-- MAIN, after event-materials migration. Fixtures and mutations always roll back.
begin;
create temporary table material_checks(name text primary key);
create temporary table material_fixtures(name text primary key,id uuid not null default gen_random_uuid());
insert into material_fixtures(name) values('admin'),('student'),('event'),('other_event'),('draft');
grant select on material_fixtures to authenticated,anon;
grant select,insert on material_checks to authenticated,anon;
create function pg_temp.material_check(p_ok boolean,p_name text) returns void language plpgsql as $$
begin
  if p_ok is distinct from true then raise exception 'FAILED: %',p_name; end if;
  insert into material_checks values(p_name);
end;
$$;
create function pg_temp.material_error(p_sql text,p_state text,p_message text,p_name text) returns void language plpgsql as $$
declare v_failed boolean:=false;
begin
  begin execute p_sql;
  exception when others then
    if sqlstate<>p_state or (p_message is not null and position(p_message in sqlerrm)=0) then
      raise exception 'FAILED: %, unexpected %: %',p_name,sqlstate,sqlerrm;
    end if;
    v_failed:=true;
  end;
  perform pg_temp.material_check(v_failed,p_name);
end;
$$;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text||'@materials-test.invalid','{}','{}'
from material_fixtures where name in ('admin','student');
insert into public.admin_users(user_id) select id from material_fixtures where name='admin';
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,status,created_by)
select id,name,'Test',now()+interval '2 days',now()+interval '3 days','Test',now()-interval '1 day',now()+interval '1 day',
  case when name='draft' then 'draft' else 'published' end,(select id from material_fixtures where name='admin')
from material_fixtures where name in ('event','other_event','draft');
select pg_temp.material_check((select relrowsecurity from pg_class where oid='public.event_materials'::regclass),'RLS enabled');

set local role anon;
select pg_temp.material_error('select * from public.event_materials','42501',null,'anonymous reads denied');
select pg_temp.material_error('select public.admin_save_event_material(null,''resource'',''T'',''https://example.com'',true,0)','42501',null,'anonymous RPC denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from material_fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.material_check((public.admin_save_event_material((select id from material_fixtures where name='event'),'resource',' First ','https://drive.google.com/file/d/example/view',true,0)).label='First','admin creates trimmed resource');
select public.admin_save_event_material((select id from material_fixtures where name='event'),'gallery','Photos','https://photos.app.goo.gl/Album123',true,-1);
select public.admin_save_event_material((select id from material_fixtures where name='event'),'resource','Hidden','https://example.com/hidden',false,1);
select public.admin_save_event_material((select id from material_fixtures where name='draft'),'gallery','Draft photos','https://photos.google.com/share/Album_123',true,0);
select public.admin_save_event_material((select id from material_fixtures where name='other_event'),'resource','Other event','https://example.com/other',true,0);
select pg_temp.material_check((select count(*)=5 from public.event_materials where created_by=auth.uid()),'admin reads published hidden and draft materials');
select pg_temp.material_check((select array_agg(label order by display_order,id)=array['Photos','First','Hidden'] from public.event_materials where event_id=(select id from material_fixtures where name='event')),'stable order by display order and UUID');
select pg_temp.material_check((public.admin_save_event_material((select id from material_fixtures where name='event'),'resource','First updated','https://example.com/slides',true,3,(select id from public.event_materials where label='First' and created_by=auth.uid()))).url='https://example.com/slides','admin edits resource');
select pg_temp.material_error('select public.admin_save_event_material(gen_random_uuid(),''resource'',''T'',''https://example.com'',true,0)','22023','EVENT_UNAVAILABLE','missing event denied');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''other_event''),''resource'',''T'',''https://example.com'',true,0,(select id from public.event_materials where label=''First updated'' and created_by=auth.uid()))','22023','MATERIAL_UNAVAILABLE','editing cannot move material to another event');
select pg_temp.material_error('select public.admin_delete_event_material((select id from material_fixtures where name=''other_event''),(select id from public.event_materials where label=''First updated'' and created_by=auth.uid()))','22023','MATERIAL_UNAVAILABLE','deleting requires matching event');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''resource'','' '',''https://example.com'',true,0)','22023','INVALID_EVENT_MATERIAL','blank label denied');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''resource'',repeat(''x'',161),''https://example.com'',true,0)','22023','INVALID_EVENT_MATERIAL','oversized label denied');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''od'',''T'',''https://example.com'',true,0)','22023','INVALID_EVENT_MATERIAL','OD is not a material kind');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''resource'',''T'',''https://example.com'',null,0)','22023','INVALID_EVENT_MATERIAL','explicit visibility required');
select pg_temp.material_error('insert into public.event_materials(label) values(''forged'')','42501',null,'admin direct insert denied');
select pg_temp.material_error('update public.event_materials set published=true','42501',null,'admin direct update denied');
select pg_temp.material_error('delete from public.event_materials','42501',null,'admin direct delete denied');

