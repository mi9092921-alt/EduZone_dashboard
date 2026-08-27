EduZone API Design Document v1.0  **|  CONFIDENTIAL**


**EduZone**

**API Design Document**

Admin & Management Dashboard — Edge Functions + RPC Contracts

*Version 1.0  |  2026-03-08  |  Schema v5.0*


|**Version**|1\.0|
| :- | :- |
|**Status**|**FINAL — Approved**|
|**Base URL**|*https://<project>.supabase.co*|
|**Auth**|Supabase JWT (Bearer) — every request|
|**Schema**|EduZone v5.0 (PostgreSQL 16)|


# **1. Overview & Architecture**
The EduZone Admin Dashboard communicates with two backend surfaces:

- Supabase RPC Functions — SECURITY DEFINER PostgreSQL functions called directly via the Supabase JS client (.rpc()). Used for all standard admin operations.
- Supabase Edge Functions — Deno serverless functions for operations that require the service\_role key, bulk processing, file generation, or cross-table transactions too complex for a single RPC.

**SECURITY:** The browser NEVER holds the service\_role key. Every Edge Function validates the caller's JWT and permission before executing.

## **1.1 Two-Surface Architecture**

|**Surface**|**Called From**|**Auth Key**|**Use Cases**|
| :-: | :-: | :-: | :-: |
|**Supabase RPC**|Browser (anon/authed)|anon key|CRUD, account actions, settings, feature flags, logging|
|**Edge Functions**|Browser → POST /functions/v1/\*|anon key + JWT|Bulk ops, exports, service\_role ops, report generation|

## **1.2 Request Lifecycle**
Browser → useQuery/useMutation (React Query)

`  `→ services/\*.service.ts  (typed wrapper)

`  `→ supabase.rpc('fn\_name', params)   OR   fetch('/functions/v1/action')

`  `→ PostgreSQL RPC / Deno Edge Function

`  `→ RLS + permission check  (user\_has\_permission / is\_current\_user\_admin)

`  `→ DB operation + log\_activity\_async

`  `→ Typed response → React Query cache update → UI

## **1.3 Authentication Headers**

|**Header**|**Value**|**Notes**|
| :-: | :-: | :-: |
|**Authorization**|*Bearer <access\_token>*|Supabase JWT from supabase.auth.getSession()|
|**Content-Type**|application/json|Required for Edge Functions|
|**x-request-id**|*<uuid v4>*|Generated client-side; attached to Sentry errors; logged in activity\_logs details|

## **1.4 Standard Error Envelope**
All RPC errors surface as PostgreSQL exceptions. The client parses them with parseRpcError():

{

`  `"code":    "ADMIN\_ONLY",          // RpcErrorCode union type

`  `"message": "Human-readable text", // shown in UI toast

`  `"detail":  "...",                 // optional extra context

`  `"hint":    "...",                 // optional fix hint

`  `"ref":     "<x-request-id>"       // for Sentry correlation

}

Edge Function errors use standard HTTP status codes + the same envelope:

HTTP 422  { "error": "INVALID\_FILTERS", "message": "...", "count": 0 }

HTTP 403  { "error": "PERMISSION\_DENIED", "message": "..." }

HTTP 429  { "error": "RATE\_LIMITED", "retry\_after": "<ISO8601>" }

HTTP 500  { "error": "INTERNAL\_ERROR", "ref": "<request-id>" }


# **2. RPC Function Contracts**
**NOTE:** All RPCs are invoked via supabase.rpc('function\_name', params). They are SECURITY DEFINER and run with DB-owner privileges while internally re-validating caller permissions.

## **2.1  check\_user\_access()**
Called on every app open and polled every 5 minutes to validate the user's session state.
### **Request**
await supabase.rpc('check\_user\_access')

No parameters. Uses auth.uid() internally.

### **Response — Success (allowed: true)**
{

`  `"allowed":           true,

`  `"role":              "admin",

`  `"tenant\_id":         "uuid",

`  `"maintenance\_bypass": false   // only present when maintenance\_mode=true

}

