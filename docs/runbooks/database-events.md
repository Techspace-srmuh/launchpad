# MAIN database and event workflow

The MAIN project is `amagfwugfinplxhkauig`. The certificate project remains separate and receives none of these migrations. The overall product specification is still a draft. The user has approved immediate student eligibility after complete onboarding and protected admin-managed access; Google provider activation and real Google login validation remain pending. See [decision 005](../decisions/005-student-onboarding-admin-access.md). This work does not establish production readiness.

## Migration catalogue

| Migration | Purpose |
|---|---|
| `20261120010000_identity_events.sql` | Profiles, protected admin records, audit logs, events, registrations, RLS and authenticated RPCs |
| `20261120011000_event_validation_hardening.sql` | Validate HTTPS poster hostnames, remove an unapproved event-start restriction on registration windows, restrict internal trigger-function execution |
| `20261120020000_onboarding_admin_access.sql` | Required onboarding details, completion-based registration eligibility, protected initial Google admin authorizations and audited admin-managed access |

All three migrations were applied to linked MAIN on 20 November 2026. See [phase.md](../../phase.md) for validation evidence; application alone does not establish successful security checks. Files are under `supabase/main/supabase/migrations/`; extend shared database history with new migrations rather than rewriting applied files.

## Data and browser access

| Table | Reads by an authenticated student | Reads by an active admin | Browser writes |
|---|---|---|---|
| `profiles` | Own profile | Profiles needed by admin operations | Through `save_profile` only |
| `admin_users` | Own allowlist entry, if any | Own allowlist entry | None |
| `admin_email_access` | None | Authorized access records | Through protected admin RPCs only |
| `events` | Non-draft events | All events including drafts | Through `admin_save_event` only |
| `registrations` | Own registrations | Participant registrations | Through `register_for_event` only |
| `audit_logs` | None | Audit records | None |

RLS is enabled on every table. Anonymous users have no table access. Both websites authenticate with MAIN; changing website URLs or browser fields cannot grant admin authority. Direct browser inserts, updates and deletes are revoked, including for admins. Service credentials remain server-side.

The RPC contract is:

```text
is_admin() -> boolean
sync_admin_access() -> boolean
save_profile(p_full_name, p_roll_number, p_department, p_academic_year,
             p_course, p_branch, p_section, p_mobile_number) -> profiles row
admin_list_access(p_offset default 0) -> email, active, user_id, updated_at rows
admin_set_access(p_email, p_active, p_reason) -> void
admin_save_event(p_event JSON object) -> events row
register_for_event(p_event_id UUID) -> registrations row
```

`admin_save_event` takes the complete event form: optional existing `id`, `title`, `description`, optional `poster_url`, `starts_at`, `ends_at`, `venue`, `registration_opens_at`, `registration_closes_at`, optional `capacity`, and `status`. Timestamps include an explicit timezone. Omit `id` to create a new event. `capacity = null` means no capacity limit. Browser-supplied `created_by`, audit fields, record creation/update timestamps and cache revisions are ignored.

The profile RPC normalizes roll numbers to uppercase and removes whitespace, enforces unique claims and preserves the original roll number during student edits. Academic year accepts integers 1–8. Full name, registration number, course, branch, department, section, academic year and mobile number are required. The new fields remain nullable for legacy rows until the student supplies them; migrations must not fill them with fabricated details. Complete details give immediate registration eligibility without approval. `verification_status` remains separate metadata and defaults to **unverified**; completing a profile does not prove enrollment. Mobile numbers remain private profile data under RLS.

Event statuses are `draft`, `published`, `closed`, `completed`, and `cancelled`. A published event cannot be moved back to draft; completed/cancelled events cannot be reopened by this RPC. Admins can edit event information and close published registration. Registration opening must precede closing, and event start must precede end; closing registration after event start is permitted if the admin chooses that window. Student cancellation is not implemented while cancellation policy remains open.

## Registration integrity and cache boundaries

Registration requires an authenticated account with a complete profile and a published event within its registration window. No manual approval or `verification_status = 'verified'` gate applies under the user-approved policy. The backend takes a row lock on the event before checking status, window, profile completeness, duplicates and capacity. Admin event changes take the same event lock, preventing a concurrent capacity edit from overbooking an event. Each user/event pair is also protected by a unique database constraint.

Expected failures include `PROFILE_REQUIRED`, `PROFILE_DETAILS_REQUIRED`, `EVENT_NOT_OPEN`, `EVENT_FULL`, `ALREADY_REGISTERED`, and `ADMIN_REQUIRED`. Successful registration returns the stored registration; denied actions do not create a success record. A capacity decrease below existing registrations fails with `CAPACITY_BELOW_REGISTRATIONS`.

