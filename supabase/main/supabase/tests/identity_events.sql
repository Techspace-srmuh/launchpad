-- Run with: supabase db query --linked --workdir supabase/main --file supabase/tests/identity_events.sql
-- Fixtures and helper functions are rolled back, including on failure.
begin;
create temporary table checks (name text primary key);
create temporary table fixtures (name text primary key, id uuid not null default gen_random_uuid());
insert into fixtures(name) values ('admin'),('student'),('other'),('unverified'),('no_profile'),('duplicate_profile'),('published'),('draft'),('closed'),('future'),('expired');
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
  begin
    execute p_query;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and position(p_message in sqlerrm) = 0) then
      raise exception 'FAILED: %, unexpected %: %', p_name, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.check_true(v_failed, p_name);
end;
$$;
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', id::text || '@launchpad-test.invalid', '{}'::jsonb, '{}'::jsonb
from fixtures where name in ('admin','student','other','unverified','no_profile','duplicate_profile');
insert into public.admin_users(user_id) select id from fixtures where name='admin';
insert into public.profiles(user_id, full_name, roll_number, department, academic_year, verification_status, course, branch, section, mobile_number)
select id, name, upper(replace(id::text,'-','')), 'Test department', 2,
  'unverified', case when name='unverified' then null else 'B.Tech' end, 'CSE', 'A', '9876543210'
from fixtures where name in ('student','other','unverified');
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,capacity,status,created_by)
select id, name, 'Test event', now()+interval '2 days', now()+interval '3 days', 'Test venue',
  case when name='future' then now()+interval '1 day' else now()-interval '1 day' end,
  case when name='expired' then now()-interval '1 hour' else now()+interval '1 day 1 hour' end,
  1, case when name='draft' then 'draft' when name='closed' then 'closed' else 'published' end,
  (select id from fixtures where name='admin')
from fixtures where name in ('published','draft','closed','future','expired');

select pg_temp.check_true((select bool_and(relrowsecurity) from pg_class where oid in
  ('public.profiles'::regclass,'public.admin_users'::regclass,'public.events'::regclass,'public.registrations'::regclass,'public.audit_logs'::regclass)), 'RLS enabled on all exposed tables');

