# EduZone — Monitoring & Logging Guide

> **Version:** 1.0 | **Date:** 2026-03-11 | **Status:** APPROVED  
> **Stack:** Sentry · Datadog · Supabase Logs · Structured JSON Logging

---

## 1. Observability Strategy

EduZone follows the **Three Pillars of Observability**:

| Pillar | Tool (Dev) | Tool (Production) | Purpose |
|--------|-----------|------------------|---------|
| **Logs** | ConsoleLogger | Datadog Log Management | Structured event records |
| **Metrics** | ConsoleMetrics | Datadog Metrics / Prometheus | Counters, timers, gauges |
| **Traces** | NoopTracer | OpenTelemetry → Datadog APM | Distributed request tracing |

All three are wired through **port interfaces** (ILogger, IMetrics, ITracer) — production implementations are injected via the DI container with zero changes to business logic.

---

## 2. Logging

### 2.1 ILogger Interface

```typescript
// domain/logger.ts
export interface ILogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: unknown, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
}
```

### 2.2 Log Format (Structured JSON)

Every log line is a JSON object. No free-form strings in production.

```json
{
  "level": "info",
  "message": "User suspended",
  "timestamp": "2026-03-11T14:32:01.123Z",
  "service": "admin-dashboard",
  "environment": "production",
  "traceId": "550e8400-e29b-41d4-a716-446655440000",
  "spanId": "7a3f9c2e-1b4d-4e8f-9a2c-3d5e6f7a8b9c",
  "tenantId": "tenant-abc-123",
  "actorId": "user-xyz-456",
  "userId": "user-def-789",
  "reason": "Violation of terms of service"
}
```

### 2.3 Required Fields in Every Log

| Field | Type | Description |
|-------|------|-------------|
| `level` | string | `info` / `warn` / `error` / `debug` |
| `message` | string | Human-readable description |
| `timestamp` | ISO 8601 | Auto-injected by logger |
| `traceId` | UUID | Correlation ID from X-Request-ID header |
| `service` | string | Always `"admin-dashboard"` |

### 2.4 What NOT to Log

**Never log PII or secrets:**
- Passwords (any form)
- Access tokens / refresh tokens
- Credit card numbers
- Full email addresses in error logs (use partial: `a***@example.com`)
- User's private messages or content

### 2.5 Log Levels Usage Guide

| Level | When to Use | Example |
|-------|------------|---------|
| `debug` | Development tracing only; disabled in production | `"Entering suspendUser use case"` |
| `info` | Successful business events | `"User suspended"`, `"Course published"` |
| `warn` | Recoverable issues / unusual but non-critical | `"Retry attempt 2/3 for RPC call"` |
| `error` | Failures that need attention | `"RPC admin_list_users failed"` |

### 2.6 Logger Implementations

**Development (ConsoleLogger):**
```typescript
// infrastructure/logger/ConsoleLogger.ts
export class ConsoleLogger implements ILogger {
  info(message: string, context?: Record<string, unknown>) {
    console.log(JSON.stringify({ level: 'info', message, ...context, timestamp: new Date().toISOString() }));
  }
  // ...
}
```

**Production (DatadogLogger):**
```typescript
// infrastructure/logger/DatadogLogger.ts
export class DatadogLogger implements ILogger {
  info(message: string, context?: Record<string, unknown>) {
    datadogLogs.logger.info(message, { ...context, service: 'admin-dashboard' });
  }
}
```

---

## 3. Metrics

### 3.1 IMetrics Interface

```typescript
// domain/observability/IMetrics.ts
export interface IMetrics {
  increment(name: string, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  histogram(name: string, value: number, tags?: Record<string, string>): void;
  timing(name: string, durationMs: number, tags?: Record<string, string>): void;
}
```

### 3.2 Standard Metrics Emitted

All use cases automatically emit the following via the RPC client wrapper:

