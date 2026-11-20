-- Serialize attendance mutations with admin revocations and preserve correction authority.
begin;
create or replace function public.validate_check_in(p_token text, p_event_id uuid)
returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_cred public.qr_credentials;
  v_event public.events;
  v_now timestamptz;
  v_att public.attendance;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_event_id is null or p_token is null or btrim(p_token) !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_QR' using errcode = '22023';
  end if;

  -- Advisory / row lock on qr_credentials to serialize concurrent scans of the same QR.
  select * into v_cred from public.qr_credentials where token = btrim(p_token) for update;
  if not found then raise exception 'QR_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_cred.event_id <> p_event_id then
    raise exception 'WRONG_EVENT' using errcode = '22023';
  end if;

  select * into v_event from public.events where id = p_event_id for share;
  if not found then raise exception 'EVENT_NOT_FOUND' using errcode = 'P0002'; end if;

  if v_event.status <> 'published' then
    raise exception 'EVENT_NOT_OPEN' using errcode = '22023';
  end if;
  if not exists(select 1 from public.registrations where id = v_cred.registration_id and event_id = p_event_id) then
    raise exception 'NOT_REGISTERED' using errcode = 'P0002';
  end if;

  v_now := clock_timestamp();
  if v_now < v_event.starts_at or v_now > v_event.ends_at then
    raise exception 'OUTSIDE_CHECK_IN_WINDOW' using errcode = '22023';
  end if;

  if exists (select 1 from public.attendance where registration_id = v_cred.registration_id and checked_in) then
    raise exception 'ALREADY_CHECKED_IN' using errcode = '23505';
  end if;

  if exists(select 1 from public.attendance where registration_id = v_cred.registration_id) then
    raise exception 'ATTENDANCE_CORRECTION_REQUIRED' using errcode = '22023';
  end if;

  insert into public.attendance (event_id, registration_id, user_id, checked_in, checked_by)
    select p_event_id, v_cred.registration_id, r.user_id, true, v_actor
    from public.registrations r where r.id = v_cred.registration_id
    returning * into v_att;

  insert into public.audit_logs (actor_id, action, entity_id, details)
    values (v_actor, 'attendance.checked_in', v_att.id,
      jsonb_build_object('event_id', p_event_id, 'registration_id', v_cred.registration_id));

  return v_att;
end;
$$;

-- Manual correction by admin with mandatory reason.
create or replace function public.admin_correct_attendance(
  p_attendance_id uuid, p_checked_in boolean, p_reason text
) returns public.attendance language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_att public.attendance;
  v_previous boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if v_actor is null or not public.is_admin() then
    raise exception 'ADMIN_REQUIRED' using errcode = '42501';
  end if;
  if p_checked_in is null then raise exception 'INVALID_ATTENDANCE_STATUS' using errcode = '22023'; end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 500 then
    raise exception 'CORRECTION_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_att from public.attendance where id = p_attendance_id for update;
  if not found then raise exception 'ATTENDANCE_NOT_FOUND' using errcode = 'P0002'; end if;

  v_previous := v_att.checked_in;
  update public.attendance
    set checked_in = p_checked_in,
        correction_reason = btrim(p_reason),
        corrected_by = v_actor,
        corrected_at = clock_timestamp()
    where id = p_attendance_id
    returning * into v_att;

  insert into public.audit_logs (actor_id, action, entity_id, details)
    values (v_actor, 'attendance.corrected', p_attendance_id,
      jsonb_build_object('event_id', v_att.event_id, 'registration_id', v_att.registration_id, 'previous_checked_in', v_previous, 'checked_in', p_checked_in, 'reason', btrim(p_reason)));

  return v_att;
end;
$$;


notify pgrst, 'reload schema';
commit;
