EduZone API Design Document v1.0 **| CONFIDENTIAL**

**EduZone**

**API Design Document**

Admin & Management Dashboard — Edge Functions + RPC Contracts

_Version 1.0 | 2026-03-08 | Schema v5.0_

| **Version**  | 1\.0                                  |
| :----------- | :------------------------------------ |
| **Status**   | **FINAL — Approved**                  |
| **Base URL** | _https://<project>.supabase.co_       |
| **Auth**     | Supabase JWT (Bearer) — every request |
| **Schema**   | EduZone v5.0 (PostgreSQL 17)          |

# **1. Overview & Architecture**

The EduZone Admin Dashboard communicates with two backend surfaces:

- Supabase RPC Functions — SECURITY DEFINER PostgreSQL functions called directly via the Supabase JS client (.rpc()). Used for all standard admin operations.
- Supabase Edge Functions — Deno serverless functions for operations that require the service_role key, bulk processing, file generation, or cross-table transactions too complex for a single RPC.

**SECURITY:** The browser NEVER holds the service_role key. Every Edge Function validates the caller's JWT and permission before executing.

## **1.1 Two-Surface Architecture**

|    **Surface**     |         **Called From**         |  **Auth Key**  |                      **Use Cases**                      |
| :----------------: | :-----------------------------: | :------------: | :-----------------------------------------------------: |
|  **Supabase RPC**  |      Browser (anon/authed)      |    anon key    | CRUD, account actions, settings, feature flags, logging |
| **Edge Functions** | Browser → POST /functions/v1/\* | anon key + JWT | Bulk ops, exports, service_role ops, report generation  |

## **1.2 Request Lifecycle**

Browser → useQuery/useMutation (React Query)

`  `→ services/\*.service.ts (typed wrapper)

`  `→ supabase.rpc('fn_name', params) OR fetch('/functions/v1/action')

`  `→ PostgreSQL RPC / Deno Edge Function

`  `→ RLS + permission check (user_has_permission / is_current_user_admin)

`  `→ DB operation + log_activity_async

`  `→ Typed response → React Query cache update → UI

## **1.3 Authentication Headers**

|    **Header**     |        **Value**        |                                     **Notes**                                     |
| :---------------: | :---------------------: | :-------------------------------------------------------------------------------: |
| **Authorization** | _Bearer <access_token>_ |                   Supabase JWT from supabase.auth.getSession()                    |
| **Content-Type**  |    application/json     |                            Required for Edge Functions                            |
| **x-request-id**  |       _<uuid v4>_       | Generated client-side; attached to Sentry errors; logged in activity_logs details |

## **1.4 Standard Error Envelope**

All RPC errors surface as PostgreSQL exceptions. The client parses them with parseRpcError():

{

`  `"code": "ADMIN_ONLY", // RpcErrorCode union type

`  `"message": "Human-readable text", // shown in UI toast

`  `"detail": "...", // optional extra context

`  `"hint": "...", // optional fix hint

`  `"ref": "<x-request-id>" // for Sentry correlation

}

Edge Function errors use standard HTTP status codes + the same envelope:

HTTP 422 { "error": "INVALID_FILTERS", "message": "...", "count": 0 }

HTTP 403 { "error": "PERMISSION_DENIED", "message": "..." }

HTTP 429 { "error": "RATE_LIMITED", "retry_after": "<ISO8601>" }

HTTP 500 { "error": "INTERNAL_ERROR", "ref": "<request-id>" }

# **2. RPC Function Contracts**

**NOTE:** All RPCs are invoked via supabase.rpc('function_name', params). They are SECURITY DEFINER and run with DB-owner privileges while internally re-validating caller permissions.

## **2.1 check_user_access()**

Called on every app open and polled every 5 minutes to validate the user's session state.

### **Request**

await supabase.rpc('check_user_access')

No parameters. Uses auth.uid() internally.

### **Response — Success (allowed: true)**

{

`  `"allowed": true,

`  `"role": "admin",

`  `"tenant_id": "uuid",

`  `"maintenance_bypass": false // only present when maintenance_mode=true

}

### **Response — Blocked (allowed: false)**

{

`  `"allowed": false,

`  `"reason": "account_locked", // see reason enum below

`  `"message": "حسابك مقفل.", // localised, from lock_reason or settings_kv

`  `"until": "2026-04-01T...", // present for account_suspended only

`  `"ends_at": "2026-04-01T..." // present for maintenance_mode only

}

### **Reason Enum**

