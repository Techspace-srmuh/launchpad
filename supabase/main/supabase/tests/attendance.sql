-- Run with: supabase db query --linked --workdir supabase/main --file supabase/tests/attendance.sql
-- All synthetic fixtures and assertions roll back cleanly.
begin;

create temporary table checks (name text primary key);
create temporary table fixtures (name text primary key, id uuid not null default gen_random_uuid());
insert into fixtures(name) values
  ('admin'), ('student'), ('other'),
  ('event_open'), ('event_future'), ('event_past'), ('other_event');

grant select on fixtures to authenticated, anon;
grant insert, select on checks to authenticated, anon;

create function pg_temp.check_true(p_condition boolean, p_name text) returns void language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'FAILED: %', p_name; end if;
  insert into checks values (p_name);
end;
$$;

create function pg_temp.check_error(p_query text, p_state text, p_message text, p_name text) returns void language plpgsql as $$
declare v_failed boolean := false;
begin
  begin execute p_query;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and position(p_message in sqlerrm) = 0) then
      raise exception 'FAILED: %, unexpected %: %', p_name, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.check_true(v_failed, p_name);
end;
$$;

-- Setup auth users
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', id::text || '@launchpad-test.invalid', now(), '{}'::jsonb, '{}'::jsonb
from fixtures where name in ('admin', 'student', 'other');

-- Admin user
insert into public.admin_users(user_id) select id from fixtures where name = 'admin';

-- Student profiles
insert into public.profiles(user_id, full_name, roll_number, department, academic_year, verification_status, course, branch, section, mobile_number)
select id, name, upper(replace(id::text, '-', '')), 'Test Dept', 2, 'unverified', 'B.Tech', 'CSE', 'A', '9876543210'
from fixtures where name in ('student', 'other');

-- Events
-- event_open: starts 1h ago, ends in 1h (currently in check-in window)
-- event_future: starts in 2h, ends in 4h
-- event_past: started 4h ago, ended 2h ago
-- other_event: starts 1h ago, ends in 1h
insert into public.events(id, title, description, starts_at, ends_at, venue, registration_opens_at, registration_closes_at, capacity, status, created_by)
values
  ((select id from fixtures where name='event_open'), 'Open Event', 'Test', now() - interval '1 hour', now() + interval '1 hour', 'Hall 1', now() - interval '2 hours', now() + interval '30 minutes', 10, 'published', (select id from fixtures where name='admin')),
  ((select id from fixtures where name='event_future'), 'Future Event', 'Test', now() + interval '2 hours', now() + interval '4 hours', 'Hall 2', now() - interval '2 hours', now() + interval '1 hour', 10, 'published', (select id from fixtures where name='admin')),
  ((select id from fixtures where name='event_past'), 'Past Event', 'Test', now() - interval '4 hours', now() - interval '2 hours', 'Hall 3', now() - interval '6 hours', now() - interval '3 hours', 10, 'published', (select id from fixtures where name='admin')),
  ((select id from fixtures where name='other_event'), 'Other Event', 'Test', now() - interval '1 hour', now() + interval '1 hour', 'Hall 4', now() - interval '2 hours', now() + interval '30 minutes', 10, 'published', (select id from fixtures where name='admin'));

-- Registrations: student is registered for event_open, event_future, event_past.
-- other is registered for other_event.
insert into public.registrations(event_id, user_id)
values
  ((select id from fixtures where name='event_open'), (select id from fixtures where name='student')),
  ((select id from fixtures where name='event_future'), (select id from fixtures where name='student')),
  ((select id from fixtures where name='event_past'), (select id from fixtures where name='student')),
  ((select id from fixtures where name='other_event'), (select id from fixtures where name='other'));

-- 1. RLS Enabled Checks
select pg_temp.check_true((select bool_and(relrowsecurity) from pg_class where oid in (
  'public.qr_credentials'::regclass, 'public.attendance'::regclass
)), 'RLS enabled on qr_credentials and attendance');

-- 2. Anonymous Access Denied
set local role anon;
select pg_temp.check_error('select * from public.qr_credentials', '42501', null, 'anonymous qr_credentials read denied');
select pg_temp.check_error('select * from public.attendance', '42501', null, 'anonymous attendance read denied');
select pg_temp.check_error('select public.generate_qr_credential(gen_random_uuid())', '42501', null, 'anonymous generate_qr denied');
select pg_temp.check_error('select public.validate_check_in(''token'', gen_random_uuid())', '42501', null, 'anonymous validate_check_in denied');
reset role;

-- 3. Student Operations (as 'student')
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='student'), true);
set local role authenticated;

