# Repository architecture

This workspace implements two Next.js App Router apps, shared identity helpers, development event workflows and MAIN database migrations under the [draft source-of-truth specification](../TechSpace_Launchpad_SOURCE_OF_TRUTH.md). MAIN migrations are applied and the authenticated `events-read` Edge Function is deployed; the frontend websites and Redis provider are not deployed/provisioned. Each app has Vercel configuration. Google login and production identity policies remain deferred. See [phase.md](../phase.md) for validation and limits.

## Folder responsibilities

| Path | Responsibility |
|---|---|
| `apps/student/` | Launchpad student web app; independent Next.js build and deployment |
| `apps/admin/` | Launchpad Control admin web app; independent Next.js build and deployment |
| `apps/*/src/app/` | File-based pages, dynamic event routes, root layout and loading/error/not-found boundaries |
| `apps/*/src/features/` | Event-centered features, added as each delivery phase begins |
| `apps/*/src/components/` | App-specific components, including client shell and identity provider boundary |
| `apps/*/src/lib/` | App-specific integration/configuration helpers; browser-safe values only |
| `apps/*/public/` | Public static assets, including PWA assets when implemented |
| `packages/ui/src/` | Shared UI primitives; no admin permissions or server credentials |
| `packages/shared/src/` | Shared types, validation and pure helpers; no privileged runtime logic |
| `packages/supabase/src/` | Browser-safe MAIN client, React identity provider/hooks, workflow record types and optional event-cache client |
| `supabase/main/supabase/migrations/` | Project 1 operational schema, constraints, RLS and protected RPC migrations |
| `supabase/main/supabase/functions/` | Protected backend operations and queue handlers as implemented |
| `supabase/main/supabase/functions/_shared/` | Backend-only authentication, authorization and integration helpers |
| `supabase/main/supabase/tests/` | Database policy, isolation, concurrency and RPC verification |
| `supabase/certificates/supabase/migrations/` | Project 2 private storage policies and any necessary auxiliary schema, Release 2 |
| `supabase/certificates/supabase/tests/` | Project 2 storage isolation and certificate asset checks, Release 2 |
| `tests/e2e/` | Real student/admin workflow tests across the two apps |
| `docs/decisions/` | Recorded implementation decisions and unresolved proposals |
| `docs/runbooks/` | Deployment, email operations, backup/restore and certificate recovery instructions |
| `phase.md` | Ordered delivery plan with dependencies and completion criteria |

Keep feature modules inside their app until real reuse justifies a shared package. Tests that exercise one feature can live beside its implementation. Do not create placeholders for every future screen or service.

## Boundaries

Both apps authenticate against Project 1. Shared browser code never contains service-role credentials. Privileged certificate endpoints belong to the protected backend under `supabase/main/supabase/functions/`, validate the Project 1 session, and access Project 2 using server-held credentials. Project 2 does not duplicate student/event records.

The two Supabase directories are independent CLI working directories, each containing the CLI-required nested `supabase/` folder with its own configuration, migrations and ignored link state. Always pass `--workdir supabase/main` or `--workdir supabase/certificates` from the repository root. Both projects were initialized and linked on 20 November 2026. MAIN now has identity/event migrations; CERTIFICATES remains reserved for Release 2. See the [Supabase setup runbook](runbooks/supabase-setup.md) and [database runbook](runbooks/database-events.md).

`save_profile`, `admin_save_event` and `register_for_event` are the browser mutation contracts. Direct browser writes are revoked; tables retain RLS for reads. Event row locking serializes registration with capacity/status edits. Protected admin records and verification status cannot be edited by a student. Audit triggers record event and authority changes. University verification and production admin provisioning still require approved policies.

The optional `events-read` Edge Function validates MAIN sessions with Auth and reads using the caller's RLS permissions. Administrators bypass Redis. Students may receive disposable event content cached by project and fresh visible event versions; every request still checks authorization and database visibility. Redis errors fall back to authorized full reads, while Auth/database errors never authorize a cache response. This reduces full-payload reads on hits, not every database query. Details and server-only variables are in the [Redis runbook](runbooks/redis-events.md). Redis does not decide capacity, registration, admin authority or certificate access.

The email worker and scheduler remain undecided. Add their executable entry points only after choosing the runtime; queue persistence belongs to Project 1. Static hosting alone is not a scheduler.

## Workspace tooling

Use npm workspaces and the root lockfile. Each app has Next.js and Tailwind PostCSS configuration. Typechecking generates Next.js route types before checking TypeScript; builds also check application types. Shared packages export TypeScript source through `transpilePackages` and have separate typecheck scripts. Workspace roots are explicit for Turbopack and output tracing. Root tooling provides ESLint, Vitest, Playwright and CI running both builds. See the README and [deployment runbook](runbooks/frontend-deployment.md).

Root layouts provide metadata and global styles. A client shell keeps the identity provider mounted across Next.js navigation. Features use `next/link` and `next/navigation`; dynamic event routes resolve IDs at request time. Vercel uses separate projects with output in `.next` and no SPA catch-all rewrite. Supabase continues to enforce authorization; the migration adds no privileged Next.js endpoints or second session system. See [decision 004](decisions/004-nextjs-migration.md).

The shared Supabase package separates pure browser-configuration validation from client creation. Configured apps create a client, restore sessions and fetch account permissions; event pages use real MAIN records. Missing configuration leaves the shell/setup pages usable. Development-only account forms use real Supabase password login with explicitly provisioned test accounts. Production Google login remains unimplemented. The shared UI package contains the Button primitive, class-name helper and theme tokens; add components when a feature actually needs them.
