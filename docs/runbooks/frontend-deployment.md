# Frontend build and deployment

Both apps use Next.js App Router and have independent runtime builds. Vercel compatibility is configured; no Vercel project has been created, linked or deployed. Google OAuth and production identity policies remain incomplete, so deployment does not establish launch readiness.

## Build locations

Run commands from the repository root using Node.js 22.12+ on Node 22 and npm. Both apps need the whole workspace, including the root lockfile and shared packages. After building, use `npm run start:student` and `npm run start:admin` to run production locally on ports 5173/5174.

| Setting | Student project | Admin project |
|---|---|---|
| Repository root | Repository root | Repository root |
| Build command | `npm ci && npm run build:student` | `npm ci && npm run build:admin` |
| Output directory | `apps/student/.next` | `apps/admin/.next` |
| Node baseline | Node 22 | Node 22 |
| Public URL | Decide before launch | Separate URL; decide before launch |

These outputs require a Next.js runtime; do not upload them as static folders or add an `index.html` catch-all rewrite. Dynamic event IDs are resolved at request time and unknown routes return HTTP 404. The former static Cloudflare Pages deployment needs a compatible Next.js runtime adapter; none is installed or validated here.

## Vercel project setup

Import the repository twice, one project for each app, following the [Vercel monorepo guide](https://vercel.com/docs/monorepos). Enable shared source outside the app root as described in the [monorepo FAQ](https://vercel.com/docs/monorepos/monorepo-faq).

| Setting | Launchpad | Launchpad Control |
|---|---|---|
| Root Directory | `apps/student` | `apps/admin` |
| Framework Preset | Next.js | Next.js |
| Include source files outside Root Directory | Enabled | Enabled |
| Node.js Version | 22.x | 22.x |
| Install Command (committed in app `vercel.json`) | `cd ../.. && npm ci` | `cd ../.. && npm ci` |
| Build Command (committed in app `vercel.json`) | `npm run build` | `npm run build` |
| Output Directory | Framework default; no override | Framework default; no override |

Installation runs at the repository root using the single lockfile; the build runs in the selected app directory. Next.js transpiles shared packages and traces from the workspace root. Root Directory belongs in Vercel project settings, not `vercel.json`. No custom server, static export or platform-specific API is required.

## Environment boundaries

Set Project 1 `NEXT_PUBLIC_MAIN_SUPABASE_URL`, `NEXT_PUBLIC_MAIN_SUPABASE_PUBLISHABLE_KEY` and optional `NEXT_PUBLIC_MAIN_EVENTS_CACHE_ENABLED` separately for both Vercel projects and the intended Preview/Production environments. Use the same MAIN project for both apps. Rename older `VITE_MAIN_*` entries. `NEXT_PUBLIC_` values are embedded in browser bundles at build time; rebuild after changes. Never put Project 1/2 service-role keys, Redis tokens, email credentials or other secrets in public variables.

Redis configuration belongs to the MAIN Edge Function environment; see the [Redis runbook](redis-events.md) for exact deployment-origin CORS settings before enabling the cache flag. Project 2 is linked for future work but neither frontend contacts it. Do not add a Project 2 browser client.

The password test-account form is gated by `process.env.NODE_ENV === "development"` and available only in `next dev`; Vercel Preview and Production builds omit it. Production builds have no interactive login until Google is connected. MAIN RLS and protected RPCs enforce admin operations even for an existing session. Configure OAuth callback origins and settle university verification/admin provisioning before production access. Camera scanning, PWA install/update behavior and recovery verification belong to later delivery phases.

## Release check

Run `npm run check`, `npm run test:e2e` and `npm run test:production`. The production suite starts the built servers on ports 5193/5194 and verifies direct dynamic routes, reloads, HTTP 404 and the absence of development password login. Test both deployed previews for navigation, direct visits and reloads of setup/account/event detail/edit/participants, denied access and missing configuration. Exercise the real event workflow before release. Public rollout remains gated by Phase 7. Local checks do not establish successful hosted deployment.
