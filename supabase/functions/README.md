# Downloads Edge Functions

This folder contains all Supabase Edge Functions for the project (moved from `supabase/downloads/functions/` — the downloads-specific functions now live alongside the rest).

Each function lives in its own subfolder with an `index.ts` entrypoint; several also have a dedicated README describing inputs, outputs, and required behavior.

Functions:

- `send-push-notification` — service-role-only FCM HTTP v1 sender for
  `notification_push` jobs. Required secrets: `FCM_PROJECT_ID`,
  `FCM_CLIENT_EMAIL`, `FCM_PRIVATE_KEY`.

The canonical database scheduler invokes this function every minute through
Vault secrets named `eduzone_push_worker_url`, `eduzone_push_worker_jwt`, and
`eduzone_push_worker_auth_token`. The JWT satisfies the Edge Function gateway
check, while the matching token is sent in `X-Push-Worker-Token` and checked by
the function. The Supabase service-role key remains an internal Edge Function
secret and is not used as the worker bearer token.
Deploy the function before enabling
those secrets; the scheduler stays inactive until Vault, pg_net, and pg_cron
are available.
`create-user` — admin-only: create an auth user + matching `public.users` profile row

- `get-lesson-content` — resolve a lesson's signed video/caption URLs after a server-side access check
- `bulk-action` — admin-only: enqueue a bulk operation (see `bulk-worker`)
- `bulk-worker` — background worker that processes queued bulk operations
- `bulk-export` / `export-report` — admin-only: generate data exports/reports

See each function subfolder for contract details, and `supabase/deploy_functions.ps1` to deploy all of them.