|    **Error Code**     | **HTTP / PG** |                             **Condition + UI Action**                             |
| :-------------------: | :-----------: | :-------------------------------------------------------------------------------: |
|    **app_locked**     |    **200**    | app_locked=true in settings_kv → show app-lock message, redirect to locked screen |
|  **unauthenticated**  |    **200**    |                      auth.uid() is NULL → redirect to /login                      |
|  **user_not_found**   |    **200**    |              User row missing in users table → hard logout → /login               |
|  **account_locked**   |    **200**    |      account_status=locked → hard logout → /login?reason=session_invalidated      |
| **account_suspended** |    **200**    |        account_status=suspended AND suspension_until > NOW() → hard logout        |
|  **account_banned**   |    **200**    |      account_status=banned → hard logout → /login?reason=session_invalidated      |
| **maintenance_mode**  |    **200**    | maintenance_mode=true AND user not excluded → show maintenance screen (NO logout) |

## **2.2 control_user_account(p_user_id, p_action, p_reason?, p_suspend_hours?)**

Performs lock / unlock / suspend / ban on a user account. Terminates all sessions for destructive actions.

### **Parameters**

|      **Field**      | **Type** |                            **Description**                             |
| :-----------------: | :------: | :--------------------------------------------------------------------: | -------- | --------- | ----- |
|    **p_user_id**    |  _UUID_  |                Target user. Must exist in users table.                 |
|    **p_action**     |  _TEXT_  |                              Enum: "lock"                              | "unlock" | "suspend" | "ban" |
|    **p_reason**     | _TEXT?_  | Required for lock / suspend / ban. Min 5 chars. Stored in lock_reason. |
| **p_suspend_hours** |  _INT?_  |    Required for "suspend". Range: 1–720. Computes suspension_until.    |

### **TypeScript Call**

const { data, error } = await supabase.rpc('control_user_account', {

`  `p_user_id: '<uuid>',

`  `p_action: 'suspend',

`  `p_reason: 'Violating platform rules',

`  `p_suspend_hours: 48,

});

### **Response (JSONB)**

| **Field**  |    **Type**    |                **Notes**                |
| :--------: | :------------: | :-------------------------------------: | -------- | ----------- | -------- |
| **status** |     _TEXT_     |                "locked"                 | "active" | "suspended" | "banned" |
| **until**  | _TIMESTAMPTZ?_ | Populated for "suspend"; null otherwise |

### **Error Codes**

|   **Error Code**   | **HTTP / PG** |                        **Condition + UI Action**                         |
| :----------------: | :-----------: | :----------------------------------------------------------------------: |
|   **ADMIN_ONLY**   |  **PG 403**   |           Caller lacks admin role → show "Permission denied."            |
| **INVALID_ACTION** |  **PG 422**   | p_action not in enum → Zod prevents client-side; log as critical if seen |
|  **RPC_TIMEOUT**   |    **504**    |           Response > 5s → "Action timed out. Check job queue."           |
|    **DB_ERROR**    |  **PG 500**   |  Unexpected exception → show generic error + Sentry log with request_id  |

## **2.3 terminate_user_sessions(p_user_id, p_reason?)**

### **Parameters**

|   **Field**   | **Type** |                     **Description**                      |
| :-----------: | :------: | :------------------------------------------------------: |
| **p_user_id** |  _UUID_  |                       Target user                        |
| **p_reason**  | _TEXT?_  | Stored in sessions.logout_reason. Default: "admin_force" |

### **TypeScript Call**

const { data: count, error } = await supabase.rpc('terminate_user_sessions', {

`  `p_user_id: '<uuid>',

`  `p_reason: 'security_review',

});

### **Response**

// INT — number of sessions terminated

// 0 is valid (user had no active sessions)

### **Error Codes**

|   **Error Code**   | **HTTP / PG** |                 **Condition + UI Action**                 |
| :----------------: | :-----------: | :-------------------------------------------------------: |
|   **ADMIN_ONLY**   |  **PG 403**   |                         Not admin                         |
| **USER_NOT_FOUND** |  **PG 404**   | p_user_id not in users table → "User not found. Refresh." |

## **2.4 issue_warning(p_user_id, p_reason, p_severity?, p_action?)**

### **Parameters**

|   **Field**    | **Type** |           **Description**           |
| :------------: | :------: | :---------------------------------: | ------------ | ---------------------- |
| **p_user_id**  |  _UUID_  |             Target user             |
|  **p_reason**  |  _TEXT_  |    Warning reason. Min 20 chars.    |
| **p_severity** |  _INT?_  |           Enum: 1 (Minor)           | 2 (Moderate) | 3 (Severe). Default 1. |
|  **p_action**  | _TEXT?_  | Default "none". Optional: "suspend" | "lock"       |

### **TypeScript Call**

const { data: warningId, error } = await supabase.rpc('issue_warning', {

`  `p_user_id: '<uuid>',

`  `p_reason: 'Repeated policy violations in course forum',

`  `p_severity: 2,

`  `p_action: 'none',

});

### **Response**

// UUID — ID of the created warning record

### **Side Effects**

