# Personalized announcement email

See [decision 006](../decisions/006-gmail-announcement-email.md). This is a dashboard-first Gmail workflow, not an email-only notice mode or certificate delivery. No fixed daily application cap is imposed.

## Setup

Use Node 22.12+ on the Node 22 line and `npm ci` at the repository root. Apply the reviewed MAIN migrations `20261120100000_announcement_email.sql` and `20261120101000_email_job_review.sql` using the explicit MAIN CLI workdir; never apply them to CERTIFICATES. No worker or mail sending starts when a migration is applied.

Copy `.env.email.example` to `.env.email` (ignored by Git). Fill in the MAIN server service-role/secret key and a Gmail app password for `officialtechspaceclub@gmail.com`. Keep this file on the worker host only; do not put either credential in frontend environment files, logs, source control or chat. Enable Google two-step verification before creating the app password. This integration does not use the Google sign-in client secret or your ordinary Gmail password.

Run:

```powershell
npm run email:verify
```

This authenticates to Gmail without sending a message. It does not prove inbox delivery or database connectivity. Then start the worker in its own process:

```powershell
npm run email:worker
```

Leave this running. Closing the browser does not stop it, but stopping the worker/computer does. For hosted operation, run this command under an always-on Node host's process supervisor with protected environment variables, or schedule `npm run email:once`. Hosting and scheduler free allowances must be checked on the chosen platform; no scheduler is automatically provisioned. For host-managed secrets, invoke `node scripts/email-worker.mjs --loop` directly instead of loading a local env file. Never launch multiple mail workers for different databases with the same Gmail account: the database lease only coordinates workers connected to this MAIN project.

## Admin workflow

1. Publish the ordinary dashboard notice, choosing all students or event registrants and optionally one existing Drive/OD link.
2. Under **Personalized email**, choose that published notice. Write an email subject and plain-text body. `{name}`, `{event_name}`, `{event_date}` and `{link}` are the only supported placeholders. Dates are formatted in India time. Event/link placeholders require that data on the notice.
3. Preview the message. The preview uses the admin's name as a sample; actual jobs use each recipient's profile name. Click **Send individual emails**. The email body is separate from the dashboard body. No name placeholders are introduced into shared student dashboard text.
4. Progress refreshes every 15 seconds while this page is visible. Counts show queued, accepted by Gmail, failed, uncertain and skipped. Use **Review recipient status** for admin-only names, addresses, attempt counts and safe error categories; refresh that paginated view explicitly. An empty audience creates a campaign with zero jobs, not an invented successful send.
5. One campaign per notice prevents accidental repeat sends; a new notice is required for an intentional reminder. Same-template retries of queue creation return the original campaign.

Recipients are confirmed, non-banned Auth accounts with student profiles in the notice audience at queue time. Email address, name and message are snapshotted then; new registrations do not join an old campaign automatically. The worker rechecks account existence, confirmation, ban status, current address, profile and event registration before sending; ineligible jobs are skipped. A name change after queueing does not rewrite the email. Browser users never supply recipient addresses.

## Failure handling and recovery

- Ten individual messages per batch, one second apart; a database-wide lease and at least one-minute batch cooldown survive process restarts. There is no application recipient cap per day. Google limits still apply.
- Definite transient SMTP failures retry with exponential backoff, up to five attempts before failure. Gmail daily-quota errors pause sending for 24 hours; authentication errors pause for one hour. Check account access and worker configuration when auth fails.
- `accepted` means Gmail acknowledged SMTP acceptance, not that a student received/read the email. Gmail SMTP does not provide provider-style delivery webhooks here.
- A timeout/reset after submission can mean Gmail already accepted the message. Such jobs become `unknown`. A worker crash leaves only its currently claimed job in `sending`; after its 15-minute lease expires, the next available batch marks it `unknown`. Stopping a worker does not requeue this job automatically.
- Check the club Sent folder before explicitly retrying uncertain messages; a stable Message-ID does not guarantee provider deduplication. Use the reason field and the explicit uncertain-send acknowledgement in Control. The retry is audited. Pending/retrying/accepted/skipped jobs are not reset by this action.
- Database acknowledgement failure stops the worker; do not treat this as a definite SMTP failure. Restart after connectivity recovers and review uncertain jobs.
- Do not log raw SMTP errors: they can contain recipients or authentication details. The worker stores safe categories and logs only aggregate batch counts. Keep the service key server-only. Revoking a browser admin removes queue/progress/retry authority immediately; already authorized campaigns remain queued.
- No automatic retention/deletion is introduced. Include queue metadata and audit records in approved operational backup/recovery and retention policies.

## Verification

```powershell
npm run check
supabase db query --linked --workdir supabase/main --file supabase/tests/announcement_email.sql
npm run test:live -- tests/live/announcement-email.spec.ts
```

The SQL tests roll back their fixtures and never call SMTP. The live test queues only synthetic event recipients, never starts the worker, and removes its exact campaign/job fixtures afterward. Do not operate a real sender while running development fixture suites. Unit tests use simulated SMTP outcomes and a real Nodemailer MIME stream, not external recipients. A real authorized Gmail send and reply check, supported devices, hosted worker restart/recovery and deployed-origin checks are still required before claiming production email readiness.

Gmail can block automated server connections even below its stated quota. References: [Nodemailer Gmail integration](https://nodemailer.com/guides/using-gmail), [Google app passwords](https://support.google.com/accounts/answer/185833), [Google sending limits](https://support.google.com/mail/answer/22839).
