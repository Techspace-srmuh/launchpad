# Launchpad delivery phases

This workflow implements [the source-of-truth specification](TechSpace_Launchpad_SOURCE_OF_TRUTH.md), v2.0.0, which remains a draft pending stakeholder approval. The phases organize delivery; they do not approve open product decisions or expand scope. See [folder architecture](docs/architecture.md) for implementation locations.

**Current state:** Phase 1 is **complete**. Both apps use Next.js App Router with separate Vercel configurations. The user has approved personal/university Google accounts, immediate eligibility after complete self-declared student onboarding, and admin-managed access. MAIN now has the onboarding/admin-access migration, in addition to identity/events and the optional event-read function. Google sign-in is enabled; automated local redirects reached Google and the user reported successful real login. Multi-account and deployed-origin checks remain release validation. Redis provisioning, frontend deployment and remaining Release 1 workflows are pending. The overall specification remains draft; Phase 2/3 are not declared release-complete.

## Phase overview

| Phase | Outcome | Depends on | Release | Status |
|---|---|---|---|---|
| 0 | Confirm scope and record decisions needed to begin | Stakeholder decisions | Foundation | Pending |
| 1 | Runnable workspace and two app shells | 0 for affected decisions | Foundation | Complete: validated 20 November 2026 |
| 2 | Shared identity, student profiles and protected admin access | 1 | 1 | Onboarding/admin policy implemented; Google enabled and user reports working login; full release validation pending |
| 3 | Event publishing and atomic registration | 2 | 1 | Development workflow verified; release depends on Phase 2/policy |
| 4 | Secure event QR attendance | 3 | 1 | Pending |
| 5 | Targeted announcements, OD links and queued email | 3; email decisions | 1 | Dashboard notices/OD links implemented; email delivery pending |
| 6 | Event materials and usable dashboards | 3-5 | 1 | Gallery/resource links and participant export development-verified; dashboard summaries and release checks pending |
| 7 | Verified mobile workflows and operational recovery | 2-6 | 1 launch gate | Pending |
| 8 | Certificate templates, issuance and private downloads | 7; certificate decisions | 2 | Pending |
| 9 | Private event questions and replies | 7; attachment decisions | 2 | Pending |
| 10 | Release 2 verification and operations | 8-9 | 2 launch gate | Pending |

Phase 5 can proceed alongside Phase 4 after registration is stable. Phases 8 and 9 can proceed independently after Release 1. Run relevant security checks within each phase; launch gates verify the integrated result.

## Phase 0 - Scope and decisions

- Review the draft with stakeholders and record approval or revisions.
- Student onboarding/admin-access policies were approved on 20 November 2026; see [decision 005](docs/decisions/005-student-onboarding-admin-access.md). Keep remaining production decisions explicit.
- Record registration cancellation policy and establish who owns production operations.
- Track email provider, verified sender, worker/scheduler and documented quotas as decisions required before email delivery.
- Track university consent/retention and authorized domains/branding before public rollout. Defer certificate and attachment decisions until their dependent phases.

**Deliverable:** decision records in `docs/decisions/`, distinguishing approved decisions from proposals and listing remaining owners/dependencies.

**Exit:** scope is understood and decisions required for the next phase are resolved. Independent directory/setup work can proceed while policy decisions remain open.

## Phase 1 - Workspace and app foundations

- Choose and document a package manager/workspace layout; create Next.js/React/TypeScript app shells under `apps/student` and `apps/admin` (originally Vite; migrated by user request on 20 November 2026).
- Configure Tailwind/shadcn UI and shared packages only where needed.
- Establish separate app builds, routing/layouts, browser-safe environment handling and backend secret boundaries.
- Add lint/type/build/test scripts and CI checks using the tooling actually installed.
- Document local setup, environment variable names without values, and separate deployment roots.

**Deliverable:** two independently buildable app shells and documented commands.

**Exit:** fresh setup and both builds work with clear missing-configuration errors. No mock workflow is presented as production functionality.

### Phase 1 implementation record - 19 November 2026

