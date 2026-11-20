# Optional Redis cache for event reads

## Status and purpose

`events-read` is implemented and deployed to the **MAIN** Supabase project, `amagfwugfinplxhkauig`. No Redis provider or credentials have been provisioned by this change. Redis connectivity and capacity under production traffic remain unverified. The default frontend setting reads Supabase directly until caching is explicitly enabled.

This cache stores disposable event content, not registrations, profiles, QR credentials, certificate files or private download URLs. PostgreSQL remains the source of truth for event visibility, permissions, registration windows, uniqueness and capacity. Redis does not replace database transactions or guarantee a particular number of concurrent users.

No Redis-based rate limiting, email queue, worker or scheduler is implemented.

## Request and invalidation behavior

1. The browser sends its MAIN Supabase session JWT to `events-read`.
2. The function verifies the session against MAIN Auth and checks `is_admin()` using the caller's JWT. It does not use a service-role key.
3. Admin requests bypass shared caching and read through database authorization.
4. For student requests with Redis configured, the function reads fresh, RLS-filtered event IDs, versions and statuses from PostgreSQL on **every request**.
5. A cache key hashes the MAIN project URL and the visible ordered event/version/status list. New publication, edits, cancellation and visibility changes produce a different key. Old keys expire naturally.
6. A valid cache hit returns the event payload. A miss reads current event content through RLS and caches it only if its versions still match the earlier metadata read.

Only explicitly selected event fields are cached or returned. Unexpected cached properties are stripped, and malformed entries are treated as misses. All responses use `Cache-Control: no-store` so browser/CDN caching does not bypass the fresh permission checks.

The TTL defaults to **30 seconds**, with supported configuration from 1 to 300 seconds. Invalid TTL settings use the default. Every Redis request has a 300 ms timeout. Missing Redis credentials, invalid Redis endpoint configuration, or Redis errors fall back to authorized PostgreSQL reads. Failed session, permission or metadata/database checks return an error and **do not serve an old cache entry**.

Cache hits avoid fetching the full event payload again. They still perform Auth verification, an admin check and a database metadata query. Measure payload size, latency, request counts and provider quotas; do not describe this design as eliminating database queries or as verified horizontal scaling.

## Backend configuration

Use the MAIN backend example at [`supabase/main/.env.example`](../../supabase/main/.env.example), separate from both frontend files and from the certificate project. Copy it to `supabase/main/.env.local` if that local file does not already exist. Local environment files are ignored by Git.

| Field | Meaning |
|---|---|
| `REDIS_REST_URL` | HTTPS origin for a Redis REST command endpoint compatible with the Upstash REST command protocol. A `redis://` TCP URL is not supported. |
| `REDIS_REST_TOKEN` | Server-only bearer token for that Redis endpoint. |
| `REDIS_EVENTS_TTL_SECONDS` | Event cache TTL, 1–300 seconds; default 30. |
| `EVENTS_ALLOWED_ORIGINS` | Comma-separated exact browser origins for the two applications, with scheme and port where applicable, and no paths. |
| `MAIN_SUPABASE_PUBLISHABLE_KEY` | Optional MAIN public project key for backend requests. When absent/blank, the runtime-supplied `SUPABASE_ANON_KEY` is used. |

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the function runtime. Keep Redis credentials in the protected backend environment; neither frontend receives them. Certificate-project credentials are unrelated to event caching and must not be added to either frontend.

Use a dedicated cache database or namespace where practical. The implementation only requires Redis **GET** and **SET with EX** on keys prefixed `launchpad:events:v1:`. Restrict the token to those commands and keys if the chosen provider supports such scopes. The token must permit writes; a read-only token cannot populate the cache. Provider selection, region, access controls, retention, quotas and pricing still require verification before rollout.

