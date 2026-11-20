-- F06 / AT-10: external event albums and resources only.
begin;

create function public.valid_event_material_url(p_kind text, p_url text) returns boolean
language sql immutable set search_path = '' as $$
  select coalesce(
    p_kind in ('gallery','resource') and char_length(p_url) between 1 and 2048
    and p_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+(:[0-9]{1,5})?([/?#][^[:space:][:cntrl:]\\]*)?$'
    and p_url !~ '^https://[^/?#]*@'
    and coalesce(substring(p_url from '^https://[^/?#:]+:([0-9]+)')::numeric between 1 and 65535, true)
    and (p_kind = 'resource' or p_url ~ '^https://photos\.app\.goo\.gl/[A-Za-z0-9]+([?#][^[:space:][:cntrl:]\\]*)?$'
      or p_url ~ '^https://photos\.google\.com/(album|share)/[A-Za-z0-9_-]+([/?#][^[:space:][:cntrl:]\\]*)?$'), false);
$$;

create table public.event_materials (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  kind text not null check (kind in ('gallery','resource')),
  label text not null check (char_length(btrim(label)) between 1 and 160 and label !~ '[[:cntrl:]]'),
  url text not null,
  published boolean not null default false,
  display_order integer not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (public.valid_event_material_url(kind, url))
);
create index event_materials_order_idx on public.event_materials(event_id, display_order, id);
alter table public.event_materials enable row level security;
create policy event_materials_read on public.event_materials for select to authenticated using (
  (select public.is_admin()) or (published and exists (
    select 1 from public.events e where e.id = event_materials.event_id and e.status <> 'draft'
  ))
);
revoke all on public.event_materials from public, anon, authenticated;
grant select on public.event_materials to authenticated;

create function public.admin_save_event_material(
  p_event_id uuid, p_kind text, p_label text, p_url text,
  p_published boolean, p_display_order integer, p_id uuid default null
) returns public.event_materials
language plpgsql security definer set search_path = '' as $$
declare v_row public.event_materials; v_before public.event_materials;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  if p_label is null or char_length(btrim(p_label)) not between 1 and 160 or p_label ~ '[[:cntrl:]]'
    or p_published is null or p_display_order is null or not public.valid_event_material_url(p_kind,p_url) then
    raise exception 'INVALID_EVENT_MATERIAL' using errcode='22023';
  end if;
  perform 1 from public.events where id=p_event_id for share;
  if not found then raise exception 'EVENT_UNAVAILABLE' using errcode='22023'; end if;
  if p_id is null then
    insert into public.event_materials(event_id,kind,label,url,published,display_order,created_by)
    values(p_event_id,p_kind,btrim(p_label),p_url,p_published,p_display_order,auth.uid()) returning * into v_row;
  else
    select * into v_before from public.event_materials where id=p_id and event_id=p_event_id for update;
    if not found then raise exception 'MATERIAL_UNAVAILABLE' using errcode='22023'; end if;
    update public.event_materials set kind=p_kind,label=btrim(p_label),url=p_url,published=p_published,
      display_order=p_display_order,updated_at=clock_timestamp() where id=p_id returning * into v_row;
  end if;
  insert into public.audit_logs(actor_id,action,entity_id,details)
  values(auth.uid(),case when p_id is null then 'event_material.created' else 'event_material.updated' end,
    v_row.id,jsonb_build_object('event_id',p_event_id,'before',case when p_id is null then null else to_jsonb(v_before) end,'after',to_jsonb(v_row)));
  return v_row;
end;
$$;

create function public.admin_delete_event_material(p_event_id uuid,p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.event_materials;
begin
  perform pg_advisory_xact_lock(hashtextextended('launchpad.admin-authority', 0));
  if auth.uid() is null or not public.is_admin() then raise exception 'ADMIN_REQUIRED' using errcode='42501'; end if;
  delete from public.event_materials where id=p_id and event_id=p_event_id returning * into v_row;
  if not found then raise exception 'MATERIAL_UNAVAILABLE' using errcode='22023'; end if;
  insert into public.audit_logs(actor_id,action,entity_id,details)
  values(auth.uid(),'event_material.deleted',p_id,jsonb_build_object('event_id',p_event_id,'before',to_jsonb(v_row)));
end;
$$;
revoke all on function public.valid_event_material_url(text,text) from public, anon;
grant execute on function public.valid_event_material_url(text,text) to authenticated;
revoke all on function public.admin_save_event_material(uuid,text,text,text,boolean,integer,uuid),
  public.admin_delete_event_material(uuid,uuid) from public,anon,authenticated;
grant execute on function public.admin_save_event_material(uuid,text,text,text,boolean,integer,uuid),
  public.admin_delete_event_material(uuid,uuid) to authenticated;
comment on table public.event_materials is 'Admin approved external URLs. App visibility does not control external Photos/Drive sharing. No file storage or OD module.';
notify pgrst, 'reload schema';
commit;