- Increments users.warning_count.
- If warning_count >= max_warnings_before_action AND p_action="none" → automatically calls control_user_account(p_user_id, "suspend", ..., 24).
- Logs activity via log_activity_async with risk_level "medium".

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |                  **Condition + UI Action**                   |
| :-------------------: | :-----------: | :----------------------------------------------------------: |
| **PERMISSION_DENIED** |  **PG 403**   |              warnings.write permission missing               |
|   **AUTO_SUSPEND**    |  **PG 200**   | Auto-suspend triggered — treat as success + show info banner |

## **2.5 enroll_student(p_user_id, p_course_id, p_expires_at?)**

### **Parameters**

|    **Field**     |    **Type**    |                   **Description**                   |
| :--------------: | :------------: | :-------------------------------------------------: |
|  **p_user_id**   |     _UUID_     |                  Student to enroll                  |
| **p_course_id**  |     _UUID_     |                    Target course                    |
| **p_expires_at** | _TIMESTAMPTZ?_ | Optional expiry. If NULL, enrollment never expires. |

### **TypeScript Call**

const { data: enrollmentId, error } = await supabase.rpc('enroll_student', {

`  `p_user_id: '<uuid>',

`  `p_course_id: '<uuid>',

`  `p_expires_at: new Date(Date.now() + 6\*30\*24\*3600\*1000).toISOString(),

});

### **Upsert Behaviour**

If the enrollment already exists (any status), it is updated to status="active" with the new enrolled_at and expires_at. This is intentional — re-enrollment is idempotent.

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |     **Condition + UI Action**     |
| :-------------------: | :-----------: | :-------------------------------: |
| **PERMISSION_DENIED** |  **PG 403**   | courses.manage permission missing |
| **COURSE_NOT_FOUND**  |  **PG 404**   | p_course_id not in courses table  |

## **2.6 revoke_enrollment(p_user_id, p_course_id, p_reason?)**

|    **Field**    | **Type** |           **Description**           |
| :-------------: | :------: | :---------------------------------: |
|  **p_user_id**  |  _UUID_  |               Student               |
| **p_course_id** |  _UUID_  |               Course                |
|  **p_reason**   | _TEXT?_  | Stored in enrollments.revoke_reason |

### **TypeScript Call**

await supabase.rpc('revoke_enrollment', {

`  `p_user_id: '<uuid>',

`  `p_course_id: '<uuid>',

`  `p_reason: 'Non-payment',

});

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |                   **Condition + UI Action**                    |
| :-------------------: | :-----------: | :------------------------------------------------------------: |
| **PERMISSION_DENIED** |  **PG 403**   |                     courses.manage missing                     |
|  **ALREADY_REVOKED**  |  **PG 200**   | Enrollment already revoked → treat as success, show info toast |
|     **NOT_FOUND**     |  **PG 404**   |                   No matching enrollment row                   |

## **2.7 get_setting(p_key) / set_setting(p_key, p_value)**

### **get_setting — TypeScript**

const { data: value } = await supabase.rpc('get_setting', { p_key: 'max_devices_per_user' });

// Returns TEXT. Client casts based on value_type from settings_kv.

### **set_setting — TypeScript**

await supabase.rpc('set_setting', {

`  `p_key: 'max_devices_per_user',

`  `p_value: '2',

});

### **Side Effects of set_setting**

- Invalidates settings_cache for the key (sets expires_at = NOW()-1s).
- Inserts into cache_invalidation_queue.
- Fires pg_notify('cache_invalidation', { type:'settings', key, value }).
- Frontend useRealtimeSettingsSync() receives notification → invalidates React Query cache.

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |                 **Condition + UI Action**                  |
| :-------------------: | :-----------: | :--------------------------------------------------------: |
|    **ADMIN_ONLY**     |  **PG 403**   |                         Not admin                          |
| **SETTING_NOT_FOUND** |  **PG 404**   | Key does not exist in settings_kv → "Unknown setting key." |

## **2.8 bind_device_for_current_user(p_device_id, p_device_info?, p_platform?)**

|     **Field**     | **Type** |                   **Description**                    |
| :---------------: | :------: | :--------------------------------------------------: | ----- | ----- |
|  **p_device_id**  |  _TEXT_  | Unique device identifier. Non-empty string required. |
| **p_device_info** | _JSONB?_ |       Device metadata: model, OS, app version.       |
|  **p_platform**   | _TEXT?_  |                      "android"                       | "ios" | "web" |

### **TypeScript Call**

const { data } = await supabase.rpc('bind_device_for_current_user', {

`  `p_device_id: deviceFingerprint,

`  `p_device_info: { model: 'iPhone 15', os: 'iOS 17', app: '1.0.0' },

`  `p_platform: 'ios',

});

### **Response (JSONB)**