Each event has a server-generated monotonic `version` and `updated_at`; version changes on every event update, including multiple edits in one transaction. Redis can use the version to invalidate derived event content. Redis does not authorize registration or decide capacity, and this database runbook does not establish that Redis has been provisioned.

Event writes, admin-authority changes and profile-verification changes create audit records. Browser clients cannot forge, update or delete them. Owner-operated changes with no end-user JWT record the database actor in audit details where applicable.

## Admin authorization and bootstrap

The backend email authorization table contains the two user-approved initial entries: `officialtechspaceclub@gmail.com` and `harutoxokura15@gmail.com`. Their owners must sign in through Google; creating a profile with one of these email strings or editing user metadata cannot grant authority. `sync_admin_access` checks the caller's confirmed Google identity against active backend authorization and links it to protected `admin_users`. There are no bundled passwords or automatically created real-user Auth accounts.

Current admins use Control's `/admins` screen to grant or revoke access by exact email and an explanation. Grants require an existing confirmed Auth account. The backend normalizes email, validates input, rejects self-revocation, serializes authority updates, rechecks the actor after acquiring the lock and records an audit trail. Revocations disable authority immediately; an inactive email authorization must not be reclaimed by a later sign-in. Pending initial authorizations can also be revoked before first Google login. All admins have the same role; no owner/super-admin hierarchy is added.

Management RPC errors include `ADMIN_REQUIRED`, `INVALID_ADMIN_EMAIL`, `INVALID_ADMIN_REASON`, `ACCOUNT_NOT_FOUND`, `SELF_REVOKE_NOT_ALLOWED` and `INVALID_OFFSET`. `admin_list_access` returns at most 100 rows from the requested offset. Students and anonymous callers cannot enumerate authorization emails or mutate records directly.

## Development test access

Use deliberately created development accounts for local testing. Production builds must not expose a password-based development login. A development account still signs in through real Supabase Auth and receives the same database permission checks; it is not a frontend role switch.

An owner with privileged SQL access can prepare a **development-only** account after its Auth user and profile exist. Replace the placeholder with that account's Auth UUID:

```sql
-- Development fixture only: do not use this as an approved production policy.
insert into public.admin_users (user_id, active)
values ('AUTH_USER_UUID', true);

```

Normal admin/browser users cannot run this direct write. Use the protected management workflow for ordinary access changes; owner-operated SQL is reserved for deliberately scoped development fixtures or recovery. Profile verification updates are no longer required for registration. Institutional consent/retention and account-recovery procedures remain launch work. Google setup is documented in the [Google runbook](google-auth.md).

## Verification commands

Run from the repository root, with the CLI signed in and MAIN linked as described in the [Supabase setup runbook](supabase-setup.md):

```sh
supabase migration list --workdir supabase/main
supabase db query --linked --workdir supabase/main --file supabase/tests/identity_events.sql
supabase db query --linked --workdir supabase/main --file supabase/tests/onboarding_admin_access.sql
python supabase/main/supabase/tests/concurrency.py
```

The `--file` path resolves relative to `supabase/main`, not the repository root. SQL suites create synthetic fixtures in a transaction and roll them back. Checks cover ownership isolation, denied anonymous/direct writes, profile eligibility, roll claims, admin revocation, audit protection, event validation and cache versions. Before the completion-based policy change, **49 security assertions passed** after the first two migrations on 20 November 2026; that historical count does not validate the later onboarding/admin policy. See [phase.md](../../phase.md) for current results.

The concurrency script requires Python's standard library, the logged-in CLI and the student app's configured MAIN publishable settings. It verifies the expected MAIN project before writing test data. It creates temporary random test accounts, profiles and events, then uses real Auth tokens and simultaneous HTTP RPC requests:

- Six final-seat requests: one registration and five `EVENT_FULL` failures.
- Six requests for the same student/event: one registration and five `ALREADY_REGISTERED` failures.
- An admin capacity change racing with six registrations: committed registrations remain within committed capacity.

All three races passed before the onboarding/admin policy update on 20 November 2026. Registration must retain the same locking under the new eligibility rule; use the updated fixtures and rerun these checks after changing that backend path. See [phase.md](../../phase.md) for current results. These checks establish correctness for the tested races, not a supported production traffic level.

The concurrency harness removes only its generated fixture IDs in `finally`, including related audit records, and confirmed zero remaining concurrency profiles after the recorded run. If the process is forcibly terminated before cleanup, inspect its exact generated fixture IDs before removing records; never replace its scoped cleanup with a deletion of all users, events, profiles or audit logs. Real-user retention and recovery procedures remain separate launch work.
