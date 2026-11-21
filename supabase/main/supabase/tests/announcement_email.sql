-- MAIN development only. No SMTP, no persistent fixtures: everything rolls back.
begin;
create temporary table email_checks(name text primary key);
create temporary table email_fixtures(name text primary key,id uuid not null default gen_random_uuid());
insert into email_fixtures(name) values('admin'),('student'),('other'),('outsider'),('event'),('notice'),('token1'),('token2');
create temporary table email_claimed(id uuid,recipient text,subject text,body text);
grant select,insert on email_checks,email_claimed to authenticated,anon,service_role;
grant select on email_fixtures to authenticated,anon,service_role;
create function pg_temp.email_check(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAILED: %',label; end if;
  insert into email_checks values(label);
end; $$;
create function pg_temp.email_error(statement text,expected text,label text) returns void language plpgsql as $$
declare denied boolean:=false;
begin
  begin execute statement;
  exception when others then
    if position(expected in sqlerrm)=0 then raise exception 'FAILED: % unexpected %',label,sqlerrm; end if;
    denied:=true;
  end;
  perform pg_temp.email_check(denied,label);
end; $$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text || '@email-test.invalid',now(),'{}','{}'
from email_fixtures where name in ('admin','student','other','outsider');
insert into public.admin_users(user_id,active) select id,true from email_fixtures where name='admin';
insert into public.profiles(user_id,full_name,roll_number,department,academic_year)
select id,case when name='student' then 'Harsh {link}' else 'Student ' || name end,upper(replace(id::text,'-','')),'CSE',2
from email_fixtures where name in ('student','other','outsider');
insert into public.events(id,title,description,starts_at,ends_at,venue,registration_opens_at,registration_closes_at,status,created_by)
values((select id from email_fixtures where name='event'),'Email Event','Test',now()+interval '2 days',now()+interval '3 days','Hall',now()-interval '1 day',now()+interval '1 day','published',(select id from email_fixtures where name='admin'));
insert into public.registrations(event_id,user_id)
select (select id from email_fixtures where name='event'),id from email_fixtures where name in ('student','other');
insert into public.announcements(id,event_id,title,body,link_url,audience,published_by)
values((select id from email_fixtures where name='notice'),(select id from email_fixtures where name='event'),'Email Notice','Dashboard record','https://drive.google.com/example','event_registrants',(select id from email_fixtures where name='admin'));

set local role anon;
select pg_temp.email_error($q$select public.admin_email_progress('{}')$q$,'permission denied','anonymous progress denied');
select pg_temp.email_error($q$select public.email_worker_batch(gen_random_uuid())$q$,'permission denied','anonymous worker denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from email_fixtures where name='student'),true);
set local role authenticated;
select pg_temp.email_error($q$select public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),'Hello','Hi')$q$,'ADMIN_REQUIRED','student queue denied');
select pg_temp.email_error($q$select public.admin_email_progress('{}')$q$,'ADMIN_REQUIRED','student progress denied');
select pg_temp.email_error($q$select public.admin_email_job_status(gen_random_uuid())$q$,'ADMIN_REQUIRED','student recipient details denied');
select pg_temp.email_error($q$select public.admin_retry_email_campaign(gen_random_uuid(),'Reason',true)$q$,'ADMIN_REQUIRED','student retry denied');
select pg_temp.email_error($q$select * from public.email_jobs$q$,'permission denied','student private queue denied');
select pg_temp.email_error($q$select public.email_worker_batch(gen_random_uuid())$q$,'permission denied','student worker denied');
reset role;
select set_config('request.jwt.claim.sub',(select id::text from email_fixtures where name='admin'),true);
set local role authenticated;
select pg_temp.email_error($q$select * from public.email_jobs$q$,'permission denied','admin direct private queue denied');
select pg_temp.email_error($q$select public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),'Hello','{password}')$q$,'UNKNOWN_EMAIL_PLACEHOLDER','unknown placeholders denied');
select pg_temp.email_error($q$select public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),E'Hello\nBCC: bad','Hi')$q$,'INVALID_EMAIL_TEMPLATE','subject header injection denied');
select pg_temp.email_check(
  public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),'Hello {name}','Hi {name}, {event_name} {event_date} {link}')
  = public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),'Hello {name}','Hi {name}, {event_name} {event_date} {link}'),
  'queue idempotent for same notice');
