-- Identity scaffolding and the first event workflow. Verification/admin provisioning
-- remain owner-operated until institutional policy is approved. No user is auto-verified.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 120),
  roll_number text not null unique check (roll_number ~ '^[A-Z0-9][A-Z0-9-]{1,39}$'),
  department text not null check (char_length(btrim(department)) between 1 and 120),
  academic_year integer not null check (academic_year between 1 and 8),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete restrict,
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete restrict,
  action text not null,
  entity_id uuid not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- A sequence avoids same-transaction/same-microsecond timestamp cache collisions.
create sequence public.event_version_seq as bigint;
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null check (char_length(description) between 1 and 10000),
  poster_url text check (poster_url is null or (char_length(poster_url) <= 2048 and poster_url ~ '^https://[^[:space:]@]+$')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  venue text not null check (char_length(btrim(venue)) between 1 and 240),
  registration_opens_at timestamptz not null,
  registration_closes_at timestamptz not null,
  capacity integer check (capacity is null or capacity > 0),
  status text not null default 'draft' check (status in ('draft','published','closed','completed','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  version bigint not null default nextval('public.event_version_seq'),
  check (ends_at > starts_at),
  check (registration_closes_at > registration_opens_at),
  check (registration_closes_at <= starts_at)
);
create index events_browse_idx on public.events (starts_at, id) where status <> 'draft';

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  unique (event_id, user_id)
);
create index registrations_user_idx on public.registrations (user_id, created_at desc);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admin_users where user_id = (select auth.uid()) and active); $$;

alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.events enable row level security;
alter table public.registrations enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_read on public.profiles for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy admins_read_own on public.admin_users for select to authenticated
using (user_id = (select auth.uid()));
create policy events_read on public.events for select to authenticated
using (status <> 'draft' or (select public.is_admin()));
create policy registrations_read on public.registrations for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy audit_read on public.audit_logs for select to authenticated
using ((select public.is_admin()));

-- All browser writes use authenticated RPCs. RLS is a second barrier, not the
-- sole defense against callers changing role/verification/capacity themselves.
revoke all on public.profiles, public.admin_users, public.events, public.registrations, public.audit_logs from anon, authenticated;
grant select on public.profiles, public.admin_users, public.events, public.registrations, public.audit_logs to authenticated;
revoke all on sequence public.event_version_seq from anon, authenticated;

create function public.save_profile(p_full_name text, p_roll_number text, p_department text, p_academic_year integer)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_roll text := upper(regexp_replace(btrim(p_roll_number), '[[:space:]]', '', 'g'));
  v_profile public.profiles;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Serialize same-account onboarding, including first creation, before checking
  -- the immutable roll claim. Unique constraint handles cross-account claims.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_profile from public.profiles where user_id = v_user for update;
  if found and v_profile.roll_number <> v_roll then
    raise exception 'ROLL_NUMBER_IMMUTABLE' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, full_name, roll_number, department, academic_year)
    values (v_user, btrim(p_full_name), v_roll, btrim(p_department), p_academic_year)
  on conflict (user_id) do update set
    full_name = excluded.full_name, department = excluded.department,
    academic_year = excluded.academic_year, updated_at = clock_timestamp()
  returning * into v_profile;
  return v_profile;
end;
$$;

create function public.touch_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  new.version := nextval('public.event_version_seq');
  return new;
end;
$$;
create trigger touch_event_before_update before update on public.events
for each row execute function public.touch_event();

create function public.audit_event_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (actor_id, action, entity_id, details)
  values (auth.uid(), case when tg_op = 'INSERT' then 'event.created' else 'event.updated' end,
    new.id, jsonb_build_object('status', new.status, 'version', new.version));
  return new;
end;
$$;
create trigger audit_event_after_write after insert or update on public.events
for each row execute function public.audit_event_change();

create function public.audit_identity_authority_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'admin_users' then
    insert into public.audit_logs (actor_id, action, entity_id, details)
    values (auth.uid(), 'admin.authority_changed', coalesce(new.user_id, old.user_id),
      jsonb_build_object('operation', tg_op, 'database_actor', session_user));
  elsif new.verification_status is distinct from old.verification_status then
    insert into public.audit_logs (actor_id, action, entity_id, details)
    values (auth.uid(), 'profile.verification_changed', new.user_id,
      jsonb_build_object('status', new.verification_status, 'database_actor', session_user));
  end if;
  return coalesce(new, old);
end;
$$;
create trigger audit_admin_authority after insert or update or delete on public.admin_users
for each row execute function public.audit_identity_authority_change();
create trigger audit_profile_verification after update on public.profiles
for each row execute function public.audit_identity_authority_change();

