# Supabase Quick Start

**Reviewed:** 2026-09-24

## Local development

From the repository root:

```powershell
pnpm install --frozen-lockfile
supabase start
supabase status
pnpm dev
```

The local project uses `supabase/config.toml`. The repository's ordered schema files are deployed by the checked-in deployment tooling; a plain `supabase db reset` should not be treated as proof that the application schema has been applied because `supabase/migrations/` contains no SQL migration chain.

For a disposable local database, review the script before running it:

```powershell
supabase\deploy.ps1 local
```

Do not run the remote deployment helpers or apply QA/demo data to a shared environment without an approved procedure. `12_seed_qa_demo.sql` contains disposable test data and is opt-in only.

## Verification

The canonical validation SQL is [`schema/VALIDATION.sql`](schema/VALIDATION.sql). Use the database client and connection selected by the local deployment procedure; do not paste production credentials into shell history or documentation.

After signing in, the dashboard uses the `check_dashboard_access` RPC path. UI visibility alone is not authorization evidence.

For schema ownership and order, see [`schema/README.md`](schema/README.md).
