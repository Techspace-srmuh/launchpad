-- Real authorization/eligibility checks. All synthetic data rolls back.
begin;
create temporary table checks (name text primary key);
create temporary table fixtures (name text primary key, id uuid not null default gen_random_uuid());
insert into fixtures(name) values ('owner'),('claim'),('student'),('other'),('event');
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
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@launchpad-test.invalid',now(),'{}',
  '{"provider":"google","email_verified":true}'::jsonb from fixtures where name <> 'event';
insert into public.admin_users(user_id) select id from fixtures where name='owner';
insert into public.admin_email_access(email,reason)
select id::text||'@launchpad-test.invalid','Synthetic approved Google bootstrap' from fixtures where name='claim';
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,capacity,status,created_by)
select id,'Onboarding security fixture','Synthetic test',now()+interval '2 days',now()+interval '3 days','Test',
  now()-interval '1 hour',now()+interval '1 day',10,'published',(select id from fixtures where name='owner')
from fixtures where name='event';
select pg_temp.check_true((select relrowsecurity from pg_class where oid='public.admin_email_access'::regclass),'admin email RLS enabled');
set local role anon;
select pg_temp.check_error('select * from public.admin_email_access','42501',null,'anonymous allowlist reads denied');
select pg_temp.check_error('select public.sync_admin_access()','42501',null,'anonymous bootstrap denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='claim'),true);
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'editable metadata cannot claim approved admin email');
reset role;
insert into auth.identities(user_id,provider_id,provider,identity_data)
select id,id::text,'google',jsonb_build_object('sub',id,'email',id::text||'@launchpad-test.invalid','email_verified',false)
from fixtures where name='claim';
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'unverified Google identity cannot claim admin');
reset role;
update auth.identities set identity_data=identity_data||'{"email_verified":true,"email":"mismatch@example.test"}'::jsonb
where user_id=(select id from fixtures where name='claim');
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'mismatched Google email cannot claim admin');
reset role;
update auth.identities set identity_data=identity_data||jsonb_build_object('email',user_id::text||'@launchpad-test.invalid')
where user_id=(select id from fixtures where name='claim');
update auth.users set email_confirmed_at=null where id=(select id from fixtures where name='claim');
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'unconfirmed account cannot claim admin');
reset role;
update auth.users set email_confirmed_at=now() where id=(select id from fixtures where name='claim');
set local role authenticated;
select pg_temp.check_true(public.sync_admin_access(),'approved confirmed Google identity claims admin');
select pg_temp.check_true(public.is_admin(),'bootstrap grants backend authority');
select pg_temp.check_true(public.sync_admin_access(),'bootstrap is idempotent');
select pg_temp.check_true((select count(*)=1 from public.admin_users where user_id=auth.uid()),'one authority record per account');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='student'),true);
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'ordinary account remains student');
select pg_temp.check_true((select count(*)=0 from public.admin_email_access),'student allowlist reads isolated');
select pg_temp.check_error('select public.admin_list_access()','42501','ADMIN_REQUIRED','student admin directory denied');
select pg_temp.check_error('select public.admin_set_access(''x@example.test'',true,''Self promote'')','42501','ADMIN_REQUIRED','student role mutation denied');
select pg_temp.check_error('insert into public.admin_email_access(email,reason) values (''x@example.test'',''Forged'')','42501',null,'student direct allowlist writes denied');
select pg_temp.check_error('select public.register_for_event((select id from fixtures where name=''event''))','42501','PROFILE_REQUIRED','missing onboarding denied');
select pg_temp.check_error('select public.save_profile(''Student'','' R 123 '',''CS'',2,null,''CSE'',''A'',''9876543210'')','22023','PROFILE_DETAILS_REQUIRED','incomplete onboarding rejected');
select pg_temp.check_error('select public.save_profile(''Student'',''R123'',''CS'',2,''B.Tech'',''CSE'',''A'',''not-a-number'')','23514',null,'invalid mobile rejected');
select pg_temp.check_true((public.save_profile('Student',' R 123 ','CS',2,'B.Tech','CSE','A','+91 (98765) 43210')).mobile_number='+919876543210','mobile formatting normalized');
select pg_temp.check_true((select roll_number='R123' and verification_status='unverified' from public.profiles where user_id=auth.uid()),'self-declared onboarding keeps roll unique and does not claim verification');
select pg_temp.check_true((public.register_for_event((select id from fixtures where name='event'))).user_id=auth.uid(),'completed unverified profile registers immediately');
select pg_temp.check_true(not public.is_admin(),'onboarding grants no admin authority');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='other'),true);
set local role authenticated;
select pg_temp.check_error('select public.save_profile(''Other'','' r123 '',''CS'',2,''B.Tech'',''CSE'',''A'',''9876543210'')','23505',null,'duplicate roll denied across Google or personal accounts');
select pg_temp.check_true((select count(*)=0 from public.profiles),'student mobile and other profile fields remain private');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='owner'),true);
set local role authenticated;
select pg_temp.check_error('select public.admin_set_access(''bad-email'',true,''Test reason'')','22023','INVALID_ADMIN_EMAIL','invalid role email rejected');
select pg_temp.check_error('select public.admin_set_access(''unknown@example.test'',true,''Test reason'')','P0002','ACCOUNT_NOT_FOUND','unknown account cannot receive manual access');
select pg_temp.check_error('select public.admin_set_access(''x@example.test'',true,'' '')','22023','INVALID_ADMIN_REASON','role change requires audit reason');
select public.admin_set_access((select id::text||'@launchpad-test.invalid' from fixtures where name='student'),true,'Approved club operator');
select pg_temp.check_true((select active from public.admin_list_access() where user_id=(select id from fixtures where name='student')),'manual grant persists backend authority');
select pg_temp.check_true((select count(*)>=1 from public.admin_list_access()),'admin directory available to admin');
select pg_temp.check_error('select public.admin_set_access((select id::text||''@launchpad-test.invalid'' from fixtures where name=''owner''),false,''Remove myself'')','22023','SELF_REVOKE_NOT_ALLOWED','self-revocation denied');
select pg_temp.check_true((select exists(select 1 from public.audit_logs where action='admin.email_access_changed' and actor_id=auth.uid() and details->>'reason'='Approved club operator')),'role grant records real actor and reason');
select public.admin_set_access((select id::text||'@launchpad-test.invalid' from fixtures where name='student'),false,'Operator access no longer needed');
select public.admin_set_access((select id::text||'@launchpad-test.invalid' from fixtures where name='claim'),false,'Bootstrap access revoked for fixture');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='student'),true);
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'manual revocation survives account refresh');
select pg_temp.check_error('select public.admin_list_access()','42501','ADMIN_REQUIRED','revoked admin directory denied immediately');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from fixtures where name='claim'),true);
set local role authenticated;
select pg_temp.check_true(not public.sync_admin_access(),'revoked Google allowlist cannot auto-promote again');
select pg_temp.check_error('select public.admin_set_access(''x@example.test'',true,''Revoked actor'')','42501','ADMIN_REQUIRED','revoked Google admin cannot mutate roles');
reset role;
select pg_temp.check_true(not has_function_privilege('authenticated','public.audit_admin_email_access()','execute'),'audit trigger RPC not exposed');
select count(*) as onboarding_admin_checks_passed from checks;
rollback;
