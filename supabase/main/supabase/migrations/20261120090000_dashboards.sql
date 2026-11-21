-- Phase 6 Dashboard Summaries: Admin event, registration, and attendance summary RPC
begin;

create or replace function public.admin_get_dashboard_summary()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_total_events integer;
  v_published_events integer;
  v_upcoming_events integer;
  v_total_registrations integer;
  v_total_check_ins integer;
  v_events jsonb;
  v_announcements jsonb;
begin
  -- Share the role-management lock and recheck authority after acquiring it.
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select count(*)::integer into v_total_events from public.events;
  select count(*)::integer into v_published_events from public.events where status = 'published';
  select count(*)::integer into v_upcoming_events from public.events where status = 'published' and starts_at >= clock_timestamp();
  select count(*)::integer into v_total_registrations from public.registrations;
  select count(*)::integer into v_total_check_ins from public.attendance where checked_in = true;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'status', e.status,
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'venue', e.venue,
      'capacity', e.capacity,
      'registration_count', coalesce(r.reg_count, 0)::integer,
      'attendance_count', coalesce(a.att_count, 0)::integer
    ) order by e.starts_at desc, e.created_at desc
  ), '[]'::jsonb)
  into v_events
  from (
    select id, title, status, starts_at, ends_at, venue, capacity, created_at
    from public.events
    order by starts_at desc, created_at desc
    limit 10
  ) e
  left join (
    select event_id, count(*)::integer as reg_count
    from public.registrations
    group by event_id
  ) r on r.event_id = e.id
  left join (
    select event_id, count(*)::integer as att_count
    from public.attendance
    where checked_in = true
    group by event_id
  ) a on a.event_id = e.id;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', an.id,
      'event_id', an.event_id,
      'title', an.title,
      'body', an.body,
      'link_url', an.link_url,
      'audience', an.audience,
      'published_at', an.published_at
    ) order by an.published_at desc, an.id desc
  ), '[]'::jsonb)
  into v_announcements
  from (
    select id, event_id, title, body, link_url, audience, published_at
    from public.announcements
    order by published_at desc, id desc
    limit 5
  ) an;

  return jsonb_build_object(
    'total_events', v_total_events,
    'published_events', v_published_events,
    'upcoming_events', v_upcoming_events,
    'total_registrations', v_total_registrations,
    'total_check_ins', v_total_check_ins,
    'events', v_events,
    'recent_announcements', v_announcements
  );
end;
$$;

revoke all on function public.admin_get_dashboard_summary() from public, anon;
grant execute on function public.admin_get_dashboard_summary() to authenticated;

commit;