### **Response — Blocked (allowed: false)**
{

`  `"allowed":  false,

`  `"reason":   "account\_locked",   // see reason enum below

`  `"message":  "حسابك مقفل.",       // localised, from lock\_reason or settings\_kv

`  `"until":    "2026-04-01T...",    // present for account\_suspended only

`  `"ends\_at":  "2026-04-01T..."    // present for maintenance\_mode only

}

### **Reason Enum**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**app\_locked**|**200**|app\_locked=true in settings\_kv → show app-lock message, redirect to locked screen|
|**unauthenticated**|**200**|auth.uid() is NULL → redirect to /login|
|**user\_not\_found**|**200**|User row missing in users table → hard logout → /login|
|**account\_locked**|**200**|account\_status=locked → hard logout → /login?reason=session\_invalidated|
|**account\_suspended**|**200**|account\_status=suspended AND suspension\_until > NOW() → hard logout|
|**account\_banned**|**200**|account\_status=banned → hard logout → /login?reason=session\_invalidated|
|**maintenance\_mode**|**200**|maintenance\_mode=true AND user not excluded → show maintenance screen (NO logout)|

## **2.2  control\_user\_account(p\_user\_id, p\_action, p\_reason?, p\_suspend\_hours?)**
Performs lock / unlock / suspend / ban on a user account. Terminates all sessions for destructive actions.
### **Parameters**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_user\_id**|*UUID*|Target user. Must exist in users table.|
|**p\_action**|*TEXT*|Enum: "lock" | "unlock" | "suspend" | "ban"|
|**p\_reason**|*TEXT?*|Required for lock / suspend / ban. Min 5 chars. Stored in lock\_reason.|
|**p\_suspend\_hours**|*INT?*|Required for "suspend". Range: 1–720. Computes suspension\_until.|
### **TypeScript Call**
const { data, error } = await supabase.rpc('control\_user\_account', {

`  `p\_user\_id:       '<uuid>',

`  `p\_action:        'suspend',

`  `p\_reason:        'Violating platform rules',

`  `p\_suspend\_hours: 48,

});

### **Response (JSONB)**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**status**|*TEXT*|"locked" | "active" | "suspended" | "banned"|
|**until**|*TIMESTAMPTZ?*|Populated for "suspend"; null otherwise|

### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**ADMIN\_ONLY**|**PG 403**|Caller lacks admin role → show "Permission denied."|
|**INVALID\_ACTION**|**PG 422**|p\_action not in enum → Zod prevents client-side; log as critical if seen|
|**RPC\_TIMEOUT**|**504**|Response > 5s → "Action timed out. Check job queue."|
|**DB\_ERROR**|**PG 500**|Unexpected exception → show generic error + Sentry log with request\_id|

## **2.3  terminate\_user\_sessions(p\_user\_id, p\_reason?)**
### **Parameters**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_user\_id**|*UUID*|Target user|
|**p\_reason**|*TEXT?*|Stored in sessions.logout\_reason. Default: "admin\_force"|
### **TypeScript Call**
const { data: count, error } = await supabase.rpc('terminate\_user\_sessions', {

`  `p\_user\_id: '<uuid>',

`  `p\_reason:  'security\_review',

});
### **Response**
// INT — number of sessions terminated

// 0 is valid (user had no active sessions)
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**ADMIN\_ONLY**|**PG 403**|Not admin|
|**USER\_NOT\_FOUND**|**PG 404**|p\_user\_id not in users table → "User not found. Refresh."|

## **2.4  issue\_warning(p\_user\_id, p\_reason, p\_severity?, p\_action?)**
### **Parameters**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_user\_id**|*UUID*|Target user|
|**p\_reason**|*TEXT*|Warning reason. Min 20 chars.|
|**p\_severity**|*INT?*|Enum: 1 (Minor) | 2 (Moderate) | 3 (Severe). Default 1.|
|**p\_action**|*TEXT?*|Default "none". Optional: "suspend" | "lock"|
### **TypeScript Call**
const { data: warningId, error } = await supabase.rpc('issue\_warning', {

`  `p\_user\_id:  '<uuid>',

`  `p\_reason:   'Repeated policy violations in course forum',

`  `p\_severity: 2,

`  `p\_action:   'none',

});
### **Response**
// UUID — ID of the created warning record
### **Side Effects**
- Increments users.warning\_count.
- If warning\_count >= max\_warnings\_before\_action AND p\_action="none" → automatically calls control\_user\_account(p\_user\_id, "suspend", ..., 24).
- Logs activity via log\_activity\_async with risk\_level "medium".
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**PERMISSION\_DENIED**|**PG 403**|warnings.write permission missing|
|**AUTO\_SUSPEND**|**PG 200**|Auto-suspend triggered — treat as success + show info banner|