| **Field**  | **Type**  |  **Notes**   |
| :--------: | :-------: | :----------: | -------------------------------------------------------------- |
| **status** | \*"bound" | "verified"\* | bound = new device added; verified = existing device refreshed |

### **Error Codes**

|      **Error Code**      | **HTTP / PG** |           **Condition + UI Action**            |
| :----------------------: | :-----------: | :--------------------------------------------: |
|    **AUTH_REQUIRED**     |  **PG 401**   |               auth.uid() is NULL               |
|  **INVALID_DEVICE_ID**   |  **PG 422**   |       Empty or whitespace-only device_id       |
| **DEVICE_ALREADY_BOUND** |  **PG 409**   |    device_id registered to a different user    |
| **MAX_DEVICES_REACHED**  |  **PG 429**   | Active devices >= max_devices_per_user setting |
|     **RATE_LIMITED**     |  **PG 429**   | device_bind rate limit hit (3 attempts / 24h)  |

## **2.9 flush_activity_logs(p_batch_size?)**

const { data: count } = await supabase.rpc('flush_activity_logs', { p_batch_size: 200 });

Moves records from activity_log_queue into activity_logs with cryptographic hash chaining.

|      **Field**      |   **Type**    |                         **Notes**                         |
| :-----------------: | :-----------: | :-------------------------------------------------------: |
|    **(return)**     |     _INT_     |        Number of log entries flushed in this call         |
|   **Error Code**    | **HTTP / PG** |                 **Condition + UI Action**                 |
| **LOCK_CONTENTION** |  **PG 500**   | Advisory lock held by concurrent worker → retry after 60s |

## **2.10 check_rate_limit(p_action, p_user_id?, p_ip?, p_device_id?)**

|    **Field**    | **Type** |             **Description**              |
| :-------------: | :------: | :--------------------------------------: | ---------- | ------------- | ---------------- | --------------- |
|  **p_action**   |  _TEXT_  |       Rate limit rule key: "login"       | "api_call" | "device_bind" | "password_reset" | "warning_issue" |
|  **p_user_id**  | _UUID?_  | Optional — identifies the user dimension |
|    **p_ip**     | _INET?_  |       Optional — client IP address       |
| **p_device_id** | _TEXT?_  |       Optional — device identifier       |

### **Response (JSONB)**

|    **Field**    |    **Type**    |                    **Notes**                     |
| :-------------: | :------------: | :----------------------------------------------: |
|   **allowed**   |   _BOOLEAN_    |               true if under limit                |
|    **hits**     |     _INT?_     | Current hit count in window (present if allowed) |
|     **max**     |     _INT?_     |            Max allowed hits in window            |
|   **reason**    |    _TEXT?_     |            "rate_limited" if blocked             |
| **retry_after** | _TIMESTAMPTZ?_ |                When block expires                |

## **2.11 Remaining RPC Quick Reference**

|                                **Function**                                 |   **Returns**   |                           **Key Behaviour**                           |
| :-------------------------------------------------------------------------: | :-------------: | :-------------------------------------------------------------------: |
|                         **_logout_current_user()_**                         |      VOID       |      Sets all sessions is_active=false; increments token_version      |
|                     **_reset_user_device(p_user_id)_**                      |      VOID       |       Sets all devices is_active=false for user; logs activity        |
|           **_rebuild_permission_cache(p_user_id, p_tenant_id?)_**           |      VOID       |      Deletes + re-inserts user_permission_cache; fires pg_notify      |
|        **_enable_maintenance_mode(msg, ends_at?, roles?, users?)_**         |      VOID       |        Calls set_setting for 5 keys; logs with risk_level high        |
|                      **_disable_maintenance_mode()_**                       |      VOID       |              Sets maintenance_mode=false; logs activity               |
|                      **_lock_app_for_all(p_message)_**                      |      VOID       |          Sets app_locked=true; logs with risk_level critical          |
|                             **_unlock_app()_**                              |      VOID       |                 Sets app_locked=false; logs activity                  |
|                 **_is_feature_enabled(p_key, p_user_id?)_**                 |     BOOLEAN     | Checks flag, dates, role/user overrides; no permission check required |
|               **_dequeue_job(worker_id, types?, ttl_sec?)_**                | SETOF job_queue |    Claims one pending job; sets status=processing; returns job row    |
|                       **_release_stale_job_locks()_**                       |       INT       |     Resets status=pending for jobs where lock_expires_at < NOW()      |
| **_log_activity_async(uid, type, details?, ip?, device?, risk?, tenant?)_** |      UUID       | Non-blocking insert to activity_log_queue; notifies on high/critical  |

# **3. Edge Function Contracts**

**AUTH:** Every Edge Function validates the Bearer JWT using \_shared/auth.ts. Service-role operations use \_shared/supabaseAdmin.ts (Deno env only — never exposed to browser).

