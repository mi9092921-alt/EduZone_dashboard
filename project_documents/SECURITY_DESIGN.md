# EduZone — Security Design Document

> **Version:** 1.0 | **Date:** 2026-03-11 | **Status:** APPROVED  
> **Classification:** CONFIDENTIAL — Internal Engineering Only

---

## 1. Security Philosophy

EduZone Admin Dashboard follows a **Zero-Trust** security model: every request is authenticated, authorised, and validated — regardless of origin. No implicit trust is granted to any component, user, or network.

**Core Principles:**

1. **Never trust, always verify** — JWT + token_version checked on every RPC
2. **Least privilege** — Users get minimum permissions required for their role
3. **Defense in depth** — Multiple security layers (JWT → RLS → SECURITY DEFINER → audit)
4. **Audit everything** — Every write operation generates an immutable, hash-chained log entry
5. **Browser never holds secrets** — service_role key only exists in Edge Functions server-side

---

## 2. Authentication Architecture

### 2.1 Authentication Flow

```
User enters email + password
    │
    ▼
Supabase Auth → validates credentials
    │
    ▼ (if MFA enrolled — required for admin/super_admin)
TOTP verification
    │
    ▼
JWT issued (access_token + refresh_token in HttpOnly cookie)
    │
    ▼
Frontend calls check_dashboard_access()
    ├── Validates account_status (not locked/banned/suspended)
    ├── Validates token_version (not stale from force-logout)
    ├── Checks maintenance_mode
    └── Checks app_locked setting
    │
    ▼
Dashboard renders (or redirect to appropriate error screen)
```

### 2.2 Token Storage

| Token                | Storage                         | Rationale                            |
| -------------------- | ------------------------------- | ------------------------------------ |
| `access_token` (JWT) | **Memory only**                 | Prevents XSS theft from localStorage |
| `refresh_token`      | **HttpOnly cookie**             | Inaccessible to JavaScript           |
| `service_role` key   | **Edge Function env vars only** | Never sent to browser                |

### 2.3 MFA Requirements

| Role          | MFA Status                                |
| ------------- | ----------------------------------------- |
| `super_admin` | **Enforced** — cannot access without TOTP |
| `admin`       | **Enforced** — cannot access without TOTP |
| `teacher`     | Optional — can enrol via profile settings |

### 2.4 Session Management

- JWT expiry: 1 hour (short-lived)
- Refresh token expiry: 7 days
- Sessions polled every 5 minutes via `check_dashboard_access()` RPC
- Force-logout invalidates all sessions by incrementing `token_version`
- Suspended/banned accounts get immediate session revocation via job queue

---

## 3. token_version Mismatch Handling

`token_version` in the `users` table is incremented whenever:

- Admin forces logout
- Account is locked, banned, or suspended
- Password is reset
- Admin revokes all sessions

**Client-side enforcement:**

```typescript
// Called every 5 minutes + on every navigation
const { data } = await supabase.rpc('check_dashboard_access');

if (!data.allowed) {
  switch (data.reason) {
    case 'account_locked':
    case 'account_banned':
      await supabase.auth.signOut();
      router.push('/login?reason=session_invalidated');
      break;
    case 'account_suspended':
      await supabase.auth.signOut();
      router.push('/login?reason=suspended&until=' + data.until);
      break;
    case 'maintenance_mode':
      router.push('/maintenance'); // NO logout
      break;
  }
}
```

**RLS enforcement** — Every policy that touches user data implicitly calls `check_dashboard_access()` internally, so a stale JWT will be rejected at the database level even if the client polling is delayed.

---

## 4. Authorisation Model

### 4.1 Role Hierarchy

```
super_admin  (global, all tenants)
    │
    ▼
admin  (tenant-scoped)
    │
    ▼
teacher  (own courses + students only)
    │
    ▼
student  (NO dashboard access)
```

### 4.2 Permission Matrix

| Action                    | super_admin | admin                | teacher          |
| ------------------------- | ----------- | -------------------- | ---------------- |
| Manage all tenants        | ✅          | ❌                   | ❌               |
| View/manage all users     | ✅          | ✅ (own tenant)      | ❌               |
| Suspend/ban users         | ✅          | ✅ (not super_admin) | ❌               |
| Manage system settings    | ✅          | ❌                   | ❌               |
| Manage feature flags      | ✅          | ❌                   | ❌               |
| Manage own-tenant courses | ✅          | ✅                   | ✅ (own courses) |
| View analytics            | ✅          | ✅ (own tenant)      | ✅ (own courses) |
| Bulk operations           | ✅          | ✅                   | ❌               |
| View audit logs           | ✅          | ✅ (own tenant)      | ❌               |

### 4.3 PermissionService (Domain Layer)

```typescript
// Pure domain logic — no DB, no async
export class PermissionService {
  canActOn(actorRole: PrimaryRole, targetRole: PrimaryRole, action: string): boolean {
    if (actorRole === 'super_admin') return true;
    if (actorRole === 'admin' && targetRole === 'super_admin') return false;
    if (actorRole === 'admin') return ['suspend', 'ban', 'reset_password'].includes(action);
    return false;
  }
}
```

### 4.4 RLS Policies

All tables have Row-Level Security enabled. Key patterns:

```sql
-- Tenant isolation (applied to users, courses, enrollments, etc.)
CREATE POLICY tenant_isolation ON users
  FOR ALL USING (
    tenant_id = get_current_tenant_id()
    OR is_super_admin()
  );

-- Admin-only write access
CREATE POLICY admin_write ON settings_kv
  FOR ALL USING (is_current_user_admin());

-- Append-only audit log
CREATE POLICY audit_append_only ON activity_logs
  FOR INSERT WITH CHECK (true);
-- No UPDATE or DELETE policies exist on activity_logs
```