create function public.admin_save_event(p_event jsonb) returns public.events
language plpgsql security definer set search_path = '' as $$
declare
  v_event public.events;
  v_existing public.events;
  v_id uuid := nullif(p_event->>'id', '')::uuid;
  v_capacity integer := nullif(p_event->>'capacity', '')::integer;
  v_status text := coalesce(p_event->>'status', 'draft');
  v_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_event is null or jsonb_typeof(p_event) <> 'object' then
    raise exception 'INVALID_EVENT' using errcode = '22023';
  end if;
  if v_id is not null then
    select * into v_existing from public.events where id = v_id for update;
    if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_existing.status <> 'draft' and v_status = 'draft' then
      raise exception 'PUBLISHED_EVENT_CANNOT_RETURN_TO_DRAFT' using errcode = '22023';
    end if;
    if v_existing.status in ('completed','cancelled') and v_status <> v_existing.status then
      raise exception 'EVENT_STATUS_FINAL' using errcode = '22023';
    end if;
    select count(*) into v_count from public.registrations where event_id = v_id;
    if v_capacity is not null and v_capacity < v_count then
      raise exception 'CAPACITY_BELOW_REGISTRATIONS' using errcode = '22023';
    end if;
    update public.events set title = btrim(p_event->>'title'), description = btrim(p_event->>'description'),
      poster_url = nullif(btrim(p_event->>'poster_url'), ''), starts_at = (p_event->>'starts_at')::timestamptz,
      ends_at = (p_event->>'ends_at')::timestamptz, venue = btrim(p_event->>'venue'),
      registration_opens_at = (p_event->>'registration_opens_at')::timestamptz,
      registration_closes_at = (p_event->>'registration_closes_at')::timestamptz,
      capacity = v_capacity, status = v_status
    where id = v_id returning * into v_event;
  else
    insert into public.events (title, description, poster_url, starts_at, ends_at, venue,
      registration_opens_at, registration_closes_at, capacity, status, created_by)
    values (btrim(p_event->>'title'), btrim(p_event->>'description'), nullif(btrim(p_event->>'poster_url'), ''),
      (p_event->>'starts_at')::timestamptz, (p_event->>'ends_at')::timestamptz, btrim(p_event->>'venue'),
      (p_event->>'registration_opens_at')::timestamptz, (p_event->>'registration_closes_at')::timestamptz,
      v_capacity, v_status, auth.uid()) returning * into v_event;
  end if;
  return v_event;
end;
$$;

create function public.register_for_event(p_event_id uuid) returns public.registrations
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_event public.events;
  v_profile public.profiles;
  v_registration public.registrations;
  v_now timestamptz;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Consistent lock order: event, then profile. Event lock serializes all
  -- registrations and admin capacity/status/window edits for this event.
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_profile from public.profiles where user_id = v_user for share;
  if not found then raise exception 'PROFILE_REQUIRED' using errcode = '42501'; end if;
  if v_profile.verification_status <> 'verified' then
    raise exception 'VERIFICATION_REQUIRED' using errcode = '42501';
  end if;
  v_now := clock_timestamp();
  if v_event.status <> 'published' or v_now < v_event.registration_opens_at or v_now >= v_event.registration_closes_at then
    raise exception 'EVENT_NOT_OPEN' using errcode = '22023';
  end if;
  if exists (select 1 from public.registrations where event_id = p_event_id and user_id = v_user) then
    raise exception 'ALREADY_REGISTERED' using errcode = '23505';
  end if;
  if v_event.capacity is not null and (select count(*) from public.registrations where event_id = p_event_id) >= v_event.capacity then
    raise exception 'EVENT_FULL' using errcode = '22023';
  end if;
  insert into public.registrations (event_id, user_id) values (p_event_id, v_user) returning * into v_registration;
  return v_registration;
end;
$$;

revoke all on function public.is_admin(), public.save_profile(text,text,text,integer),
  public.admin_save_event(jsonb), public.register_for_event(uuid), public.touch_event(),
  public.audit_event_change(), public.audit_identity_authority_change() from public, anon;
grant execute on function public.is_admin(), public.save_profile(text,text,text,integer),
  public.admin_save_event(jsonb), public.register_for_event(uuid) to authenticated;

comment on table public.profiles is 'Verification defaults to unverified. Approved institutional verification and production admin provisioning remain unresolved.';
comment on column public.events.version is 'Monotonic server-generated revision for disposable event caches; never determines registration eligibility.';
notify pgrst, 'reload schema';
commit;