| Metric Name | Type | Tags | Description |
|-------------|------|------|-------------|
| `rpc.{fnName}.duration` | timing | `tenant_id`, `env` | RPC call duration in ms |
| `rpc.{fnName}.success` | counter | `tenant_id` | Successful RPC calls |
| `rpc.{fnName}.error` | counter | `tenant_id`, `error_code` | Failed RPC calls |
| `user.suspended` | counter | `tenant_id` | Users suspended |
| `user.banned` | counter | `tenant_id` | Users banned |
| `course.published` | counter | `tenant_id` | Courses published |
| `bulk_action.started` | counter | `action_type`, `tenant_id` | Bulk operations started |
| `bulk_action.completed` | counter | `action_type`, `tenant_id` | Bulk operations completed |
| `job_queue.depth` | gauge | `job_name` | Current job queue depth |
| `rate_limit.exceeded` | counter | `user_id`, `endpoint` | Rate limit hits |

### 3.3 Custom Business Metrics (Feature Teams)

When adding a new feature, emit relevant counters in the use case:

```typescript
// In any use case
metrics.increment('feature_flag.toggled', { flag_name: flagName, tenant_id: tenantId });
metrics.timing('analytics.view_refresh.duration', elapsed, { view_name: 'mv_user_stats' });
```

---

## 4. Distributed Tracing

### 4.1 ITracer Interface

```typescript
// domain/observability/ITracer.ts
export interface ISpan {
  readonly traceId: string;
  readonly spanId: string;
  end(status: 'ok' | 'error', error?: unknown): void;
  setTag(key: string, value: string | number | boolean): void;
}

export interface ITracer {
  startSpan(name: string, parentSpanId?: string): ISpan;
}
```

### 4.2 Correlation ID Flow

Every HTTP request gets a `X-Request-ID` UUID, which threads through the entire call chain:

```
HTTP Request → Next.js middleware generates X-Request-ID
    ↓
Use case: tracer.startSpan('suspendUser') → span.traceId = X-Request-ID
    ↓
All RPC calls tagged with traceId (via RpcClient wrapper)
    ↓
DomainEvent.correlationId = span.traceId
    ↓
Event handlers inherit traceId → job queue entries tagged
    ↓
All log lines include traceId → full trace searchable in Datadog
    ↓
Sentry errors include traceId → correlate error to exact request chain
```

### 4.3 Production Tracer (OpenTelemetry)

```typescript
// infrastructure/observability/OtelTracer.ts
import { trace, context } from '@opentelemetry/api';

export class OtelTracer implements ITracer {
  startSpan(name: string, parentSpanId?: string): ISpan {
    const tracer = trace.getTracer('admin-dashboard');
    const span = tracer.startSpan(name);
    return new OtelSpan(span);
  }
}
```

---

## 5. Error Tracking (Sentry)

### 5.1 Sentry Configuration

```typescript
// apps/admin/src/instrumentation.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV,
  tracesSampleRate: 0.1,     // 10% of requests traced
  profilesSampleRate: 0.05,  // 5% profiled
  beforeSend(event) {
    // Strip PII before sending to Sentry
    return scrubPii(event);
  },
});
```

### 5.2 Error Capture in Use Cases

```typescript
// All errors automatically captured in use cases via:
span.end('error', err);
// which calls: Sentry.captureException(err, { extra: { traceId: span.traceId } })
```

### 5.3 Alert Rules in Sentry

| Alert | Threshold | Action |
|-------|-----------|--------|
| New error type detected | Any | Notify #alerts-engineering Slack |
| Error rate > 1% | 5 min sustained | PagerDuty P2 |
| Error rate > 5% | 2 min sustained | PagerDuty P1 |
| Auth error spike | > 50 errors/min | PagerDuty P1 (potential attack) |

---

## 6. Dashboards & Alerts

### 6.1 Datadog Dashboards

**Dashboard: EduZone Admin — Overview**
- Request rate (total RPC calls/min)
- Error rate (%)
- P50/P95/P99 response times
- Active users (by tenant)
- Job queue depth

**Dashboard: EduZone Admin — Business Metrics**
- Users suspended/banned per hour
- Courses published per day
- Bulk operations in-flight
- Feature flag toggle rate
- Analytics view freshness

**Dashboard: EduZone Admin — Infrastructure**
- Supabase connection pool utilisation
- DB query time (P99)
- Edge Function cold start rate
- Rate limit hit rate
- Materialised view refresh status

### 6.2 Alert Thresholds

