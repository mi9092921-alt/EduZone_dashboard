EduZone Admin & Management Dashboard — PRD v2.0 **| CONFIDENTIAL**

**EduZone**

**Admin & Management Dashboard**

Product Requirements Document

_Version 2.0 — FAANG-Grade Specification_

Based on EduZone Schema v5.0 | 2026-03-08

| **Version** | 2\.0                                               |
| :---------- | :------------------------------------------------- |
| **Date**    | 2026-03-08                                         |
| **Status**  | FINAL — Approved for Development                   |
| **Author**  | PM Team — EduZone Platform                         |
| **Schema**  | EduZone Schema v5.0 (PostgreSQL 16 / Supabase Pro) |

# **1. Executive Summary**

The EduZone Admin & Management Dashboard is the centralised control plane for platform administrators, tenant managers, and instructors. It provides real-time visibility, granular access control, and advanced analytics across all EduZone deployments.

Built on React 18 + TypeScript with a Material-UI + Tailwind interface, the dashboard leverages Supabase v5 for authentication, row-level security (RLS), realtime subscriptions, and secure RPC calls. All sensitive operations are routed through SECURITY DEFINER RPC functions or Supabase Edge Functions — the browser never holds a service_role key.

## **1.1 Key Objectives**

- Enable super-admins to manage global settings, feature flags, tenants, and system health across all regions.
- Empower tenant administrators to control users, courses, enrollments, warnings, and access rules within their isolated domain.
- Provide real-time monitoring of platform activity, rate limits, audit trails, and job queues.
- Deliver actionable analytics through materialised views and interactive charts.
- Enforce zero-trust security: every request validates JWT, token_version, and RLS policies.
- Guarantee full audit immutability via cryptographic hash-chain in activity_logs.

## **1.2 What Is New in v2.0**

- FR-AUTH-TOKEN: Complete token_version mismatch detection, refresh, and forced-logout flow.
- Section 6: Dedicated Teacher Dashboard — full specification of what teachers see and can do.
- Section 7: Bulk Operations — detailed API contracts for all bulk admin actions.
- Section 8: Error States Catalogue — every admin action maps to defined error codes and UI behaviour.
- FR-ACCESS expanded: device-bind rate limits, geo-restriction enforcement, and session risk scoring.
- NFR additions: GDPR data-export SLA, audit-chain verification cron, accessibility WCAG 2.1 AA.

# **2. Product Overview**

## **2.1 Product Vision**

To become the single pane of glass for managing EduZone's multi-tenant, multi-region ecosystem — offering unmatched control and insight while maintaining enterprise-grade security and performance at FAANG scale.

## **2.2 Scope — Functional Domains**

|      **Domain**       |                                       **Key Entities & Tables**                                        |
| :-------------------: | :----------------------------------------------------------------------------------------------------: |
| **Tenant Management** |                                            tenants, regions                                            |
|  **User Management**  |            users, user_roles, devices, sessions, warnings, push_tokens, user_location_logs             |
|  **Access Control**   |               roles, permissions, role_permissions, user_permission_cache, access_rules                |
| **Course Management** |                  courses, enrollments, sections, lessons, user_progress, video_views                   |
|  **System Settings**  |           settings_kv, settings_cache, feature_flags, feature_flag_roles, feature_flag_users           |
| **Monitoring & Ops**  | activity_logs, activity_log_queue, rate_limits, job_queue, audit_chain_state, cache_invalidation_queue |
|     **Analytics**     |                 mv_user_stats, mv_course_stats, mv_daily_activity (materialised views)                 |
|     **Security**      |                rate_limit_rules, rate_limits, sessions (partitioned), audit_chain_state                |

## **2.3 Target Users**

| **Persona** | **DB Role** |                            **Primary Goals**                            |
| :---------: | :---------: | :---------------------------------------------------------------------: |
|  **Ahmed**  | super_admin | Global ops: all tenants, regions, system health, feature flags, audit.  |
|  **Layla**  |    admin    |    Tenant ops: users, courses, enrollments, warnings, access rules.     |
|  **Omar**   |   teacher   | Instructor: own courses, student progress, warnings, limited analytics. |

# **3. Authentication, Session & Token-Version Management**

## **3.1 Standard Authentication Flow**

- FR-AUTH-01: Dashboard uses Supabase Auth (email/password + optional MFA). Only users with super_admin, admin, or teacher role may access.
- FR-AUTH-02: On first successful login, the frontend calls check_user_access() to verify account_status, maintenance_mode, and app_locked state before rendering any dashboard content.
- FR-AUTH-03: The Supabase JWT is stored in memory only (no localStorage). The refresh token is stored in an HttpOnly cookie managed by Supabase.
- FR-AUTH-04: Multi-Factor Authentication (MFA) is enforced for all super_admin and admin accounts. Teachers may optionally enroll.

## **3.2 Token-Version Mismatch Handling (NEW — FR-AUTH-TOKEN)**

**IMPORTANT:** token_version in the users table is incremented on every forced logout, account lock/ban, or password reset. A valid JWT with a stale token_version must be rejected immediately, even if it has not expired.

### **3.2.1 How token_version Is Used**

Every RLS policy that reads users.token_version does so implicitly through check_user_access(). The dashboard must additionally enforce this on the client side to give instant feedback.

### **3.2.2 Detection — FR-AUTH-TV-01**

- After every successful Supabase Auth session refresh, the frontend calls check_user_access() and inspects the response.
- Any RPC that returns { allowed: false, reason: "account_locked" | "account_banned" | "account_suspended" } is treated as a token_version mismatch trigger.
- HTTP 401 responses from Supabase with error code PGRST301 ("JWT expired") or a custom claim mismatch must be caught globally in the React Query error handler.

### **3.2.3 Client-Side Token Store — FR-AUTH-TV-02**

