# EduZone — Monitoring and Logging Notes

**Reviewed:** 2026-09-24
**Status:** source-level logging and Sentry integration are present; no external monitoring deployment or alert coverage is proven by this repository.

## Implemented in the repository

- `apps/admin/src/infrastructure/observability/` contains the application observability services.
- `apps/admin/sentry.server.config.ts` and `apps/admin/sentry.edge.config.ts` configure server/Edge Sentry entrypoints when DSNs are supplied.
- The application has audit/activity data paths and database-side validation SQL.
- The API cron route and database job functions exist in source; their schedules and remote execution require live verification.

## Not established by source inspection

The repository does not prove that a Sentry project, Datadog/Prometheus backend, PagerDuty account, dashboards, alerts, retention policy, or on-call process is configured. References to those systems are operational options, not current integrations.

Likewise, structured logs in local code do not prove that production logs are JSON, retained, scrubbed, searchable, or alerted on. Verify those properties in the target environment.

## Verification checklist

Before a release, obtain evidence for:

1. Sentry DSN configuration and a test event with the intended environment.
2. PII/secret scrubbing in client, server, Edge Function, and database logs.
3. Cron/job execution and failure visibility.
4. Audit-chain verification and retention behavior.
5. Alert ownership, thresholds, escalation, and rollback/recovery drills.

Do not use this document as a production readiness certificate. Current release evidence belongs in [`PRODUCTION_READINESS_PLAN.md`](PRODUCTION_READINESS_PLAN.md).
