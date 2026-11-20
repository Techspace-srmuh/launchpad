# 004 - Next.js migration and Vercel compatibility

**Date:** 20 November 2026.

**Status:** framework migration and Vercel compatibility explicitly requested by the user. The overall v2.0.0 product specification remains draft pending stakeholder approval.

Both applications move from Vite/React Router to Next.js 16 App Router. They remain separate npm workspaces and independently deployable apps using the existing shared UI, validation and Supabase packages. File-based routes preserve home/overview, setup, account, profile and event URLs, including runtime event IDs. Next.js handles navigation, loading, route failures and HTTP 404 responses.

Root layouts supply document metadata and global styles. A client shell keeps the MAIN identity provider mounted across navigation. Existing browser session restoration, RLS reads and protected PostgreSQL RPC mutations remain in place. No privileged credentials, new server actions, database migration or product feature is introduced. Development password access remains gated by `NODE_ENV === "development"`; production and preview builds omit the form.

Public environment variables change from `VITE_MAIN_*` to `NEXT_PUBLIC_MAIN_*`; security validation remains unchanged. Next.js uses explicit public environment references to inline them at build time. Existing local app environment files were renamed in place without exposing or committing values. Hosted environments must set the new names and rebuild.

Each app includes `vercel.json` with the Next.js preset, root workspace installation and its own build. Configure separate Vercel projects with app-specific root directories and access to shared source outside those roots. No projects are linked and no deployment is performed. Node.js 22 remains the local/CI baseline. See the [deployment runbook](../runbooks/frontend-deployment.md).

The former `dist` folders and `_redirects` SPA rewrites are retired. Builds produce `.next` and require a Next.js runtime for dynamic routes. Event IDs are database records created after deployment, so they are not enumerated for static export. Cloudflare requires a compatible runtime adapter; none is installed or validated here. Email workers, Redis provisioning and later release decisions remain unchanged.

Validation evidence belongs in [phase.md](../../phase.md). Local checks do not establish a hosted deployment or production readiness.
