# MAIN database and event workflow

The MAIN project is `amagfwugfinplxhkauig`. The certificate project remains separate and receives none of these migrations. The product specification is still a draft; Google OAuth, university verification policy and production admin provisioning remain unresolved/deferred. This foundation does not complete Phase 2 or establish production readiness.

## Applied migrations

| Migration | Purpose |
|---|---|
| `20261120010000_identity_events.sql` | Profiles, protected admin records, audit logs, events, registrations, RLS and authenticated RPCs |
| `20261120011000_event_validation_hardening.sql` | Validate HTTPS poster hostnames, remove an unapproved event-start restriction on registration windows, restrict internal trigger-function execution |

Both migrations were applied to MAIN and verified on 20 November 2026. They are under `supabase/main/supabase/migrations/`. Existing shared database history should be extended with a new migration rather than rewriting an applied migration.

## Data and browser access

| Table | Reads by an authenticated student | Reads by an active admin | Browser writes |
|---|---|---|---|
| `profiles` | Own profile | Profiles needed by admin operations | Through `save_profile` only |
| `admin_users` | Own allowlist entry, if any | Own allowlist entry | None |
| `events` | Non-draft events | All events including drafts | Through `admin_save_event` only |
| `registrations` | Own registrations | Participant registrations | Through `register_for_event` only |
| `audit_logs` | None | Audit records | None |

RLS is enabled on every table. Anonymous users have no table access. Both websites authenticate with MAIN; changing website URLs or browser fields cannot grant admin authority. Direct browser inserts, updates and deletes are revoked, including for admins. Service credentials remain server-side.

The RPC contract is:

```text
is_admin() -> boolean
save_profile(p_full_name, p_roll_number, p_department, p_academic_year) -> profiles row
admin_save_event(p_event JSON object) -> events row
register_for_event(p_event_id UUID) -> registrations row
```

`admin_save_event` takes the complete event form: optional existing `id`, `title`, `description`, optional `poster_url`, `starts_at`, `ends_at`, `venue`, `registration_opens_at`, `registration_closes_at`, optional `capacity`, and `status`. Timestamps include an explicit timezone. Omit `id` to create a new event. `capacity = null` means no capacity limit. Browser-supplied `created_by`, audit fields, record creation/update timestamps and cache revisions are ignored.

The current conservative profile scaffold normalizes roll numbers to uppercase and removes whitespace, enforces unique roll claims, and preserves the original roll number during student edits. Academic year accepts integers 1–8. Students can update their name, department and academic year through the profile RPC. All new profiles are **unverified**; the RPC cannot verify an account. These scaffold limits do not select the university verification or production profile-correction policy.

Event statuses are `draft`, `published`, `closed`, `completed`, and `cancelled`. A published event cannot be moved back to draft; completed/cancelled events cannot be reopened by this RPC. Admins can edit event information and close published registration. Registration opening must precede closing, and event start must precede end; closing registration after event start is permitted if the admin chooses that window. Student cancellation is not implemented while cancellation policy remains open.

## Registration integrity and cache boundaries

Registration requires an authenticated account with a complete **verified** profile and a published event within its registration window. The backend takes a row lock on the event before checking status, window, duplicates and capacity. Admin event changes take the same event lock, preventing a concurrent capacity edit from overbooking an event. Each user/event pair is also protected by a unique database constraint.

Expected failures include `PROFILE_REQUIRED`, `VERIFICATION_REQUIRED`, `EVENT_NOT_OPEN`, `EVENT_FULL`, `ALREADY_REGISTERED`, and `ADMIN_REQUIRED`. Successful registration returns the stored registration; denied actions do not create a success record. A capacity decrease below existing registrations fails with `CAPACITY_BELOW_REGISTRATIONS`.

Each event has a server-generated monotonic `version` and `updated_at`; version changes on every event update, including multiple edits in one transaction. Redis can use the version to invalidate derived event content. Redis does not authorize registration or decide capacity, and this database runbook does not establish that Redis has been provisioned.

Event writes, admin-authority changes and profile-verification changes create audit records. Browser clients cannot forge, update or delete them. Owner-operated changes with no end-user JWT record the database actor in audit details where applicable.

## Development access while Google sign-in is deferred

Use deliberately created development accounts for local testing. Production builds must not expose a password-based development login. A development account still signs in through real Supabase Auth and receives the same database permission checks; it is not a frontend role switch.

An owner with privileged SQL access can prepare a **development-only** account after its Auth user and profile exist. Replace the placeholder with that account's Auth UUID:

```sql
-- Development fixture only: do not use this as an approved production policy.
insert into public.admin_users (user_id, active)
values ('AUTH_USER_UUID', true);

-- Development fixture only: Google login itself never proves enrollment.
update public.profiles
set verification_status = 'verified', updated_at = clock_timestamp()
where user_id = 'AUTH_USER_UUID';
```

Normal admin/browser users cannot run these direct writes. Production verification, who may grant admin access, permitted profile corrections and retention must be decided before launch. No owner-operated development script should automatically promote arbitrary sign-ins.

## Verification commands

Run from the repository root, with the CLI signed in and MAIN linked as described in the [Supabase setup runbook](supabase-setup.md):

```sh
supabase migration list --workdir supabase/main
supabase db query --linked --workdir supabase/main --file supabase/tests/identity_events.sql
python supabase/main/supabase/tests/concurrency.py
```

The `--file` path resolves relative to `supabase/main`, not the repository root. The SQL suite creates synthetic fixtures inside one transaction and rolls them back. It checks ownership isolation, denied anonymous/direct writes, verification requirements, roll claims, admin revocation, audit protection, event validation and cache versions. After both migrations, **49 security assertions passed** on 20 November 2026.

The concurrency script requires Python's standard library, the logged-in CLI and the student app's configured MAIN publishable settings. It verifies the expected MAIN project before writing test data. It creates temporary random test accounts, profiles and events, then uses real Auth tokens and simultaneous HTTP RPC requests:

- Six final-seat requests: one registration and five `EVENT_FULL` failures.
- Six requests for the same student/event: one registration and five `ALREADY_REGISTERED` failures.
- An admin capacity change racing with six registrations: committed registrations remain within committed capacity.

All three races passed on 20 November 2026. The validation-only followup migration does not change registration locking. These checks establish correctness for those races, not a supported production traffic level.

The concurrency harness removes only its generated fixture IDs in `finally`, including related audit records, and confirmed zero remaining concurrency profiles after the recorded run. If the process is forcibly terminated before cleanup, inspect its exact generated fixture IDs before removing records; never replace its scoped cleanup with a deletion of all users, events, profiles or audit logs. Real-user retention and recovery procedures remain separate launch work.