-- Validate each hostile URL through the real mutation endpoint.
do $$
declare v_url text;
begin
  foreach v_url in array array['http://example.com','javascript:alert(1)','https://user:pass@example.com/file',
    'https:///file','https://example..com','https://example.com:0/file','https://example.com:99999/file',
    'https://example.com/has space','https://example.com/'||chr(92)||'evil','https://example.com/'||chr(10)] loop
    perform pg_temp.material_error(format('select public.admin_save_event_material(%L,''resource'',''T'',%L,true,0)',
      (select id from material_fixtures where name='event'),v_url),'22023','INVALID_EVENT_MATERIAL','invalid resource URL '||encode(convert_to(v_url,'UTF8'),'hex'));
  end loop;
  foreach v_url in array array['https://example.com/album/123','https://photos.app.goo.gl.evil.com/123',
    'https://photos.google.com','https://photos.google.com/photos','https://photos.app.goo.gl/',
    'https://photos.google.com:444/share/123','https://photos.google.com.evil.com/share/123'] loop
    perform pg_temp.material_error(format('select public.admin_save_event_material(%L,''gallery'',''T'',%L,true,0)',
      (select id from material_fixtures where name='event'),v_url),'22023','INVALID_EVENT_MATERIAL','invalid gallery URL '||v_url);
  end loop;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub',(select id::text from material_fixtures where name='student'),true);
set local role authenticated;
select pg_temp.material_check((select count(*)=3 from public.event_materials where event_id in(select id from material_fixtures)),'student sees published materials of visible events only');
select pg_temp.material_check((select count(*)=0 from public.event_materials where event_id=(select id from material_fixtures where name='draft')),'direct draft material reads hidden');
select pg_temp.material_check((select count(*)=0 from public.event_materials where label='Hidden'),'direct unpublished material reads hidden');
select pg_temp.material_check((select count(*)=2 from public.event_materials where event_id=(select id from material_fixtures where name='event')),'event filtering does not include other event materials');
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''resource'',''Forged'',''https://example.com'',true,0)','42501','ADMIN_REQUIRED','student save RPC denied');
select pg_temp.material_error('select public.admin_delete_event_material((select id from material_fixtures where name=''event''),gen_random_uuid())','42501','ADMIN_REQUIRED','student delete RPC denied');
select pg_temp.material_error('insert into public.event_materials(label) values(''forged'')','42501',null,'student direct insert denied');
select pg_temp.material_error('update public.event_materials set published=true','42501',null,'student direct update denied');
select pg_temp.material_error('delete from public.event_materials','42501',null,'student direct delete denied');
reset role;

select set_config('request.jwt.claim.sub',(select id::text from material_fixtures where name='admin'),true);
set local role authenticated;
select public.admin_delete_event_material((select id from material_fixtures where name='event'),(select id from public.event_materials where label='First updated' and created_by=auth.uid()));
select pg_temp.material_check((select count(*)=0 from public.event_materials where label='First updated'),'admin deletes material');
select pg_temp.material_check((select count(*)=7 from public.audit_logs where actor_id=auth.uid() and action like 'event_material.%' and created_at is not null and details->>'event_id' in(select id::text from material_fixtures)),'create update delete audited with actor time and event');
select pg_temp.material_check((select count(*)=1 from public.audit_logs where actor_id=auth.uid() and action='event_material.updated' and details->'before'->>'label'='First' and details->'after'->>'label'='First updated'),'update audit preserves before and after');
select pg_temp.material_check((select count(*)=1 from public.audit_logs where actor_id=auth.uid() and action='event_material.deleted' and details->'before'->>'url'='https://example.com/slides'),'delete audit preserves removed material');
reset role;
update public.admin_users set active=false where user_id=(select id from material_fixtures where name='admin');
set local role authenticated;
select pg_temp.material_error('select public.admin_save_event_material((select id from material_fixtures where name=''event''),''resource'',''T'',''https://example.com'',true,0)','42501','ADMIN_REQUIRED','revoked admin save denied');
select pg_temp.material_error('select public.admin_delete_event_material((select id from material_fixtures where name=''event''),gen_random_uuid())','42501','ADMIN_REQUIRED','revoked admin delete denied');
reset role;
select count(*) as passed_event_material_checks from material_checks;
rollback;