-- Cannot call admin RPCs
select pg_temp.check_error('select public.validate_check_in(''token'', gen_random_uuid())', '42501', 'ADMIN_REQUIRED', 'student cannot validate check-in');
select pg_temp.check_error('select public.admin_correct_attendance(gen_random_uuid(), true, ''Reason'')', '42501', 'ADMIN_REQUIRED', 'student cannot correct attendance');
select pg_temp.check_error('select public.admin_list_attendance(gen_random_uuid())', '42501', 'ADMIN_REQUIRED', 'student cannot list event attendance');

-- Direct table mutations denied
select pg_temp.check_error('insert into public.attendance (event_id, registration_id, user_id, checked_by) values (gen_random_uuid(), gen_random_uuid(), auth.uid(), auth.uid())', '42501', null, 'direct attendance insert denied');

-- Generate QR credential for unregistered event -> NOT_REGISTERED
select pg_temp.check_error(
  'select public.generate_qr_credential(''' || (select id from fixtures where name='other_event') || '''::uuid)',
  'P0002', 'NOT_REGISTERED', 'cannot generate QR for unregistered event'
);

-- Generate QR credential for registered event_open -> Success
select pg_temp.check_true(
  char_length(public.generate_qr_credential((select id from fixtures where name='event_open'))) = 64,
  'generate_qr_credential returns 64-char hex token'
);

-- Idempotency check: same token returned
select pg_temp.check_true(
  public.generate_qr_credential((select id from fixtures where name='event_open')) =
  (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_open')),
  'generate_qr_credential is idempotent'
);

-- Token does not contain registration_id or student details
select pg_temp.check_true(
  (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_open')) !~* 'student',
  'token does not expose student details'
);

-- Student can read own QR credential
select pg_temp.check_true(
  (select count(*) = 1 from public.qr_credentials),
  'student can read own QR credential'
);

reset role;

-- 4. Cross-student QR isolation (as 'other')
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='other'), true);
set local role authenticated;

-- 'other' should see 0 qr_credentials because student's is isolated
select pg_temp.check_true(
  (select count(*) = 0 from public.qr_credentials),
  'student cannot see other students QR credentials'
);

-- Generate QR for 'other_event'
select pg_temp.check_true(
  char_length(public.generate_qr_credential((select id from fixtures where name='other_event'))) = 64,
  'other student generates their QR credential'
);

reset role;

-- 5. Admin Scanning & Attendance Validation (as 'admin')
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='admin'), true);
set local role authenticated;

-- Admin can see all QR credentials
select pg_temp.check_true(
  (select count(*) = 2 from public.qr_credentials),
  'admin can read all QR credentials'
);

-- Scan non-existent QR -> QR_NOT_FOUND
select pg_temp.check_error(
  'select public.validate_check_in(''0000000000000000000000000000000000000000000000000000000000000000'', ''' || (select id from fixtures where name='event_open') || '''::uuid)',
  'P0002', 'QR_NOT_FOUND', 'unknown token rejected'
);

-- Scan wrong event: pass other_event token with event_open -> WRONG_EVENT
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id = (select id from fixtures where name='other_event')) || ''', ''' || (select id from fixtures where name='event_open') || '''::uuid)',
  '22023', 'WRONG_EVENT', 'wrong event scan rejected'
);

reset role;

-- Student generates QR for future and past events
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='student'), true);
set local role authenticated;
select public.generate_qr_credential((select id from fixtures where name='event_future'));
select public.generate_qr_credential((select id from fixtures where name='event_past'));
reset role;

-- Admin scanning outside window
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='admin'), true);
set local role authenticated;

-- Future event scan -> OUTSIDE_CHECK_IN_WINDOW
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_future')) || ''', ''' || (select id from fixtures where name='event_future') || '''::uuid)',
  '22023', 'OUTSIDE_CHECK_IN_WINDOW', 'future event scan rejected'
);

-- Past event scan -> OUTSIDE_CHECK_IN_WINDOW
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_past')) || ''', ''' || (select id from fixtures where name='event_past') || '''::uuid)',
  '22023', 'OUTSIDE_CHECK_IN_WINDOW', 'past event scan rejected'
);

-- Cancelled events reject scans even during the original time window.
reset role;
update public.events set status='cancelled' where id=(select id from fixtures where name='event_open');
set local role authenticated;
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id=(select id from fixtures where name='event_open')) || ''', ''' || (select id from fixtures where name='event_open') || '''::uuid)',
  '22023', 'EVENT_NOT_OPEN', 'cancelled event scan denied'
);
reset role;
update public.events set status='published' where id=(select id from fixtures where name='event_open');
set local role authenticated;

-- Valid check-in for event_open
select pg_temp.check_true(
  (public.validate_check_in(
    (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_open')),
    (select id from fixtures where name='event_open')
  )).checked_in = true,
  'valid scan records check-in'
);

-- Duplicate check-in -> ALREADY_CHECKED_IN
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id = (select id from fixtures where name='event_open')) || ''', ''' || (select id from fixtures where name='event_open') || '''::uuid)',
  '23505', 'ALREADY_CHECKED_IN', 'duplicate check-in rejected'
);