The REST command format is a JSON array sent by POST with bearer authorization, for example `['GET', key]` or `['SET', key, value, 'EX', seconds]`, with a JSON `result` response. See the [REST API protocol documentation](https://upstash.com/docs/redis/features/restapi). This protocol choice does not select or provision a provider.

### Allowed origins

For the existing local app URLs:

```dotenv
EVENTS_ALLOWED_ORIGINS=http://127.0.0.1:5173,http://127.0.0.1:5174
```

For production, replace or extend the list with the **actual student and admin deployment origins**. For example, `https://launchpad.example.edu,https://control.example.edu` illustrates the format only; these are not configured Launchpad domains. `localhost` and `127.0.0.1` are different origins. No wildcard origin matching is implemented. Origin filtering complements authentication; it does not grant a user authority.

## Local serving and deployment

Run these PowerShell commands from the repository root. Absolute environment-file paths avoid ambiguity when `--workdir` changes the CLI working directory.

```powershell
if (-not (Test-Path -LiteralPath .\supabase\main\.env.local)) {
    Copy-Item -LiteralPath .\supabase\main\.env.example -Destination .\supabase\main\.env.local
}
$redisEnvPath = (Resolve-Path -LiteralPath .\supabase\main\.env.local).Path
supabase functions serve events-read --workdir supabase/main --env-file $redisEnvPath
```

Local serving requires the appropriate local Supabase/Docker setup and local sessions. It is separate from deployment to the hosted MAIN project; a successful hosted deployment does not establish that Docker or local serving has been tested on this computer.

After filling in the backend file and checking that it contains only the intended MAIN backend settings, upload those settings and deploy to **MAIN only**:

```powershell
$redisEnvPath = (Resolve-Path -LiteralPath .\supabase\main\.env.local).Path
supabase secrets set --env-file $redisEnvPath --project-ref amagfwugfinplxhkauig --workdir supabase/main
supabase functions deploy events-read --project-ref amagfwugfinplxhkauig --workdir supabase/main
```

These commands upload secrets from the local file without putting their values into shell command arguments. Do not upload either frontend environment file or the certificate environment file. Deployment uses the MAIN function configuration; the handler performs its own Auth verification before returning event data, including where gateway JWT verification is disabled to support current session signing keys.

## Frontend opt-in

In each app's `.env.local`, keep the existing MAIN project URL and publishable key and set:

```dotenv
NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED=true
```

Restart the development servers, or rebuild/redeploy the two frontends for production. Leave this unset or `false` to read through the regular RLS-protected Supabase API. An enabled frontend calls the deployed function; the function can still operate without Redis and will report the cache as disabled.

The endpoint accepts authenticated POST requests with `{}` for a list or `{ "event_id": "<uuid>" }` for a detail result. The response is always `{ "events": [...] }`; a detail result contains zero or one event. List pagination accepts `limit` from 1 to 100 and `offset` from 0 to 100000; defaults are 100 and 0. Results are ordered by `starts_at`, then `id`. Registration mutations use PostgreSQL RPCs, never cache values.

## Verification

Inspect the `events-read` network response in the browser with a real MAIN session. The `x-launchpad-cache` response header reports:

| Value | Meaning |
|---|---|
| `disabled` | No usable Redis configuration; authorized database read succeeded. |
| `admin-bypass` | The caller is currently an admin; shared cache was bypassed. |
| `miss` | Current content was read from PostgreSQL after a cache miss. |
| `hit` | Cached content matched freshly authorized event versions. |
| `empty` | No visible events matched the requested page or ID. |
| `unavailable` | Redis access failed; authorized database content was returned. |

With a selected, configured provider and a visible event, make two student requests and verify miss then hit. Edit or cancel that event as an admin and verify the next student request reflects the new state. Verify expiry, an expired session, denied origins, admin revocation and a controlled Redis outage. Do not use the cache headers as evidence of registration capacity correctness; concurrent final-seat and duplicate-registration tests must exercise PostgreSQL separately.

The local handler suite can be run without live Redis credentials:

```sh
npx vitest run supabase/main/supabase/functions/_shared/events-read.test.ts
npx tsc --noEmit -p supabase/main/supabase/functions/tsconfig.json
```

The 17 handler tests passed on 20 November 2026 using simulated Auth, PostgreSQL and Redis HTTP responses. They cover hit/miss/expiry, changed publication and versions, malformed cache values, session/admin revocation, RLS visibility failures, Redis timeout fallback, input validation and CORS. These tests establish handler behavior; they do not establish live Redis availability, provider limits or production throughput.
