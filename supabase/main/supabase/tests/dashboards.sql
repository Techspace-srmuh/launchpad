-- MAIN development DB tests for Phase 6 dashboard summaries. Fixtures roll back.
begin;

create temporary table dashboard_checks(name text primary key);
create temporary table dashboard_fixtures(name text primary key, id uuid not null default gen_random_uuid());
insert into dashboard_fixtures(name) values('admin'), ('student1'), ('student2'), ('outsider'), ('event_published'), ('event_draft'), ('event_past');

grant select on dashboard_fixtures to authenticated, anon;
grant select, insert on dashboard_checks to authenticated, anon;

create function pg_temp.dash_check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %', p_name; end if;
  insert into dashboard_checks values(p_name);
end;
$$;

create function pg_temp.dash_error(p_sql text, p_state text, p_message text, p_name text) returns void language plpgsql as $$
declare v_failed boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and position(p_message in sqlerrm) = 0) then
      raise exception 'FAILED: %, unexpected %: %', p_name, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.dash_check(v_failed, p_name);
end;
$$;

-- Create auth users
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', id::text || '@dash-test.invalid', '{}', '{}'
from dashboard_fixtures where name in ('admin', 'student1', 'student2', 'outsider');

insert into public.admin_users(user_id, active)
select id, true from dashboard_fixtures where name = 'admin';

insert into public.profiles(user_id, full_name, roll_number, department, academic_year, course, branch, section, mobile_number)
select id, 'Student ' || name, upper(replace(id::text, '-', '')), 'CSE', 2, 'B.Tech', 'CSE', 'A', '9876543210'
from dashboard_fixtures where name in ('student1', 'student2', 'outsider');

-- Create events: 1 published upcoming, 1 draft, 1 published past
insert into public.events(id, title, description, starts_at, ends_at, venue, registration_opens_at, registration_closes_at, status, created_by, capacity)
values
  ((select id from dashboard_fixtures where name = 'event_published'), 'Upcoming Published', 'Desc', now() + interval '2 days', now() + interval '3 days', 'Hall A', now() - interval '1 day', now() + interval '1 day', 'published', (select id from dashboard_fixtures where name = 'admin'), 100),
  ((select id from dashboard_fixtures where name = 'event_draft'), 'Draft Event', 'Desc', now() + interval '5 days', now() + interval '6 days', 'Hall B', now() - interval '1 day', now() + interval '4 days', 'draft', (select id from dashboard_fixtures where name = 'admin'), 50),
  ((select id from dashboard_fixtures where name = 'event_past'), 'Past Published', 'Desc', now() - interval '5 days', now() - interval '4 days', 'Hall C', now() - interval '10 days', now() - interval '6 days', 'published', (select id from dashboard_fixtures where name = 'admin'), null);

-- Registrations:
-- student1 registers for event_published and event_past
-- student2 registers for event_published
insert into public.registrations(id, event_id, user_id)
values
  (gen_random_uuid(), (select id from dashboard_fixtures where name = 'event_published'), (select id from dashboard_fixtures where name = 'student1')),
  (gen_random_uuid(), (select id from dashboard_fixtures where name = 'event_past'), (select id from dashboard_fixtures where name = 'student1')),
  (gen_random_uuid(), (select id from dashboard_fixtures where name = 'event_published'), (select id from dashboard_fixtures where name = 'student2'));

-- Attendance:
-- student1 checked in for event_past
insert into public.attendance(event_id, registration_id, user_id, checked_in, checked_by)
select
  r.event_id,
  r.id,
  r.user_id,
  true,
  (select id from dashboard_fixtures where name = 'admin')
from public.registrations r
where r.event_id = (select id from dashboard_fixtures where name = 'event_past')
  and r.user_id = (select id from dashboard_fixtures where name = 'student1');

-- Announcements:
-- 1 for all students
-- 1 for event_registrants of event_published
-- 1 for event_registrants of event_past
insert into public.announcements(id, event_id, title, body, audience, published_by)
values
  (gen_random_uuid(), null, 'Global Announcement', 'Hello all students', 'all_students', (select id from dashboard_fixtures where name = 'admin')),
  (gen_random_uuid(), (select id from dashboard_fixtures where name = 'event_published'), 'Upcoming Notice', 'Notice for upcoming event', 'event_registrants', (select id from dashboard_fixtures where name = 'admin')),
  (gen_random_uuid(), (select id from dashboard_fixtures where name = 'event_past'), 'Past Notice', 'Notice for past event', 'event_registrants', (select id from dashboard_fixtures where name = 'admin'));

-- 1. Anonymous call denied
set local role anon;
select pg_temp.dash_error('select public.admin_get_dashboard_summary()', '42501', null, 'anonymous dashboard summary denied');
reset role;