- Implemented npm workspaces, root lockfile, separate React/TypeScript/Vite app configurations and development ports 5173/5174.
- Added Tailwind 4, shared shadcn-style Button/theme utilities, browser configuration validation/client factory, and shared app metadata.
- Added home/overview, setup and not-found routing in both apps. No sign-in, backend calls, metrics or event mutations are simulated.
- Added TypeScript/ESLint/Vitest/Playwright commands, CI, environment examples, static SPA rewrites and deployment instructions.
- Executed the actual pure TypeScript browser-config validator with Node and assertions: **16 scenarios passed**, covering missing values, unsafe endpoints, private/invalid keys and valid public/local settings. This does not substitute for the full Vitest suite or backend connectivity checks.
- Generated the lockfile with all five workspace entries; the dependency audit after updating Vitest reported **zero known vulnerabilities**. Checked source encoding, JSON, non-JSX TypeScript/configuration syntax, local document links and Markdown fences. JSX compilation, lint and real browser behavior remain unverified.
- Full npm install failed with `EPERM` while creating `node_modules`; the elevated retry was rejected because this session disables sandbox approvals. Lockfile generation without installing dependencies is separate from that blocked action.
- **At that time, still required:** `npm ci`, `npm run check`, Chromium installation and `npm run test:e2e` on a machine/session that permits dependencies. These checks were subsequently completed as recorded below.

### Phase 1 validation record - 20 November 2026

- Environment: Windows, Node.js **22.23.2** (matching `.nvmrc`), npm **10.9.8**.
- `npm ci`: **passed**, installing 232 packages and auditing 244 packages with zero reported vulnerabilities. The root lockfile was unchanged.
- `npm run check`: **passed**. TypeScript checks passed for both apps, all shared packages and tooling; ESLint reported zero errors and one non-blocking `react-refresh/only-export-components` warning for the shared Button's `buttonVariants` export; all **15 Vitest tests** passed; both student and admin production builds succeeded.
- `npx playwright install chromium`: **passed**, installing Chromium and its required browser tooling.
- `npm run test:e2e` with `CI=true`: **4/4 passed** using fresh student/admin dev servers. Both apps passed at desktop (1440×900) and mobile (390×844) viewport sizes: shell rendering, missing-configuration messages, setup navigation/reload, not-found recovery, no horizontal overflow on the final page, no uncaught page errors and no requests to Supabase-hosted backends.
- **Outcome:** Phase 1 foundation exit criteria are satisfied locally. No application code changes were needed. npm reported an ESLint 9 support deprecation notice; upgrading lint tooling is separate maintenance work.
- **Limits:** this is local Windows validation, not evidence of a GitHub CI run or deployed Cloudflare behavior. Mobile viewport tests do not establish physical-device camera, download or PWA readiness. Authentication, database connectivity, authorization and product workflows remain Phase 2 or later work. The specification remains a draft and Phase 0 policy decisions remain open.

### Next.js migration record - 20 November 2026

- User-authorized migration: both Vite apps now use Next.js **16.4.6** App Router, file-based pages and runtime event IDs, shared client identity, Next.js navigation, metadata and loading/error/not-found boundaries. Supabase RLS/RPC contracts and existing workflows are preserved. See [decision 004](docs/decisions/004-nextjs-migration.md).
- Replaced Vite application entry points, React Router, Tailwind Vite integration and static SPA rewrites with Next.js/PostCSS configuration. Public variables are now `NEXT_PUBLIC_MAIN_*`; local environment values were renamed without being displayed or committed. Browser configuration validation and development-only password access remain enforced.
- Added separate app-level Vercel configurations and documented project roots, workspace installation, Node 22, shared-source access and environment boundaries. No Vercel project is linked or deployed. `.next` requires a Next.js runtime; the former static Cloudflare Pages upload is no longer applicable.
- Clean `npm ci`: **passed**, 202 packages installed, 214 audited, zero reported vulnerabilities. Node **22.23.2**, npm **10.9.8**. npm reports the existing ESLint 9 support deprecation notice; lint itself passes.
- `npm run check`: **passed** after the clean install, including application/shared/backend/tooling types, ESLint, **32 unit tests** and both production builds.
- `npm run test:e2e`: **8/8 passed** across desktop/mobile viewports, covering client navigation, direct routes, dynamic event route access gates, active links, back/reload behavior and HTTP 404 recovery. Cold development compilation requires a longer assertion timeout than the former Vite server.
- `npm run test:production`: **4/4 passed**, exercising real built servers, dynamic event routes/reloads, signed-out access gates, HTTP 404 recovery and omission of development login. Added this suite to CI. Test suites use separate output directories.
- `npm run test:live`: **one integrated browser/API scenario passed** against linked MAIN, covering real admin draft/publish/edit/close, student profile update/registration/My Events, full/duplicate/unverified failures, participant records, non-admin denial, private-record isolation, direct-write denial, deployed function reads and sign-out. The test now scopes alerts to page content because Next.js supplies its own accessibility route announcer. Temporary synthetic accounts and event records are removed by the harness.
- **Recommended next work:** complete Phase 2 Google OAuth for both origins and obtain university-verification/admin-provisioning decisions so hosted users can sign in. Then implement Phase 4 secure event QR attendance. This recommendation does not approve those policies or start another feature phase; certificates and private questions remain Release 2.
- **Limits:** local checks do not establish hosted Vercel deployment, approved production identity policy, physical-device PWA/camera readiness or a production-ready release.

