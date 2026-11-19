# 001 - Phase 1 workspace foundations

**Status:** implementation decision for the authorized Phase 1 scope. This does not approve the draft product specification or resolve onboarding/production policies.

## Decisions

- Use npm workspaces and a single root lockfile. Both applications consume shared TypeScript source through workspace packages; Vite bundles it into each independent build.
- Use Node.js 22 (at least 22.12) for the local/CI baseline, with separate student and admin dev servers on ports 5173 and 5174. No machine-wide Node configuration is required by the repository.
- Keep root tooling shared, with app-specific Vite configuration and separate build output directories.
- Use React Router for the foundation routes: home, setup guidance and a not-found page. Authentication and role enforcement are Phase 2 work. The admin shell itself provides no privileged access.
- Use Tailwind CSS 4 and a shared shadcn-style Button primitive. Add further primitives when a real feature needs them.
- Accept the Project 1 URL and new Supabase publishable key in each app's local environment file. Do not accept server secret keys in browser configuration. Legacy JWT anon keys are not used by this foundation.
- Show an explicit configuration notice when browser configuration is absent or invalid. Starting the shell does not contact Supabase, authenticate a user, or create records.

## Open decisions preserved

University verification, admin provisioning, cancellation policy, email provider/worker/sender, query attachments, certificate layout/retention, domains/branding and institutional consent/retention remain as listed in the source-of-truth specification. Resolve them before shipping dependent workflows.