| Metric | Warning | Critical | Action |
|--------|---------|---------|--------|
| RPC P99 response time | > 1s | > 2s | Investigate + add indexes |
| Error rate | > 0.5% | > 2% | PagerDuty alert |
| Job queue depth | > 500 | > 2000 | Scale Edge concurrency |
| DB connection pool | > 70% | > 90% | Upgrade Supabase plan |
| Rate limit hit rate | > 100/min | > 500/min | Investigate abuse |
| Audit hash mismatch | Any | Any | P0 incident — potential tampering |
| View refresh failure | 1 failure | 3 consecutive | Alert on-call |

---

## 7. Supabase-Specific Monitoring

### 7.1 Key Supabase Metrics to Watch

| Metric | Location | Threshold |
|--------|----------|-----------|
| DB CPU | Supabase Dashboard → Database | < 80% |
| Connection pool usage | Supabase Dashboard | < 80% |
| Storage usage | Supabase Dashboard | < 80% |
| Edge Function errors | Supabase Dashboard → Functions | < 1% |
| Realtime connection count | Supabase Dashboard | < 8,000 |

### 7.2 Supabase Log Queries

Useful log queries in Supabase Studio → Logs:

```sql
-- Find all errors in last hour
SELECT timestamp, event_message, metadata
FROM postgres_logs
WHERE level = 'ERROR'
AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC;

-- Find slow RPC calls (> 500ms)
SELECT timestamp, event_message, metadata->>'execution_time' AS duration
FROM postgres_logs
WHERE metadata->>'execution_time'::float > 500
ORDER BY timestamp DESC;

-- Rate limit violations
SELECT timestamp, metadata->>'user_id', COUNT(*)
FROM edge_logs
WHERE event_message LIKE '%RATE_LIMITED%'
GROUP BY 1, 2
ORDER BY 1 DESC;
```

---

## 8. Audit Log Monitoring

### 8.1 Hash Chain Verification

Automated verification runs every 6 hours via a Supabase cron job:

```sql
-- Verify audit chain integrity
SELECT verify_audit_hash_chain(); 
-- Returns: { valid: true, last_verified_id: uuid, checked_count: integer }
-- On failure: raises exception → triggers PagerDuty P0 alert
```

### 8.2 Audit Log Retention

| Environment | Retention |
|-------------|-----------|
| Development | 30 days |
| Staging | 90 days |
| Production | 7 years (GDPR + compliance) |

### 8.3 Activity Log Dashboard

Available in the admin UI under **System → Audit Trail**:
- Filter by actor, action type, tenant, date range
- Export to CSV (triggers async bulk-export job)
- Hash chain status indicator (green = verified, red = alert)

---

## 9. Incident Response Playbooks

### 9.1 High Error Rate

```
1. Check Sentry for new error types
2. Identify affected use case / RPC function from traceId
3. Check if recent deployment triggered the issue
4. If yes → rollback (see DEVOPS_DEPLOYMENT.md)
5. If no → add hotfix + fast-track deploy
6. Post incident report within 24h
```

### 9.2 Slow Response Times

```
1. Check Datadog: which RPC function is slow?
2. Check Supabase: DB CPU + slow query log
3. Likely causes:
   a. Missing index → add migration with CONCURRENTLY
   b. Materialised view not refreshed → trigger manual refresh
   c. Connection pool exhausted → scale Supabase plan
   d. N+1 query in repo → fix query in SupabaseXRepo
```

### 9.3 Job Queue Backlog

```
1. Check job queue depth metric (target: < 500)
2. Identify which job_name is backing up
3. Check Edge Function logs for processing errors
4. If errors: fix bug, re-deploy function
5. If overload: increase Edge Function concurrency limit
6. Monitor queue drain rate after fix
```

### 9.4 Audit Hash Chain Mismatch

```
1. IMMEDIATELY → PagerDuty P0 → escalate to Security Lead + CTO
2. Identify: which entry in activity_logs has broken hash
3. Determine: data corruption or malicious tampering?
4. Preserve: snapshot all audit_log data immediately
5. Restore: from last verified backup if corruption
6. Investigate: how the record was modified (only DB-level access could do this)
7. Report: security incident report within 24h, legal notification if required
```