## **2.5  enroll\_student(p\_user\_id, p\_course\_id, p\_expires\_at?)**
### **Parameters**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_user\_id**|*UUID*|Student to enroll|
|**p\_course\_id**|*UUID*|Target course|
|**p\_expires\_at**|*TIMESTAMPTZ?*|Optional expiry. If NULL, enrollment never expires.|
### **TypeScript Call**
const { data: enrollmentId, error } = await supabase.rpc('enroll\_student', {

`  `p\_user\_id:   '<uuid>',

`  `p\_course\_id: '<uuid>',

`  `p\_expires\_at: new Date(Date.now() + 6\*30\*24\*3600\*1000).toISOString(),

});
### **Upsert Behaviour**
If the enrollment already exists (any status), it is updated to status="active" with the new enrolled\_at and expires\_at. This is intentional — re-enrollment is idempotent.
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**PERMISSION\_DENIED**|**PG 403**|courses.manage permission missing|
|**COURSE\_NOT\_FOUND**|**PG 404**|p\_course\_id not in courses table|

## **2.6  revoke\_enrollment(p\_user\_id, p\_course\_id, p\_reason?)**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_user\_id**|*UUID*|Student|
|**p\_course\_id**|*UUID*|Course|
|**p\_reason**|*TEXT?*|Stored in enrollments.revoke\_reason|
### **TypeScript Call**
await supabase.rpc('revoke\_enrollment', {

`  `p\_user\_id:   '<uuid>',

`  `p\_course\_id: '<uuid>',

`  `p\_reason:    'Non-payment',

});
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**PERMISSION\_DENIED**|**PG 403**|courses.manage missing|
|**ALREADY\_REVOKED**|**PG 200**|Enrollment already revoked → treat as success, show info toast|
|**NOT\_FOUND**|**PG 404**|No matching enrollment row|

## **2.7  get\_setting(p\_key) / set\_setting(p\_key, p\_value)**
### **get\_setting — TypeScript**
const { data: value } = await supabase.rpc('get\_setting', { p\_key: 'max\_devices\_per\_user' });

// Returns TEXT. Client casts based on value\_type from settings\_kv.

### **set\_setting — TypeScript**
await supabase.rpc('set\_setting', {

`  `p\_key:   'max\_devices\_per\_user',

`  `p\_value: '2',

});
### **Side Effects of set\_setting**
- Invalidates settings\_cache for the key (sets expires\_at = NOW()-1s).
- Inserts into cache\_invalidation\_queue.
- Fires pg\_notify('cache\_invalidation', { type:'settings', key, value }).
- Frontend useRealtimeSettingsSync() receives notification → invalidates React Query cache.
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**ADMIN\_ONLY**|**PG 403**|Not admin|
|**SETTING\_NOT\_FOUND**|**PG 404**|Key does not exist in settings\_kv → "Unknown setting key."|

## **2.8  bind\_device\_for\_current\_user(p\_device\_id, p\_device\_info?, p\_platform?)**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_device\_id**|*TEXT*|Unique device identifier. Non-empty string required.|
|**p\_device\_info**|*JSONB?*|Device metadata: model, OS, app version.|
|**p\_platform**|*TEXT?*|"android" | "ios" | "web"|
### **TypeScript Call**
const { data } = await supabase.rpc('bind\_device\_for\_current\_user', {

`  `p\_device\_id:   deviceFingerprint,

`  `p\_device\_info: { model: 'iPhone 15', os: 'iOS 17', app: '1.0.0' },

`  `p\_platform:    'ios',

});
### **Response (JSONB)**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**status**|*"bound" | "verified"*|bound = new device added; verified = existing device refreshed|
### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**AUTH\_REQUIRED**|**PG 401**|auth.uid() is NULL|
|**INVALID\_DEVICE\_ID**|**PG 422**|Empty or whitespace-only device\_id|
|**DEVICE\_ALREADY\_BOUND**|**PG 409**|device\_id registered to a different user|
|**MAX\_DEVICES\_REACHED**|**PG 429**|Active devices >= max\_devices\_per\_user setting|
|**RATE\_LIMITED**|**PG 429**|device\_bind rate limit hit (3 attempts / 24h)|

