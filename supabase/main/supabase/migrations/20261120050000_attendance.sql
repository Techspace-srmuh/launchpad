-- Phase 4 QR attendance: opaque event credentials, admin mobile scanning, and audited corrections.
begin;

create extension if not exists pgcrypto;

-- QR credentials: one opaque hex token per registration.
-- Never contains roll numbers or personal details.
create table public.qr_credentials (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete restrict,
  event_id uuid not null references public.events(id) on delete restrict,
  token text not null unique,
  created_at timestamptz not null default clock_timestamp()
);
create index qr_credentials_token_idx on public.qr_credentials (token);

-- Attendance: one primary check-in per registration.
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  registration_id uuid not null references public.registrations(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  checked_in boolean not null default true,
  checked_by uuid not null references auth.users(id) on delete restrict,
  checked_at timestamptz not null default clock_timestamp(),
  correction_reason text check (correction_reason is null or char_length(btrim(correction_reason)) between 3 and 500),
  corrected_by uuid references auth.users(id) on delete restrict,
  corrected_at timestamptz,
  unique (registration_id)
);
create index attendance_event_idx on public.attendance (event_id, checked_in);
create index attendance_user_idx on public.attendance (user_id);

alter table public.qr_credentials enable row level security;
alter table public.attendance enable row level security;

-- Student reads own QR credential; admin reads all.
create policy qr_credentials_read on public.qr_credentials for select to authenticated
  using (
    registration_id in (select id from public.registrations where user_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Student reads own attendance; admin reads all.
create policy attendance_read on public.attendance for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.qr_credentials, public.attendance from public, anon, authenticated;
grant select on public.qr_credentials, public.attendance to authenticated;

-- Issue or retrieve an event-specific QR credential for the authenticated student.
create function public.generate_qr_credential(p_event_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reg public.registrations;
  v_cred public.qr_credentials;
  v_token text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_reg from public.registrations
    where event_id = p_event_id and user_id = v_user;
  if not found then raise exception 'NOT_REGISTERED' using errcode = 'P0002'; end if;

  select * into v_cred from public.qr_credentials where registration_id = v_reg.id;
  if found then return v_cred.token; end if;

  -- Generate opaque hex token: hmac-sha256 of registration_id and event_id.
  v_token := encode(hmac(v_reg.id::text || p_event_id::text, gen_random_uuid()::text, 'sha256'), 'hex');
  insert into public.qr_credentials (registration_id, event_id, token)
    values (v_reg.id, p_event_id, v_token)
    on conflict (registration_id) do update set token = qr_credentials.token
    returning token into v_token;
  return v_token;
end;
$$;

-- Validate QR check-in by admin scanner.
create function public.validate_check_in(p_token text, p_event_id uuid)
returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_cred public.qr_credentials;
  v_event public.events;
  v_now timestamptz;
  v_att public.attendance;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_token is null or length(btrim(p_token)) < 10 then
    raise exception 'INVALID_QR' using errcode = '22023';
  end if;

  -- Advisory / row lock on qr_credentials to serialize concurrent scans of the same QR.
  select * into v_cred from public.qr_credentials where token = btrim(p_token) for update;
  if not found then raise exception 'QR_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_cred.event_id <> p_event_id then
    raise exception 'WRONG_EVENT' using errcode = '22023';
  end if;

  select * into v_event from public.events where id = p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;

  v_now := clock_timestamp();
  if v_now < v_event.starts_at or v_now > v_event.ends_at then
    raise exception 'OUTSIDE_CHECK_IN_WINDOW' using errcode = '22023';
  end if;

  if exists (select 1 from public.attendance where registration_id = v_cred.registration_id and checked_in) then
    raise exception 'ALREADY_CHECKED_IN' using errcode = '23505';
  end if;

  insert into public.attendance (event_id, registration_id, user_id, checked_in, checked_by)
    select p_event_id, v_cred.registration_id, r.user_id, true, v_actor
    from public.registrations r where r.id = v_cred.registration_id
    returning * into v_att;

  insert into public.audit_logs (actor_id, action, entity_id, details)
    values (v_actor, 'attendance.checked_in', v_att.id,
      jsonb_build_object('event_id', p_event_id, 'registration_id', v_cred.registration_id));

  return v_att;
end;
$$;

-- Manual correction by admin with mandatory reason.
create function public.admin_correct_attendance(
  p_attendance_id uuid, p_checked_in boolean, p_reason text
) returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_att public.attendance;
begin
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_att from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND' using errcode = 'P0002'; end if;

  update public.attendance
    set checked_in = p_checked_in,
        correction_reason = btrim(p_reason),
        corrected_by = v_actor,
        corrected_at = clock_timestamp()
    where id = p_attendance_id
    returning * into v_att;

  insert into public.audit_logs (actor_id, action, entity_id, details)
    values (v_actor, 'attendance.corrected', p_attendance_id,
      jsonb_build_object('checked_in', p_checked_in, 'reason', btrim(p_reason)));

  return v_att;
end;
$$;

-- Admin lists attendance records for an event.
create function public.admin_list_attendance(p_event_id uuid, p_offset integer default 0)
returns table (
  attendance_id uuid, registration_id uuid, user_id uuid, checked_in boolean,
  checked_at timestamptz, checked_by uuid, correction_reason text, corrected_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0 then raise exception 'INVALID_OFFSET' using errcode = '22023'; end if;

  return query select a.id, a.registration_id, a.user_id, a.checked_in,
    a.checked_at, a.checked_by, a.correction_reason, a.corrected_at
    from public.attendance a where a.event_id = p_event_id
    order by a.checked_at desc, a.id
    limit 100 offset p_offset;
end;
$$;

revoke all on function
  public.generate_qr_credential(uuid),
  public.validate_check_in(text, uuid),
  public.admin_correct_attendance(uuid, boolean, text),
  public.admin_list_attendance(uuid, integer)
from public, anon;

grant execute on function
  public.generate_qr_credential(uuid),
  public.validate_check_in(text, uuid),
  public.admin_correct_attendance(uuid, boolean, text),
  public.admin_list_attendance(uuid, integer)
to authenticated;

comment on table public.attendance is 'Attendance check-in records. Exactly one primary check-in per registration, with audited admin corrections.';
comment on table public.qr_credentials is 'Per-registration opaque HMAC tokens; never expose roll number or student details.';

notify pgrst, 'reload schema';
commit;
