-- MAIN development DB after migration 20261120070000. Fixtures roll back.
begin;
create temporary table export_checks(name text primary key);
create temporary table export_fixtures(name text primary key,id uuid not null default gen_random_uuid());
insert into export_fixtures(name) values('admin'),('student'),('second'),('outsider'),('event'),('other_event');
grant select on export_fixtures to authenticated,anon;
grant select,insert on export_checks to authenticated,anon;
create function pg_temp.export_check(p_ok boolean,p_name text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %',p_name; end if;
  insert into export_checks values(p_name);
end;
$$;
create function pg_temp.export_error(p_sql text,p_state text,p_message text,p_name text) returns void language plpgsql as $$
declare v_failed boolean:=false;
begin
  begin execute p_sql;
  exception when others then
    if sqlstate<>p_state or (p_message is not null and position(p_message in sqlerrm)=0) then
      raise exception 'FAILED: %, unexpected %: %',p_name,sqlstate,sqlerrm;
    end if;
    v_failed:=true;
  end;
  perform pg_temp.export_check(v_failed,p_name);
end;
$$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@export-test.invalid','{}','{}'
from export_fixtures where name in('admin','student','second','outsider');
insert into public.admin_users(user_id) select id from export_fixtures where name='admin';
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,course,branch,section,mobile_number)
select id,case when name='student' then 'Alice% Unicode தமிழ்' else name end,
  upper(replace(id::text,'-','')),'CSE',case when name='second' then 3 else 2 end,'B.Tech','CSE','A','9876543210'
from export_fixtures where name in('student','second','outsider');
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,status,created_by)
select id,name,'Export test',now()+interval '2 days',now()+interval '3 days','Test',now()-interval '1 day',now()+interval '1 day','published',
  (select id from export_fixtures where name='admin') from export_fixtures where name in('event','other_event');
insert into public.registrations(event_id,user_id)
select (select id from export_fixtures where name=case when p.name='outsider' then 'other_event' else 'event' end),p.id
from export_fixtures p where name in('student','second','outsider');
set local role anon;
select pg_temp.export_error('select public.admin_event_participant_export(gen_random_uuid())','42501',null,'anonymous export denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from export_fixtures where name='student'),true);
set local role authenticated;
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''))','42501','ADMIN_REQUIRED','student preview denied');
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),null,null,null,true)','42501','ADMIN_REQUIRED','student download denied');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select pg_temp.export_error('select public.admin_event_participant_export(gen_random_uuid())','42501','ADMIN_REQUIRED','missing identity denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from export_fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'))->>'count')::integer=2,'event isolation');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),' cSe ',2,'aLiCe')->>'count')::integer=1,'combined normalized filters');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),null,null,'%')->>'count')::integer=1,'percent search is literal');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),null,null,'_')->>'count')::integer=0,'underscore search is literal');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),'missing')->>'count')::integer=0,'empty result is valid');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),null,null,(select lower(roll_number) from public.profiles where user_id=(select id from export_fixtures where name='student')))->>'count')::integer=1,'registration number search ignores case');
select pg_temp.export_check(not exists(select 1 from public.audit_logs where action='participants.export_prepared' and entity_id=(select id from export_fixtures where name='event')),'preview does not claim export');
select pg_temp.export_check((select array_agg(key order by key)=array['academic_year','branch','course','department','full_name','registered_at','roll_number','section'] from jsonb_object_keys(public.admin_event_participant_export((select id from export_fixtures where name='event'))->'rows'->0) as key),'only eight approved fields exposed');
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),'cse',2,null,true)->>'count')::integer=1,'download uses preview filters');
select pg_temp.export_check((select count(*)=1 from public.audit_logs where action='participants.export_prepared' and actor_id=auth.uid() and entity_id=(select id from export_fixtures where name='event') and (details->>'count')::integer=1 and details->'filters'->>'department'='cse' and (details->'filters'->>'academic_year')::integer=2),'audit actor event filters count');
select pg_temp.export_error('select public.admin_event_participant_export(gen_random_uuid())','P0002','EVENT_UNAVAILABLE','missing event rejected');
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),null,9)','22023','INVALID_EXPORT_FILTER','invalid year rejected');
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),null,null,repeat(''x'',121))','22023','INVALID_EXPORT_FILTER','oversized search rejected');
reset role;
create temporary table export_bulk(id uuid primary key default gen_random_uuid(),n integer);
insert into export_bulk(n) select generate_series(1,1001);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@export-test.invalid','{}','{}' from export_bulk;
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,course,branch,section,mobile_number)
select id,'Bulk '||n,upper(replace(id::text,'-','')),'Bulk',1,'B.Tech','CSE','B','9876543210' from export_bulk;
insert into public.registrations(event_id,user_id) select (select id from export_fixtures where name='event'),id from export_bulk;
set local role authenticated;
select pg_temp.export_check((public.admin_event_participant_export((select id from export_fixtures where name='event'),'Bulk')->>'count')::integer=1001 and jsonb_array_length(public.admin_event_participant_export((select id from export_fixtures where name='event'),'Bulk')->'rows')=10,'preview counts all and shows ten');
select pg_temp.export_check(jsonb_array_length(public.admin_event_participant_export((select id from export_fixtures where name='event'),'Bulk',null,null,true)->'rows')=1001,'download exceeds PostgREST row cap');
reset role;
truncate export_bulk;
insert into export_bulk(n) select generate_series(1,9000);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@export-test.invalid','{}','{}' from export_bulk;
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,course,branch,section,mobile_number)
select id,'Overflow '||n,upper(replace(id::text,'-','')),'Overflow',1,'B.Tech','CSE','B','9876543210' from export_bulk;
insert into public.registrations(event_id,user_id) select (select id from export_fixtures where name='event'),id from export_bulk;
set local role authenticated;
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),null,null,null,true)','54000','EXPORT_TOO_LARGE','oversized download rejects partial result');
select pg_temp.export_check((select count(*)=2 from public.audit_logs where action='participants.export_prepared' and entity_id=(select id from export_fixtures where name='event')),'failed export creates no success audit');
reset role;
update public.admin_users set active=false where user_id=(select id from export_fixtures where name='admin');
set local role authenticated;
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),''Bulk'')','42501','ADMIN_REQUIRED','revoked admin preview denied');
select pg_temp.export_error('select public.admin_event_participant_export((select id from export_fixtures where name=''event''),''Bulk'',null,null,true)','42501','ADMIN_REQUIRED','revoked admin download denied');
reset role;
select count(*) as passed_participant_export_checks from export_checks;
rollback;