## **2.9  flush\_activity\_logs(p\_batch\_size?)**
const { data: count } = await supabase.rpc('flush\_activity\_logs', { p\_batch\_size: 200 });

Moves records from activity\_log\_queue into activity\_logs with cryptographic hash chaining.

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**(return)**|*INT*|Number of log entries flushed in this call|
|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
|**LOCK\_CONTENTION**|**PG 500**|Advisory lock held by concurrent worker → retry after 60s|

## **2.10  check\_rate\_limit(p\_action, p\_user\_id?, p\_ip?, p\_device\_id?)**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**p\_action**|*TEXT*|Rate limit rule key: "login" | "api\_call" | "device\_bind" | "password\_reset" | "warning\_issue"|
|**p\_user\_id**|*UUID?*|Optional — identifies the user dimension|
|**p\_ip**|*INET?*|Optional — client IP address|
|**p\_device\_id**|*TEXT?*|Optional — device identifier|
### **Response (JSONB)**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**allowed**|*BOOLEAN*|true if under limit|
|**hits**|*INT?*|Current hit count in window (present if allowed)|
|**max**|*INT?*|Max allowed hits in window|
|**reason**|*TEXT?*|"rate\_limited" if blocked|
|**retry\_after**|*TIMESTAMPTZ?*|When block expires|

## **2.11  Remaining RPC Quick Reference**

|**Function**|**Returns**|**Key Behaviour**|
| :-: | :-: | :-: |
|***logout\_current\_user()***|VOID|Sets all sessions is\_active=false; increments token\_version|
|***reset\_user\_device(p\_user\_id)***|VOID|Sets all devices is\_active=false for user; logs activity|
|***rebuild\_permission\_cache(p\_user\_id, p\_tenant\_id?)***|VOID|Deletes + re-inserts user\_permission\_cache; fires pg\_notify|
|***enable\_maintenance\_mode(msg, ends\_at?, roles?, users?)***|VOID|Calls set\_setting for 5 keys; logs with risk\_level high|
|***disable\_maintenance\_mode()***|VOID|Sets maintenance\_mode=false; logs activity|
|***lock\_app\_for\_all(p\_message)***|VOID|Sets app\_locked=true; logs with risk\_level critical|
|***unlock\_app()***|VOID|Sets app\_locked=false; logs activity|
|***is\_feature\_enabled(p\_key, p\_user\_id?)***|BOOLEAN|Checks flag, dates, role/user overrides; no permission check required|
|***dequeue\_job(worker\_id, types?, ttl\_sec?)***|SETOF job\_queue|Claims one pending job; sets status=processing; returns job row|
|***release\_stale\_job\_locks()***|INT|Resets status=pending for jobs where lock\_expires\_at < NOW()|
|***log\_activity\_async(uid, type, details?, ip?, device?, risk?, tenant?)***|UUID|Non-blocking insert to activity\_log\_queue; notifies on high/critical|


# **3. Edge Function Contracts**
**AUTH:** Every Edge Function validates the Bearer JWT using \_shared/auth.ts. Service-role operations use \_shared/supabaseAdmin.ts (Deno env only — never exposed to browser).

## **3.1  POST /functions/v1/bulk-action**
` `**POST   /functions/v1/bulk-action**

Validates and queues a bulk admin operation. Returns immediately with a job\_id. Actual processing is asynchronous via the bulk-worker function.

### **Request Body**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**action**|*string*|"bulk\_lock"|"bulk\_suspend"|"bulk\_warn"|"bulk\_enroll"|"bulk\_revoke"|"bulk\_terminate\_sessions"|"bulk\_reset\_devices"|"bulk\_export"|
|**filters**|*object*|{ tenant\_id?, user\_ids?, role?, account\_status?, warning\_count\_gte? } — server re-validates; max 500 user\_ids|
|**params**|*object*|Action-specific. See params table below.|
|**priority**|*number?*|job\_queue priority 1–10. Default 5.|
|**dry\_run**|*boolean?*|If true: returns estimated\_count without inserting a job.|

