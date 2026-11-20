-- F08 bounded event-scoped snapshots, serialized with admin role changes.
begin;
create function public.admin_event_participant_export(
  p_event_id uuid, p_department text default null, p_academic_year integer default null,
  p_search text default null, p_download boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_department text := nullif(btrim(p_department), '');
  v_search text := nullif(btrim(p_search), '');
  v_count integer;
  v_rows jsonb;
  v_result jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if auth.uid() is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_event_id is null or p_download is null or char_length(v_department) > 120
    or char_length(v_search) > 120 or (p_academic_year is not null and p_academic_year not between 1 and 8) then
    raise exception 'INVALID_EXPORT_FILTER' using errcode = '22023';
  end if;
  if not exists(select 1 from public.events where id=p_event_id) then
    raise exception 'EVENT_UNAVAILABLE' using errcode = 'P0002';
  end if;
  -- One materialized query supplies both count and data in one MVCC snapshot.
  -- A scalar JSON response bypasses PostgREST's returned-row cap.
  with matched as materialized (
    select r.id, p.full_name, p.roll_number, p.course, p.branch, p.department,
      p.section, p.academic_year, r.created_at as registered_at
    from public.registrations r join public.profiles p on p.user_id=r.user_id
    where r.event_id=p_event_id
      and (v_department is null or lower(p.department)=lower(v_department))
      and (p_academic_year is null or p.academic_year=p_academic_year)
      and (v_search is null or strpos(lower(p.full_name),lower(v_search))>0
        or strpos(lower(p.roll_number),lower(v_search))>0)
    order by r.created_at,r.id limit 10001
  ), numbered as (
    select *,row_number() over(order by registered_at,id) as position from matched
  )
  select count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(numbered)-'id'-'position' order by registered_at,id)
      filter(where p_download or position<=10),'[]'::jsonb)
  into v_count,v_rows from numbered;
  if v_count>10000 then
    raise exception 'EXPORT_TOO_LARGE: narrow filters to at most 10000 participants' using errcode='54000';
  end if;
  v_result:=jsonb_build_object('count',v_count,'rows',v_rows,'event_id',p_event_id,
    'generated_at',clock_timestamp(),'filters',jsonb_build_object('department',v_department,'academic_year',p_academic_year,'search',v_search));
  if octet_length(v_result::text)>16777216 then
    raise exception 'EXPORT_TOO_LARGE: narrow filters to reduce file size' using errcode='54000';
  end if;
  if p_download then
    insert into public.audit_logs(actor_id,action,entity_id,details)
    values(auth.uid(),'participants.export_prepared',p_event_id,jsonb_build_object('filters',v_result->'filters','count',v_count,'generated_at',v_result->'generated_at','format','csv'));
  end if;
  return v_result;
end;
$$;
revoke all on function public.admin_event_participant_export(uuid,text,integer,text,boolean) from public,anon;
grant execute on function public.admin_event_participant_export(uuid,text,integer,text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