set local role anon;
select pg_temp.check_error('select * from public.events','42501',null,'anonymous event reads denied');
select pg_temp.check_error('select public.is_admin()','42501',null,'anonymous admin checks denied');
select pg_temp.check_error('select public.save_profile(''X'',''R123'',''D'',1,''B.Tech'',''CSE'',''A'',''9876543210'')','42501',null,'anonymous profile writes denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='student'),true);
set local role authenticated;
select pg_temp.check_true(not public.is_admin(), 'student is not admin');
select pg_temp.check_true((select count(*)=1 from public.profiles), 'student reads own profile only');
select pg_temp.check_true((select count(*)=0 from public.admin_users), 'student cannot read admin records');
select pg_temp.check_true((select count(*)=0 from public.audit_logs), 'student cannot read audit records');
select pg_temp.check_true((select count(*)=4 from public.events where id in (select id from fixtures)), 'student sees non-drafts only');
select pg_temp.check_error('insert into public.admin_users(user_id) values (auth.uid())','42501',null,'self-promotion denied');
select pg_temp.check_error('update public.profiles set verification_status=''verified''','42501',null,'direct verification changes denied');
select pg_temp.check_error('delete from public.audit_logs','42501',null,'audit deletion denied');
select pg_temp.check_error('update public.events set capacity=999','42501',null,'direct event edits denied');
select pg_temp.check_error('select public.admin_save_event(''{}''::jsonb)','42501','ADMIN_REQUIRED','student admin RPC denied');
select pg_temp.check_error('select public.save_profile(''Name'',''changed-roll'',''D'',1,''B.Tech'',''CSE'',''A'',''9876543210'')','22023','ROLL_NUMBER_IMMUTABLE','roll changes denied');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''draft''))','22023','EVENT_NOT_OPEN','draft registration denied');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''closed''))','22023','EVENT_NOT_OPEN','closed registration denied');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''future''))','22023','EVENT_NOT_OPEN','early registration denied');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''expired''))','22023','EVENT_NOT_OPEN','late registration denied');
select pg_temp.check_true((public.register_for_event((select id from fixtures where name='published'))).user_id=auth.uid(), 'registration records authenticated actor');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''published''))','23505','ALREADY_REGISTERED','duplicate registration denied');
select pg_temp.check_true((select count(*)=1 from public.registrations), 'student sees own registration');
select pg_temp.check_error('insert into public.registrations(event_id,user_id) select id,auth.uid() from fixtures where name=''closed''','42501',null,'direct registration insert denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='other'),true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.registrations), 'cross-student registration isolation');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''published''))','22023','EVENT_FULL','capacity limit enforced');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='unverified'),true);
set local role authenticated;
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''published''))','42501','PROFILE_DETAILS_REQUIRED','incomplete onboarding registration denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='no_profile'),true);
set local role authenticated;
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''published''))','42501','PROFILE_REQUIRED','missing profile denied');
select pg_temp.check_true((public.save_profile(' New Student ',' abc 123 ',' CS ',1,'B.Tech','CSE','A','9876543210')).roll_number='ABC123','roll normalized');
select pg_temp.check_true((select verification_status='unverified' from public.profiles where user_id=auth.uid()),'self-declared onboarding does not claim university verification');
select pg_temp.check_error('select public.save_profile(''N'',''ABC123'',''D'',9,''B.Tech'',''CSE'',''A'',''9876543210'')','23514',null,'invalid academic year rejected');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='duplicate_profile'),true);
set local role authenticated;
select pg_temp.check_error('select public.save_profile(''N'','' abc 123 '',''D'',1,''B.Tech'',''CSE'',''A'',''9876543210'')','23505',null,'normalized roll claims unique across users');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='unverified'),true);
set local role authenticated;
select pg_temp.check_error('select public.save_profile(''N'',''ABC123'',''D'',1,''B.Tech'',''CSE'',''A'',''9876543210'')','22023','ROLL_NUMBER_IMMUTABLE','existing roll cannot be replaced with another claim');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.check_true(public.is_admin(),'active admin recognized');
select pg_temp.check_true((select count(*)=5 from public.events where id in (select id from fixtures)),'admin sees draft events');
select pg_temp.check_true((select count(*)=4 from public.profiles where user_id in (select id from fixtures)),'admin sees required participant profiles');
select pg_temp.check_error('select public.admin_save_event((select to_jsonb(e)||''{"capacity":0}''::jsonb from public.events e where e.id=(select id from fixtures where name=''published'')))','22023','CAPACITY_BELOW_REGISTRATIONS','capacity cannot shrink below participants');
select pg_temp.check_error('select public.admin_save_event((select to_jsonb(e)||''{"status":"draft"}''::jsonb from public.events e where e.id=(select id from fixtures where name=''published'')))','22023','PUBLISHED_EVENT_CANNOT_RETURN_TO_DRAFT','published event cannot be hidden as draft');
select pg_temp.check_true((public.admin_save_event((select to_jsonb(e)||'{"title":"Updated event","status":"closed"}'::jsonb from public.events e where e.id=(select id from fixtures where name='published')))).status='closed','admin can close event');
select pg_temp.check_true((select count(*)>=1 from public.audit_logs where action='event.updated'),'admin changes audited');
select pg_temp.check_error('insert into public.audit_logs(action,entity_id) values (''forged'',gen_random_uuid())','42501',null,'admin cannot forge audit records');
select pg_temp.check_error('update public.admin_users set active=false','42501',null,'admin cannot edit own allowlist');
select pg_temp.check_error('select public.admin_save_event((select to_jsonb(e)||''{"poster_url":"https:///"}''::jsonb from public.events e where e.id=(select id from fixtures where name=''published'')))','23514',null,'poster URL requires hostname');
select pg_temp.check_error('select public.admin_save_event((select to_jsonb(e)||''{"poster_url":"https://user:password@example.com/poster.png"}''::jsonb from public.events e where e.id=(select id from fixtures where name=''published'')))','23514',null,'poster URL credentials rejected');
select pg_temp.check_true(
  not has_function_privilege('authenticated','public.touch_event()','execute') and
  not has_function_privilege('authenticated','public.audit_event_change()','execute') and
  not has_function_privilege('authenticated','public.audit_identity_authority_change()','execute'),
  'internal trigger functions inaccessible to browser role');
select pg_temp.check_true((public.admin_save_event((select to_jsonb(e)||jsonb_build_object(
  'status','published','starts_at',now()-interval '1 hour','ends_at',now()+interval '1 hour',
  'registration_opens_at',now()-interval '2 hours','registration_closes_at',now()+interval '30 minutes')
  from public.events e where e.id=(select id from fixtures where name='draft')))).status='published',
  'admin-selected registration window may extend after event start');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='other'),true);
set local role authenticated;
select pg_temp.check_true((public.register_for_event((select id from fixtures where name='draft'))).user_id=auth.uid(),
  'registration during event allowed while configured window open');
reset role;

-- Every mutation gets a distinct cache version, even within this transaction.
create temporary table prior_version as select version from public.events where id=(select id from fixtures where name='published');
update public.events set title='Same transaction edit' where id=(select id from fixtures where name='published');
select pg_temp.check_true((select e.version>p.version from public.events e cross join prior_version p where e.id=(select id from fixtures where name='published')),'event cache revision changes per mutation');
update public.admin_users set active=false where user_id=(select id from fixtures where name='admin');
select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.check_true(not public.is_admin(),'revoked admin loses authority immediately');
select pg_temp.check_error('select public.admin_save_event(''{}''::jsonb)','42501','ADMIN_REQUIRED','revoked admin RPC denied');
reset role;

select count(*) as security_checks_passed from checks;
rollback;