-- Audit log created for check-in
select pg_temp.check_true(
  exists(select 1 from public.audit_logs where action = 'attendance.checked_in' and actor_id = auth.uid()),
  'attendance.checked_in audited'
);

-- 6. Manual Attendance Correction
-- Correction with missing/short reason -> CORRECTION_REASON_REQUIRED
select pg_temp.check_error(
  'select public.admin_correct_attendance(''' || (select id from public.attendance where event_id = (select id from fixtures where name='event_open')) || '''::uuid, false, ''no'')',
  '22023', 'CORRECTION_REASON_REQUIRED', 'correction requires valid reason'
);

-- Successful correction to false
select pg_temp.check_true(
  (public.admin_correct_attendance(
    (select id from public.attendance where event_id = (select id from fixtures where name='event_open')),
    false,
    'Student left early before start'
  )).checked_in = false,
  'admin successfully corrects attendance to false'
);

-- Audit log created for correction
select pg_temp.check_true(
  exists(select 1 from public.audit_logs where action = 'attendance.corrected' and actor_id = auth.uid() and details->>'reason' = 'Student left early before start'),
  'attendance.corrected audited with actor and reason'
);

select pg_temp.check_error(
  'select public.admin_correct_attendance(''' || (select id from public.attendance where event_id=(select id from fixtures where name='event_open')) || '''::uuid, null, ''Valid reason'')',
  '22023', 'INVALID_ATTENDANCE_STATUS', 'null correction status denied'
);
select pg_temp.check_error(
  'select public.validate_check_in(''' || (select token from public.qr_credentials where event_id=(select id from fixtures where name='event_open')) || ''', ''' || (select id from fixtures where name='event_open') || '''::uuid)',
  '22023', 'ATTENDANCE_CORRECTION_REQUIRED', 'rescanning cannot override manual correction'
);
select pg_temp.check_true(exists(select 1 from public.audit_logs where action='attendance.corrected'
  and details->>'previous_checked_in'='true' and details->>'checked_in'='false'), 'correction records previous and new status');

-- Admin list attendance returns corrected record
select pg_temp.check_true(
  (select count(*) = 1 from public.admin_list_attendance((select id from fixtures where name='event_open')) where checked_in = false),
  'admin_list_attendance returns event records'
);

reset role;

-- 7. Student reads own attendance record
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='student'), true);
set local role authenticated;
select pg_temp.check_true(
  (select count(*) = 1 from public.attendance where event_id = (select id from fixtures where name='event_open')),
  'student can read own attendance'
);
reset role;

-- Cross-student attendance reads and revoked administrator mutations.
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='other'), true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.attendance), 'other student cannot read attendance');
reset role;
update public.admin_users set active=false where user_id=(select id from fixtures where name='admin');
select set_config('request.jwt.claim.sub', (select id::text from fixtures where name='admin'), true);
set local role authenticated;
select pg_temp.check_error('select public.validate_check_in(repeat(''a'',64),gen_random_uuid())', '42501','ADMIN_REQUIRED','revoked admin cannot scan');
select pg_temp.check_error('select public.admin_correct_attendance(gen_random_uuid(),true,''Valid reason'')', '42501','ADMIN_REQUIRED','revoked admin cannot correct');
reset role;
update public.admin_users set active=true where user_id=(select id from fixtures where name='admin');

-- Pagination must expose the 101st record, not truncate the event at 100.
create temporary table page_users as select gen_random_uuid() as id from generate_series(1,100);
insert into auth.users(id,aud,role,email) select id,'authenticated','authenticated',id::text||'@launchpad-test.invalid' from page_users;
insert into public.profiles(user_id,full_name,roll_number,department,academic_year)
  select id,'Pagination student',upper(replace(id::text,'-','')),'Test Dept',2 from page_users;
insert into public.registrations(event_id,user_id) select (select id from fixtures where name='event_open'),id from page_users;
insert into public.attendance(event_id,registration_id,user_id,checked_by)
  select r.event_id,r.id,r.user_id,(select id from fixtures where name='admin') from public.registrations r join page_users p on p.id=r.user_id;
set local role authenticated;
select pg_temp.check_true((select count(*)=100 from public.admin_list_attendance((select id from fixtures where name='event_open'),0)), 'first attendance page limited to 100');
select pg_temp.check_true((select count(*)=1 from public.admin_list_attendance((select id from fixtures where name='event_open'),100)), 'second attendance page exposes remaining record');
select pg_temp.check_error('select public.admin_list_attendance(gen_random_uuid(),-1)', '22023','INVALID_OFFSET','negative attendance offset denied');
reset role;

select count(*) as attendance_checks_passed from checks;
rollback;