## **3.1 POST /functions/v1/bulk-action**

` `**POST /functions/v1/bulk-action**

Validates and queues a bulk admin operation. Returns immediately with a job_id. Actual processing is asynchronous via the bulk-worker function.

### **Request Body**

|  **Field**   |  **Type**  |                                                **Description**                                                |
| :----------: | :--------: | :-----------------------------------------------------------------------------------------------------------: | -------------- | ----------- | ------------- | ------------- | ------------------------- | -------------------- | ------------- |
|  **action**  |  _string_  |                                                  "bulk_lock"                                                  | "bulk_suspend" | "bulk_warn" | "bulk_enroll" | "bulk_revoke" | "bulk_terminate_sessions" | "bulk_reset_devices" | "bulk_export" |
| **filters**  |  _object_  | { tenant_id?, user_ids?, role?, account_status?, warning_count_gte? } — server re-validates; max 500 user_ids |
|  **params**  |  _object_  |                                   Action-specific. See params table below.                                    |
| **priority** | _number?_  |                                      job_queue priority 1–10. Default 5.                                      |
| **dry_run**  | _boolean?_ |                           If true: returns estimated_count without inserting a job.                           |

### **TypeScript Call**

const res = await fetch('/functions/v1/bulk-action', {

`  `method: 'POST',

`  `headers: { Authorization: `Bearer ${session.access\_token}`,

`             `'Content-Type': 'application/json' },

`  `body: JSON.stringify({

`    `action: 'bulk_suspend',

`    `filters: { tenant_id: '<uuid>', account_status: 'active' },

`    `params: { reason: 'Policy violation', suspend_hours: 24 },

`    `dry_run: false,

`    `priority: 7,

`  `}),

});

const { job_id, estimated_count } = await res.json();

### **Response**

|      **Field**      | **Type** |                          **Notes**                          |
| :-----------------: | :------: | :---------------------------------------------------------: |
|     **job_id**      | _string_ | UUID of the created job_queue record (null if dry_run=true) |
|     **action**      | _string_ |                  Echo of requested action                   |
| **estimated_count** | _number_ |                Users that match the filters                 |
|     **status**      | _string_ |              "pending" (null if dry_run=true)               |
|   **created_at**    | _string_ |                      ISO8601 timestamp                      |

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |                      **Condition + UI Action**                       |
| :-------------------: | :-----------: | :------------------------------------------------------------------: |
| **PAYLOAD_TOO_LARGE** |    **422**    |     user_ids.length > 500 → "Select up to 500 users at a time."      |
| **PERMISSION_DENIED** |    **403**    |               JWT lacks required permission for action               |
|  **INVALID_FILTERS**  |    **422**    | filters produce 0 matching rows → "No users match selected filters." |
|  **JOB_QUEUE_FULL**   |    **503**    |      pending job_queue count > 10,000 → retry in a few minutes       |
|   **DRY_RUN_ZERO**    |    **200**    |   dry_run=true, count=0 → show info: "No users would be affected."   |

### **Params Object by Action**

|         **action**          |           **Required params**           | **Optional params** |
| :-------------------------: | :-------------------------------------: | :-----------------: | --- | -------------- |
|        **bulk_lock**        |            _reason: string_             |          —          |
|      **bulk_suspend**       | _reason: string, suspend_hours: number_ |          —          |
|        **bulk_warn**        |      \*reason: string, severity: 1      |          2          | 3\* | action: string |
|       **bulk_enroll**       |           _course_id: string_           | expires_at: ISO8601 |
|       **bulk_revoke**       |           _course_id: string_           |   reason: string    |
| **bulk_terminate_sessions** |                   _—_                   |          —          |
|   **bulk_reset_devices**    |                   _—_                   |          —          |
|       **bulk_export**       |         \*export_format: "json"         |       "csv"\*       | —   |

## **3.2 POST /functions/v1/bulk-worker (internal — cron-triggered)**

` `**POST /functions/v1/bulk-worker**

Triggered by Supabase pg_cron every 60 seconds. Claims one pending bulk job and processes it in batches of 50 records.

### **Processing Loop**

1\. dequeue_job('bulk-worker', BULK_TYPES, 1800)

2\. Parse job.payload: { filters, params, initiator_id }

3\. Query matching user_ids from filters (service_role, bypasses RLS)

4\. For each batch of 50:

`   `a. Execute per-user RPC (service_role client)

`   `b. Collect failures in failed_ids[]

`   `c. pg_notify('job_progress', { job_id, processed, total, failed_ids })

5\. UPDATE job_queue SET status='done', error_msg=JSON({ processed, failed_ids })

6\. On exception: retry if attempts < max_attempts, else status='dead'