### **TypeScript Call**
const res = await fetch('/functions/v1/bulk-action', {

`  `method: 'POST',

`  `headers: { Authorization: `Bearer ${session.access\_token}`,

`             `'Content-Type': 'application/json' },

`  `body: JSON.stringify({

`    `action:   'bulk\_suspend',

`    `filters:  { tenant\_id: '<uuid>', account\_status: 'active' },

`    `params:   { reason: 'Policy violation', suspend\_hours: 24 },

`    `dry\_run:  false,

`    `priority: 7,

`  `}),

});

const { job\_id, estimated\_count } = await res.json();

### **Response**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**job\_id**|*string*|UUID of the created job\_queue record (null if dry\_run=true)|
|**action**|*string*|Echo of requested action|
|**estimated\_count**|*number*|Users that match the filters|
|**status**|*string*|"pending" (null if dry\_run=true)|
|**created\_at**|*string*|ISO8601 timestamp|

### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**PAYLOAD\_TOO\_LARGE**|**422**|user\_ids.length > 500 → "Select up to 500 users at a time."|
|**PERMISSION\_DENIED**|**403**|JWT lacks required permission for action|
|**INVALID\_FILTERS**|**422**|filters produce 0 matching rows → "No users match selected filters."|
|**JOB\_QUEUE\_FULL**|**503**|pending job\_queue count > 10,000 → retry in a few minutes|
|**DRY\_RUN\_ZERO**|**200**|dry\_run=true, count=0 → show info: "No users would be affected."|

### **Params Object by Action**

|**action**|**Required params**|**Optional params**|
| :-: | :-: | :-: |
|**bulk\_lock**|*reason: string*|—|
|**bulk\_suspend**|*reason: string, suspend\_hours: number*|—|
|**bulk\_warn**|*reason: string, severity: 1|2|3*|action: string|
|**bulk\_enroll**|*course\_id: string*|expires\_at: ISO8601|
|**bulk\_revoke**|*course\_id: string*|reason: string|
|**bulk\_terminate\_sessions**|*—*|—|
|**bulk\_reset\_devices**|*—*|—|
|**bulk\_export**|*export\_format: "json"|"csv"*|—|

## **3.2  POST /functions/v1/bulk-worker  (internal — cron-triggered)**
` `**POST   /functions/v1/bulk-worker**

Triggered by Supabase pg\_cron every 60 seconds. Claims one pending bulk job and processes it in batches of 50 records.
### **Processing Loop**
1\. dequeue\_job('bulk-worker', BULK\_TYPES, 1800)

2\. Parse job.payload: { filters, params, initiator\_id }

3\. Query matching user\_ids from filters (service\_role, bypasses RLS)

4\. For each batch of 50:

`   `a. Execute per-user RPC (service\_role client)

`   `b. Collect failures in failed\_ids[]

`   `c. pg\_notify('job\_progress', { job\_id, processed, total, failed\_ids })

5\. UPDATE job\_queue SET status='done', error\_msg=JSON({ processed, failed\_ids })

6\. On exception: retry if attempts < max\_attempts, else status='dead'

**NOTE:** The bulk-worker uses the service\_role client to bypass RLS and call RPCs on behalf of the initiator\_id. Every per-user action is still logged via log\_activity\_async with the initiator as the actor.

## **3.3  POST /functions/v1/bulk-export  (triggered by bulk-worker)**
` `**POST   /functions/v1/bulk-export**

Collects all data for filtered users and uploads a JSON or CSV archive to Supabase Storage. Returns a signed URL with 1-hour TTL.

### **Request Body**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**job\_id**|*string*|The bulk\_export job\_queue ID|
|**filters**|*object*|Same filters object from the original bulk-action request|
|**export\_format**|*string*|"json" | "csv"|
|**tenant\_id**|*string*|Scopes the Storage path|

