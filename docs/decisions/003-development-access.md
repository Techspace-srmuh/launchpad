# 003 - Build functional events before Google integration

**Date:** 20 November 2026.

**Status:** delivery order authorized by the user. The source-of-truth specification remains draft; this does not approve unresolved production policies.

The user requested simple UI and working core workflows, with external credentials added when needed. MAIN Supabase is available, so event operations use real database records and permissions. Google Console/OAuth integration is deferred.

**Historical policy note:** this record describes the earlier development order. Its verified-profile eligibility gate and unresolved admin-provisioning policy are superseded by [005 — Student onboarding and admin access](005-student-onboarding-admin-access.md). Google activation remains an external setup dependency; the development-only password restriction remains in force.

## Development access

Both Next.js apps expose a real Supabase email/password test-account form only when `process.env.NODE_ENV === "development"` (previously Vite's `import.meta.env.DEV`). Production bundles omit the development form. There are no hard-coded accounts, session tokens, role overrides or browser verification shortcuts. Existing authenticated sessions still require server-side authorization for every protected action.

Owner-provisioned synthetic accounts allow development and end-to-end checks. The automated live browser/concurrency harnesses create isolated fixtures, mark only those test profiles verified, assign admin only to a specific test identity and remove their fixtures afterward. The ordinary profile RPC defaults to unverified and cannot change verification/admin authority.

## Provisional schema choices

Roll numbers are normalized by removing whitespace and uppercasing, are unique and immutable through the student profile RPC. Names and departments are bounded text, and academic year currently accepts integers 1–8. These are implementation constraints for development, not an approved institutional identity/edit policy. Revisit them before production onboarding.

Student registration requires a verified profile. The production mechanism for establishing university identity, the authorized operator/process for granting admin access, and registration cancellation policy remain unresolved. No public rollout or Phase 2 completion is claimed until those decisions, Google login and the real onboarding acceptance criteria are satisfied.
