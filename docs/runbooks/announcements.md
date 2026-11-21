# Dashboard announcements and common OD links

This workflow implements dashboard notices in F04/AT-07 and shared links in AT-09. The v2.0.0 specification remains draft pending stakeholder approval. A subsequent user-authorized increment adds separate personalized Gmail email composition, queueing, progress and retry controls. See the [email runbook](announcement-email.md) for worker setup, verification and remaining real-send/hosting checks. Publishing the dashboard notice alone never sends email.

## Database setup and security verification

Use the explicit MAIN working directory from the [Supabase setup runbook](supabase-setup.md). Migration `supabase/main/supabase/migrations/20261120040000_dashboard_announcements.sql` was reviewed and applied to linked MAIN on 20 November 2026. It depends on the existing identity/events and onboarding/admin-access migrations and does not alter event or registration RPCs. See [phase.md](../../phase.md) for actual validation evidence.

After migration, run from the repository root:

```powershell
supabase db query --linked --workdir supabase/main --file supabase/tests/announcements.sql
```

The SQL test creates development fixtures inside a transaction and rolls them back. It checks anonymous access, student direct writes/publishing, revoked-admin publishing, audience isolation before and after registration, URL validation, required event association, shared OD URL reuse and publication audit records. Follow the [database events runbook](database-events.md) for credentials and linked-project requirements. A prepared test file is not evidence of a successful remote test.

`public.admin_publish_announcement(p_title text, p_body text, p_audience text, p_event_id uuid default null, p_link_url text default null)` returns the inserted `public.announcements` row. It takes no caller-supplied actor or publication timestamp. An authenticated active admin is required after taking the same authority lock as admin access changes. The dashboard record and `announcement.published` audit entry are committed atomically.

`announcements` stores `id`, optional `event_id`, `title`, `body`, optional `link_url`, `audience`, `published_by` and `published_at`. There are no draft notices or browser insert/update/delete grants. RLS allows admins to read all notices; signed-in students read global notices and notices for events where they currently hold a registration. Registration cancellation is not introduced. Titles are limited to 160 characters, bodies to 10,000 and links to 2,048. URLs require HTTPS, a valid ASCII hostname and optional port 1–65535; credentials, whitespace and backslashes are rejected. Internationalized hostnames should use their ASCII/punycode form. Event-associated notices require an existing non-draft event.

## Real workflow

1. Sign in to Launchpad Control as an authorized admin and open `/announcements`.
2. Enter a title and message. Select **All students** or **Event registrants**. Choose an event when targeting registrants; an event is optional for a global notice.
3. Optionally add an existing HTTPS resource URL. Publish and confirm the dashboard success message. Refresh or return to confirm persistence.
4. In Launchpad, open `/announcements` using a registered student account. Confirm the event notice appears. A second student who is not registered must see only global notices, including when querying `announcements` directly.
5. Exercise invalid-link rejection, non-admin publishing denial, and the refresh/error path. Sign out and confirm the account gate replaces the list. Test pagination when records exceed a page (50 notices; 100 event choices).

For a common signed OD, create or use **one Google Drive PDF**, associate the notice with its event, and paste that PDF's shared URL into the optional link field. Reminder announcements can reuse the same URL. There is no OD table, upload, generator or per-student file copy. The application cannot inspect whether an external URL is a signed PDF or enforce Drive permissions; check the target and its sharing settings manually with the intended recipient account. External links may be forwarded according to their external sharing permissions.

## Remaining release work

- Configure Gmail credentials and a continuously operated worker, then verify real sending and reply behavior following the email runbook. The dashboard publication success message still correctly says email was not sent; queue email separately under Personalized email. Email-only notices are not added by this increment.
- Repeat the real browser/admin/student workflow against each deployed origin before public release. Local MAIN checks do not establish hosted deployment, real Drive sharing or physical-device readiness.
- Approval for production deployment, institutional retention/consent and operational recovery remains separate from this increment. No automatic cleanup or retention policy is added.