The auth.store (Zustand) holds { user_id, token_version, primary_role, tenant_id }. On every API call response, if the server returns a token_version higher than the local store, the mismatch handler fires.

### **3.2.4 Mismatch Handler Flow — FR-AUTH-TV-03**

1. Global React Query onError intercepts the relevant error codes.
1. The Zustand auth store is cleared (setUser(null)).
1. Supabase client calls supabase.auth.signOut() to revoke the refresh token locally.
1. The user is redirected to /login with a query parameter ?reason=session_invalidated.
1. The login page displays a localised banner: "Your session was ended by an administrator. Please sign in again."
1. The event is logged client-side to Sentry with severity "warning" for observability.

### **3.2.5 Silent Refresh vs. Hard Logout — FR-AUTH-TV-04**

If check_user_access() returns { allowed: false, reason: "maintenance_mode" | "maintenance_bypass": true }, the session is NOT invalidated — the user is shown the maintenance screen but stays authenticated. Only account_locked, account_banned, account_suspended, and user_not_found trigger a hard logout.

### **3.2.6 Error UI — FR-AUTH-TV-05**

|       **Reason**        |                     **UI Behaviour**                      |                    **User Message**                    |
| :---------------------: | :-------------------------------------------------------: | :----------------------------------------------------: |
|   **account_locked**    |                   Hard logout → /login                    |    "Your account has been locked. Contact support."    |
|   **account_banned**    |                   Hard logout → /login                    |     "Your account has been permanently suspended."     |
|  **account_suspended**  |                   Hard logout → /login                    | "Your account is suspended until [suspension\_until]." |
|   **user_not_found**    |                   Hard logout → /login                    |    "Account not found. Contact your administrator."    |
|     **JWT expired**     | Silent refresh attempt, then hard logout if refresh fails |        "Session expired. Please sign in again."        |
| **token_version stale** |                   Hard logout → /login                    |     "Your session was ended by an administrator."      |

## **3.3 Session Timeout & Device Limits**

- FR-AUTH-ST-01: The session_timeout_minutes setting (default: 1440) defines inactivity timeout. The frontend tracks last user interaction and calls logout_current_user() on timeout.
- FR-AUTH-ST-02: max_devices_per_user (default: 1) is enforced via bind_device_for_current_user(). If MAX_DEVICES_REACHED is returned, the user sees: "Device limit reached. Please remove an existing device to continue."
- FR-AUTH-ST-03: If force_single_session = true, any new session creation invalidates all previous sessions by calling terminate_user_sessions() before creating the new one.

# **4. Super-Admin & Admin Features**

## **4.1 Global Dashboard (Home)**

- FR-DASH-01: Display KPI cards from mv_user_stats (total_users, active_users, dau, wau, mau) and mv_course_stats (enrolled, completed, avg_progress, total_views).
- FR-DASH-02: Activity heatmap from mv_daily_activity: hourly event_count per activity_type, colour-coded by risk_level.
- FR-DASH-03: System health bar: job_queue depth (pending + processing), stale locks count, and count of rate_limit records with blocked_until > NOW().
- FR-DASH-04: Real-time security alert panel — subscribes to the security_alert pg_notify channel and displays high/critical events as dismissible toast notifications with drill-down link to the relevant user in Audit Logs.
- FR-DASH-05 (super_admin only): Multi-region health summary — one row per region showing latency, active tenant count, and any suspended tenants.

## **4.2 Tenant Management (super_admin only)**

- FR-TENANT-01: List all tenants (excluding deleted_at IS NOT NULL) with search by name/slug, filter by region and plan, sort by created_at or current_users.
- FR-TENANT-02: Tenant detail card: slug, name, plan badge, region_id, shard_id, resource usage bars (current_users/max_users, current_courses/max_courses, current_storage_bytes/max_storage_bytes).
- FR-TENANT-03: Create tenant — required fields: slug (unique, validated against existing), name, plan, region_id, max_users, max_courses, max_storage_bytes.
- FR-TENANT-04: Suspend tenant — sets status = "suspended", calls terminate_user_sessions for all tenant users via job_queue bulk action. Requires confirmation dialog with tenant name re-entry.
- FR-TENANT-05: Delete tenant — soft delete (deleted_at = NOW()). Only super_admin. Irreversible from UI.
- FR-TENANT-06: Tenant audit log tab — activity_logs filtered by tenant_id, same UI as global audit but scoped.

## **4.3 User Management**

- FR-USER-01: List users with filters: tenant, primary_role, account_status, region_id, warning_count range, last_login date range. Server-side pagination (50/page default). Column sort on email, primary_role, account_status, last_login, warning_count.
- FR-USER-02: User profile drawer (right-side slide-in) with tabs: Overview, Activity, Enrollments, Security, Permissions.
- FR-USER-03: User actions via ConfirmDialog with mandatory reason field for destructive actions:
  - lock — calls control_user_account(id, "lock", reason). Sets account_status = "locked" and terminates sessions.
  - unlock — calls control_user_account(id, "unlock"). Clears lock_reason and suspension_until.
  - suspend — calls control_user_account(id, "suspend", reason, hours). Requires duration input (min 1h, max 720h).
  - ban — calls control_user_account(id, "ban", reason). Permanent. Requires typed confirmation "BAN".
  - terminate_sessions — calls terminate_user_sessions(id). Returns session count terminated.
  - reset_device — calls reset_user_device(id). Deactivates all devices.
  - issue_warning — calls issue_warning(id, reason, severity, action). Severity 1-3 selector; optional action field.
- FR-USER-04: Real-time status badge updates via Supabase Realtime on the users table (account_status column changes).
- FR-USER-05: GDPR export — admin can trigger a data export job for a specific user. Edge function collects all user data across tables and returns a JSON archive via download link. SLA: generated within 30 minutes.

## **4.4 Role & Permission Management**