### **TypeScript Call**
// Triggered internally by bulk-worker — not called from browser directly.

// Browser polls job\_queue for status='done' then reads error\_msg.download\_url.

const job = await supabase

.from('job\_queue')

.select('status, error\_msg')

.eq('id', jobId)

.single();

if (job.data.status === 'done') {

`  `const { download\_url } = JSON.parse(job.data.error\_msg);

`  `window.open(download\_url, '\_blank');

}

### **Response**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**download\_url**|*string*|Signed Supabase Storage URL|
|**expires\_at**|*string*|ISO8601 — 1 hour from generation|
|**record\_count**|*number*|Number of users included in export|
|**file\_size\_kb**|*number*|Approximate file size|

### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**EXPORT\_EMPTY**|**422**|0 users match filters → "No data to export."|
|**STORAGE\_ERROR**|**500**|Supabase Storage upload failed → retry job|
|**TIMEOUT**|**504**|Processing > 25s → job split into smaller batches (future)|

## **3.4  POST /functions/v1/export-report**
` `**POST   /functions/v1/export-report**

Generates a CSV or PDF analytics report from materialised views. Requires reports.read permission.

### **Request Body**

|**Field**|**Type**|**Description**|
| :-: | :-: | :-: |
|**report\_type**|*string*|"user\_stats" | "course\_stats" | "activity" | "geographic"|
|**format**|*string*|"csv" | "pdf"|
|**tenant\_id**|*string?*|Scope to tenant. Required for admin; optional for super\_admin.|
|**date\_from**|*string?*|ISO8601 start date filter|
|**date\_to**|*string?*|ISO8601 end date filter|

### **TypeScript Call**
const res = await fetch('/functions/v1/export-report', {

`  `method: 'POST',

`  `headers: { Authorization: `Bearer ${session.access\_token}`, 'Content-Type': 'application/json' },

`  `body: JSON.stringify({

`    `report\_type: 'user\_stats',

`    `format:      'csv',

`    `tenant\_id:   tenantId,

`    `date\_from:   '2026-01-01',

`    `date\_to:     '2026-03-08',

`  `}),

});

const { download\_url } = await res.json();

window.open(download\_url, '\_blank');

### **Response**

|**Field**|**Type**|**Notes**|
| :-: | :-: | :-: |
|**download\_url**|*string*|Signed URL (1-hour TTL) or streaming response for small reports|
|**expires\_at**|*string*|ISO8601|
|**row\_count**|*number*|Number of data rows in the report|

### **Error Codes**

|**Error Code**|**HTTP / PG**|**Condition + UI Action**|
| :-: | :-: | :-: |
|**PERMISSION\_DENIED**|**403**|reports.read permission missing|
|**EMPTY\_REPORT**|**422**|No data for the given filters|
|**INVALID\_DATE**|**422**|date\_from > date\_to or invalid format|


# **4. Realtime Channels & Subscriptions**
Supabase Realtime is used for three purposes: cache invalidation, security alerts, and job progress updates.

|**Channel / Table**|**Trigger**|**Listener**|**Action on Receipt**|
| :-: | :-: | :-: | :-: |
|**pg\_notify: cache\_invalidation**|*set\_setting() / rebuild\_permission\_cache()*|useRealtimeSettingsSync|Invalidate React Query key: queryKeys.settings.all or queryKeys.users.permissions|
|**pg\_notify: security\_alert**|*log\_activity\_async with risk high/critical*|RealtimeToast (layout)|Add alert to realtime.store; increment unread badge; show Snackbar|
|**pg\_notify: job\_progress**|*bulk-worker after each batch*|BulkProgressPanel|Update processed/total progress bar; render failed\_ids count|
|**Table: users (UPDATE)**|*Any account\_status / token\_version change*|useUserRealtime hook|setQueryData to update row in DataGrid; highlight row briefly|
|**Table: job\_queue (UPDATE)**|*Any status change*|useJobRealtime hook|Update job status chip; trigger summary toast on done/failed|
|**Table: activity\_log\_queue (INSERT)**|*log\_activity\_async call*|LiveActivityStream|Prepend event to feed; auto-pause at 200 items|

