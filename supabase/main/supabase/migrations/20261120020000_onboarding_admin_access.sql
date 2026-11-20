-- User-approved self-declared onboarding and protected admin access management.
begin;

alter table public.profiles
  add column course text check (course is null or char_length(btrim(course)) between 1 and 120),
  add column branch text check (branch is null or char_length(btrim(branch)) between 1 and 120),
  add column section text check (section is null or char_length(btrim(section)) between 1 and 40),
  add column mobile_number text check (mobile_number is null or mobile_number ~ '^\+?[0-9]{10,15}$');

-- Existing records must provide the new details; do not fabricate student data.
drop function public.save_profile(text,text,text,integer);
create function public.save_profile(p_full_name text, p_roll_number text, p_department text,
  p_academic_year integer, p_course text, p_branch text, p_section text, p_mobile_number text)
returns public.profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_roll text := upper(regexp_replace(btrim(p_roll_number), '[[:space:]]', '', 'g'));
  v_mobile text := regexp_replace(btrim(p_mobile_number), '[[:space:]().-]', '', 'g');
  v_profile public.profiles;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_full_name is null or p_roll_number is null or p_department is null or p_academic_year is null
    or nullif(btrim(p_course), '') is null or nullif(btrim(p_branch), '') is null
    or nullif(btrim(p_section), '') is null or v_mobile is null then
    raise exception 'PROFILE_DETAILS_REQUIRED' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_profile from public.profiles where user_id = v_user for update;
  if found and v_profile.roll_number <> v_roll then
    raise exception 'ROLL_NUMBER_IMMUTABLE' using errcode = '22023';
  end if;
  insert into public.profiles (user_id, full_name, roll_number, department, academic_year, course, branch, section, mobile_number)
  values (v_user, btrim(p_full_name), v_roll, btrim(p_department), p_academic_year,
    btrim(p_course), btrim(p_branch), btrim(p_section), v_mobile)
  on conflict (user_id) do update set full_name = excluded.full_name, department = excluded.department,
    academic_year = excluded.academic_year, course = excluded.course, branch = excluded.branch,
    section = excluded.section, mobile_number = excluded.mobile_number, updated_at = clock_timestamp()
  returning * into v_profile;
  return v_profile;
end;
$$;

-- Only the registration eligibility condition changes; retain event locking,
-- capacity, publication, windows and duplicate checks from the existing RPC.
create or replace function public.register_for_event(p_event_id uuid) returns public.registrations
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_event public.events;
  v_profile public.profiles;
  v_registration public.registrations;
  v_now timestamptz;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_event from public.events where id = p_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into v_profile from public.profiles where user_id = v_user for share;
  if not found then raise exception 'PROFILE_REQUIRED' using errcode = '42501'; end if;
  if v_profile.course is null or v_profile.branch is null or v_profile.section is null or v_profile.mobile_number is null then
    raise exception 'PROFILE_DETAILS_REQUIRED' using errcode = '42501';
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

