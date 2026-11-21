begin;
-- Review only through a current-admin RPC; raw queue tables stay inaccessible.
create function public.admin_email_job_status(p_campaign_id uuid,p_offset integer default 0)
returns table(id uuid,full_name text,recipient text,status text,attempts integer,last_error text,next_attempt_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority',0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_offset is null or p_offset<0 then raise exception 'INVALID_OFFSET' using errcode='22023'; end if;
  return query select j.id,p.full_name,j.recipient,j.status,j.attempts,j.last_error,j.next_attempt_at
    from public.email_jobs j join public.profiles p on p.user_id=j.user_id
    where j.campaign_id=p_campaign_id order by j.id offset p_offset limit 50;
end;
$$;
revoke all on function public.admin_email_job_status(uuid,integer) from public,anon;
grant execute on function public.admin_email_job_status(uuid,integer) to authenticated;
notify pgrst,'reload schema';
commit;