- FR-RBAC-01: List all roles (global system roles + tenant-scoped custom roles) with their assigned permissions shown as chips.
- FR-RBAC-02: Create custom role for a tenant — name (unique per tenant), label (Arabic), priority (0–99). System roles (is_system = true) are read-only.
- FR-RBAC-03: Assign/remove permissions to/from a role via checklist grouped by resource. Changes insert/delete from role_permissions.
- FR-RBAC-04: Assign role to user — inserts into user_roles with optional expires_at. Triggers trg_ur_role (syncs primary_role) and trg_ur_cache (queues permission rebuild).
- FR-RBAC-05: Manual permission cache rebuild — calls rebuild_permission_cache(user_id). Shows job status from job_queue.
- FR-RBAC-06: Effective permissions panel — shows user_permission_cache for a user with cached_at and expires_at timestamps.

## **4.5 Course & Enrollment Management**

- FR-COURSE-01: List courses with filters: tenant, status (draft/published/archived), category, level, is_free. Full-text search uses immutable_tsvector(title) index via plainto_tsquery.
- FR-COURSE-02: Course detail: title, description, teacher_id (searchable user selector), category, level, price, thumbnail_url. Sections accordion with lesson ordering (drag-to-reorder via order_index update).
- FR-COURSE-03: Publish/archive course — updates status. Archived courses hide from enrolled-user RLS policy.
- FR-COURSE-04: Enroll student — calls enroll_student(user_id, course_id, expires_at). Optional expiry date picker.
- FR-COURSE-05: Revoke enrollment — calls revoke_enrollment(user_id, course_id, reason). Sets status = "revoked".
- FR-COURSE-06: Course analytics tab: total views (video_views), avg watch time, progress distribution histogram (user_progress), completion rate (mv_course_stats).

## **4.6 System Settings**

- FR-SETTINGS-01: Settings are grouped by category (security, maintenance, limits, general) from settings_kv. Each row shows key, label (Arabic), current value, value_type, is_public, and version.
- FR-SETTINGS-02: Inline editing with type-aware inputs: toggle for boolean, number input for integer, JSON editor for json, text field for string. All saves go through set_setting(key, value) RPC which atomically invalidates the cache and fires pg_notify.
- FR-SETTINGS-03: Maintenance Mode Wizard — multi-step: (1) Enable/Disable toggle, (2) Message text area, (3) Ends-at datetime picker, (4) Excluded roles multi-select, (5) Excluded users search. Calls enable_maintenance_mode() or disable_maintenance_mode().
- FR-SETTINGS-04: App Lock — single-click lock_app_for_all(message) with confirmation dialog. Banner shown when app_locked = true.
- FR-SETTINGS-05: Feature Flags — list all flags with is_enabled toggle, rollout_pct slider, starts_at/ends_at pickers. Per-flag role/user override tables (feature_flag_roles, feature_flag_users) with include/exclude toggle.

## **4.7 Monitoring & Audit**

- FR-MONITOR-01: Audit log viewer — searchable by user_id (email search), activity_type, risk_level, created_at range. Shows seq, entry_hash (truncated), prev_hash link for tamper evidence. "Verify chain" button triggers client-side SHA-256 recomputation against audit_chain_state.last_hash.
- FR-MONITOR-02: Rate limit dashboard — active blocks (blocked_until > NOW()), top offenders by hit_count, rule table (rate_limit_rules) with current configuration.
- FR-MONITOR-03: Job queue — tabs: Pending, Processing, Done, Failed, Dead. Retry button for failed jobs (resets status = "pending", increments max_attempts). Cancel button (status = "dead").
- FR-MONITOR-04: Live activity stream — Supabase Realtime on activity_log_queue WHERE flushed = false. Displays incoming events with risk_level highlight. Auto-pauses at 200 events to prevent UI freeze.
- FR-MONITOR-05: Manual flush trigger — calls flush_activity_logs(batch_size) and shows count of logs flushed.

# **5. Error States Catalogue**

**IMPORTANT:** Every admin action that calls an RPC must handle both expected business errors (returned as RAISE EXCEPTION from the DB) and unexpected infrastructure errors (network, timeout, Supabase 5xx). The table below defines the full error contract for each operation.

## **5.1 User Account Actions**

|         **Action**          |    **Error Code**     |       **Trigger Condition**       |                                 **UI Behaviour**                                 |
| :-------------------------: | :-------------------: | :-------------------------------: | :------------------------------------------------------------------------------: |
|  **control_user_account**   |    **ADMIN_ONLY**     |      Caller lacks admin role      |                    Show: "Permission denied." Log to Sentry.                     |
|  **control_user_account**   |  **INVALID_ACTION**   |   p_action not in allowed enum    |     Should never reach UI — Zod schema prevents it. Log as critical if seen.     |
|  **control_user_account**   |    **RPC_TIMEOUT**    |      DB response > 5 seconds      |       Show: "Action timed out. Check job queue for status." Toast warning.       |
|  **control_user_account**   |     **DB_ERROR**      |  Unexpected PostgreSQL exception  | Show: "Unexpected error. Please retry." Toast error. Log full details to Sentry. |
| **terminate_user_sessions** |    **ADMIN_ONLY**     |      Caller lacks admin role      |                            Show: "Permission denied."                            |
| **terminate_user_sessions** |  **USER_NOT_FOUND**   | p_user_id does not exist in users |                    Show: "User not found. Refresh the page."                     |
|    **reset_user_device**    |    **ADMIN_ONLY**     |      Caller lacks admin role      |                            Show: "Permission denied."                            |
|    **reset_user_device**    |    **NO_DEVICES**     |    User has no active devices     |             Show informational toast: "User has no active devices."              |
|      **issue_warning**      | **PERMISSION_DENIED** | warnings.write permission missing |              Show: "You do not have permission to issue warnings."               |
|      **issue_warning**      |   **AUTO_SUSPEND**    |   warning_count >= max_warnings   |  Show success + info banner: "User automatically suspended after [N] warnings."  |