## Phase 2 - Identity and authorization

- Configure Project 1 Google OAuth for both app origins, accepting personal Gmail and university Google accounts. Complete student details give immediate eligibility without manual verification.
- Add migrations for profiles, protected admin records, audit foundation and required RLS.
- Implement student onboarding with full name, unique normalized registration number, course, branch, department, section, academic year and mobile number; retain returning profiles and permitted edits.
- Provision the two approved initial Google admins and implement audited admin-managed grants/revocations with backend authority checks and unauthorized/session-expired states.

**Deliverable:** shared sign-in and distinct student/admin access using real records.

**Exit:** AT-01 and AT-02 pass, including direct API attempts and student-to-student isolation.

### User-approved onboarding and admin access - 20 November 2026

- The user approved personal Gmail and university Google accounts, the domain `stu.srmuviversity.ac.in`, full student details and immediate registration eligibility without manual approval. Completion is self-declared and is not presented as institutional verification. See [decision 005](docs/decisions/005-student-onboarding-admin-access.md).
- Applied MAIN migration `20261120020000_onboarding_admin_access.sql`: nullable legacy profile fields for course/branch/section/mobile, expanded profile RPC and complete-profile registration eligibility. Unique immutable normalized registration numbers, private profile RLS and atomic event rules remain enforced. Existing profiles must fill new fields; no fabricated data was added.
- Added the Google sign-in entry point in both apps, same-origin `/account` returns, bounded provider-configuration checks and sanitized cancellation/error handling. Password test login remains development-only. A complete profile can register while `verification_status` remains `unverified`.
- Added protected email authorizations for `officialtechspaceclub@gmail.com` and `harutoxokura15@gmail.com`; MAIN reports **two active authorizations, zero linked accounts**. They will claim admin authority after confirmed matching Google sign-in. No real-user account, password or invitation was created.
- Added Control `/admins`, with grant/revoke by exact confirmed-account email, audit reason, loading/error/empty states and paginated access records. Backend authority is rechecked under a shared lock; self-revocation, student promotion, metadata spoofing and reactivation of revoked Google grants are denied.
- MAIN rollback SQL suites: **49 existing checks and 37 onboarding/admin checks pass**. Tests cover profile completeness, immediate registration without verification, invalid phone/duplicate roll denial, private fields, confirmed Google identity matching, untrusted metadata denial and audited grant/revoke permissions.
- Real concurrency tests: **4/4 pass** for final-seat contention, duplicate attempts, capacity edits and simultaneous cross-admin revocations. The revocation race leaves one active admin and rejects the now-revoked actor. Synthetic fixtures are removed afterward.
- `npm run check`: **passed**, including application/shared/backend/tooling types, ESLint, **40 unit tests** and both Next.js production builds. Desktop/mobile navigation checks: **8/8 passed**, including denied direct access to `/admins` when configuration is absent.
- Production browser checks: **4/4 passed**, including Google provider-disabled messaging, sanitized cancellation returns, absence of development password login, direct event/admin routes and HTTP 404 recovery. These controlled failure tests do not claim successful Google authentication.
- `npm run test:live`: **one expanded integrated browser/API scenario passed** against MAIN. An initially incomplete, unverified student fills course/branch/section/mobile and immediately registers; private records remain isolated. A current admin grants access from `/admins`, the target can enter Control, self-revocation is rejected, another admin revokes access and subsequent API/page access is denied. Event publication/closing, capacity/duplicate failures, deployed event-read authorization and sign-out remain covered. All synthetic accounts, authorizations and event records were removed. The test exposed and corrected accessible labels for the mobile field and action selector. One earlier run hit an external event-read network failure; invocations are now bounded to 15 seconds and the passing run also checked the anonymous HTTP denial status.
- **Remaining external setup:** MAIN Google provider is disabled. Configure an External-audience Google OAuth client and exact Supabase/app callbacks using the [Google setup runbook](docs/runbooks/google-auth.md), then test real personal/university logins and both initial admins. Synthetic identities do not verify real Google consent or account ownership. Phase 2 and public rollout remain incomplete until this passes.
- **Next product phase:** secure event-specific QR attendance (Phase 4). Certificates and private questions remain Release 2; consent/retention, email and later release decisions are unchanged.