**NOTE:** The bulk-worker uses the service_role client to bypass RLS and call RPCs on behalf of the initiator_id. Every per-user action is still logged via log_activity_async with the initiator as the actor.

## **3.3 POST /functions/v1/bulk-export (triggered by bulk-worker)**

` `**POST /functions/v1/bulk-export**

Collects all data for filtered users and uploads a JSON or CSV archive to Supabase Storage. Returns a signed URL with 1-hour TTL.

### **Request Body**

|     **Field**     | **Type** |                      **Description**                      |
| :---------------: | :------: | :-------------------------------------------------------: | ----- |
|    **job_id**     | _string_ |               The bulk_export job_queue ID                |
|    **filters**    | _object_ | Same filters object from the original bulk-action request |
| **export_format** | _string_ |                          "json"                           | "csv" |
|   **tenant_id**   | _string_ |                  Scopes the Storage path                  |

### **TypeScript Call**

// Triggered internally by bulk-worker — not called from browser directly.

// Browser polls job_queue for status='done' then reads error_msg.download_url.

const job = await supabase

.from('job_queue')

.select('status, error_msg')

.eq('id', jobId)

.single();

if (job.data.status === 'done') {

`  `const { download_url } = JSON.parse(job.data.error_msg);

`  `window.open(download_url, '\_blank');

}

### **Response**

|    **Field**     | **Type** |             **Notes**              |
| :--------------: | :------: | :--------------------------------: |
| **download_url** | _string_ |    Signed Supabase Storage URL     |
|  **expires_at**  | _string_ |  ISO8601 — 1 hour from generation  |
| **record_count** | _number_ | Number of users included in export |
| **file_size_kb** | _number_ |       Approximate file size        |

### **Error Codes**

|  **Error Code**   | **HTTP / PG** |                 **Condition + UI Action**                  |
| :---------------: | :-----------: | :--------------------------------------------------------: |
| **EXPORT_EMPTY**  |    **422**    |        0 users match filters → "No data to export."        |
| **STORAGE_ERROR** |    **500**    |         Supabase Storage upload failed → retry job         |
|    **TIMEOUT**    |    **504**    | Processing > 25s → job split into smaller batches (future) |

## **3.4 POST /functions/v1/export-report**

` `**POST /functions/v1/export-report**

Generates a CSV or PDF analytics report from materialised views. Requires reports.read permission.

### **Request Body**

|    **Field**    | **Type**  |                        **Description**                         |
| :-------------: | :-------: | :------------------------------------------------------------: | -------------- | ---------- | ------------ |
| **report_type** | _string_  |                          "user_stats"                          | "course_stats" | "activity" | "geographic" |
|   **format**    | _string_  |                             "csv"                              | "pdf"          |
|  **tenant_id**  | _string?_ | Scope to tenant. Required for admin; optional for super_admin. |
|  **date_from**  | _string?_ |                   ISO8601 start date filter                    |
|   **date_to**   | _string?_ |                    ISO8601 end date filter                     |

### **TypeScript Call**

const res = await fetch('/functions/v1/export-report', {

`  `method: 'POST',

`  `headers: { Authorization: `Bearer ${session.access\_token}`, 'Content-Type': 'application/json' },

`  `body: JSON.stringify({

`    `report_type: 'user_stats',

`    `format: 'csv',

`    `tenant_id: tenantId,

`    `date_from: '2026-01-01',

`    `date_to: '2026-03-08',

`  `}),

});

const { download_url } = await res.json();

window.open(download_url, '\_blank');

### **Response**

|    **Field**     | **Type** |                            **Notes**                            |
| :--------------: | :------: | :-------------------------------------------------------------: |
| **download_url** | _string_ | Signed URL (1-hour TTL) or streaming response for small reports |
|  **expires_at**  | _string_ |                             ISO8601                             |
|  **row_count**   | _number_ |                Number of data rows in the report                |

### **Error Codes**

|    **Error Code**     | **HTTP / PG** |       **Condition + UI Action**       |
| :-------------------: | :-----------: | :-----------------------------------: |
| **PERMISSION_DENIED** |    **403**    |    reports.read permission missing    |
|   **EMPTY_REPORT**    |    **422**    |     No data for the given filters     |
|   **INVALID_DATE**    |    **422**    | date_from > date_to or invalid format |

# **4. Realtime Channels & Subscriptions**

Supabase Realtime is used for three purposes: cache invalidation, security alerts, and job progress updates.