## **5.2 Course & Enrollment Actions**

|      **Action**       |    **Error Code**     |         **Trigger Condition**         |                          **UI Behaviour**                           |
| :-------------------: | :-------------------: | :-----------------------------------: | :-----------------------------------------------------------------: |
|  **enroll_student**   | **PERMISSION_DENIED** |   courses.manage permission missing   |                     Show: "Permission denied."                      |
|  **enroll_student**   |     **DUPLICATE**     | UNIQUE (user_id, course_id) violation | Re-activates existing enrollment. Show info: "Student re-enrolled." |
|  **enroll_student**   | **COURSE_NOT_FOUND**  |       course_id does not exist        |               Show: "Course not found. Refresh list."               |
| **revoke_enrollment** | **PERMISSION_DENIED** |   courses.manage permission missing   |                     Show: "Permission denied."                      |
| **revoke_enrollment** |  **ALREADY_REVOKED**  |   enrollment.status already revoked   |              Show info: "Enrollment already revoked."               |
| **revoke_enrollment** |     **NOT_FOUND**     |      No matching enrollment row       |                    Show: "Enrollment not found."                    |

## **5.3 Settings & Maintenance Actions**

|         **Action**          |    **Error Code**     |        **Trigger Condition**         |                                        **UI Behaviour**                                        |
| :-------------------------: | :-------------------: | :----------------------------------: | :--------------------------------------------------------------------------------------------: |
|       **set_setting**       |    **ADMIN_ONLY**     |              Not admin               |                                   Show: "Permission denied."                                   |
|       **set_setting**       | **SETTING_NOT_FOUND** |        key not in settings_kv        |                       Show: "Unknown setting key. Contact engineering."                        |
|       **set_setting**       |   **INVALID_TYPE**    |  Value fails value_type constraint   | Client Zod validation should catch first. If bypassed, show: "Invalid value for this setting." |
| **enable_maintenance_mode** |    **ADMIN_ONLY**     |              Not admin               |                                   Show: "Permission denied."                                   |
| **enable_maintenance_mode** |   **ENDS_AT_PAST**    |      p_ends_at is before NOW()       |            Client validation catches this. Show: "End time must be in the future."             |
|    **lock_app_for_all**     |    **ADMIN_ONLY**     |              Not admin               |                                   Show: "Permission denied."                                   |
|   **flush_activity_logs**   |  **LOCK_CONTENTION**  | Advisory lock held by another worker |                 Show: "Another flush is in progress. Try again in 60 seconds."                 |
|       **dequeue_job**       |      **NO_JOBS**      |   No pending jobs matching filter    |                  Show info: "No pending jobs." Disable button for 30 seconds.                  |

## **5.4 Device & Session Actions**

|            **Action**            |      **Error Code**      |     **Trigger Condition**      |                           **UI Behaviour**                           |
| :------------------------------: | :----------------------: | :----------------------------: | :------------------------------------------------------------------: |
| **bind_device_for_current_user** |    **AUTH_REQUIRED**     |       auth.uid() is NULL       |                         Redirect to /login.                          |
| **bind_device_for_current_user** |  **INVALID_DEVICE_ID**   |    Empty or blank device_id    |                  Show: "Invalid device identifier."                  |
| **bind_device_for_current_user** | **DEVICE_ALREADY_BOUND** | Device bound to different user |        Show: "This device is registered to another account."         |
| **bind_device_for_current_user** | **MAX_DEVICES_REACHED**  | Active devices >= max_devices  | Show: "Device limit reached. Remove an existing device to continue." |
| **bind_device_for_current_user** |     **RATE_LIMITED**     |   device_bind rate limit hit   |       Show: "Too many attempts. Try again in [retry\_after]."        |

## **5.5 Global Error Handling Rules**

- FR-ERR-01: All RPC calls are wrapped in a global React Query onError handler that maps PostgreSQL RAISE EXCEPTION messages (format: ERROR_CODE: detail) to the catalogue above.
- FR-ERR-02: Any unmapped error is shown as: "An unexpected error occurred (ref: [request-id])." and logged to Sentry with full context.
- FR-ERR-03: Destructive actions (lock, ban, bulk-suspend) use optimistic UI — the row status updates immediately. On error, the previous state is restored and an error toast is shown.
- FR-ERR-04: Network errors (fetch failed, no internet) show a persistent banner: "Connection lost. Changes may not have been saved." with a Retry button.
- FR-ERR-05: Rate-limited responses (check_rate_limit returns allowed: false) show a countdown timer: "Too many requests. Try again in [N] seconds."

# **6. Teacher Dashboard**

**IMPORTANT:** Teachers have a dedicated, restricted view of the dashboard. They cannot access User Management, Tenant Management, System Settings, or Audit Logs. Their navigation is limited to the sections below.

## **6.1 Teacher Persona — Omar**

- Role: Instructor with courses.read, courses.write, reports.read, and warnings.write permissions.
- Context: Manages one or more published courses within a single tenant. Sees only their own courses (teacher_id = auth.uid()).
- Constraints: Cannot enroll or revoke students (requires courses.manage). Cannot access user profiles or account actions.

## **6.2 Teacher Navigation Structure**

|     **Nav Item**     | **Permission Required** |                                                            **What Omar Sees**                                                            |
| :------------------: | :---------------------: | :--------------------------------------------------------------------------------------------------------------------------------------: |
|    **My Courses**    |      courses.read       |    List of courses WHERE teacher_id = auth.uid(). Status badges (draft/published/archived). Create new course button (courses.write).    |
|  **Course Detail**   |      courses.read       |                     Sections accordion, lesson list, publish/unpublish toggle per lesson. No enrollment management.                      |
| **Course Analytics** |      reports.read       |        mv_course_stats for own courses: enrolled count, completed, avg_progress, total_views. Bar chart of watch time per lesson.        |
| **Student Progress** |      reports.read       |                 user_progress for own courses: student list with progress_pct, last_watched, completed flag. Read-only.                  |
|     **Warnings**     |     warnings.write      | Issue warning form: select student from enrolled list, reason text, severity 1–3. View warnings issued by Omar (issued_by = auth.uid()). |
|    **My Profile**    |     own record only     |                         View own user profile. Change display name/avatar. View own active sessions and devices.                         |

