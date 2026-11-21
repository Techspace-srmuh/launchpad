-- Gmail delivery is opt-in through a separately operated server-only worker.
begin;

create table public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null unique references public.announcements(id) on delete restrict,
  subject_template text not null,
  body_template text not null,
  queued_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp()
);
create table public.email_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending','sending','accepted','retry','failed','unknown','cancelled')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text,
  accepted_at timestamptz,
  unique(campaign_id,user_id)
);
create index email_jobs_due on public.email_jobs(next_attempt_at,id) where status in ('pending','retry');
create index email_jobs_campaign on public.email_jobs(campaign_id,status);
create table public.email_worker_state (
  singleton boolean primary key default true check (singleton),
  lease_token uuid,
  lease_until timestamptz,
  batch_claims integer not null default 0,
  next_batch_at timestamptz not null default clock_timestamp(),
  last_error text,
  last_seen_at timestamptz
);
insert into public.email_worker_state(singleton) values(true);
alter table public.email_campaigns enable row level security;
alter table public.email_jobs enable row level security;
alter table public.email_worker_state enable row level security;
revoke all on public.email_campaigns, public.email_jobs, public.email_worker_state from public, anon, authenticated;
-- Only worker RPCs need service access. No queue table is directly exposed.
revoke all on public.email_campaigns, public.email_jobs, public.email_worker_state from service_role;

create function public.email_render(p_template text,p_name text,p_event text,p_date text,p_link text)
returns text language sql immutable set search_path = '' as $$
  -- One pass: replacement values must never be interpreted as templates.
  select string_agg(case m[1]
    when '{name}' then p_name when '{event_name}' then p_event
    when '{event_date}' then p_date when '{link}' then p_link else m[1] end, '' order by n)
  from regexp_matches(p_template, '(\{name\}|\{event_name\}|\{event_date\}|\{link\}|[^\{]+|\{)', 'g') with ordinality as t(m,n);
$$;
revoke all on function public.email_render(text,text,text,text,text) from public, anon, authenticated;

