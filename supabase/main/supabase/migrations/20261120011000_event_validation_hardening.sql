-- Keep admin-selected registration windows independent from event start times;
-- the specification does not require registration to close before an event starts.
begin;
alter table public.events drop constraint events_check2;

-- Poster links must have an HTTPS hostname, not an empty host or URL credentials.
alter table public.events drop constraint events_poster_url_check;
alter table public.events add constraint events_poster_url_check check (
  poster_url is null or (
    char_length(poster_url) <= 2048 and
    poster_url ~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
  )
);

-- Supabase default privileges may grant roles directly, in addition to PUBLIC.
-- Internal trigger functions are not part of the client RPC contract.
revoke execute on function public.touch_event(), public.audit_event_change(),
  public.audit_identity_authority_change() from authenticated;
commit;