## **6.3 Teacher — My Courses Page**

- FR-TEACHER-01: Lists courses WHERE teacher_id = auth.uid() AND deleted_at IS NULL. Filter by status. Search by title (immutable_tsvector).
- FR-TEACHER-02: Create course form — title (required), description, category, level, is_free toggle, price (shown when is_free = false). Saved as status = "draft".
- FR-TEACHER-03: Course editor — sections (add/rename/delete/reorder), lessons per section (add/edit/delete/reorder, youtube_url, duration_sec). Publish section toggle (is_published).
- FR-TEACHER-04: Publish course — changes status from "draft" to "published". Requires at least 1 published section with 1 published lesson. Confirmation dialog.
- FR-TEACHER-05: Archive course — changes status to "archived". Enrolled students lose RLS access. Confirmation dialog.

## **6.4 Teacher — Course Analytics Page**

- FR-TEACHER-06: KPI row: Total Enrolled, Completed, Average Progress %, Total Video Views — all from mv_course_stats for own courses.
- FR-TEACHER-07: Progress distribution chart — histogram of progress_pct buckets (0–25%, 25–50%, 50–75%, 75–100%, Completed) from user_progress.
- FR-TEACHER-08: Lesson watch-time table — lesson title, total watch_time (seconds) from video_views, unique viewer count. Sortable.
- FR-TEACHER-09: Trend chart — enrolled count over the last 30 days (from enrollments.enrolled_at grouped by day). Recharts LineChart.

## **6.5 Teacher — Student Progress Page**

- FR-TEACHER-10: Enrolled students list for a selected course — student first_name + last_name (masked if deleted), progress_pct bar, last_watched timestamp, completed badge.
- FR-TEACHER-11: Row expand shows lesson-level progress (user_progress JOIN lessons).
- FR-TEACHER-12: Export student progress as CSV — client-side generation from query results. Columns: student_id, email, progress_pct, completed, last_watched.

**IMPORTANT:** Teachers cannot see student email or personal details beyond what is needed for course management. email is shown only if the student is enrolled in the teacher's course AND the tenant has data_sharing_teachers = true in settings_kv.

## **6.6 Teacher — Warnings Page**

- FR-TEACHER-13: Issue warning form — student selector (enrolled students only, searched by name), reason textarea (required, min 20 chars), severity selector (1 = Minor, 2 = Moderate, 3 = Severe), action field (default "none").
- FR-TEACHER-14: Calls issue_warning(user_id, reason, severity, action). On AUTO_SUSPEND error code, displays: "Student automatically suspended after reaching warning limit."
- FR-TEACHER-15: My issued warnings list — warnings WHERE issued_by = auth.uid(). Shows student name, reason, severity chip, created_at, is_acknowledged badge.
- FR-TEACHER-16: Teachers CANNOT view warnings issued by other teachers or admins against their students. This is enforced by RLS (warn_own policy: auth.uid() = user_id OR is_current_user_admin()).

**IMPORTANT:** FR-TEACHER-16 is a known RLS gap: teachers see warnings where they are the SUBJECT (user_id), not the ISSUER. A view or separate RLS policy warn_issued_by should be created to show warnings WHERE issued_by = auth.uid(). This is a v2.1 backlog item.

## **6.7 Teacher — Error States**

|     **Action**     |      **Error Code**       |                                   **UI Behaviour**                                   |
| :----------------: | :-----------------------: | :----------------------------------------------------------------------------------: |
| **Create Course**  | **courses.write denied**  |   Show: "Permission denied." (should not occur for teacher role — log as anomaly).   |
| **Publish Course** | **NO_PUBLISHED_SECTIONS** | Client validates: "Add at least one published section and lesson before publishing." |
| **Issue Warning**  |   **PERMISSION_DENIED**   |                Show: "You do not have permission to issue warnings."                 |
| **Issue Warning**  |     **AUTO_SUSPEND**      |       Info banner: "Student automatically suspended (warning limit reached)."        |
| **Issue Warning**  | **STUDENT_NOT_ENROLLED**  |                 Show: "This student is not enrolled in your course."                 |
|   **Export CSV**   |     **EMPTY_RESULT**      |                  Show: "No student data available for this course."                  |

# **7. Bulk Operations — API Contracts**

**NOTE:** All bulk operations are asynchronous — they create job_queue records and return immediately with a job_id. The frontend polls the job status via useQuery on job_queue WHERE id = job_id.

## **7.1 Bulk Architecture**

- Bulk actions are submitted to the bulk-action Edge Function (POST /functions/v1/bulk-action).
- The Edge Function uses the service_role client to insert records into job_queue and returns { job_id, estimated_count } within < 500ms.
- A pg_cron worker (or Supabase Edge Function on a schedule) dequeues jobs via dequeue_job() and processes them in batches.
- Progress is broadcast via pg_notify("job_progress", { job_id, processed, total }) and received via Supabase Realtime.

## **7.2 Bulk Action Request Schema**

POST /functions/v1/bulk-action

Authorization: Bearer <admin_jwt>

Content-Type: application/json

