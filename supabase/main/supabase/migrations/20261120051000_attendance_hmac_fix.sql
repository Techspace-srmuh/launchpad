-- Fix schema qualification for extensions.hmac in generate_qr_credential under security definer empty search_path.
begin;

create or replace function public.generate_qr_credential(p_event_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_reg public.registrations;
  v_cred public.qr_credentials;
  v_token text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_reg from public.registrations
    where event_id = p_event_id and user_id = v_user;
  if not found then raise exception 'NOT_REGISTERED' using errcode = 'P0002'; end if;

  select * into v_cred from public.qr_credentials where registration_id = v_reg.id;
  if found then return v_cred.token; end if;

  -- Generate opaque hex token: extensions.hmac of registration_id and event_id.
  v_token := encode(extensions.hmac(v_reg.id::text || p_event_id::text, gen_random_uuid()::text, 'sha256'::text), 'hex');
  insert into public.qr_credentials (registration_id, event_id, token)
    values (v_reg.id, p_event_id, v_token)
    on conflict (registration_id) do update set token = qr_credentials.token
    returning token into v_token;
  return v_token;
end;
$$;

revoke all on function public.generate_qr_credential(uuid) from public, anon;
grant execute on function public.generate_qr_credential(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
