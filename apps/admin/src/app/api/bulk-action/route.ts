import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Bulk-action API route — replaces the Supabase Edge Function.
 * Handles dry-run (count estimation) and job submission.
 *
 * POST /api/bulk-action
 * Body: { action, filters, params?, dry_run }
 */

const VALID_ACTIONS = [
  'lock',
  'unlock',
  'suspend',
  'ban',
  'warn',
  'terminate_sessions',
  'reset_devices',
  'export',
  'delete',
] as const;

type BulkAction = (typeof VALID_ACTIONS)[number];

const ACTION_PERMISSIONS: Record<BulkAction, string> = {
  lock: 'users.lock',
  unlock: 'users.lock',
  suspend: 'users.lock',
  ban: 'users.lock',
  warn: 'warnings.write',
  terminate_sessions: 'sessions.manage',
  reset_devices: 'users.write',
  export: 'users.read',
  delete: 'users.write',
};

const MAX_BULK_SIZE = 500;

interface BulkRequestBody {
  action: BulkAction;
  filters: Record<string, unknown>;
  params?: Record<string, unknown>;
  dry_run: boolean;
}

function errorJson(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

function roleAllowsPermission(role: string | undefined, permission: string) {
  if (role === 'admin') return permission !== 'tenants.manage';
  if (role === 'teacher') {
    return [
      'courses.read',
      'courses.write',
      'courses.manage',
      'users.read',
      'warnings.write',
      'reports.read',
      'notifications.send',
      'notifications.delete',
    ].includes(permission);
  }
  if (role === 'student') return permission === 'courses.read' || permission === 'reports.read';
  return false;
}

interface UserFilterQuery {
  in(column: string, values: unknown[]): UserFilterQuery;
  eq(column: string, value: unknown): UserFilterQuery;
  or(filters: string): UserFilterQuery;
  limit(count: number): PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
}

function applyUserFilters(query: UserFilterQuery, f: Record<string, unknown>): UserFilterQuery {
  if (f.user_ids && Array.isArray(f.user_ids) && f.user_ids.length > 0) {
    query = query.in('id', f.user_ids as string[]);
    if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
    return query;
  }

  if (f.search) {
    query = query.or(
      `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
    );
  }
  if (f.primary_role) query = query.eq('primary_role', f.primary_role as string);
  if (f.account_status) query = query.eq('account_status', f.account_status as string);
  if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
  if (f.region_id) query = query.eq('region_id', f.region_id as string);
  return query;
}

async function updateBulkJob(admin: SupabaseClient, jobId: string, opts: {
  status?: string;
  errorMessage?: string;
  finishedAt?: string;
  releaseLock?: boolean;
}) {
  const { error } = await admin.rpc('worker_update_bulk_job', {
    p_id: jobId,
    p_status: opts.status ?? null,
    p_error_message: opts.errorMessage ?? null,
    p_finished_at: opts.finishedAt ?? null,
    p_release_lock: opts.releaseLock ?? false,
  });
  if (error) throw error;
}

async function processInlineBulkJob(
  admin: SupabaseClient,
  job: { id: string },
  body: BulkRequestBody,
  initiatorId: string,
) {
  const { data: users, error } = await applyUserFilters(
    admin
      .from('users')
      .select('id, tenant_id, email, first_name, last_name, phone, primary_role, account_status, warning_count, login_count, token_version, created_at, last_login, last_seen_at, region_id')
      .is('deleted_at', null) as unknown as UserFilterQuery,
    body.filters,
  ).limit(MAX_BULK_SIZE);

  if (error) throw error;

  if (body.action === 'export') {
    await exportUsers(admin, job.id, users ?? [], body, initiatorId);
    return;
  }

  const failedIds: string[] = [];
  let processed = 0;

  for (const user of users ?? []) {
    try {
      await processInlineUserAction(admin, body.action, user, body.params ?? {}, initiatorId);
    } catch (err) {
      console.error(`[bulk-action] ${body.action} failed for ${user.id}:`, err);
      failedIds.push(user.id as string);
    } finally {
      processed++;
    }
  }

  const result = {
    processed,
    total: users?.length ?? 0,
    succeeded: processed - failedIds.length,
    failed: failedIds.length,
    failed_ids: failedIds,
  };

  await updateBulkJob(admin, job.id, {
    status: 'done',
    finishedAt: new Date().toISOString(),
    errorMessage: JSON.stringify(result),
    releaseLock: true,
  });

  await admin.rpc('log_activity_async', {
    p_user_id: initiatorId,
    p_type: 'bulk_action_completed',
    p_details: { job_id: job.id, action: body.action, ...result },
    p_risk_level: failedIds.length > 0 ? 'medium' : 'low',
  });
}

async function processInlineUserAction(
  admin: SupabaseClient,
  action: BulkAction,
  user: Record<string, unknown>,
  params: Record<string, unknown>,
  initiatorId: string,
) {
  const now = new Date().toISOString();
  const reason = (params.reason as string | undefined)?.trim() || null;

  switch (action) {
    case 'warn': {
      const { error: warningError } = await admin.from('warnings').insert({
        user_id: user.id,
        tenant_id: user.tenant_id,
        issued_by: initiatorId,
        reason: reason || 'Bulk warning',
        severity: Math.max(1, Math.min(Number(params.severity ?? 1), 3)),
      });
      if (warningError) throw warningError;

      const { error: countError } = await admin
        .from('users')
        .update({
          warning_count: Number(user.warning_count ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', user.id);
      if (countError) throw countError;
      break;
    }
    case 'delete': {
      // Soft-delete in the data layer first — this is the authoritative step.
      const { error: softDeleteError } = await admin
        .from('users')
        .update({ deleted_at: now, account_status: 'banned', updated_at: now })
        .eq('id', user.id);
      if (softDeleteError) throw softDeleteError;

      // Best-effort: remove from Auth. Failures are silently ignored because:
      // 1. The user may not exist in Auth (e.g. created without auth record).
      // 2. Auth deletion is not the source of truth for our data model.
      await admin.auth.admin.deleteUser(user.id as string).catch(() => { /* best-effort */ });
      break;
    }
    case 'lock':
    case 'unlock':
    case 'suspend':
    case 'ban': {
      const status =
        action === 'unlock' ? 'active' :
        action === 'lock' ? 'locked' :
        action === 'suspend' ? 'suspended' :
        'banned';
      const suspendHours = Number(params.suspend_hours ?? 24);
      const { error } = await admin
        .from('users')
        .update({
          account_status: status,
          lock_reason: action === 'unlock' ? null : reason,
          locked_at: action === 'lock' || action === 'ban' ? now : null,
          locked_by: action === 'lock' || action === 'ban' ? initiatorId : null,
          suspension_until: action === 'suspend'
            ? new Date(Date.now() + suspendHours * 3600_000).toISOString()
            : null,
          token_version: Number(user.token_version ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', user.id);
      if (error) throw error;
      break;
    }
    case 'terminate_sessions': {
      const { error } = await admin
        .from('sessions')
        .update({ is_active: false, ended_at: now, end_reason: reason || 'bulk_terminated' })
        .eq('user_id', user.id)
        .eq('is_active', true);
      if (error) throw error;
      break;
    }
    case 'reset_devices': {
      const { error } = await admin
        .from('devices')
        .update({ is_active: false })
        .eq('user_id', user.id);
      if (error) throw error;
      break;
    }
    default:
      break;
  }
}

async function exportUsers(
  admin: SupabaseClient,
  jobId: string,
  users: Record<string, unknown>[],
  body: BulkRequestBody,
  initiatorId: string,
) {
  const format = String(body.params?.export_format ?? 'json');
  const tenantId = String(body.filters.tenant_id ?? users[0]?.tenant_id ?? 'default');
  const ext = format === 'csv' ? 'csv' : 'json';
  const contentType = ext === 'csv' ? 'text/csv' : 'application/json';
  const fileContent = ext === 'csv' ? generateCsv(users) : JSON.stringify(users, null, 2);
  const filePath = `exports/${tenantId}/${jobId}.${ext}`;

  let upload = await admin.storage
    .from('exports')
    .upload(filePath, new Blob([fileContent], { type: contentType }), {
      contentType,
      upsert: true,
    });

  if (upload.error?.message?.toLowerCase().includes('bucket')) {
    await admin.storage.createBucket('exports', { public: false, fileSizeLimit: 52_428_800 });
    upload = await admin.storage
      .from('exports')
      .upload(filePath, new Blob([fileContent], { type: contentType }), {
        contentType,
        upsert: true,
      });
  }
  if (upload.error) throw upload.error;

  const { data: signedUrl, error: signError } = await admin.storage
    .from('exports')
    .createSignedUrl(filePath, 3600, { download: `users-export-${jobId}.${ext}` });
  if (signError) throw signError;

  await updateBulkJob(admin, jobId, {
    status: 'done',
    finishedAt: new Date().toISOString(),
    errorMessage: JSON.stringify({
      processed: users.length,
      total: users.length,
      succeeded: users.length,
      failed: 0,
      failed_ids: [],
      download_url: signedUrl.signedUrl,
      expires_at: new Date(Date.now() + 3600_000).toISOString(),
      format: ext,
    }),
    releaseLock: true,
  });

  await admin.rpc('log_activity_async', {
    p_user_id: initiatorId,
    p_type: 'bulk_export_completed',
    p_details: { job_id: jobId, user_count: users.length, format: ext },
    p_risk_level: 'low',
  });
}

function generateCsv(users: Record<string, unknown>[]) {
  const fields = ['id', 'email', 'first_name', 'last_name', 'phone', 'primary_role', 'account_status', 'warning_count', 'login_count', 'created_at', 'last_login', 'tenant_id'];
  const escape = (value: unknown) => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [fields.join(','), ...users.map((user) => fields.map((field) => escape(user[field])).join(','))].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    // ── Parse body ────────────────────────────────────────────
    const body = (await request.json()) as BulkRequestBody;

    if (!body.action || !VALID_ACTIONS.includes(body.action)) {
      return errorJson(
        'INVALID_ACTION',
        `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
      );
    }

    if (!body.filters || typeof body.filters !== 'object') {
      return errorJson('INVALID_FILTERS', 'filters must be an object');
    }

    // ── Authenticate caller ───────────────────────────────────
    const supabase = await createServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData?.user) {
      return errorJson('UNAUTHORIZED', 'Not authenticated', 401);
    }

    // ── Get caller profile (need role for super_admin bypass) ──────────
    const { data: callerProfile, error: profileErr } = await supabase
      .from('users')
      .select('tenant_id, primary_role')
      .eq('id', userData.user.id)
      .is('deleted_at', null)
      .single();

    if (profileErr || !callerProfile) {
      return errorJson('UNAUTHORIZED', 'User profile not found', 401);
    }

    // ── Verify permission (super_admin bypasses all checks) ───────────
    const permission = ACTION_PERMISSIONS[body.action];
    if (
      callerProfile.primary_role !== 'super_admin' &&
      !roleAllowsPermission(callerProfile.primary_role, permission)
    ) {
      const { data: hasPerm, error: permErr } = await supabase.rpc('user_has_permission', {
        p_user_id: userData.user.id,
        p_permission: permission,
        p_tenant_id: callerProfile.tenant_id,
      });

      if (permErr || !hasPerm) {
        return errorJson('FORBIDDEN', `Permission denied: requires ${permission}`, 403);
      }
    }

    // ── Build admin client for privileged ops ─────────────────
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceKey) {
      return errorJson('SERVER_ERROR', 'Missing server configuration', 500);
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── Count matching users ──────────────────────────────────
    // v13: users_with_pii_access includes decrypted email for search;
    //      it inherits soft-delete exclusion from the underlying users_active join.
    let query = admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    const f = body.filters;
    if (f.user_ids && Array.isArray(f.user_ids) && f.user_ids.length > 0) {
      // User explicitly selected individual users via checkboxes.
      // Bypass general search/filters to honor user intent, but retain tenant_id check.
      query = query.in('id', f.user_ids as string[]);
      if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
    } else {
      // User did not select checkboxes (e.g. bulk action on entire search results).
      // Apply full search and filters.
      if (f.search) {
        // v13: search against decrypted PII column
        query = query.or(
          `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
        );
      }
      if (f.primary_role) query = query.eq('primary_role', f.primary_role as string);
      if (f.account_status) query = query.eq('account_status', f.account_status as string);
      if (f.tenant_id) query = query.eq('tenant_id', f.tenant_id as string);
      if (f.region_id) query = query.eq('region_id', f.region_id as string);
    }

    const { count: estimatedCount, error: countErr } = await query;

    if (countErr) {
      return errorJson('QUERY_ERROR', countErr.message, 400);
    }

    const count = estimatedCount ?? 0;

    if (count === 0) {
      return errorJson('NO_MATCHES', 'No users match the given filters', 400);
    }

    // ── Dry run → return count only ───────────────────────────
    if (body.dry_run) {
      return NextResponse.json({ estimated_count: count, dry_run: true });
    }

    // ── Submit → validate limits ──────────────────────────────
    if (count > MAX_BULK_SIZE) {
      return errorJson(
        'PAYLOAD_TOO_LARGE',
        `Bulk operations are limited to ${MAX_BULK_SIZE} users. Found ${count}.`,
        400,
      );
    }

    // ── Insert job into queue ─────────────────────────────────
    const jobType = body.action === 'export' ? 'bulk_export' : `bulk_${body.action}`;

    const { data: job, error: insertErr } = await admin
      .rpc('admin_enqueue_bulk_job', {
        p_job_type: jobType,
        p_payload: {
          action: body.action,
          filters: body.filters,
          params: body.params ?? {},
          initiator_id: userData.user.id,
          estimated_count: count,
        },
        p_initiator_id: userData.user.id,
      });

    if (insertErr) {
      if (insertErr.message.includes('JOB_QUEUE_FULL')) {
        return errorJson('JOB_QUEUE_FULL', 'Too many pending jobs. Please try again later.', 429);
      }
      if (insertErr.message.includes('uq_job_dedupe')) {
        return errorJson('DUPLICATE_JOB', 'An identical bulk action is already processing. Please wait for it to finish.', 409);
      }
      return errorJson('QUEUE_ERROR', insertErr.message, 500);
    }

    // ── Log the activity (non-critical) ──────────────────────
    try {
      await admin.rpc('log_activity_async', {
        p_user_id: userData.user.id,
        p_type: 'bulk_action_queued',
        p_details: {
          action: body.action,
          estimated_count: count,
          job_id: job.id,
          filters: body.filters,
        },
        p_risk_level: 'medium',
        p_tenant_id: callerProfile?.tenant_id ?? null,
      });
    } catch {
      // Don't block job submission if activity logging fails
    }

    await processInlineBulkJob(admin, job, body, userData.user.id);

    // ── Return 202 Accepted ───────────────────────────────────
    return NextResponse.json(
      {
        job_id: job.id,
        estimated_count: count,
        status: 'done',
        created_at: job.created_at,
      },
      { status: 202 },
    );
  } catch (err) {
    console.error('[bulk-action] Unhandled error:', err);
    return errorJson('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
}
