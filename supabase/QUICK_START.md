# Supabase Quick Start

**Baseline:** `main` @ `9f1a31659d929fcf5bbcdec58429c146021b777d`  
**Reviewed:** 2026-09-08

## Development

From the repository root:

```powershell
pnpm install --frozen-lockfile
supabase start
supabase status
supabase db reset
```

The current `config.toml` uses the ordered SQL files in `supabase/schema/` as schema inputs.

Start the dashboard with:

```powershell
pnpm dev
```

Or target the admin package directly:

```powershell
pnpm --filter @eduzone/admin dev
```

## Database verification

Use the repository's canonical validation SQL where applicable:

```powershell
supabase db execute < supabase/schema/VALIDATION.sql
```

For database changes, inspect both repositories before changing shared objects.

## Authentication smoke check

After signing in to the dashboard, the application uses the server-side dashboard access gate:

```text
check_dashboard_access
```

Do not infer successful authorization from UI visibility alone.

## Important restriction

The development-stage project policy uses `supabase/schema/` as the canonical SQL source. Do not create a competing active migration/patch source.

For schema ownership and file order, see `schema/README.md`.
