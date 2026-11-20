-- Dashboard-only delivery. Email provider, sender and worker remain undecided.
begin;

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  link_url text check (link_url is null or (
    char_length(link_url) <= 2048
    and link_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$'
    and link_url !~ '^https://[^/?#]*@'
    and coalesce(substring(link_url from '^https://[^/?#:]+:([0-9]+)')::numeric between 1 and 65535, true)
  )),
  audience text not null check (audience in ('all_students', 'event_registrants')),
  published_by uuid not null references auth.users(id) on delete restrict,
  published_at timestamptz not null default clock_timestamp(),
  check (audience <> 'event_registrants' or event_id is not null)
);
create index announcements_recent_idx on public.announcements (published_at desc, id desc);
create index announcements_event_idx on public.announcements (event_id) where event_id is not null;
alter table public.announcements enable row level security;
create policy announcements_read on public.announcements for select to authenticated
using (
  (select public.is_admin())
  or audience = 'all_students'
  or exists (select 1 from public.registrations r
    where r.event_id = announcements.event_id and r.user_id = (select auth.uid()))
);
revoke all on public.announcements from public, anon, authenticated;
grant select on public.announcements to authenticated;

create function public.admin_publish_announcement(
  p_title text, p_body text, p_audience text,
  p_event_id uuid default null, p_link_url text default null
) returns public.announcements
language plpgsql security definer set search_path = '' as $$
declare
  v_announcement public.announcements;
  v_link text := nullif(btrim(p_link_url), '');
begin
  -- Share the role-management lock and recheck authority after acquiring it.
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_body is null or char_length(btrim(p_body)) not between 1 and 10000
    or p_audience is null or p_audience not in ('all_students','event_registrants') then
    raise exception 'INVALID_ANNOUNCEMENT' using errcode = '22023';
  end if;
  if p_audience = 'event_registrants' and p_event_id is null then
    raise exception 'ANNOUNCEMENT_EVENT_REQUIRED' using errcode = '22023';
  end if;
  if v_link is not null and (char_length(v_link) > 2048
    or v_link !~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$'
    or v_link ~ '^https://[^/?#]*@'
    or not coalesce(substring(v_link from '^https://[^/?#:]+:([0-9]+)')::numeric between 1 and 65535, true)) then
    raise exception 'INVALID_ANNOUNCEMENT_LINK' using errcode = '22023';
  end if;
  if p_event_id is not null then
    -- Draft events must not leak through a notice sent to all students.
    perform 1 from public.events where id = p_event_id and status <> 'draft' for share;
    if not found then raise exception 'ANNOUNCEMENT_EVENT_UNAVAILABLE' using errcode = '22023'; end if;
  end if;
  insert into public.announcements(title, body, audience, event_id, link_url, published_by)
    values (btrim(p_title), btrim(p_body), p_audience, p_event_id, v_link, auth.uid())
    returning * into v_announcement;
  insert into public.audit_logs(actor_id, action, entity_id, details)
    values (auth.uid(), 'announcement.published', v_announcement.id,
      jsonb_build_object('audience', p_audience, 'event_id', p_event_id, 'delivery', 'dashboard'));
  return v_announcement;
end;
$$;
revoke all on function public.admin_publish_announcement(text,text,text,uuid,text) from public, anon;
grant execute on function public.admin_publish_announcement(text,text,text,uuid,text) to authenticated;
comment on table public.announcements is 'Published dashboard notices. Optional external URLs include shared Google Drive OD PDFs; no files are copied. Email delivery is not implemented.';
notify pgrst, 'reload schema';
commit;