{

`  `"action": "bulk_lock" | "bulk_suspend" | "bulk_warn" | "bulk_enroll"

`          `| "bulk_revoke" | "bulk_export" | "bulk_terminate_sessions"

`          `| "bulk_reset_devices",

`  `"filters": { // server-side re-validation; never trust client IDs only

`    `"tenant_id": "uuid",

`    `"user_ids": ["uuid", ...], // max 500 per request

`    `"role": "student", // optional filter

`    `"account_status": "active", // optional filter

`    `"warning_count_gte": 3 // optional filter

`  `},

`  `"params": { // action-specific parameters

`    `"reason": "string", // required for lock/suspend/warn

`    `"suspend_hours": 24, // required for bulk_suspend

`    `"severity": 2, // required for bulk_warn (1-3)

`    `"course_id": "uuid", // required for bulk_enroll/revoke

`    `"expires_at": "ISO8601", // optional for bulk_enroll

`    `"export_format": "json" // required for bulk_export: "json" | "csv"

`  `},

`  `"priority": 5, // job_queue priority (1–10, default 5)

`  `"dry_run": false // if true: returns count without executing

}

## **7.3 Bulk Action Response Schema**

HTTP 202 Accepted

{

`  `"job_id": "uuid",

`  `"action": "bulk_lock",

`  `"estimated_count": 47, // from filters dry-run count

`  `"status": "pending",

`  `"created_at": "ISO8601"

}

## **7.4 Bulk Action Catalogue**

|         **Action**          | **Required Permission** |                     **DB Operation**                     |                          **Notes**                          |
| :-------------------------: | :---------------------: | :------------------------------------------------------: | :---------------------------------------------------------: |
|        **bulk_lock**        |       users.lock        |     control_user_account(id,"lock",reason) per user      |           Max 500 users. Terminates all sessions.           |
|      **bulk_suspend**       |       users.lock        | control_user_account(id,"suspend",reason,hours) per user |        suspend_hours required. Sessions terminated.         |
|        **bulk_warn**        |     warnings.write      |        issue_warning(id,reason,severity) per user        |           Auto-suspend triggers logged per-user.            |
|       **bulk_enroll**       |     courses.manage      |    enroll_student(id, course_id, expires_at) per user    |              Skips already-active enrollments.              |
|       **bulk_revoke**       |     courses.manage      |    revoke_enrollment(id, course_id, reason) per user     |                Skips non-active enrollments.                |
| **bulk_terminate_sessions** |     sessions.manage     |    terminate_user_sessions(id,"bulk_admin") per user     |               Does not change account_status.               |
|   **bulk_reset_devices**    |     devices.manage      |              reset_user_device(id) per user              |           Deactivates all devices for each user.            |
|       **bulk_export**       |       users.read        |       Collects all user data into JSON/CSV archive       | Edge Function; result via signed download URL. TTL: 1 hour. |

## **7.5 Bulk Job Progress UI**

- FR-BULK-01: When a bulk action is submitted, the BulkActionBar is replaced by a progress panel showing: action name, estimated_count, processed so far (from Realtime), status chip, and a Cancel button.
- FR-BULK-02: Cancel changes job status to "dead" via a PATCH call to the Edge Function. Jobs in "processing" status cannot be cancelled — only the next batch is stopped.
- FR-BULK-03: On completion (status = "done"), show summary: "47 users locked successfully." Link to activity_logs filtered by the bulk job_id stored in details.
- FR-BULK-04: On partial failure (some users failed), show warning: "42 succeeded, 5 failed. View failed users." Failed user_ids are stored in job_queue.error_msg as JSON.

## **7.6 Bulk Operation Error States**

|    **Error Code**     |            **When**             |                                         **UI Behaviour**                                          |
| :-------------------: | :-----------------------------: | :-----------------------------------------------------------------------------------------------: |
| **PAYLOAD_TOO_LARGE** |      user_ids.length > 500      |                        Client blocks: "Select up to 500 users at a time."                         |
| **PERMISSION_DENIED** |  JWT lacks required permission  |                          Show: "Permission denied for this bulk action."                          |
|  **INVALID_FILTERS**  | filters produce 0 matching rows |              Show: "No users match the selected filters." (dry_run count = 0 check)               |
|  **JOB_QUEUE_FULL**   | job_queue pending > 10,000 rows |                      Show: "Job queue is busy. Try again in a few minutes."                       |
|  **PARTIAL_FAILURE**  |   Some records fail mid-batch   |  Job completes with status="done"; error_msg contains failed IDs. Show partial success warning.   |
|   **JOB_TIMED_OUT**   |  Job in "processing" > 30 min   | release_stale_job_locks() resets to "pending". UI shows: "Job stalled — re-queued automatically." |
|   **DRY_RUN_ZERO**    |      dry_run=true, count=0      |                        Show: "No users would be affected by this action."                         |

# **8. Non-Functional Requirements**