## Phase 3 - Events and registration

- Build admin event creation/edit/publish/close/complete/cancel flows and student discovery/detail/My Events.
- Add event/registration schema, constraints, policies and protected registration operations.
- Enforce publication, opening/closing windows, eligibility, uniqueness and optional capacity atomically.
- Show accurate confirmation, closed/full/cancelled states and participant views.

**Deliverable:** a student can discover and register for a real published event.

**Exit:** AT-03 and AT-04 pass, including simultaneous duplicate and final-seat requests.

### Development identity/events and Redis record - 20 November 2026

- User-authorized delivery adjustment: simple UI and real event workflows precede Google integration. See [development access decision](docs/decisions/003-development-access.md); this does not approve production verification/admin policy or the whole draft specification.
- Applied MAIN migrations `20261120010000` and `20261120011000`: profiles, protected admin records, audit logs, events, registrations, RLS, authenticated mutation RPCs, atomic capacity/duplicate enforcement, URL validation and event revision tracking. CERTIFICATES received no product migrations.
- Added development-only real password test-account login, session restoration/sign-out, profile editing, backend-guarded admin views and loading/empty/error states. Students cannot self-verify or promote themselves. Normal profiles remain unverified.
- Added admin event create/edit/status changes and paginated participant views; students browse events/details, register and view My Events. Roll normalization/immutability and academic-year limits remain provisional development constraints.
- Implemented/deployed authenticated `events-read` to MAIN. Optional Redis REST caching uses fresh RLS visibility/version metadata and admin bypass, bounded TTL/timeouts and database fallback. Browser opt-in is off by default. No Redis provider/credentials, rate limiting or email queue are configured by this work. Live Redis hit/expiry/outage verification and traffic capacity testing remain pending.
- `npm run check`: TypeScript (apps/shared/backend/tooling), ESLint, **32 unit tests** and both builds pass. One pre-existing shared Button Fast Refresh warning and Vite bundle-size advisories remain non-blocking.
- `npm run test:e2e` with `CI=true`: **4/4** foundation navigation tests pass at desktop/mobile viewport sizes. Tests now use dedicated ports 5183/5184, leaving regular 5173/5174 development sessions alone.
- MAIN SQL suite: **49 security/validation assertions pass**, with fixtures rolled back. Actual simultaneous HTTP tests: **3/3 races pass** (six final-seat attempts, six same-student attempts and concurrent admin capacity change). See [database runbook](docs/runbooks/database-events.md).
- `npm run test:live`: **one real integrated browser/API scenario passes**, covering admin draft/publish/close, hidden drafts, student profile update, mobile-viewport registration/My Events, full-event failure, admin participant records, non-admin denial, isolation/direct-write denial, unverified denial, sign-out and authenticated deployed function reads. Synthetic accounts/events are removed afterward. A profile refresh remount issue found by this check was fixed.
- **Limits:** Google onboarding AT-01 remains unverified. AT-02/03/04 behavior was exercised with synthetic development identities, not approved production onboarding. No frontend deployment, physical-device camera/PWA workflow, real Redis service or production load capacity has been verified. Later phases and release gates remain open.

## Phase 4 - Attendance

- Issue event-specific QR credentials on valid registration without exposing roll numbers.
- Add authorized mobile browser scanning and backend event/time/registration validation.
- Enforce exactly one primary check-in; support audited admin corrections with reasons.
- Handle denied camera access, network errors, expired/invalid and duplicate/wrong-event scans explicitly.

