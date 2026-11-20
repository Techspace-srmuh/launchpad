# Launchpad development guidance

## Read first

This repository is TechSpace Launchpad, an event platform for one university club. Read [the source-of-truth specification](TechSpace_Launchpad_SOURCE_OF_TRUTH.md) before planning or changing product behavior. It contains requirements F01-F08, acceptance criteria AT-01-AT-16, architecture, release boundaries, and unresolved decisions.

The specification is **v2.0.0, draft pending stakeholder approval**. Use it as the current planning baseline; do not imply it has been approved. Once approved, it takes precedence over earlier PRDs and conversations. Keep this file and the README aligned with it without duplicating the full specification.

## Current repository state

The repository contains two Next.js App Router apps and shared packages in an npm workspace. Phase 1 is locally validated. MAIN has identity/event/onboarding/admin-access and dashboard-announcement migrations, RLS, audited admin operations and atomic registration. Dashboard notices and shared OD links are available; event gallery/resource management and protected participant CSV export are implemented. Email delivery remains pending. The user has approved immediate student eligibility after complete onboarding and admin-managed access; see [decision 005](docs/decisions/005-student-onboarding-admin-access.md). Google sign-in is enabled in MAIN; automated checks reached Google from both apps and the user subsequently reported successful real login. Detailed multi-account and deployed-origin verification remains a release check. Separate Vercel configurations are included; no frontend is deployed. The optional Redis function is deployed, but Redis is not provisioned. See [architecture](docs/architecture.md), [phases](phase.md) and README for evidence and limits. Development verification does not establish production readiness.

Use Node.js 22.12+ on the Node 22 line for the baseline and `npm ci` from the root. Run `npm run check` for typechecking, lint, unit tests and both builds; install Chromium with `npx playwright install chromium` and run `npm run test:e2e` for navigation checks. Keep root `package-lock.json` in sync with all workspace manifests. Do not confuse a generated lockfile or source review with a successful install/build.

Use explicit MAIN/CERTIFICATES CLI working directories as described in the [Supabase setup runbook](docs/runbooks/supabase-setup.md). Real SQL/security/concurrency and live-browser tests require the linked development project; follow the [database runbook](docs/runbooks/database-events.md). Keep test-account access development-only. Redis is an optional server-side cache, never an authority for registration capacity or private access; see the [Redis runbook](docs/runbooks/redis-events.md).

## Product boundaries

- Build two separately deployed web apps: **Launchpad** for students and **Launchpad Control** for admins. Share the primary identity and operational database.
- There are two end-user roles: student and admin. Admins may scan attendance. Enforce admin authority server-side.
- Keep features centered on events. Release 1 covers sign-in/profile, events, registration, QR attendance, announcements/email queue, OD links, galleries/resources, minimal dashboards, and participant export.
- Release 2 adds certificate templates/issuance/download/verification and private event questions. Do not move these into Release 1 without an explicit scope change.
- A common signed OD is one Google Drive PDF linked from an announcement. Do not add OD generation, an OD module/table, or per-student PDF copies.
- Store Google Photos album URLs and Drive/resource links rather than hosting gallery media or duplicating large resources.
- Exclude payments, membership approval, multi-club support, advanced analytics, extra role hierarchies, social/group chat, native apps, and offline check-in.

## Architecture baseline

| Concern | Baseline in the specification |
|---|---|
| Frontends | Next.js App Router, React, TypeScript; Tailwind CSS and shadcn/ui |
| Hosting | Two independent Next.js deployments; Vercel configuration included. Cloudflare needs a compatible runtime adapter instead of the former static Pages upload. |
| Identity | Supabase Project 1 Auth with Google OAuth |
| Operational data | Project 1 PostgreSQL with row-level security |
| Privileged operations | Authenticated Edge Functions or protected PostgreSQL RPC |
| Certificates | Project 1 permanent metadata; Project 2 private template/PDF storage |
| Email | External provider with queue, throttling, retry and status; provider/worker undecided |
| Form factor | Responsive HTTPS web apps; student app installable as a PWA; mobile admin camera scanning |