|      **ID**      |                **Requirement**                |                            **Target / Measurement**                             |
| :--------------: | :-------------------------------------------: | :-----------------------------------------------------------------------------: |
| **NFR-PERF-01**  |       Page load time for dashboard home       |                        P95 < 2 seconds (Lighthouse TTI)                         |
| **NFR-PERF-02**  |            RPC / API response time            |                        P95 < 200ms (pg_stat_statements)                         |
| **NFR-PERF-03**  |       Concurrent admin users supported        |                   10,000 concurrent; throughput > 1,000 req/s                   |
| **NFR-PERF-04**  |            Bulk action throughput             |                       500 users processed in < 60 seconds                       |
|  **NFR-SEC-01**  |         All DB access via RLS or RPC          | Zero direct table SELECT/INSERT from browser (verified by CSP + Supabase audit) |
|  **NFR-SEC-02**  |  JWT token_version enforced on every request  |           Enforced in check_user_access() + client-side Zustand store           |
|  **NFR-SEC-03**  |            MFA for admin accounts             |                       100% enforcement; no bypass allowed                       |
|  **NFR-SEC-04**  |       service_role key never in browser       |               Edge Functions only; verified by secret scan in CI                |
| **NFR-AVAIL-01** | System uptime (excluding planned maintenance) |                      SLA 99.95% (~4.4 hours/year downtime)                      |
| **NFR-AVAIL-02** |            Audit log immutability             |      Hash chain verified weekly by cron; any break triggers critical alert      |
| **NFR-SCALE-01** |          Horizontal scaling strategy          |      Supabase read replicas for analytics; sharding via shard_key on users      |
| **NFR-SCALE-02** |             Partition management              |  sessions, activity_logs, video_views auto-partitioned by quarter through 2028  |
| **NFR-I18N-01**  |       Arabic (RTL) and English support        |   MUI direction prop; all DB labels in Arabic; English UI strings via i18next   |
|  **NFR-LOG-01**  |           All admin actions logged            |        log_activity_async() with risk_level >= medium for all mutations         |
| **NFR-GDPR-01**  |          User data export on request          |    Edge Function generates export in < 30 minutes; download link TTL 1 hour     |
| **NFR-GDPR-02**  |         User data deletion on request         |  Soft delete (deleted_at) + scheduled hard delete after 30 days via job_queue   |
|  **NFR-ACC-01**  |           WCAG 2.1 AA accessibility           |        Keyboard navigation, screen reader labels, 4.5:1 colour contrast         |
| **NFR-TEST-01**  |      Critical flows covered by E2E tests      |     Cypress: login, lock user, enroll student, issue warning, bulk suspend      |

# **9. RPC API Contracts**

**NOTE:** All RPC functions are SECURITY DEFINER and run with the DB owner's privileges. They internally re-validate permissions — the browser never bypasses RLS. Function signatures are from EduZone Schema v5.0.

|              **RPC Function**              |              **Parameters**               |   **Returns**   |                         **Permission Check**                          |
| :----------------------------------------: | :---------------------------------------: | :-------------: | :-------------------------------------------------------------------: |
|          **check_user_access()**           |                     —                     |      JSONB      |  None — public. Checks app_locked, account_status, maintenance_mode.  |
|            **get_setting(key)**            |                p_key TEXT                 |      TEXT       |              None. RLS filters is_public for anon users.              |
|        **set_setting(key, value)**         |            p_key, p_value TEXT            |      VOID       |                        is_current_user_admin()                        |
|  **user_has_permission(uid, perm, tid)**   |             UUID, TEXT, UUID              |     BOOLEAN     | Internal helper. Checks user_permission_cache then role_permissions.  |
|   **rebuild_permission_cache(uid, tid)**   |                UUID, UUID                 |      VOID       |                        is_current_user_admin()                        |
|  **control_user_account(uid, action, …)**  |           UUID, TEXT, TEXT, INT           |      JSONB      |                        is_current_user_admin()                        |
|  **terminate_user_sessions(uid, reason)**  |                UUID, TEXT                 |       INT       |                        is_current_user_admin()                        |
|         **logout_current_user()**          |                     —                     |      VOID       |                            auth.uid() only                            |
|    **bind_device_for_current_user(…)**     |             TEXT, JSONB, TEXT             |      JSONB      |           auth.uid() only. Rate-limited: device_bind rule.            |
|         **reset_user_device(uid)**         |                   UUID                    |      VOID       |                        is_current_user_admin()                        |
|     **enroll_student(uid, cid, exp)**      |          UUID, UUID, TIMESTAMPTZ          |      UUID       |           user_has_permission(auth.uid(), "courses.manage")           |
|  **revoke_enrollment(uid, cid, reason)**   |             UUID, UUID, TEXT              |      VOID       |           user_has_permission(auth.uid(), "courses.manage")           |
|  **issue_warning(uid, reason, sev, act)**  |           UUID, TEXT, INT, TEXT           |      UUID       |           user_has_permission(auth.uid(), "warnings.write")           |
|      **is_feature_enabled(key, uid)**      |                TEXT, UUID                 |     BOOLEAN     | SECURITY DEFINER — no explicit check. Returns false if flag disabled. |
| **check_rate_limit(action, uid, ip, dev)** |          TEXT, UUID, INET, TEXT           |      JSONB      |     SECURITY DEFINER. Used internally and by client for feedback.     |
|         **log_activity_async(…)**          | UUID, TEXT, JSONB, INET, TEXT, TEXT, UUID |      UUID       |             authenticated. Inserts to activity_log_queue.             |
|       **flush_activity_logs(batch)**       |                    INT                    |       INT       |    is_current_user_admin(). Advisory lock guards chain integrity.     |
|    **dequeue_job(worker, types, ttl)**     |             TEXT, TEXT[], INT             | SETOF job_queue |          is_current_user_admin() or designated worker role.           |
|       **release_stale_job_locks()**        |                     —                     |       INT       |                        is_current_user_admin()                        |
|       **enable_maintenance_mode(…)**       |     TEXT, TIMESTAMPTZ, TEXT[], UUID[]     |      VOID       |                        is_current_user_admin()                        |
|       **disable_maintenance_mode()**       |                     —                     |      VOID       |                        is_current_user_admin()                        |
|       **lock_app_for_all(message)**        |                   TEXT                    |      VOID       |                        is_current_user_admin()                        |
|              **unlock_app()**              |                     —                     |      VOID       |                        is_current_user_admin()                        |

# **10. Success Metrics & Monitoring**

