# Repository architecture

This workspace implements the Phase 1 foundation structure for the [source-of-truth specification](../TechSpace_Launchpad_SOURCE_OF_TRUTH.md): two React/Vite app shells, shared source packages and development checks. Installation/build/browser validation remains pending as recorded in [phase.md](../phase.md). It does not contain product workflows, database migrations or deployed infrastructure. Future directories contain `.gitkeep` so Git retains them.

## Folder responsibilities

| Path | Responsibility |
|---|---|
| `apps/student/` | Launchpad student web app; independent Vite build and deployment |
| `apps/admin/` | Launchpad Control admin web app; independent Vite build and deployment |
| `apps/*/src/app/` | App startup, providers, routing and layouts |
| `apps/*/src/features/` | Event-centered features, added as each delivery phase begins |
| `apps/*/src/components/` | Components specific to that application |
| `apps/*/src/lib/` | App-specific integration/configuration helpers; browser-safe values only |
| `apps/*/public/` | Public static assets, including PWA assets when implemented |
| `packages/ui/src/` | Shared UI primitives; no admin permissions or server credentials |
| `packages/shared/src/` | Shared types, validation and pure helpers; no privileged runtime logic |
| `packages/supabase/src/` | Browser-safe Project 1 client factory and generated database types once configured |
| `supabase/main/migrations/` | Project 1 operational schema, constraints, RLS and protected RPC migrations |
| `supabase/main/functions/` | Protected backend operations and queue handlers as implemented |
| `supabase/main/functions/_shared/` | Backend-only authentication, authorization and integration helpers |
| `supabase/main/tests/` | Database policy, isolation, concurrency and RPC verification |
| `supabase/certificates/migrations/` | Project 2 private storage policies and any necessary auxiliary schema, Release 2 |
| `supabase/certificates/tests/` | Project 2 storage isolation and certificate asset checks, Release 2 |
| `tests/e2e/` | Real student/admin workflow tests across the two apps |
| `docs/decisions/` | Recorded implementation decisions and unresolved proposals |
| `docs/runbooks/` | Deployment, email operations, backup/restore and certificate recovery instructions |
| `phase.md` | Ordered delivery plan with dependencies and completion criteria |

Keep feature modules inside their app until real reuse justifies a shared package. Tests that exercise one feature can live beside its implementation. Do not create placeholders for every future screen or service.

## Boundaries

Both apps authenticate against Project 1. Shared browser code never contains service-role credentials. Privileged certificate endpoints belong to the protected backend under `supabase/main/functions/`, validate the Project 1 session, and access Project 2 using server-held credentials. Project 2 does not duplicate student/event records.

The two Supabase directories represent separate projects. Their future CLI configuration, migrations and deployment commands must be isolated so a command cannot accidentally target the wrong project. They are not configured yet.

The email worker and scheduler remain undecided. Add their executable entry points only after choosing the runtime; queue persistence belongs to Project 1. Static hosting alone is not a scheduler.

## Workspace tooling

Use npm workspaces and the root lockfile. Each app has a Vite configuration and independently runs TypeScript checking before its build. Shared packages export TypeScript source for Vite to bundle and have separate typecheck scripts. Root tooling provides ESLint, Vitest for validation logic, Playwright for desktop/mobile navigation checks, and CI running both builds. See the README for commands and the [frontend deployment runbook](runbooks/frontend-deployment.md) for build roots and outputs.

The shared Supabase package separates pure browser-configuration validation from client creation. App shells only validate settings; they do not create a client, send requests or imply authentication. The shared UI package contains the Button primitive, class-name helper and theme tokens; add components when a feature actually needs them.