|          **Channel / Table**           |                 **Trigger**                  |      **Listener**       |                               **Action on Receipt**                               |
| :------------------------------------: | :------------------------------------------: | :---------------------: | :-------------------------------------------------------------------------------: |
|   **pg_notify: cache_invalidation**    | _set_setting() / rebuild_permission_cache()_ | useRealtimeSettingsSync | Invalidate React Query key: queryKeys.settings.all or queryKeys.users.permissions |
|     **pg_notify: security_alert**      | _log_activity_async with risk high/critical_ | RealtimeToast (layout)  |        Add alert to realtime.store; increment unread badge; show Snackbar         |
|      **pg_notify: job_progress**       |        _bulk-worker after each batch_        |    BulkProgressPanel    |           Update processed/total progress bar; render failed_ids count            |
|       **Table: users (UPDATE)**        | _Any account_status / token_version change_  |  useUserRealtime hook   |           setQueryData to update row in DataGrid; highlight row briefly           |
|     **Table: job_queue (UPDATE)**      |             _Any status change_              |   useJobRealtime hook   |           Update job status chip; trigger summary toast on done/failed            |
| **Table: activity_log_queue (INSERT)** |          _log_activity_async call_           |   LiveActivityStream    |                  Prepend event to feed; auto-pause at 200 items                   |

## **4.1 TypeScript Subscription Pattern**

// Cache invalidation — in useRealtimeSettingsSync hook

const channel = supabase

.channel('cache_invalidation')

.on('broadcast', { event: '\*' }, (payload) => {

`    `if (payload.type === 'settings') {

`      `queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });

`    `}

`    `if (payload.type === 'permissions') {

`      `queryClient.invalidateQueries({

`        `queryKey: queryKeys.users.permissions(payload.user_id)

`      `});

`    `}

`  `})

.subscribe();

// Security alerts — in RealtimeToast component

supabase

.channel('security_alert')

.on('broadcast', { event: '\*' }, (payload) => {

`    `realtimeStore.addAlert({

`      `type: payload.type,

`      `user_id: payload.user,

`      `risk: payload.risk,

`      `ts: new Date().toISOString(),

`    `});

`  `})

.subscribe();

## **4.2 Subscription Cleanup**

**CRITICAL:** Every subscription must be removed in the useEffect cleanup function to prevent memory leaks and duplicate event handling across re-renders.

useEffect(() => {

`  `const channel = supabase.channel('...').on(...).subscribe();

`  `return () => { supabase.removeChannel(channel); };

}, []);

# **5. TypeScript Interface Reference**

All interfaces live in packages/types/src/rpc.types.ts and are auto-imported by services and queries.

## **5.1 Core Domain Types**

// packages/types/src/domain.types.ts

export type AccountStatus = 'active' | 'locked' | 'suspended' | 'banned';

export type PrimaryRole = 'super_admin' | 'admin' | 'teacher' | 'student';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type Platform = 'android' | 'ios' | 'web';

export type JobStatus = 'pending'|'processing'|'done'|'failed'|'dead';

export type EnrollStatus = 'active'|'revoked'|'expired'|'completed';

export interface AuthUser {

`  `id: string;

`  `email: string;

`  `primary_role: PrimaryRole;

`  `tenant_id: string;

`  `token_version: number;

}

export interface User {

`  `id: string;

`  `email: string | null;

`  `first_name: string | null;

`  `last_name: string | null;

`  `primary_role: PrimaryRole;

`  `account_status: AccountStatus;

`  `lock_reason: string | null;

`  `locked_at: string | null;

`  `suspension_until: string | null;

`  `warning_count: number;

`  `last_login: string | null;

`  `shard_key: number;

`  `tenant_id: string;

`  `region_id: string;

}

## **5.2 RPC Request / Response Types**

// packages/types/src/rpc.types.ts

export type CheckDashboardAccessResult =

`  `| { allowed: true; role: PrimaryRole; tenant_id: string; maintenance_bypass?: true }

`  `| { allowed: false; reason: AccessDeniedReason; message?: string;

`      `until?: string; ends_at?: string };

export type AccessDeniedReason =

`  `| 'app_locked' | 'unauthenticated' | 'user_not_found'

`  `| 'account_locked' | 'account_suspended' | 'account_banned'

`  `| 'maintenance_mode';

export type ControlUserAccountResult = {

`  `status: AccountStatus;

`  `until: string | null;

};

export type BindDeviceResult = {

`  `status: 'bound' | 'verified';

};

export type CheckRateLimitResult =

`  `| { allowed: true; hits: number; max: number }

`  `| { allowed: false; reason: 'rate_limited'; retry_after: string };

## **5.3 Error Types**

// packages/types/src/errors.types.ts

export type RpcErrorCode =

`  `| 'ADMIN_ONLY' | 'INVALID_ACTION' | 'RPC_TIMEOUT'

`  `| 'DB_ERROR' | 'USER_NOT_FOUND' | 'PERMISSION_DENIED'

`  `| 'AUTO_SUSPEND' | 'DUPLICATE' | 'ALREADY_REVOKED'

`  `| 'COURSE_NOT_FOUND' | 'NOT_FOUND' | 'SETTING_NOT_FOUND'

