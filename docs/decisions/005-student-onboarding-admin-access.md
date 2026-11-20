# 005 - Student onboarding and admin access

**Date:** 20 November 2026.

**Status:** these identity and access decisions were explicitly approved by the user. The complete v2.0.0 specification remains draft pending stakeholder approval. This decision supersedes the earlier verified-profile registration gate and unresolved provisioning proposals, without approving unrelated release policies.

## Student workflow

Students may use a personal Gmail or university Google account. The university domain is exactly `stu.srmuviversity.ac.in`, as confirmed by the user; the address format is `registration_number@stu.srmuviversity.ac.in`, with one `@`. It is an informational example, not a domain restriction.

After signing in, the student supplies full name, registration/roll number, course, branch, department, section, academic year and mobile number. Completing these details makes the student immediately eligible to register for events. There is no manual approval, membership approval or institutional verification gate. A Google account and self-declared student details do not establish enrollment; the application must not label completion as university-verified identity.

MAIN stores the details in the existing private `profiles` record. Roll claims stay normalized, unique and immutable through the student RPC; other permitted fields can be edited. The new columns remain null for legacy profiles until students fill them in. No fabricated defaults are inserted. Mobile numbers remain private under profile RLS and are not an OTP authentication factor. Existing `verification_status` metadata is retained but no longer decides registration eligibility. The backend checks complete details alongside atomic event status/window/duplicate/capacity checks.

## Admin workflow

The initial authorized email addresses are:

- `officialtechspaceclub@gmail.com`
- `harutoxokura15@gmail.com`

Protected backend email authorizations are seeded for these addresses. Initial automatic access requires a matching confirmed Google identity; editable profile/user metadata and a browser-supplied email cannot promote an account. No real-user Auth account, password or invitation is created by the migration. Signing in synchronizes the authorized identity into the protected admin record.

An existing admin can open Control's Admin access screen and grant or revoke access by exact email with a recorded explanation. Grants require a confirmed registered Auth account. Pending initial email authorizations may be revoked before the first login. Backend RPCs enforce authority, normalize/validate input, serialize role changes, recheck the actor inside the lock, reject self-revocation and audit actor/time/reason. Revoked email authorization cannot restore itself on another sign-in. There remain only two roles: student and admin.

## Scope, data and acceptance

The student task is to sign in and complete details once, then register without waiting for approval. The admin task is to authorize a known account and revoke it when needed. MAIN gains nullable profile fields and a protected email-authorization table; no new external service, frontend privileged credential or role hierarchy is introduced. The onboarding/admin migration is `20261120020000_onboarding_admin_access.sql`, applied to linked MAIN. See [phase.md](../../phase.md) for verification evidence.

AT-01 must cover both accepted Google account types, complete onboarding, returning profiles, immediate eligibility, incomplete-profile denial and unique roll claims. AT-02 must cover confirmed initial Google bootstrap, metadata spoof denial, denied student/anonymous access, audited grants/revocations, self-revocation denial, concurrent stale-authority denial and immediate revoked-user failure. SQL and synthetic-account tests do not establish a completed real Google login.

## External setup and limits

Both apps keep the existing Supabase browser-session model. Google OAuth returns to the same app's `/account`; the Supabase client detects the session. MAIN's Google provider was observed disabled on 20 November 2026. Activation requires Google OAuth configuration and exact app return URLs in Supabase; see the [Google setup runbook](../runbooks/google-auth.md). Google secrets belong in Supabase provider settings, never a frontend environment variable or chat message. Development password login remains development-only. No OAuth activation, hosted deployment or production readiness is claimed by this decision.
