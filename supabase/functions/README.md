# Supabase Edge Functions

Each subdirectory in this folder is an Edge Function with an `index.ts` entrypoint. The files are implementation entrypoints only; deployment, secrets, external service availability, and end-to-end behavior require separate verification.

## Functions present in this repository

- `bulk-action` — validates and enqueues bulk operations.
- `bulk-export` — handles bulk export work.
- `bulk-worker` — processes queued bulk jobs.
- `create-user` — provisions an auth user and profile through an admin-only path.
- `export-report` — handles report exports.
- `get-lesson-content` — resolves lesson content after an access check.
- `log-download-attempt` — records download analytics; see its local README.
- `send-push-notification` — sends push notifications when its configured provider and secrets are available.
- `validate-course-access` — validates course or lesson access; see its local README.
- `video-info` — resolves video information through the provider used by its implementation; see its local README.

The repository also contains [`supabase/deploy_functions.ps1`](../deploy_functions.ps1). Review its target project and environment before deploying. No claim is made here that any function is currently deployed.