`  `| 'AUTH_REQUIRED' | 'INVALID_DEVICE_ID' | 'DEVICE_ALREADY_BOUND'

`  `| 'MAX_DEVICES_REACHED' | 'RATE_LIMITED' | 'LOCK_CONTENTION'

`  `| 'NO_JOBS' | 'ENDS_AT_PAST';

export interface RpcError {

`  `code: RpcErrorCode;

`  `message: string; // Human-readable; show in toast

`  `detail?: string; // Technical detail; log to Sentry

`  `ref?: string; // x-request-id for correlation

}

export function parseRpcError(error: unknown): RpcError {

`  `// Parses PostgreSQL RAISE EXCEPTION message format:

`  `// "ADMIN_ONLY" or "SETTING_NOT_FOUND: max_devices_per_user"

`  `const msg = (error as any)?.message ?? '';

`  `const code = msg.split(':')[0].trim() as RpcErrorCode;

`  `return { code, message: ERROR_MESSAGES[code] ?? 'Unexpected error.', detail: msg };

}

## **5.4 Query Key Factory**

// apps/web/src/lib/rpc/keys.ts

export const queryKeys = {

`  `users: {

`    `all: () => ['users'] as const,

`    `list: (f: UserFilters) => ['users','list',f] as const,

`    `detail: (id: string) => ['users',id] as const,

`    `devices: (id: string) => ['users',id,'devices'] as const,

`    `sessions: (id: string) => ['users',id,'sessions'] as const,

`    `warnings: (id: string) => ['users',id,'warnings'] as const,

`    `permissions: (id: string) => ['users',id,'permissions'] as const,

`  `},

`  `courses: {

`    `all: () => ['courses'] as const,

`    `list: (f: CourseFilters) => ['courses','list',f] as const,

`    `detail: (id: string) => ['courses',id] as const,

`    `analytics:(id: string) => ['courses',id,'analytics'] as const,

`  `},

`  `settings: { all: () => ['settings'] as const },

`  `flags: { all: () => ['flags'] as const },

`  `audit: { list:(f:AuditFilters) => ['audit','list',f] as const },

`  `jobs: { list:(f:JobFilters) => ['jobs','list',f] as const },

`  `tenants: { all: () => ['tenants'] as const,

`             `detail:(id:string) => ['tenants',id] as const },

`  `analytics:{ userStats: (tid?:string) => ['mv','user\_stats',tid] as const,

`              `courseStats:(cid?:string) => ['mv','course\_stats',cid] as const,

`              `daily: (tid?:string) => ['mv','daily',tid] as const },

} as const;

# **6. Versioning, Conventions & Changelog**

## **6.1 RPC Versioning Strategy**

Supabase RPC functions are versioned by name suffix when breaking changes are needed:

-- Non-breaking: update the function body in-place

-- Breaking: create new function with \_v2 suffix

CREATE OR REPLACE FUNCTION control_user_account_v2(...) ...

-- Keep v1 alive for 2 sprints, then deprecate

The client services layer abstracts the version:

// services/users.service.ts

const FN = process.env.NEXT_PUBLIC_APP_ENV === 'production'

`  `? 'control_user_account' // stable

`  `: 'control_user_account_v2'; // canary

## **6.2 Edge Function Versioning**

- URL path does NOT include a version prefix — function name changes for breaking versions.
- All Edge Functions return X-Function-Version header for debugging.
- Backward-compatible changes (new optional fields) are deployed in-place.

## **6.3 Naming Conventions**

|      **Entity**       |       **Convention**        |                **Example**                |
| :-------------------: | :-------------------------: | :---------------------------------------: |
|   **RPC function**    |   _snake_case verb_noun_    | control_user_account, flush_activity_logs |
|   **RPC parameter**   |  _p\_ prefix + snake_case_  |        p_user_id, p_suspend_hours         |
| **Edge Function URL** | _kebab-case, singular noun_ |       /bulk-action, /export-report        |
|     **Query key**     | _camelCase nested factory_  |        queryKeys.users.detail(id)         |
| **Service function**  |   _camelCase verb + noun_   |     controlUserAccount, issueWarning      |
|    **Error code**     |   _SCREAMING_SNAKE_CASE_    |      ADMIN_ONLY, MAX_DEVICES_REACHED      |
|  **TypeScript type**  | _PascalCase + descriptive_  | CheckDashboardAccessResult, RpcErrorCode  |

## **6.4 Changelog**

| **Version** |  **Date**  |                                                                            **Changes**                                                                             |
| :---------: | :--------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------: |
|   **1.0**   | 2026-03-08 | Initial release — all RPC contracts from Schema v5.0; Edge Functions: bulk-action, bulk-worker, bulk-export, export-report; full TypeScript interface definitions. |

EduZone Platform | Schema v5.0 | Page of
