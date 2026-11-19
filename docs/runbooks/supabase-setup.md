# Supabase CLI setup

The CLI was initialized and both projects were linked on 20 November 2026. This setup does not implement authentication, product tables or certificate operations, and does not apply migrations.

Subsequent event development applied MAIN migrations `20261120010000` and `20261120011000` and deployed `events-read`. CERTIFICATES has no product migrations. See the [database runbook](database-events.md) for the implemented schema and tests and the [Redis runbook](redis-events.md) for the optional cache function. Google OAuth and production onboarding remain deferred.

| Working directory | Purpose | Hosted project reference |
|---|---|---|
| `supabase/main` | MAIN: shared identity, operational data and permanent certificate metadata | `amagfwugfinplxhkauig` |
| `supabase/certificates` | CERTIFICATES: Release 2 private template and PDF storage | `eikpwpkcjjlphqxwvqtq` |

Run commands from the repository root. Each working directory contains its own nested `supabase/config.toml`, migration/function/test folders and ignored `.temp` link state. Do not run both links against one working directory: the second would replace the first project's link.

On a new machine, sign in once using an account with access to both projects, then restore the links:

```sh
supabase login
supabase link --project-ref amagfwugfinplxhkauig --workdir supabase/main
supabase link --project-ref eikpwpkcjjlphqxwvqtq --workdir supabase/certificates
```

Configuration files are committed, so `supabase init` is not needed again after cloning. Browser publishable keys are separate from CLI account credentials. Never put a CLI access token or database password in a frontend environment file.

Check migration history without applying schema changes:

```sh
supabase migration list --workdir supabase/main
supabase migration list --workdir supabase/certificates
```

Create future migrations with explicit targets:

```sh
supabase migration new migration_name --workdir supabase/main
```

Keep Release 1 operational migrations in MAIN. Certificate storage work is deferred to Release 2. Review and test migrations and confirm the target project before applying them.

The generated configurations use default local development ports. Running both local Supabase stacks simultaneously requires separate ports first; linking to the hosted projects does not start local stacks or change hosted settings.