---

## 5. Audit Trail (Hash-Chain Integrity)

Every write operation generates an immutable audit log entry. Entries are cryptographically chained:

```sql
-- Each log entry includes a hash of the previous entry
new_hash = SHA256(prev_hash || timestamp || actor_id || action || target || details)
```

This creates a tamper-evident chain. If any historical record is modified, all subsequent hashes become invalid.

**Audit log fields:**

| Field         | Type        | Description                               |
| ------------- | ----------- | ----------------------------------------- |
| `id`          | UUID        | Unique entry ID                           |
| `tenant_id`   | UUID        | Tenant scope                              |
| `actor_id`    | UUID        | Admin who performed the action            |
| `action`      | TEXT        | e.g. `user.suspended`, `course.published` |
| `target_type` | TEXT        | e.g. `user`, `course`, `setting`          |
| `target_id`   | UUID        | Affected entity                           |
| `details`     | JSONB       | Action-specific metadata                  |
| `ip_address`  | INET        | Actor's IP                                |
| `user_agent`  | TEXT        | Actor's browser/client                    |
| `hash`        | TEXT        | SHA256 chain hash                         |
| `created_at`  | TIMESTAMPTZ | Immutable timestamp                       |

**Verification cron:** Runs every 6 hours to verify hash chain integrity. Alerts on any mismatch.

---

## 6. Rate Limiting

Rate limits prevent abuse and protect database resources.

### 6.1 Default Limits

| Endpoint Type     | Window | Max Requests |
| ----------------- | ------ | ------------ |
| Admin RPC calls   | 60s    | 100          |
| Bulk operations   | 60s    | 10           |
| Export generation | 300s   | 5            |
| Auth attempts     | 300s   | 10           |
| Password reset    | 3600s  | 3            |

### 6.2 Implementation

Rate limits are checked in every Edge Function before processing:

```typescript
// supabase/functions/_shared/rateLimitGuard.ts
await rateLimitGuard(req, sb, { windowSec: 60, maxRequests: 100 });
// Throws HTTP 429 if limit exceeded with Retry-After header
```

Rate limit state is stored in PostgreSQL `rate_limits` table (not in-memory) to survive Edge Function cold starts and enable cross-instance coordination.

---

## 7. Idempotency

All mutations implement idempotency to prevent double-execution from:

- Button double-clicks
- Network retries
- Edge Function timeout re-runs

**Flow:**

```
Client generates UUID v4 idempotency key before mutation
    ↓
Sends key in request body / X-Idempotency-Key header
    ↓
Edge Function checks key in idempotency store
    ├── Key exists → return cached result (wasReplay: true)
    └── Key not found → execute operation → store result with 24h TTL
```

All mutation hooks generate the key automatically:

```typescript
const idempotencyKey = crypto.randomUUID(); // before useMutation call
```

---

## 8. Input Validation

All inputs are validated at multiple layers:

| Layer         | Tool                                   | Scope              |
| ------------- | -------------------------------------- | ------------------ |
| Frontend form | Zod + React Hook Form                  | User-facing input  |
| API contract  | Zod schema                             | Request body shape |
| Database      | PostgreSQL CHECK constraints           | Column-level rules |
| RPC function  | Internal validation + permission check | Business rules     |

**SQL Injection prevention:** All queries use parameterised RPC calls via Supabase client. No string concatenation in SQL ever.

**XSS prevention:** Next.js escapes all rendered content. No `dangerouslySetInnerHTML` usage outside of explicitly sanitised rich-text display.

---

## 9. Threat Model

### 9.1 In-Scope Threats

| Threat                 | Mitigation                                             |
| ---------------------- | ------------------------------------------------------ |
| Stolen JWT             | Short expiry (1h) + token_version invalidation         |
| XSS                    | Memory-only JWT storage + CSP headers                  |
| CSRF                   | SameSite=Strict cookies + custom headers               |
| SQL Injection          | Parameterised queries only                             |
| Privilege escalation   | RLS + PermissionService + SECURITY DEFINER             |
| Cross-tenant data leak | Tenant isolation RLS on all tables                     |
| Replay attacks         | Idempotency keys with 24h TTL                          |
| Brute force            | Rate limiting (10 attempts / 5 min) + lockout          |
| Data exfiltration      | Bulk export requires explicit admin action + audit log |
| Audit tampering        | Hash-chain verification + append-only policy           |
| service_role key leak  | Never in browser; only in Edge Function env vars       |

### 9.2 Out-of-Scope Threats

- Infrastructure-level attacks (handled by Supabase/Vercel platform)
- Physical hardware compromise
- Supply chain attacks on npm packages (mitigated by lock files + audit)

---

## 10. Security Checklist (Pre-Launch)

- [ ] MFA enforced for all admin accounts in production
- [ ] CSP headers configured (`Content-Security-Policy: default-src 'self'`)
- [ ] HSTS enabled (`Strict-Transport-Security: max-age=31536000; includeSubDomains`)
- [ ] All cookies: `Secure; HttpOnly; SameSite=Strict`
- [ ] Supabase RLS enabled on every table (verified with `\d+ tablename`)
- [ ] service_role key NOT in any client-side environment variable
- [ ] Rate limit rules configured in production Supabase
- [ ] Audit chain verification cron deployed and alerting
- [ ] Penetration test completed (schedule before launch)
- [ ] GDPR data export flow tested (72h SLA)
- [ ] Sentry error tracking with PII scrubbing enabled
- [ ] Dependency audit: `pnpm audit --audit-level=high` passing