These are planned choices, not evidence of provisioned infrastructure. Do not assume free quotas, scheduling capabilities, or an email provider. Verify current provider limits when implementing integrations.

## Data and security invariants

- Enable and test RLS on every exposed table. Students must not access other students' private records or invoke admin mutations, even through direct API calls.
- Keep service-role keys and other secrets in server environments. Neither frontend may hold Project 2 privileged credentials.
- Accept personal Gmail and university Google accounts. The user-confirmed university domain is `stu.srmuviversity.ac.in`; do not impose a university-domain sign-in restriction. Full name, unique normalized immutable registration number, course, branch, department, section, academic year and mobile number are required for student onboarding. Complete details give immediate registration eligibility without manual approval. Do not label self-declared details as university-verified.
- Initial authorized admin emails are `officialtechspaceclub@gmail.com` and `harutoxokura15@gmail.com`. Bootstrap only from matching confirmed Google identities and protected backend records, never editable user metadata. Current admins may grant/revoke confirmed registered accounts with an audited reason; reject self-revocation and recheck authority while serializing role changes. Keep only student/admin roles.
- Enforce event publication, registration windows, eligibility, uniqueness and capacity atomically on the backend. Client validation is for usability only.
- Use event-specific QR credentials that do not expose plain roll numbers. Validate scanner authority, event, registration, check-in window and duplicates on the backend. Record actor, time and reason for corrections.
- Apply announcement audience rules to reads and delivery. Save the dashboard record independently of email processing; rate-limit, retry and report email failures.
- Validate URLs, text and any uploads. External Drive/Photos permissions remain external to app authorization; do not promise private access to publicly shared links.
- Certificate UUIDs, owner/event associations, printed values, template versions and status are permanent in Project 1. Keep immutable template assets for regeneration after temporary PDF cleanup.
- Authenticate against Project 1 before backend access to Project 2. Check ownership/admin authority and issuance status, then return a bounded private download result. Public verification exposes minimal data and revocation status.
- Private event threads and attachments are accessible only to the owning student and authorized admins.
- Audit privileged actions. Use migrations for schema changes and test recovery of operational data and certificate templates before production use.

## Handling unresolved decisions

Consult section 15 of the specification. Student eligibility and admin provisioning policy are resolved by the user as recorded in decision 005; Google is enabled and the user reports successful login; comprehensive OAuth validation remains a release check. Cancellation policy, email provider/worker/sender, query attachments, certificate layout/retention/email policy, deployment branding, and institutional retention/consent remain unresolved.

Do not silently turn suggested defaults into approved policy. Continue independent work where possible, record assumptions as proposals, and request the relevant decision before shipping dependent behavior. The proposed 30-day PDF retention is not an approved cleanup policy.

New scope needs a clear user task, a named role, a workflow, a database/storage implication and a testable acceptance criterion. Update the specification when the user approves a scope change.

## Implementation and verification

1. Read the relevant requirements and acceptance criteria; inspect existing code and conventions.
2. Implement the smallest complete authorized workflow with loading, empty, failure and unauthorized states. Do not report mock actions as successful production operations.
3. Keep browser presentation separate from privileged backend logic. Use existing project conventions once established; avoid introducing extra services without a concrete requirement.
4. Run the actual checks available for the change and report what ran. For documentation-only edits, check links, consistency and Markdown rather than inventing application tests.
5. For backend changes, include meaningful authorization/isolation checks. For registration, test concurrent capacity/duplicate attempts; for attendance, wrong-event/unauthorized/duplicate scans; for announcements, audience isolation and email retry behavior.
6. For Release 2, test private certificate downloads, revoked verification, regeneration after PDF removal, and thread/attachment isolation. Test mobile camera/download/PWA behavior on supported devices before claiming release readiness.
7. Document remaining limitations. A feature is complete only after its real student/admin workflow, denied unauthorized actions and failure paths work end to end.

Keep changes scoped, preserve unrelated user work, and update README instructions when real setup or commands change.