**Deliverable:** real check-in visible in student and admin records.

**Exit:** AT-05 and AT-06 pass; camera workflow is exercised on supported mobile devices.

## Phase 5 - Announcements, OD and email

- Add announcement authoring and audience-filtered student reads for all students or event registrants.
- Support dashboard/email/both delivery selections according to the specification.
- Share a common signed OD through one Google Drive link inside an event announcement.
- Configure the selected email provider, verified sender and queue worker/scheduler; implement throttling, retry, duplicate-send protection and delivery status.
- Persist dashboard announcements independently of email success and expose meaningful failures.

**Deliverable:** targeted dashboard notices and real queued email delivery within provider limits.

**Exit:** AT-07-AT-09 pass, including audience isolation, retry/rate-limit failures and single-link OD sharing. Email cannot be marked complete while provider/worker/sender decisions remain unresolved.

### Dashboard announcements and OD links - 20 November 2026

- User-authorized incremental delivery: dashboard notices and common OD links first; email provider, sender, worker/queue delivery and retry/status checks remain pending. This does not complete all of F04 or AT-08.
- Applied MAIN migration `20261120040000_dashboard_announcements.sql`. Admin publishing checks current backend authority under the role-change lock and commits the published notice and audit record together. Direct browser mutations are revoked; RLS limits students to global notices and events where they hold a registration. Draft/missing event associations and invalid links are rejected.
- Added `/announcements` to both apps and navigation, admin authoring and paginated feeds, loading/empty/failure/account gates, and mobile navigation scrolling. Common signed OD uses the ordinary event-associated HTTPS link; reminders can reuse one shared Drive PDF without an OD table, generator or copies.
- `npm run check`: **passed**, including frontend/shared/backend/tooling TypeScript, ESLint, **40 unit tests** and both production builds. `npm run test:e2e`: **8/8 passed** across desktop/mobile, including announcement-route access gates and responsive navigation.
- `npm run test:production`: **4/4 passed**, including direct announcement-route account gates, Google configuration/cancellation handling and development-login boundaries.
- MAIN rollback announcement suite: **34 checks passed**, covering publisher authority, audience isolation before/after registration, direct-write denial, revoked admin denial, audit records, shared OD URL reuse and HTTPS host/port/credential/whitespace/backslash validation.
- `npm run test:live`: **2/2 real browser/API scenarios passed**. Admin published both notice audiences, the intended mobile student saw the event notice and one shared Drive link, and a different student was denied through UI and direct API reads. Invalid-link failure, anonymous/student publishing denial, direct writes, non-admin Control access and signed-out access were exercised. The existing profile/event/registration/admin grant-revoke scenario also passed. Synthetic accounts, notices and events were removed afterward.
- External Drive URL in automated tests is synthetic and is not opened: the tests establish storage, rendering and isolation, not the content/signature or Drive sharing permissions of a real PDF. Email is not sent and no delivery success is simulated. Pagination above one page and physical-device behavior remain release checks.
- Google status correction: MAIN was subsequently observed enabled; automated redirects reached Google's real login screen from both local apps, and the user reported successful login. This is separate from a comprehensive multi-account/university/deployed-origin verification claim.
- QR attendance remains a separate user-managed Antigravity task. No attendance implementation or completion is claimed by this increment.

## Phase 6 - Materials and dashboards

- Add validated labeled resource links and Google Photos album links to event details.
- Build minimal student activity/upcoming events/notices and admin event/registration/attendance summaries.
- Add filtered participant CSV export with appropriate admin authorization.
- Keep external sharing limitations clear; avoid gallery uploads or a standalone OD system.

**Deliverable:** useful event materials and operational dashboards for both roles.

**Exit:** AT-10 passes; counts/export reflect real records and unauthorized exports fail.

### Phase 6 implementation record - 20 November 2026

