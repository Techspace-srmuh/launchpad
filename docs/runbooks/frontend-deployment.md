# Frontend build and deployment

Phase 1 prepares independent static builds. It does not create Cloudflare projects or publish a production service. Authentication, database policies and product workflows are later phases.

## Build locations

Run commands from the repository root using Node.js 22.12+ and npm. Both Cloudflare Pages projects must have access to the whole workspace, including the root lockfile and `packages/` directories.

| Setting | Student project | Admin project |
|---|---|---|
| Repository root | Repository root | Repository root |
| Build command | `npm ci && npm run build:student` | `npm ci && npm run build:admin` |
| Output directory | `apps/student/dist` | `apps/admin/dist` |
| Node baseline | Node 22 | Node 22 |
| Public URL | Decide before launch | Separate URL; decide before launch |

Both outputs include a `_redirects` file so client routes can resolve to `index.html`. Check a direct request to `/setup` after deploying. These static rewrite rules are not authorization controls.

## Environment boundaries

Each build may receive only its Project 1 `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Values prefixed with `VITE_` are public and can appear in the JavaScript bundle. Never supply Project 1/2 service-role keys, email provider credentials or other secrets to a frontend build.

Keep future server secrets in the selected protected backend's environment. Project 2 is not configured or contacted in Phase 1. Do not add a Project 2 browser client.

OAuth callback origins and RLS must be configured and verified in Phase 2 before sign-in or admin operations are enabled. Camera scanning, PWA install/update behavior and recovery verification belong to their later delivery phases.

## Release check

Run the root validation command, build both apps, and verify navigation, missing-configuration messaging and the not-found route. Deploy each output to its own preview first. Public production rollout remains gated by Phase 7.
