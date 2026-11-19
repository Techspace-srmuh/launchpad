# Frontend build and deployment

The two apps have independent static builds. This work has not created Cloudflare projects or published either frontend. Development event workflows use MAIN migrations and real sessions; Google OAuth and production identity/provisioning policies remain incomplete, so publishing a build does not make the product launch-ready.

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

Each build may receive its Project 1 `VITE_MAIN_SUPABASE_URL`, `VITE_MAIN_SUPABASE_PUBLISHABLE_KEY` and optional `VITE_MAIN_EVENTS_CACHE_ENABLED` flag. Values prefixed with `VITE_` are public and can appear in the JavaScript bundle. Never supply Project 1/2 service-role keys, Redis REST tokens, email provider credentials or other secrets to a frontend build.

Redis configuration belongs to the MAIN Edge Function environment; see the [Redis runbook](redis-events.md) for exact deployment-origin CORS settings before enabling the cache flag. Project 2 is linked for future work but neither frontend contacts it. Do not add a Project 2 browser client.

The password test-account form is compiled only in Vite development mode. Production builds currently have no interactive login until Google is connected. MAIN RLS and protected RPCs enforce admin operations even for an existing session. Configure OAuth callback origins and settle university verification/admin provisioning before production access. Camera scanning, PWA install/update behavior and recovery verification belong to later delivery phases.

## Release check

Run the root validation command, build both apps, and verify navigation, missing-configuration messaging and the not-found route. Deploy each output to its own preview first. Public production rollout remains gated by Phase 7.