- Implemented admin gallery/resource create, edit, hide, order and delete, plus student event links with published/event-visibility rules. External media stays in Google Photos/Drive or another admin-approved HTTPS destination; OD links stay in announcements.
- Implemented admin participant preview and complete filtered CSV download. Eight fields exclude contacts and QR credentials; preparation is audited. Explicit 10,000-participant/16-MiB response limits reject oversized exports instead of truncating them.
- Applied MAIN migrations `20261120060000` and `20261120070000`. Rollback SQL suites passed **49 materials checks** and **23 export checks**, including authorization, isolation, audit behavior, more than 1,000 rows and oversized-export rejection.
- In an isolated checkout, fresh `npm ci` and `npm run check` passed: typechecking, lint, **54 unit tests** and both Next.js production builds. Navigation checks passed **8/8**, and production-server checks passed **4/4**, including direct access gates for the new routes.
- Final `npm run test:materials-export` passed **2/2 real browser/API workflows** against linked MAIN: material CRUD/order/hiding, student publication/draft isolation, full 105-participant CSV, filters, Unicode/quoting/formula protection and student/anonymous/revoked-admin denials. Cleanup committed and verified no fixture residue. An earlier run's cleanup failed; its exact fixture namespace was subsequently removed and verified. The harness now preserves credential-free recovery data on failure and retries only connection failures. A subsequent sign-in wait timed out while checking the account; a bounded 30-second auth wait allowed the final full run to pass.
- Attendance work developed concurrently was excluded from this change's validated checkout and commit. Real external file permissions, deployed origins, supported spreadsheet/mobile downloads, concurrent admin revocation and dashboard summaries remain release checks. Email delivery still requires its provider/sender/worker decisions; Phase 6 and Release 1 are not declared complete.

## Phase 7 - Release 1 launch gate

- Verify the full sign-in, publish, register, scan, announce and access-materials workflow on both apps.
- Configure HTTPS, separate Next.js deployments (Vercel configuration included), OAuth redirects and student PWA install/update behavior.
- Run authorization/isolation checks, registration concurrency checks, queue failure checks and supported-mobile camera/download checks.
- Set up independent database exports, protected recovery procedures, quota monitoring and tested restore; record runbooks in `docs/runbooks/`.
- Resolve production retention/consent, domains and branding before rollout.

**Deliverable:** Release 1 deployment with verified recovery and operating instructions.

**Exit:** applicable AT-01-AT-10, AT-15 and main-database portion of AT-16 pass. No unresolved critical access or data-integrity failures. Certificate-specific checks remain pending until Release 2.

## Phase 8 - Certificates

- Resolve template layout, eligibility, PDF retention and email policy before dependent operations.
- Configure Project 2 private storage and immutable versioned template assets; keep permanent issuance/revocation data in Project 1.
- Build admin template preview/selection/issuance and protected student listing/download endpoints.
- Validate Project 1 sessions and owner/admin authority before server-side Project 2 operations.
- Add public UUID/QR verification with minimal data and explicit revoked status.
- Verify regeneration from immutable template/printed values before enabling any approved temporary-PDF cleanup. Thirty days remains a proposal until decided.

**Deliverable:** real certificates that remain verifiable and recoverable after PDF expiration.

**Exit:** AT-11-AT-13 pass, including unauthorized downloads, revocation, cross-project errors and regeneration after deleting temporary PDFs.

## Phase 9 - Private event support

- Resolve private upload versus approved-link-only attachment policy before attachments.
- Build student event question threads and authorized admin replies/closure with retained history and pagination.
- Add owner/admin RLS and input limits; apply private storage and file validation if uploads are selected.
- Keep group chat, typing indicators, presence and read receipts outside scope.

**Deliverable:** private event support with enforced document visibility.

**Exit:** AT-14 passes, including cross-student thread and attachment access attempts.

## Phase 10 - Release 2 launch gate

- Run integrated Release 1 regressions plus certificate and private-query workflows.
- Test mobile certificate download/verification and question flows.
- Test recovery of certificate metadata and immutable templates alongside the primary database.
- Verify queue, cleanup and regeneration failures remain visible and recoverable; finalize runbooks and monitoring.

**Deliverable:** Release 2 deployment with document/support workflows and recovery evidence.

**Exit:** all AT-01-AT-16 pass for the implemented scope, with actual results and remaining limitations recorded.

## Tracking work

Update phase status only when its deliverable and exit criteria have evidence. Record meaningful checks, unresolved decisions and blockers with the corresponding change. Keep product-policy changes in the source-of-truth document and approved decision records; this plan must not silently redefine requirements.
