-- Run against MAIN after the announcements migration. All fixtures roll back.
begin;
create temporary table announcement_checks (name text primary key);
create temporary table announcement_fixtures (name text primary key, id uuid not null default gen_random_uuid());
insert into announcement_fixtures(name) values ('admin'),('student'),('other'),('event'),('other_event'),('draft');
grant select on announcement_fixtures to authenticated, anon;
grant insert, select on announcement_checks to authenticated, anon;
create function pg_temp.announcement_check(p_ok boolean, p_name text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %', p_name; end if;
  insert into announcement_checks values (p_name);
end;
$$;
create function pg_temp.announcement_error(p_sql text, p_state text, p_message text, p_name text) returns void language plpgsql as $$
declare v_failed boolean := false;
begin
  begin execute p_sql;
  exception when others then
    if sqlstate <> p_state or (p_message is not null and position(p_message in sqlerrm)=0) then
      raise exception 'FAILED: %, unexpected %: %', p_name, sqlstate, sqlerrm;
    end if;
    v_failed := true;
  end;
  perform pg_temp.announcement_check(v_failed, p_name);
end;
$$;
insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
select id, 'authenticated', 'authenticated', id::text || '@announcement-test.invalid', '{}', '{}'
from announcement_fixtures where name in ('admin','student','other');
insert into public.admin_users(user_id) select id from announcement_fixtures where name='admin';
insert into public.profiles(user_id,full_name,roll_number,department,academic_year,course,branch,section,mobile_number)
select id,name,upper(replace(id::text,'-','')),'Test',2,'B.Tech','CSE','A','9876543210'
from announcement_fixtures where name in ('student','other');
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,status,created_by)
select id,name,'Test',now()+interval '2 days',now()+interval '3 days','Test',now()-interval '1 day',now()+interval '1 day',
  case when name='draft' then 'draft' else 'published' end,(select id from announcement_fixtures where name='admin')
from announcement_fixtures where name in ('event','other_event','draft');
select pg_temp.announcement_check((select relrowsecurity from pg_class where oid='public.announcements'::regclass),'announcements RLS enabled');

set local role anon;
select pg_temp.announcement_error('select * from public.announcements','42501',null,'anonymous reads denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'')','42501',null,'anonymous publishing denied');
select pg_temp.announcement_error('insert into public.announcements(title) values (''forged'')','42501',null,'anonymous direct writes denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from announcement_fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.announcement_check((public.admin_publish_announcement(' Everyone ',' Global body ','all_students')).title='Everyone','admin publishes trimmed global notice');
select pg_temp.announcement_check((public.admin_publish_announcement('Event only','Registrant body','event_registrants',(select id from announcement_fixtures where name='event'))).published_by=auth.uid(),'publisher actor comes from session');
select public.admin_publish_announcement('Other event','Other body','event_registrants',(select id from announcement_fixtures where name='other_event'));
select pg_temp.announcement_check((public.admin_publish_announcement('Common signed OD','Use the shared signed PDF','event_registrants',(select id from announcement_fixtures where name='event'),'https://drive.google.com/file/d/shared-signed-od/view')).link_url='https://drive.google.com/file/d/shared-signed-od/view','OD stores one existing Drive URL');
select public.admin_publish_announcement('OD reminder','Same shared file','event_registrants',(select id from announcement_fixtures where name='event'),'https://drive.google.com/file/d/shared-signed-od/view');
select pg_temp.announcement_check((select count(distinct link_url)=1 from public.announcements where published_by=auth.uid() and link_url is not null),'reminders reuse the same OD PDF URL');
select pg_temp.announcement_check((select count(*)=5 from public.audit_logs a join public.announcements n on n.id=a.entity_id where n.published_by=auth.uid() and a.actor_id=auth.uid() and a.action='announcement.published' and a.created_at is not null and a.details->>'audience'=n.audience and a.details->>'delivery'='dashboard'),'each publish is audited with actor time and audience');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''event_registrants'')','22023','ANNOUNCEMENT_EVENT_REQUIRED','event audience requires event');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',(select id from announcement_fixtures where name=''draft''))','22023','ANNOUNCEMENT_EVENT_UNAVAILABLE','draft event association denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',gen_random_uuid())','22023','ANNOUNCEMENT_EVENT_UNAVAILABLE','missing event association denied');
select pg_temp.announcement_error('select public.admin_publish_announcement('' '',''B'',''all_students'')','22023','INVALID_ANNOUNCEMENT','empty title denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',repeat(''B'',10001),''all_students'')','22023','INVALID_ANNOUNCEMENT','oversized body denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''everyone'')','22023','INVALID_ANNOUNCEMENT','unknown audience denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''http://drive.google.com/file/d/test/view'')','22023','INVALID_ANNOUNCEMENT_LINK','HTTP URL denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''javascript:alert(1)'')','22023','INVALID_ANNOUNCEMENT_LINK','unsafe scheme denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://user:password@example.com/file'')','22023','INVALID_ANNOUNCEMENT_LINK','URL credentials denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https:///file'')','22023','INVALID_ANNOUNCEMENT_LINK','missing URL hostname denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://example..com/file'')','22023','INVALID_ANNOUNCEMENT_LINK','malformed URL hostname denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://example.com:99999/file'')','22023','INVALID_ANNOUNCEMENT_LINK','invalid URL port denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://example.com:0/file'')','22023','INVALID_ANNOUNCEMENT_LINK','zero URL port denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://example.com/has space'')','22023','INVALID_ANNOUNCEMENT_LINK','URL spaces denied');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'',null,''https://example.com/''||chr(92)||''evil'')','22023','INVALID_ANNOUNCEMENT_LINK','URL backslashes denied');
select pg_temp.announcement_error('insert into public.announcements(title) values (''forged'')','42501',null,'admin direct insert denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from announcement_fixtures where name='student'),true);
set local role authenticated;
select pg_temp.announcement_check((select count(*)=1 from public.announcements where published_by=(select id from announcement_fixtures where name='admin')),'non-registrant sees only global notice');
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'')','42501','ADMIN_REQUIRED','student publish RPC denied');
select pg_temp.announcement_error('insert into public.announcements(title) values (''forged'')','42501',null,'student direct insert denied');
select pg_temp.announcement_error('update public.announcements set audience=''all_students''','42501',null,'student audience edits denied');
select pg_temp.announcement_error('delete from public.announcements','42501',null,'student deletions denied');
select public.register_for_event((select id from announcement_fixtures where name='event'));
select pg_temp.announcement_check((select count(*)=4 from public.announcements where published_by=(select id from announcement_fixtures where name='admin')),'registrant sees global and own event notices');
select pg_temp.announcement_check((select count(*)=0 from public.announcements where event_id=(select id from announcement_fixtures where name='other_event')),'registrant cannot read other event notice');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from announcement_fixtures where name='other'),true);
set local role authenticated;
select pg_temp.announcement_check((select count(*)=1 from public.announcements where published_by=(select id from announcement_fixtures where name='admin')),'other student cannot inherit another registration audience');
reset role;
update public.admin_users set active=false where user_id=(select id from announcement_fixtures where name='admin');
select set_config('request.jwt.claim.sub',(select id::text from announcement_fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.announcement_error('select public.admin_publish_announcement(''T'',''B'',''all_students'')','42501','ADMIN_REQUIRED','revoked admin cannot publish');
reset role;
select count(*) as passed_announcement_checks from announcement_checks;
rollback;
