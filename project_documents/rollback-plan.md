# EduZone Admin Dashboard — Rollback Plan

**Version:** 1.0  
**Date:** 2026-03-28  
**Owner:** Tech Lead

---

## 1. Frontend (Vercel) Rollback

### Scenario: Bad deployment causes 5xx errors or visual regressions

**Trigger Condition:** Sentry error-rate > 5% OR Vercel Health Check fails.

**Steps:**

1. Go to **Vercel Dashboard** → Project: `eduzone-admin`
2. Navigate to **Deployments** tab
3. Find the last successful deployment (green checkmark)
4. Click **⋮ (three dots)** → **Promote to Production**
5. Verify domain is serving the previous version (~30 seconds)

**Verification:** `curl -I https://admin.eduzone.com` → HTTP 200

---

## 2. Database (Supabase) Rollback

### Scenario: A migration causes data corruption or schema errors

**Trigger Condition:** RPC errors in Sentry, `500` from Supabase REST API, or data integrity alerts.

> [!CAUTION]
> **Take a manual snapshot BEFORE every migration run.** This is the only way to guarantee a clean rollback point.

**Pre-Migration Snapshot:**

1. Supabase Dashboard → **Database** → **Backups**
2. Click **Create Backup** — label it with the migration name (e.g., `pre-cron-jobs-20260328`)
3. Wait for completion (~2-5 min)

**Rollback Steps:**

1. Supabase Dashboard → **Database** → **Backups**
2. Select the pre-migration backup
3. Click **Restore** → Confirm
4. Time estimate: **5–15 minutes** depending on DB size
5. Notify team via Slack/comms channel immediately

---

## 3. Edge Functions Rollback

### Scenario: An Edge Function update causes 500s or broken behavior

**Trigger Condition:** Supabase Functions logs show > 10 errors/min.

**Steps:**

```bash
# Check current deployed version
supabase functions list

# Re-deploy the previous known-good version from git
git checkout <previous-commit-sha> -- supabase/functions/<function-name>/
supabase functions deploy <function-name>
```

**Example — rolling back `create-user`:**

```bash
git log supabase/functions/create-user/ --oneline -5
# Pick the previous commit SHA
git checkout abc1234 -- supabase/functions/create-user/
supabase functions deploy create-user
```

---

## 4. pg_cron Jobs — Emergency Disable

### Scenario: A cron job goes rogue (e.g., deleting too many rows)

**Steps via SQL Editor:**

```sql
-- Disable a specific job immediately
SELECT cron.unschedule('flush_logs_minutely');

-- List all current jobs to verify
SELECT * FROM cron.job;

-- Re-enable after the issue is fixed
SELECT cron.schedule('flush_logs_minutely', '* * * * *', $$
  SELECT flush_activity_logs(100);
$$);
```

---

## 5. Communication & Escalation

| Severity                      | Response Time | Action                                     |
| ----------------------------- | ------------- | ------------------------------------------ |
| **P0** — Site down            | 15 min        | Immediate rollback + Notify PM + Tech Lead |
| **P1** — Major feature broken | 1 hour        | Hotfix or rollback                         |
| **P2** — Minor degradation    | 4 hours       | Scheduled fix in next deploy               |

**Escalation Order:**

1. On-Call Engineer → Slack `#incidents`
2. Tech Lead → Direct message
3. PM → Status page update

---

## 6. Go-Live Checklist (Pre-Production)

- [ ] Supabase DB snapshot taken and labeled
- [ ] Vercel previous deployment identified and noted
- [ ] pg_cron jobs verified working on Staging
- [ ] All 5 Edge Functions deployed and tested
- [ ] DNS propagated (`dig admin.eduzone.com`)
- [ ] SSL certificate active (green padlock)
- [ ] Sentry receiving events
- [ ] Vercel Analytics enabled
- [ ] Rollback tested on Staging (dry-run)
