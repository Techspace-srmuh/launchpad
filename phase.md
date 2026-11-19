# Launchpad delivery phases

This workflow implements [the source-of-truth specification](TechSpace_Launchpad_SOURCE_OF_TRUTH.md), v2.0.0, which remains a draft pending stakeholder approval. The phases organize delivery; they do not approve open product decisions or expand scope. See [folder architecture](docs/architecture.md) for implementation locations.

**Current state:** documentation and directory skeleton exist. No runnable apps, provider configuration, migrations, or product features have been implemented. Every delivery phase below is pending.

## Phase overview

| Phase | Outcome | Depends on | Release | Status |
|---|---|---|---|---|
| 0 | Confirm scope and record decisions needed to begin | Stakeholder decisions | Foundation | Pending |
| 1 | Runnable workspace and two app shells | 0 for affected decisions | Foundation | Pending |
| 2 | Shared identity, student profiles and protected admin access | 1 | 1 | Pending |
| 3 | Event publishing and atomic registration | 2 | 1 | Pending |
| 4 | Secure event QR attendance | 3 | 1 | Pending |
| 5 | Targeted announcements, OD links and queued email | 3; email decisions | 1 | Pending |
| 6 | Event materials and usable dashboards | 3-5 | 1 | Pending |
| 7 | Verified mobile workflows and operational recovery | 2-6 | 1 launch gate | Pending |
| 8 | Certificate templates, issuance and private downloads | 7; certificate decisions | 2 | Pending |
| 9 | Private event questions and replies | 7; attachment decisions | 2 | Pending |
| 10 | Release 2 verification and operations | 8-9 | 2 launch gate | Pending |

Phase 5 can proceed alongside Phase 4 after registration is stable. Phases 8 and 9 can proceed independently after Release 1. Run relevant security checks within each phase; launch gates verify the integrated result.

## Phase 0 - Scope and decisions

- Review the draft with stakeholders and record approval or revisions.
- Confirm student university-verification and admin-provisioning policies before implementing onboarding.
- Record registration cancellation policy and establish who owns production operations.
- Track email provider, verified sender, worker/scheduler and documented quotas as decisions required before email delivery.
- Track university consent/retention and authorized domains/branding before public rollout. Defer certificate and attachment decisions until their dependent phases.

**Deliverable:** decision records in `docs/decisions/`, distinguishing approved decisions from proposals and listing remaining owners/dependencies.

**Exit:** scope is understood and decisions required for the next phase are resolved. Independent directory/setup work can proceed while policy decisions remain open.

## Phase 1 - Workspace and app foundations

- Choose and document a package manager/workspace layout; create actual React/TypeScript/Vite app shells under `apps/student` and `apps/admin`.
- Configure Tailwind/shadcn UI and shared packages only where needed.
- Establish separate app builds, routing/layouts, browser-safe environment handling and backend secret boundaries.
- Add lint/type/build/test scripts and CI checks using the tooling actually installed.
- Document local setup, environment variable names without values, and separate deployment roots.

**Deliverable:** two independently buildable app shells and documented commands.

**Exit:** fresh setup and both builds work with clear missing-configuration errors. No mock workflow is presented as production functionality.

## Phase 2 - Identity and authorization

- Configure Project 1 Google OAuth for both app origins and selected student-verification policy.
- Add migrations for profiles, protected admin records, audit foundation and required RLS.
- Implement student onboarding, unique normalized roll numbers, returning-user profiles and permitted edits.
- Implement admin provisioning and backend-enforced access checks, plus unauthorized/session-expired states.

**Deliverable:** shared sign-in and distinct student/admin access using real records.

**Exit:** AT-01 and AT-02 pass, including direct API attempts and student-to-student isolation.

## Phase 3 - Events and registration

- Build admin event creation/edit/publish/close/complete/cancel flows and student discovery/detail/My Events.
- Add event/registration schema, constraints, policies and protected registration operations.
- Enforce publication, opening/closing windows, eligibility, uniqueness and optional capacity atomically.
- Show accurate confirmation, closed/full/cancelled states and participant views.

**Deliverable:** a student can discover and register for a real published event.

**Exit:** AT-03 and AT-04 pass, including simultaneous duplicate and final-seat requests.

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

## Phase 6 - Materials and dashboards

- Add validated labeled resource links and Google Photos album links to event details.
- Build minimal student activity/upcoming events/notices and admin event/registration/attendance summaries.
- Add filtered participant CSV export with appropriate admin authorization.
- Keep external sharing limitations clear; avoid gallery uploads or a standalone OD system.

**Deliverable:** useful event materials and operational dashboards for both roles.

**Exit:** AT-10 passes; counts/export reflect real records and unauthorized exports fail.

## Phase 7 - Release 1 launch gate

- Verify the full sign-in, publish, register, scan, announce and access-materials workflow on both apps.
- Configure HTTPS, separate Cloudflare deployments, OAuth redirects and student PWA install/update behavior.
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