create table public.admin_email_access (
  email text primary key check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  active boolean not null default true,
  user_id uuid unique references auth.users(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.admin_email_access enable row level security;
revoke all on public.admin_email_access from anon, authenticated;
grant select on public.admin_email_access to authenticated;
create policy admin_email_access_read on public.admin_email_access for select to authenticated
using ((select public.is_admin()));

create function public.audit_admin_email_access() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(actor_id, action, entity_id, details)
  values (auth.uid(), 'admin.email_access_changed', coalesce(new.user_id, old.user_id, gen_random_uuid()),
    jsonb_build_object('email', coalesce(new.email, old.email), 'active', new.active,
      'reason', coalesce(new.reason, old.reason), 'operation', tg_op, 'database_actor', session_user));
  return coalesce(new, old);
end;
$$;
create trigger audit_admin_email_access after insert or update or delete on public.admin_email_access
for each row execute function public.audit_admin_email_access();

insert into public.admin_email_access(email, reason) values
  ('officialtechspaceclub@gmail.com', 'Initial admin explicitly authorized by project owner'),
  ('harutoxokura15@gmail.com', 'Initial admin explicitly authorized by project owner');

create function public.sync_admin_access() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_email text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  -- Provider identities are server-owned. Never trust editable user metadata,
  -- an unconfirmed email/password signup, or an email supplied by the browser.
  select lower(u.email) into v_email from auth.users u
  where u.id = v_user and u.email_confirmed_at is not null
    and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google'
      and lower(i.identity_data->>'email') = lower(u.email)
      and i.identity_data->>'email_verified' = 'true');
  if v_email is not null and exists (select 1 from public.admin_email_access
    where email = v_email and active and (user_id is null or user_id = v_user)) then
    update public.admin_email_access set user_id = v_user, updated_at = clock_timestamp()
      where email = v_email and user_id is distinct from v_user;
    insert into public.admin_users(user_id, active) values (v_user, true)
      on conflict (user_id) do update set active = true where not admin_users.active;
  end if;
  return public.is_admin();
end;
$$;

create function public.admin_list_access(p_offset integer default 0)
returns table (email text, active boolean, user_id uuid, updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if p_offset is null or p_offset < 0 then raise exception 'INVALID_OFFSET' using errcode = '22023'; end if;
  return query select a.email, a.active, a.user_id, a.updated_at from public.admin_email_access a
    order by a.email limit 100 offset p_offset;
end;
$$;

create function public.admin_set_access(p_email text, p_active boolean, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(btrim(p_email)); v_target uuid; v_actor uuid := auth.uid();
begin
  -- Recheck authority after the shared lock: concurrent revocations must not
  -- let a just-revoked caller revoke the remaining admin.
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if v_actor is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode = '42501'; end if;
  if v_email is null or char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_active is null then raise exception 'INVALID_ADMIN_EMAIL' using errcode = '22023'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'INVALID_ADMIN_REASON' using errcode = '22023'; end if;
  select id into v_target from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if not found then
    -- Initial preauthorizations may be revoked before the first login.
    if p_active or not exists (select 1 from public.admin_email_access where email = v_email) then
      raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;
  if not p_active and v_target = v_actor then raise exception 'SELF_REVOKE_NOT_ALLOWED' using errcode = '22023'; end if;
  insert into public.admin_email_access(email, active, user_id, reason)
    values (v_email, p_active, v_target, btrim(p_reason))
    on conflict (email) do update set active = excluded.active, user_id = excluded.user_id,
      reason = excluded.reason, updated_at = clock_timestamp();
  if v_target is not null then
    insert into public.admin_users(user_id, active) values (v_target, p_active)
      on conflict (user_id) do update set active = excluded.active;
  end if;
end;
$$;

-- Claim initial grants for existing confirmed Google users without creating
-- accounts, changing passwords, or sending invitations.
insert into public.admin_users(user_id, active)
select u.id, true from auth.users u join public.admin_email_access a on a.email = lower(u.email)
where u.email_confirmed_at is not null and exists (select 1 from auth.identities i where i.user_id = u.id
  and i.provider = 'google' and lower(i.identity_data->>'email') = lower(u.email) and i.identity_data->>'email_verified' = 'true')
on conflict (user_id) do update set active = true;
update public.admin_email_access a set user_id = u.id from auth.users u
where a.email = lower(u.email) and exists (select 1 from public.admin_users au where au.user_id = u.id and au.active);

revoke all on function public.save_profile(text,text,text,integer,text,text,text,text),
  public.sync_admin_access(), public.admin_list_access(integer), public.admin_set_access(text,boolean,text),
  public.audit_admin_email_access() from public, anon, authenticated;
grant execute on function public.save_profile(text,text,text,integer,text,text,text,text),
  public.sync_admin_access(), public.admin_list_access(integer), public.admin_set_access(text,boolean,text) to authenticated;
comment on table public.profiles is 'Student details are self-declared. Complete onboarding permits registration without manual verification; verification_status is not an eligibility gate.';
notify pgrst, 'reload schema';
commit;