create function public.admin_queue_announcement_email(p_announcement_id uuid,p_subject text,p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  a public.announcements;
  c public.email_campaigns;
  e public.events;
  v_id uuid;
  v_remaining text;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority',0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_subject is null or char_length(btrim(p_subject)) not between 1 and 160 or p_subject ~ '[[:cntrl:]]'
    or p_body is null or char_length(btrim(p_body)) not between 1 and 10000 then
    raise exception 'INVALID_EMAIL_TEMPLATE' using errcode='22023';
  end if;
  v_remaining := regexp_replace(p_subject || p_body,'\{(name|event_name|event_date|link)\}','','g');
  if v_remaining ~ '[{}]' then raise exception 'UNKNOWN_EMAIL_PLACEHOLDER' using errcode='22023'; end if;
  select * into a from public.announcements where id=p_announcement_id for update;
  if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND' using errcode='22023'; end if;
  select * into c from public.email_campaigns where announcement_id=a.id;
  if found then
    if c.subject_template<>btrim(p_subject) or c.body_template<>btrim(p_body) then
      raise exception 'EMAIL_ALREADY_QUEUED' using errcode='22023';
    end if;
    return c.id; -- idempotent double-click / response lost after commit
  end if;
  if a.event_id is not null then
    select * into e from public.events where id=a.event_id and status<>'draft';
    if not found then raise exception 'ANNOUNCEMENT_EVENT_UNAVAILABLE' using errcode='22023'; end if;
  end if;
  if a.event_id is null and (p_subject || p_body) ~ '\{event_(name|date)\}' then
    raise exception 'EMAIL_EVENT_REQUIRED' using errcode='22023';
  end if;
  if a.link_url is null and (p_subject || p_body) like '%{link}%' then
    raise exception 'EMAIL_LINK_REQUIRED' using errcode='22023';
  end if;
  insert into public.email_campaigns(announcement_id,subject_template,body_template,queued_by)
  values(a.id,btrim(p_subject),btrim(p_body),auth.uid()) returning id into v_id;
  -- Snapshot only confirmed, non-banned registered student profiles and their
  -- intended audience at queue time. Never accept recipient addresses from UI.
  insert into public.email_jobs(campaign_id,user_id,recipient,subject,body)
  select v_id,u.id,lower(u.email),
    regexp_replace(public.email_render(btrim(p_subject),p.full_name,coalesce(e.title,''),coalesce(to_char(e.starts_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI') || ' IST',''),coalesce(a.link_url,'')), '[[:cntrl:]]', ' ', 'g'),
    public.email_render(btrim(p_body),p.full_name,coalesce(e.title,''),coalesce(to_char(e.starts_at at time zone 'Asia/Kolkata','DD Mon YYYY HH24:MI') || ' IST',''),coalesce(a.link_url,''))
  from public.profiles p join auth.users u on u.id=p.user_id
  where u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<clock_timestamp())
    and u.email ~ '^[^[:space:]@,;<>]+@[^[:space:]@,;<>]+\.[^[:space:]@,;<>]+$'
    and (a.audience='all_students' or exists(select 1 from public.registrations r where r.user_id=u.id and r.event_id=a.event_id));
  insert into public.audit_logs(actor_id,action,entity_id,details)
  values(auth.uid(),'announcement.email_queued',v_id,jsonb_build_object('announcement_id',a.id,'recipients',(select count(*) from public.email_jobs where campaign_id=v_id)));
  return v_id;
end;
$$;

create function public.admin_email_progress(p_announcement_ids uuid[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority',0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_announcement_ids is null or cardinality(p_announcement_ids)>50 then raise exception 'INVALID_EMAIL_PAGE' using errcode='22023'; end if;
  select jsonb_build_object('campaigns',coalesce(jsonb_agg(x),'[]'::jsonb),
    'worker',(select jsonb_build_object('last_seen_at',last_seen_at,'next_batch_at',next_batch_at,'last_error',last_error) from public.email_worker_state)) into v_result
  from (select c.id,c.announcement_id,count(j.id) as total,
    count(j.id) filter(where j.status='accepted') as accepted,
    count(j.id) filter(where j.status in ('pending','retry','sending')) as queued,
    count(j.id) filter(where j.status='failed') as failed,
    count(j.id) filter(where j.status='unknown') as unknown,
    count(j.id) filter(where j.status='cancelled') as cancelled
    from public.email_campaigns c left join public.email_jobs j on j.campaign_id=c.id
    where c.announcement_id=any(p_announcement_ids) group by c.id) x;
  return v_result;
end;
$$;

create function public.admin_retry_email_campaign(p_campaign_id uuid,p_reason text,p_include_unknown boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority',0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'EMAIL_RETRY_REASON_REQUIRED' using errcode='22023'; end if;
  update public.email_jobs set status='retry',attempts=0,next_attempt_at=clock_timestamp(),last_error=null
    where campaign_id=p_campaign_id and (status='failed' or (p_include_unknown is true and status='unknown'));
  get diagnostics v_count = row_count;
  insert into public.audit_logs(actor_id,action,entity_id,details) values(auth.uid(),'announcement.email_retry',p_campaign_id,
    jsonb_build_object('reason',btrim(p_reason),'include_unknown',p_include_unknown,'jobs',v_count));
  return v_count;
end;
$$;

-- A global batch lease serializes all workers and preserves pacing between runs.
-- Claim ONE job immediately before SMTP: a crash never strands a full batch.
create function public.email_worker_batch(p_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare s public.email_worker_state;
begin
  if p_token is null then raise exception 'EMAIL_TOKEN_REQUIRED'; end if;
  select * into s from public.email_worker_state where singleton for update;
  update public.email_worker_state set last_seen_at=clock_timestamp() where singleton;
  if s.lease_until>clock_timestamp() or s.next_batch_at>clock_timestamp() then return false; end if;
  update public.email_jobs set status='unknown',last_error='WORKER_INTERRUPTED',lease_token=null,lease_until=null
    where status='sending' and lease_until<clock_timestamp();
  update public.email_worker_state set lease_token=p_token,lease_until=clock_timestamp()+interval '15 minutes',
    next_batch_at=clock_timestamp()+interval '1 minute',last_error=null,batch_claims=0 where singleton;
  return true;
end;
$$;

create function public.email_worker_claim(p_token uuid) returns setof public.email_jobs
language plpgsql security definer set search_path = '' as $$
declare j public.email_jobs; a public.announcements;
begin
  perform 1 from public.email_worker_state where singleton and lease_token=p_token and lease_until>clock_timestamp() and batch_claims<10 for update;
  if not found then return; end if;
  select * into j from public.email_jobs where status in ('pending','retry') and next_attempt_at<=clock_timestamp() order by next_attempt_at,id limit 1 for update skip locked;
  if not found then return; end if;
  update public.email_worker_state set batch_claims=batch_claims+1 where singleton;
  select a1.* into a from public.announcements a1 join public.email_campaigns c on c.announcement_id=a1.id where c.id=j.campaign_id;
  -- Recheck current ownership/address/audience before exposing the job to sender.
  if not exists(select 1 from auth.users u join public.profiles p on p.user_id=u.id
      where u.id=j.user_id and lower(u.email)=j.recipient and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until<clock_timestamp()))
    or (a.audience='event_registrants' and not exists(select 1 from public.registrations r where r.user_id=j.user_id and r.event_id=a.event_id)) then
    update public.email_jobs set status='cancelled',last_error='RECIPIENT_NO_LONGER_ELIGIBLE' where id=j.id;
    return;
  end if;
  return query update public.email_jobs set status='sending',attempts=attempts+1,lease_token=p_token,lease_until=clock_timestamp()+interval '15 minutes'
    where id=j.id returning *;
end;
$$;

create function public.email_worker_finish(p_token uuid,p_job_id uuid,p_outcome text,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare j public.email_jobs;
begin
  if p_outcome not in ('accepted','retry','failed','unknown','quota','auth') or p_outcome is null then raise exception 'INVALID_EMAIL_OUTCOME'; end if;
  select * into j from public.email_jobs where id=p_job_id and status='sending' and lease_token=p_token for update;
  if not found then raise exception 'EMAIL_LEASE_LOST'; end if;
  update public.email_jobs set status=case when p_outcome in ('quota','auth') then 'retry'
      when p_outcome='retry' and attempts>=5 then 'failed' else p_outcome end,
    last_error=case when p_outcome='accepted' then null else left(p_error,80) end,
    next_attempt_at=clock_timestamp()+case when p_outcome='quota' then interval '24 hours'
      when p_outcome='auth' then interval '1 hour' else interval '1 minute'*power(2,least(j.attempts,10)) end,
    accepted_at=case when p_outcome='accepted' then clock_timestamp() else null end,
    lease_token=null,lease_until=null where id=j.id;
  if p_outcome in ('quota','auth') then
    update public.email_worker_state set next_batch_at=clock_timestamp()+case when p_outcome='quota' then interval '24 hours' else interval '1 hour' end,
      last_error=case when p_outcome='quota' then 'GMAIL_QUOTA_PAUSED' else 'GMAIL_AUTH_PAUSED' end where singleton;
  end if;
end;
$$;

create function public.email_worker_release(p_token uuid) returns void
language sql security definer set search_path = '' as $$
  update public.email_worker_state set lease_token=null,lease_until=null,
    next_batch_at=greatest(next_batch_at,clock_timestamp()+interval '1 minute') where singleton and lease_token=p_token;
$$;

revoke all on function public.admin_queue_announcement_email(uuid,text,text),public.admin_email_progress(uuid[]),public.admin_retry_email_campaign(uuid,text,boolean) from public,anon;
grant execute on function public.admin_queue_announcement_email(uuid,text,text),public.admin_email_progress(uuid[]),public.admin_retry_email_campaign(uuid,text,boolean) to authenticated;
revoke all on function public.email_worker_batch(uuid),public.email_worker_claim(uuid),public.email_worker_finish(uuid,uuid,text,text),public.email_worker_release(uuid) from public,anon,authenticated;
grant execute on function public.email_worker_batch(uuid),public.email_worker_claim(uuid),public.email_worker_finish(uuid,uuid,text,text),public.email_worker_release(uuid) to service_role;
comment on table public.announcements is 'Published dashboard notices. Email is independently queued through admin_queue_announcement_email; no external files are copied.';
notify pgrst,'reload schema';
commit;
