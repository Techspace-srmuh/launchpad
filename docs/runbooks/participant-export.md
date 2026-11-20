# Participant CSV export

F08 in the v2.0.0 draft specification provides an admin-only filtered export. Launchpad Control exposes `/events/[eventId]/export`, linked from participants. Migration `supabase/main/supabase/migrations/20261120070000_participant_export.sql` was reviewed and applied to linked MAIN on 20 November 2026; the rollback suite passed 23 checks. Follow the existing [database runbook](database-events.md) for verification and see [phase.md](../../phase.md) for evidence. This implementation does not establish production readiness.

## Workflow

An active admin previews participants using optional department (case-insensitive exact match), academic year (1–8), and literal name/registration-number substring search (case-insensitive). Filters combine with AND; search checks either name or registration number. Clear filters resets the event list. Preview shows the exact matching count and first ten rows. Changed controls must be previewed before downloading.

Download uses the same applied filters and requests a fresh snapshot. Registrations or profile edits after preview can change the count; the UI updates the preview/count to match the download. One materialized query supplies count and data from one MVCC snapshot, ordered by registration time then UUID. This avoids shifting pagination, duplicates and skipped records. Cross-request snapshots are not promised.

CSV columns are `full_name`, `roll_number`, `course`, `branch`, `department`, `section`, `academic_year`, `registered_at`. Values reflect current profiles and original ISO registration time; nullable legacy fields become empty cells. Contact details, user/registration UUIDs and QR credentials are excluded. Export does not depend on attendance.

CSV uses UTF-8 BOM, CRLF, quoted cells and doubled quotes. Formula-like text beginning with `=`, `+`, `-` or `@` after whitespace/control characters, and leading tab/CR/LF, receives an apostrophe prefix. Stored values remain unchanged. The filename contains the validated event UUID. A Blob download releases its object URL after the browser starts downloading.

## Backend and limits

`admin_event_participant_export(p_event_id uuid, p_department text default null, p_academic_year integer default null, p_search text default null, p_download boolean default false)` returns one JSON object: `{event_id, generated_at, filters: {department, academic_year, search}, count, rows}`. Preview returns up to ten rows; download returns all matching rows. Scalar JSON avoids PostgREST's returned-row cap. Responses are bounded to 10,000 participants and 16 MiB of JSON. Oversized results raise `EXPORT_TOO_LARGE` and never return a partial export. Narrow filters for larger events. Failed/incomplete responses create no CSV; retry requests a new complete snapshot.

The security-definer RPC uses an empty search path, grants execution only to authenticated callers, and checks active admin authority after acquiring the same transaction advisory lock as admin grant/revoke operations. Every request rechecks authority. Revocation committed before lock acquisition denies access; an export holding the lock finishes before a concurrent revocation. Browser code uses no service-role key.

Successful backend download preparation atomically logs `participants.export_prepared` in existing RLS-protected `audit_logs`: actor, event, normalized filters, exact count, generation timestamp and CSV format. Preview and failed/oversized requests create no successful-export audit. This records backend preparation, not confirmation of a local file save. Network/browser failures after commit can leave an audit without a saved file; retries create another preparation audit.

## Verification

Run `npx vitest run packages/shared/src/participant-csv.test.ts` for Unicode, quote/comma/newline interoperability, formula protection, nulls, BOM, safe filenames and more than 1,000 rows. Run repository typecheck/lint/build as described in README.

Run `supabase/main/supabase/tests/participant_export.sql` against linked MAIN development with the [database runbook](database-events.md)'s explicit working directory and trusted connection. Fixtures roll back. Checks cover anonymous/student/missing-identity/revoked-admin denial, event isolation, normalized/literal filters, eight-field scope, audit behavior, over 1,000 rows, and explicit rejection above 10,000. Writing SQL is not evidence it passed. The final live browser/API suite passed authorized 105-participant downloads, filters, CSV escaping and direct student/anonymous/revoked-admin denials; see phase.md. Concurrent role revocation, simulated transport-failure/retry, supported spreadsheet readers and mobile downloads remain release verification.