|                **Metric**                |     **Target**      |                            **Measurement Method**                             |
| :--------------------------------------: | :-----------------: | :---------------------------------------------------------------------------: |
|      **Admin task completion time**      |    < 30 seconds     |           User timing in activity_logs (action start → completion)            |
|   **Time to detect security incident**   |     < 5 minutes     |     Alert latency from security_alert pg_notify to admin dashboard toast      |
|         **Audit log integrity**          |        100%         |        Weekly cron: recomputes SHA-256 hash chain; alerts on any break        |
|        **Bulk action throughput**        |   500 users < 60s   |             job_queue: (completed_at - created_at) for bulk jobs              |
| **Token-version mismatch recovery time** |     < 3 seconds     |         Client-side timer from mismatch detection to /login redirect          |
|         **System availability**          |       99\.95%       |                  Supabase uptime monitoring + external probe                  |
|         **MV refresh freshness**         |    < 1 hour lag     |              Check refreshed_at in mv_user_stats via cron alert               |
|      **Permission cache hit rate**       |        > 95%        | user_permission_cache queries vs. role_permissions joins (pg_stat_statements) |
|       **User satisfaction (CSAT)**       |        > 85%        |                       Periodic in-app survey for admins                       |
|          **E2E test pass rate**          | 100% on main branch |                                Cypress CI gate                                |

## **10.1 Observability Stack**

- Frontend errors: Sentry with source maps. Every unhandled error includes user_id, tenant_id, and request_id.
- DB performance: pg_stat_statements — tracked for all RPCs. Slow query threshold: 200ms.
- Realtime health: monitor WebSocket connection drops in Supabase dashboard; alert if > 1% drop rate.
- Job queue health: alert if job_queue WHERE status = "dead" count > 10 or processing > 30 minutes.
- Audit chain: weekly pg_cron job recomputes full hash chain; sends critical alert on mismatch.

# **11. Open Issues & Future Scope**

## **11.1 Known Issues (v2.0)**

- ISSUE-01: Teacher warning RLS gap — warn_own policy shows warnings where teacher is the SUBJECT, not ISSUER. Requires new view or additional policy. Target: v2.1.
- ISSUE-02: bulk_export Edge Function not yet implemented. Placeholder in job_queue. Target: v2.2.
- ISSUE-03: mv_daily_activity CONCURRENT REFRESH requires unique index — currently only one non-unique index. Must add unique composite index on (hour_bucket, tenant_id, activity_type, risk_level). Target: Schema v5.1.

## **11.2 Future Scope (Backlog)**

- Multi-language support beyond Arabic/English (French, Turkish).
- Custom report builder — drag-and-drop query composer over materialised views.
- Anomaly detection on activity_logs — ML model flags unusual login patterns.
- SIEM integration — export audit_logs to Splunk/Elastic via webhook.
- Granular sub-roles — "user manager", "course editor", "report viewer" as separate delegated roles.
- Mobile dashboard app — React Native for on-call monitoring.
- Tenant self-service portal — tenant admins can configure their own settings without super_admin.
- Two-person integrity for critical actions — ban/delete-tenant requires second admin approval.

# **Appendix A — Permissions Matrix**

|      **Permission**      | **Resource**  | **Super Admin** | **Admin** | **Teacher** | **Student** |
| :----------------------: | :-----------: | :-------------: | :-------: | :---------: | :---------: |
|      **users.read**      |     Users     |       YES       |    YES    |     NO      |     NO      |
|     **users.write**      |     Users     |       YES       |    YES    |     NO      |     NO      |
|      **users.lock**      |     Users     |       YES       |    YES    |     NO      |     NO      |
|     **users.delete**     |     Users     |       YES       |    NO     |     NO      |     NO      |
|     **courses.read**     |    Courses    |       YES       |    YES    |     YES     |     NO      |
|    **courses.write**     |    Courses    |       YES       |    YES    |     YES     |     NO      |
|    **courses.delete**    |    Courses    |       YES       |    YES    |     NO      |     NO      |
|    **courses.manage**    |    Courses    |       YES       |    YES    |     NO      |     NO      |
|     **reports.read**     |   Analytics   |       YES       |    YES    |     YES     |     NO      |
|    **settings.read**     |   Settings    |       YES       |    YES    |     NO      |     NO      |
|    **settings.write**    |   Settings    |       YES       |    NO     |     NO      |     NO      |
|    **warnings.write**    |   Warnings    |       YES       |    YES    |     YES     |     NO      |
|    **devices.manage**    |    Devices    |       YES       |    YES    |     NO      |     NO      |
|   **sessions.manage**    |   Sessions    |       YES       |    YES    |     NO      |     NO      |
|      **audit.read**      |     Audit     |       YES       |    NO     |     NO      |     NO      |
| **feature_flags.manage** | Feature Flags |       YES       |    NO     |     NO      |     NO      |
|    **tenants.manage**    |    Tenants    |       YES       |    NO     |     NO      |     NO      |

# **Appendix B — Glossary**

|       **Term**        |                                            **Definition**                                             |
| :-------------------: | :---------------------------------------------------------------------------------------------------: |
|      **Tenant**       |      An isolated instance for a customer (school, university). All data is scoped by tenant_id.       |
|        **RLS**        |        Row-Level Security — PostgreSQL feature that restricts which rows a DB user can access.        |
|        **RPC**        |          Remote Procedure Call — invoking a DB function via Supabase's .rpc() client method.          |
| **SECURITY DEFINER**  |   PostgreSQL function attribute: function runs with the privileges of its creator, not the caller.    |
|   **token_version**   | Integer on users table incremented on every forced logout or account action. Stale JWTs are rejected. |
| **Materialised View** |              A pre-computed, cached snapshot of aggregated data refreshed on a schedule.              |
|    **Audit Chain**    | Cryptographic SHA-256 hash linking each activity_log entry to the previous, ensuring tamper evidence. |
|   **Edge Function**   | Supabase serverless function running on Deno. Used for sensitive operations with service_role access. |
|     **shard_key**     |             Generated column on users (abs(hashtext(id)) % 256) for horizontal sharding.              |
|     **pg_notify**     |   PostgreSQL asynchronous notification mechanism used for real-time cache invalidation and alerts.    |
|       **FAANG**       |    Meta, Amazon, Apple, Netflix, Google — denotes high-scale, high-quality engineering standards.     |

EduZone Platform | Schema v5.0 | Page of
