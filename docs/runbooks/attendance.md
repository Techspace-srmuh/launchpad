# QR Attendance and Check-in Runbook

This runbook covers the operational model, security guarantees, verification procedures, and limitations of the event QR attendance system in TechSpace Launchpad.

## Architecture and Guarantees

1. **Opaque Credentials**:
   - Students receive an event-specific QR credential generated via `public.generate_qr_credential(p_event_id uuid)`.
   - The QR payload is a 64-character hex HMAC-SHA256 token derived from `registration_id` and `event_id` with a server-generated salt.
   - It **never contains registration numbers, student names, phone numbers, or PII**.
   - The token is served as a dynamic PNG image from `/api/qr/[eventId]` inside Launchpad (student app) to authenticated callers, with private no-store caching. The QR is a bearer credential visible to its owner and scanner; do not log or share it. The PNG transport is not encryption of the credential.

2. **Backend Authority and Scanning**:
   - Check-in scanning is performed by authorized admins via `public.validate_check_in(p_token text, p_event_id uuid)`.
   - The backend checks:
     - Caller has active admin authority (`is_admin()`) rechecked after the shared admin-authority lock, serialized with access revocation.
     - Credential and registration match the scanned event, which must remain published.
     - Scanned time is within the event's check-in window (`now() between events.starts_at and events.ends_at`).
     - Duplicate check-in is rejected atomically (`registration_id` unique constraint in `public.attendance`).
     - Concurrent scans of the same QR are serialized using a row lock (`FOR UPDATE` on `public.qr_credentials`).
   - Every check-in records the scanning admin (`checked_by`) and timestamp in `public.attendance` and an audit entry in `public.audit_logs`.

3. **Manual Attendance Corrections**:
   - Admins can correct a record using `public.admin_correct_attendance(p_attendance_id uuid, p_checked_in boolean, p_reason text)`.
   - A mandatory reason between 3 and 500 characters is required.
   - The actor, previous/new status, event, registration, timestamp and reason are retained in the row/audit history. A scan cannot override an absent correction; an admin must restore it with another reason.
   - The admin list displays student names and registration numbers with 100-row pagination; refreshes keep the camera preview attached.

4. **No Offline Check-in**:
   - In accordance with the specification, check-in requires a live connection to the backend. No offline check-in caching is permitted.

## Verification Commands

Run the test suite against the linked MAIN development database:

```bash
# 1. Rollback SQL test suite (covers AT-05, AT-06, RLS, wrong-event, duplicate, window, and corrections)
supabase db query --linked --workdir supabase/main --file supabase/tests/attendance.sql

# 2. Concurrency race conditions (simultaneous same-QR scans, capacity edits, and admin role changes)
python supabase/main/supabase/tests/concurrency.py

# 3. Full browser and API integration test (covers QR UI, scanner workflow, and audit logging)
npm run test:live
```

## Known Limitations

- **Physical camera scanning (AT-15)**: Automated tests decode an actual QR PNG through the jsQR fallback using a synthetic canvas video stream and the real check-in RPC, then verify refresh preserves the preview and stop ends the track. Camera performance across physical iOS (Safari) and Android (Chrome) devices must be validated on actual hardware before production sign-off.
- **Check-in Window**: Current development window is strictly between `starts_at` and `ends_at`. Any pre-event check-in grace period (e.g. 30 minutes prior) remains an open policy decision.
- **Scanner Fallback**: Browsers exposing a working `BarcodeDetector` QR implementation use it; others fall back to the bundled `jsQR` canvas decoder. Browser and device support still requires release verification.

## Reviewed development evidence — 20 November 2026

`npm run check` passed with 60 unit tests and both production builds; navigation passed 8/8, production routing 4/4, rollback attendance SQL 39/39 and concurrency races 5/5. Announcements/events passed in the full live run, and the corrected attendance scenario passed in the targeted follow-up. See [phase.md](../../phase.md) for exact scope and limits.

To rerun attendance only, use `npm run test:live -- tests/live/attendance.spec.ts`. The harness preserves credential-free fixture IDs and cleanup SQL under ignored `.supabase/live-test-*` if cleanup fails; password-bearing seed SQL is always removed.