-- 2. Authenticated non-admin (student) call denied
select set_config('request.jwt.claim.sub', (select id::text from dashboard_fixtures where name = 'student1'), true);
set local role authenticated;
select pg_temp.dash_error('select public.admin_get_dashboard_summary()', '42501', 'ADMIN_REQUIRED', 'student dashboard summary denied');
reset role;

-- 3. Authenticated admin call succeeds and returns accurate counts
select set_config('request.jwt.claim.sub', (select id::text from dashboard_fixtures where name = 'admin'), true);
set local role authenticated;

select pg_temp.dash_check(
  (public.admin_get_dashboard_summary()->>'total_events')::integer >= 3,
  'total events count includes all events'
);

select pg_temp.dash_check(
  (public.admin_get_dashboard_summary()->>'published_events')::integer >= 2,
  'published events count includes published events'
);

select pg_temp.dash_check(
  (public.admin_get_dashboard_summary()->>'upcoming_events')::integer >= 1,
  'upcoming events count includes future published events'
);

select pg_temp.dash_check(
  (public.admin_get_dashboard_summary()->>'total_registrations')::integer >= 3,
  'total registrations count is accurate'
);

select pg_temp.dash_check(
  (public.admin_get_dashboard_summary()->>'total_check_ins')::integer >= 1,
  'total check-ins count is accurate'
);

-- Check per-event registration and attendance counts in admin summary
select pg_temp.dash_check(
  exists (
    select 1
    from jsonb_array_elements(public.admin_get_dashboard_summary()->'events') ev
    where ev->>'id' = (select id::text from dashboard_fixtures where name = 'event_published')
      and (ev->>'registration_count')::integer = 2
      and (ev->>'attendance_count')::integer = 0
  ),
  'published event has 2 registrations and 0 check-ins'
);

select pg_temp.dash_check(
  exists (
    select 1
    from jsonb_array_elements(public.admin_get_dashboard_summary()->'events') ev
    where ev->>'id' = (select id::text from dashboard_fixtures where name = 'event_past')
      and (ev->>'registration_count')::integer = 1
      and (ev->>'attendance_count')::integer = 1
  ),
  'past event has 1 registration and 1 check-in'
);

select pg_temp.dash_check(
  jsonb_array_length(public.admin_get_dashboard_summary()->'recent_announcements') >= 3,
  'admin sees recent announcements'
);

reset role;

-- 4. Check revoked admin authority is denied
update public.admin_users set active = false where user_id = (select id from dashboard_fixtures where name = 'admin');
select set_config('request.jwt.claim.sub', (select id::text from dashboard_fixtures where name = 'admin'), true);
set local role authenticated;
select pg_temp.dash_error('select public.admin_get_dashboard_summary()', '42501', 'ADMIN_REQUIRED', 'revoked admin dashboard summary denied');
reset role;

-- 5. Student direct RLS queries: verify audience and data isolation
-- student1 is registered for event_published and event_past
select set_config('request.jwt.claim.sub', (select id::text from dashboard_fixtures where name = 'student1'), true);
set local role authenticated;

-- student1 sees their 2 registrations
select pg_temp.dash_check(
  (select count(*) from public.registrations where user_id = (select auth.uid())) = 2,
  'student1 sees own 2 registrations'
);

-- student1 cannot see student2 registrations
select pg_temp.dash_check(
  (select count(*) from public.registrations where user_id = (select id from dashboard_fixtures where name = 'student2')) = 0,
  'student1 cannot see student2 registrations'
);

-- student1 sees their 1 check-in
select pg_temp.dash_check(
  (select count(*) from public.attendance where user_id = (select auth.uid()) and checked_in = true) = 1,
  'student1 sees own check-in'
);

-- student1 cannot see other attendance
select pg_temp.dash_check(
  (select count(*) from public.attendance where user_id <> (select auth.uid())) = 0,
  'student1 cannot see other attendance'
);

-- student1 sees global announcement + event_published announcement + event_past announcement (3 total)
select pg_temp.dash_check(
  (select count(*) from public.announcements) >= 3,
  'student1 sees global and registered event announcements'
);

reset role;

-- outsider is NOT registered for any event
select set_config('request.jwt.claim.sub', (select id::text from dashboard_fixtures where name = 'outsider'), true);
set local role authenticated;

-- outsider sees 0 registrations
select pg_temp.dash_check(
  (select count(*) from public.registrations where user_id = (select auth.uid())) = 0,
  'outsider has 0 registrations'
);

-- outsider sees 0 attendance
select pg_temp.dash_check(
  (select count(*) from public.attendance where user_id = (select auth.uid())) = 0,
  'outsider has 0 attendance'
);

-- outsider cannot see event_registrants announcements (only sees all_students)
select pg_temp.dash_check(
  not exists (
    select 1 from public.announcements
    where audience = 'event_registrants'
      and event_id in (select id from dashboard_fixtures where name in ('event_published', 'event_past'))
  ),
  'outsider is denied event-registrant announcements'
);

reset role;

select count(*) as passed_dashboard_checks from dashboard_checks;

rollback;