select pg_temp.email_error($q$select public.admin_queue_announcement_email((select id from email_fixtures where name='notice'),'Changed','Hi')$q$,'EMAIL_ALREADY_QUEUED','changed campaign cannot duplicate sends');
select pg_temp.email_check((public.admin_email_progress(array[(select id from email_fixtures where name='notice')])->'campaigns'->0->>'total')::integer=2,'progress exact audience count');
select pg_temp.email_check((select count(*)=2 from public.admin_email_job_status((public.admin_email_progress(array[(select id from email_fixtures where name='notice')])->'campaigns'->0->>'id')::uuid)),'admin can review exact recipients');
reset role;
select pg_temp.email_check((select count(*)=2 from public.email_jobs j join public.email_campaigns c on c.id=j.campaign_id where c.announcement_id=(select id from email_fixtures where name='notice')),'only two registrants queued');
select pg_temp.email_check(not exists(select 1 from public.email_jobs where user_id=(select id from email_fixtures where name='outsider')),'outsider excluded from email audience');
select pg_temp.email_check(exists(select 1 from public.email_jobs where user_id=(select id from email_fixtures where name='student') and subject='Hello Harsh {link}' and body like 'Hi Harsh {link}, Email Event % IST https://drive.google.com/example'),'personalization single pass and shared OD');
select pg_temp.email_check(exists(select 1 from public.audit_logs where action='announcement.email_queued' and details->>'recipients'='2'),'queue audited');
-- Isolate this rolled-back worker test from any pre-existing real queued jobs.
update public.email_jobs set next_attempt_at=now()+interval '7 days'
where campaign_id not in(select id from public.email_campaigns where announcement_id=(select id from email_fixtures where name='notice'));
update public.email_worker_state set lease_token=null,lease_until=null,next_batch_at=now()-interval '1 second';
set local role service_role;
select pg_temp.email_error($q$select * from public.email_jobs$q$,'permission denied','worker direct table access denied');
select pg_temp.email_check(public.email_worker_batch((select id from email_fixtures where name='token1')),'first worker acquires batch');
select pg_temp.email_check(not public.email_worker_batch((select id from email_fixtures where name='token2')),'overlapping worker blocked');
select pg_temp.email_check(not exists(select 1 from public.email_worker_claim((select id from email_fixtures where name='token2'))),'wrong lease cannot claim');
insert into email_claimed select id,recipient,subject,body from public.email_worker_claim((select id from email_fixtures where name='token1'));
select pg_temp.email_check((select count(*)=1 from email_claimed),'one job claimed just before send');
select pg_temp.email_error($q$select public.email_worker_finish((select id from email_fixtures where name='token2'),(select id from email_claimed),'accepted')$q$,'EMAIL_LEASE_LOST','wrong worker cannot acknowledge');
select public.email_worker_finish((select id from email_fixtures where name='token1'),(select id from email_claimed),'retry','SMTP_TEMPORARY_REJECTION');
reset role;
select pg_temp.email_check((select status='retry' and attempts=1 and next_attempt_at>now()+interval '1 minute' from public.email_jobs where id=(select id from email_claimed)),'temporary failure backs off');
truncate email_claimed;
set local role service_role;
insert into email_claimed select id,recipient,subject,body from public.email_worker_claim((select id from email_fixtures where name='token1'));
select public.email_worker_finish((select id from email_fixtures where name='token1'),(select id from email_claimed),'accepted');
select public.email_worker_release((select id from email_fixtures where name='token1'));
select pg_temp.email_check(not public.email_worker_batch((select id from email_fixtures where name='token2')),'batch pacing survives restart');
reset role;
select pg_temp.email_check((select status='accepted' and accepted_at is not null from public.email_jobs where id=(select id from email_claimed)),'accepted message recorded');
-- Crash recovery never automatically re-sends a message of uncertain acceptance.
update public.email_jobs set status='sending',lease_until=now()-interval '1 minute' where id=(select id from email_claimed);
update public.email_worker_state set next_batch_at=now()-interval '1 second';
set local role service_role;
select public.email_worker_batch((select id from email_fixtures where name='token2'));
reset role;
select pg_temp.email_check((select status='unknown' and last_error='WORKER_INTERRUPTED' from public.email_jobs where id=(select id from email_claimed)),'crash becomes uncertain instead of duplicate');
set local role authenticated;
select pg_temp.email_error($q$select public.admin_retry_email_campaign((select (public.admin_email_progress(array[(select id from email_fixtures where name='notice')])->'campaigns'->0->>'id')::uuid),'',true)$q$,'EMAIL_RETRY_REASON_REQUIRED','retry requires reason');
select pg_temp.email_check(public.admin_retry_email_campaign((public.admin_email_progress(array[(select id from email_fixtures where name='notice')])->'campaigns'->0->>'id')::uuid,'Checked Sent folder',false)=0,'uncertain requires explicit opt in');
select pg_temp.email_check(public.admin_retry_email_campaign((public.admin_email_progress(array[(select id from email_fixtures where name='notice')])->'campaigns'->0->>'id')::uuid,'Checked Sent folder',true)=1,'reviewed uncertain can retry');
reset role;
select pg_temp.email_check(exists(select 1 from public.audit_logs where action='announcement.email_retry' and details->>'include_unknown'='true'),'reviewed retry audited');
-- Quota pause is a provider response, never an application daily recipient cap.
update public.email_jobs set status='sending',lease_token=(select id from email_fixtures where name='token2') where id=(select id from email_claimed);
set local role service_role;
select public.email_worker_finish((select id from email_fixtures where name='token2'),(select id from email_claimed),'quota','GMAIL_QUOTA');
reset role;
select pg_temp.email_check((select next_batch_at>now()+interval '23 hours' and last_error='GMAIL_QUOTA_PAUSED' from public.email_worker_state),'provider quota pauses all workers');
select pg_temp.email_check((select body='Dashboard record' from public.announcements where id=(select id from email_fixtures where name='notice')),'email failure preserves dashboard notice');
update public.email_jobs set status='sending',attempts=5,lease_token=(select id from email_fixtures where name='token2') where id=(select id from email_claimed);
set local role service_role;
select public.email_worker_finish((select id from email_fixtures where name='token2'),(select id from email_claimed),'retry','SMTP_TEMPORARY_REJECTION');
reset role;
select pg_temp.email_check((select status='failed' from public.email_jobs where id=(select id from email_claimed)),'five temporary rejections stop automatic retries');
update public.email_jobs set status='sending',lease_token=(select id from email_fixtures where name='token2') where id=(select id from email_claimed);
set local role service_role;
select public.email_worker_finish((select id from email_fixtures where name='token2'),(select id from email_claimed),'auth','GMAIL_AUTH');
reset role;
select pg_temp.email_check((select next_batch_at>now()+interval '59 minutes' and last_error='GMAIL_AUTH_PAUSED' from public.email_worker_state),'authentication failure pauses sender');
update public.email_jobs set next_attempt_at=now()+interval '7 days';
update public.email_jobs set next_attempt_at=now(),status='retry',recipient='changed@example.invalid' where id=(select id from email_claimed);
update public.email_worker_state set next_batch_at=now()-interval '1 second',lease_token=null,lease_until=null;
set local role service_role;
select public.email_worker_batch((select id from email_fixtures where name='token1'));
select pg_temp.email_check(not exists(select 1 from public.email_worker_claim((select id from email_fixtures where name='token1'))),'changed address never returned to sender');
reset role;
select pg_temp.email_check((select status='cancelled' from public.email_jobs where id=(select id from email_claimed)),'changed address recorded as skipped');
-- Enforce ten per batch in SQL as well as in the worker loop.
insert into email_fixtures(name) select 'bulk-' || n from generate_series(1,12) n;
insert into email_fixtures(name) values('bulk-notice');
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
select id,'authenticated','authenticated',id::text || '@email-test.invalid',now(),'{}','{}' from email_fixtures where name ~ '^bulk-[0-9]+$';
insert into public.profiles(user_id,full_name,roll_number,department,academic_year)
select id,'Batch Student',upper(replace(id::text,'-','')),'CSE',2 from email_fixtures where name ~ '^bulk-[0-9]+$';
insert into public.registrations(event_id,user_id) select (select id from email_fixtures where name='event'),id from email_fixtures where name ~ '^bulk-[0-9]+$';
insert into public.announcements(id,event_id,title,body,audience,published_by)
values((select id from email_fixtures where name='bulk-notice'),(select id from email_fixtures where name='event'),'Batch Notice','Test','event_registrants',(select id from email_fixtures where name='admin'));
set local role authenticated;
select public.admin_queue_announcement_email((select id from email_fixtures where name='bulk-notice'),'Batch','Hi {name}');
reset role;
update public.email_worker_state set next_batch_at=now()-interval '1 second',lease_token=null,lease_until=null;
set local role service_role;
select public.email_worker_batch((select id from email_fixtures where name='token2'));
do $$ declare j public.email_jobs; i integer; begin
  for i in 1..10 loop
    select * into j from public.email_worker_claim((select id from email_fixtures where name='token2'));
    if j.id is null then raise exception 'FAILED: missing batch job'; end if;
    perform public.email_worker_finish((select id from email_fixtures where name='token2'),j.id,'accepted');
  end loop;
end; $$;
select pg_temp.email_check(not exists(select 1 from public.email_worker_claim((select id from email_fixtures where name='token2'))),'eleventh claim blocked by database');
reset role;
select pg_temp.email_check((select count(*)=10 from public.email_jobs where campaign_id=(select id from public.email_campaigns where announcement_id=(select id from email_fixtures where name='bulk-notice')) and status='accepted'),'batch accepted exactly ten individual jobs');
update public.admin_users set active=false where user_id=(select id from email_fixtures where name='admin');
set local role authenticated;
select pg_temp.email_error($q$select public.admin_email_progress('{}')$q$,'ADMIN_REQUIRED','revoked admin loses progress access');
reset role;
select count(*) as passed_email_checks from email_checks;
rollback;