## **4.1 TypeScript Subscription Pattern**
// Cache invalidation — in useRealtimeSettingsSync hook

const channel = supabase

.channel('cache\_invalidation')

.on('broadcast', { event: '\*' }, (payload) => {

`    `if (payload.type === 'settings') {

`      `queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });

`    `}

`    `if (payload.type === 'permissions') {

`      `queryClient.invalidateQueries({

`        `queryKey: queryKeys.users.permissions(payload.user\_id)

`      `});

`    `}

`  `})

.subscribe();

// Security alerts — in RealtimeToast component

supabase

.channel('security\_alert')

.on('broadcast', { event: '\*' }, (payload) => {

`    `realtimeStore.addAlert({

`      `type:    payload.type,

`      `user\_id: payload.user,

`      `risk:    payload.risk,

`      `ts:      new Date().toISOString(),

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

export type PrimaryRole    = 'super\_admin' | 'admin' | 'teacher' | 'student';

export type RiskLevel      = 'low' | 'medium' | 'high' | 'critical';

export type Platform       = 'android' | 'ios' | 'web';

export type JobStatus      = 'pending'|'processing'|'done'|'failed'|'dead';

export type EnrollStatus   = 'active'|'revoked'|'expired'|'completed';

export interface AuthUser {

`  `id:            string;

`  `email:         string;

`  `primary\_role:  PrimaryRole;

`  `tenant\_id:     string;

`  `token\_version: number;

}

export interface User {

`  `id:               string;

`  `email:            string | null;

`  `first\_name:       string | null;

`  `last\_name:        string | null;

`  `primary\_role:     PrimaryRole;

`  `account\_status:   AccountStatus;

`  `lock\_reason:      string | null;

`  `locked\_at:        string | null;

`  `suspension\_until: string | null;

`  `warning\_count:    number;

`  `last\_login:       string | null;

`  `shard\_key:        number;

`  `tenant\_id:        string;

`  `region\_id:        string;

}

## **5.2 RPC Request / Response Types**
// packages/types/src/rpc.types.ts

export type CheckUserAccessResult =

`  `| { allowed: true;  role: PrimaryRole; tenant\_id: string; maintenance\_bypass?: true }

`  `| { allowed: false; reason: AccessDeniedReason; message?: string;

`      `until?: string; ends\_at?: string };

export type AccessDeniedReason =

`  `| 'app\_locked' | 'unauthenticated' | 'user\_not\_found'

`  `| 'account\_locked' | 'account\_suspended' | 'account\_banned'

`  `| 'maintenance\_mode';

export type ControlUserAccountResult = {

`  `status: AccountStatus;

`  `until:  string | null;

};

export type BindDeviceResult = {

`  `status: 'bound' | 'verified';

};

export type CheckRateLimitResult =

`  `| { allowed: true;  hits: number; max: number }

`  `| { allowed: false; reason: 'rate\_limited'; retry\_after: string };

## **5.3 Error Types**
// packages/types/src/errors.types.ts

export type RpcErrorCode =

`  `| 'ADMIN\_ONLY'            | 'INVALID\_ACTION'       | 'RPC\_TIMEOUT'

`  `| 'DB\_ERROR'             | 'USER\_NOT\_FOUND'       | 'PERMISSION\_DENIED'

`  `| 'AUTO\_SUSPEND'         | 'DUPLICATE'            | 'ALREADY\_REVOKED'

`  `| 'COURSE\_NOT\_FOUND'     | 'NOT\_FOUND'            | 'SETTING\_NOT\_FOUND'

`  `| 'AUTH\_REQUIRED'        | 'INVALID\_DEVICE\_ID'    | 'DEVICE\_ALREADY\_BOUND'

`  `| 'MAX\_DEVICES\_REACHED'  | 'RATE\_LIMITED'         | 'LOCK\_CONTENTION'

`  `| 'NO\_JOBS'             | 'ENDS\_AT\_PAST';

export interface RpcError {

`  `code:    RpcErrorCode;

`  `message: string;         // Human-readable; show in toast

`  `detail?: string;         // Technical detail; log to Sentry

`  `ref?:    string;         // x-request-id for correlation

}

export function parseRpcError(error: unknown): RpcError {

`  `// Parses PostgreSQL RAISE EXCEPTION message format:

`  `// "ADMIN\_ONLY" or "SETTING\_NOT\_FOUND: max\_devices\_per\_user"

`  `const msg  = (error as any)?.message ?? '';

`  `const code = msg.split(':')[0].trim() as RpcErrorCode;

`  `return { code, message: ERROR\_MESSAGES[code] ?? 'Unexpected error.', detail: msg };

}

## **5.4 Query Key Factory**
// apps/web/src/lib/rpc/keys.ts

export const queryKeys = {

`  `users: {

`    `all:         () => ['users']                        as const,

`    `list:        (f: UserFilters) => ['users','list',f] as const,

`    `detail:      (id: string)     => ['users',id]       as const,

`    `devices:     (id: string)     => ['users',id,'devices']     as const,

`    `sessions:    (id: string)     => ['users',id,'sessions']    as const,

`    `warnings:    (id: string)     => ['users',id,'warnings']    as const,

`    `permissions: (id: string)     => ['users',id,'permissions'] as const,

`  `},

`  `courses: {

`    `all:      () => ['courses']                          as const,

`    `list:     (f: CourseFilters) => ['courses','list',f] as const,

`    `detail:   (id: string)       => ['courses',id]       as const,

`    `analytics:(id: string)       => ['courses',id,'analytics'] as const,

`  `},

`  `settings: { all: () => ['settings'] as const },

`  `flags:    { all: () => ['flags']    as const },

`  `audit:    { list:(f:AuditFilters) => ['audit','list',f] as const },

`  `jobs:     { list:(f:JobFilters)   => ['jobs','list',f]  as const },

`  `tenants:  { all: () => ['tenants'] as const,

`             `detail:(id:string)    => ['tenants',id]     as const },

`  `analytics:{ userStats:  (tid?:string) => ['mv','user\_stats',tid]   as const,

`              `courseStats:(cid?:string) => ['mv','course\_stats',cid] as const,

`              `daily:      (tid?:string) => ['mv','daily',tid]        as const },

} as const;


# **6. Versioning, Conventions & Changelog**
## **6.1 RPC Versioning Strategy**
Supabase RPC functions are versioned by name suffix when breaking changes are needed:

-- Non-breaking: update the function body in-place

-- Breaking: create new function with \_v2 suffix

CREATE OR REPLACE FUNCTION control\_user\_account\_v2(...) ...

-- Keep v1 alive for 2 sprints, then deprecate

The client services layer abstracts the version:

// services/users.service.ts

const FN = process.env.NEXT\_PUBLIC\_APP\_ENV === 'production'

`  `? 'control\_user\_account'    // stable

`  `: 'control\_user\_account\_v2'; // canary

## **6.2 Edge Function Versioning**
- URL path does NOT include a version prefix — function name changes for breaking versions.
- All Edge Functions return X-Function-Version header for debugging.
- Backward-compatible changes (new optional fields) are deployed in-place.

## **6.3 Naming Conventions**

|**Entity**|**Convention**|**Example**|
| :-: | :-: | :-: |
|**RPC function**|*snake\_case verb\_noun*|control\_user\_account, flush\_activity\_logs|
|**RPC parameter**|*p\_ prefix + snake\_case*|p\_user\_id, p\_suspend\_hours|
|**Edge Function URL**|*kebab-case, singular noun*|/bulk-action, /export-report|
|**Query key**|*camelCase nested factory*|queryKeys.users.detail(id)|
|**Service function**|*camelCase verb + noun*|controlUserAccount, issueWarning|
|**Error code**|*SCREAMING\_SNAKE\_CASE*|ADMIN\_ONLY, MAX\_DEVICES\_REACHED|
|**TypeScript type**|*PascalCase + descriptive*|CheckUserAccessResult, RpcErrorCode|

## **6.4 Changelog**

|**Version**|**Date**|**Changes**|
| :-: | :-: | :-: |
|**1.0**|2026-03-08|Initial release — all RPC contracts from Schema v5.0; Edge Functions: bulk-action, bulk-worker, bulk-export, export-report; full TypeScript interface definitions.|

EduZone Platform  |  Schema v5.0  |  Page  of 
