# Google sign-in setup

Both apps use MAIN Supabase Auth and accept personal Gmail and university Google accounts. The domain supplied by the user is `stu.srmuviversity.ac.in`; do not restrict Google sign-in to that domain. Follow [decision 005](../decisions/005-student-onboarding-admin-access.md) for complete-onboarding eligibility and admin authorization.

**Current external state:** MAIN's Google provider is enabled. Both local apps reached Google's real sign-in screen without configuration errors, and the user subsequently reported successful Google login on 20 November 2026. This does not independently verify every account, university login, or deployed-origin callback; use the release checks below.

## Provider configuration

1. In the intended Google Cloud project, configure a web OAuth client and consent screen. Select an External audience so personal Gmail accounts can participate. If the consent app remains in testing, add the intended testers; publishing/access requirements must be checked in the Google console before public launch. See [Google's OAuth setup guidance](https://developers.google.com/identity/protocols/oauth2/web-server) and [app audience guidance](https://support.google.com/cloud/answer/15549945).
2. Add this exact **Google authorized redirect URI** for MAIN:

   ```text
   https://amagfwugfinplxhkauig.supabase.co/auth/v1/callback
   ```

3. In MAIN Supabase Authentication provider settings, enable Google using that OAuth client's ID and secret. Enter the secret directly in Supabase, never in chat, Git or `NEXT_PUBLIC_*` variables. See [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-sign-in/auth-google).
4. In Supabase Authentication URL Configuration, choose the actual student production URL as the Site URL when known and add exact app return URLs to Redirect URLs. The app explicitly requests its current origin plus `/account`; Supabase must allow it. See [Supabase redirect configuration](https://supabase.com/docs/guides/auth/redirect-urls).

## App return URLs

For the standard local servers, allow the addresses actually used:

| App | Supabase Redirect URL |
|---|---|
| Student | `http://127.0.0.1:5173/account` |
| Admin | `http://127.0.0.1:5174/account` |
| Student, if opened as localhost | `http://localhost:5173/account` |
| Admin, if opened as localhost | `http://localhost:5174/account` |

Add each chosen student/admin Vercel HTTPS origin with `/account` after those URLs exist. These app return URLs belong in Supabase's allowlist; the Google OAuth client's authorized redirect URI is the Supabase callback above. Avoid authorizing arbitrary preview deployments. No frontend URLs are invented or provisioned by this runbook.

The apps use the existing Supabase browser client, not a new server cookie session. On return to `/account`, the client detects the OAuth session; do not add a competing token-exchange handler or log callback fragments/tokens. A new or incomplete student follows the profile-completion link before registering. Complete details make the student eligible immediately, without manual approval or a university-verification claim.

## Initial admin accounts

The MAIN migration authorizes `officialtechspaceclub@gmail.com` and `harutoxokura15@gmail.com`. Each owner signs in through Google using that exact address. Backend synchronization checks the confirmed provider identity before granting initial access. No password or account is created on the owner's behalf, and an editable metadata email does not qualify. Existing admins can then manage confirmed registered accounts from Control's Admin access screen using an explanation. Revoked authorization cannot be reactivated merely by signing in again.

## Real-provider verification

After configuration, test personal Gmail and the university Google account separately: sign in, return to the correct app, complete all details, register without approval, sign out and restore the same profile on a later login. Test denied consent/provider failure without exposing raw tokens. For each initial admin, confirm Control access, then test an audited grant/revoke for a separate confirmed account, a rejected self-revocation and denied direct student mutations. Confirm both deployed origins and mobile browser behavior. Record evidence in [phase.md](../../phase.md); do not mark real Google login complete from synthetic fixtures.
