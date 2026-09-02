import type { SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

import { roleAllowsPermission } from '@/application/authorization/policy';
import {
  MAX_BULK_SIZE,
  bulkActionRequestSchema,
  type BulkActionRequest,
  type BulkParamsInput,
} from '@/domain/schemas/bulk-action.schema';
import type { BulkAction } from '@/domain/types/bulk.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Bulk-action API route — replaces the Supabase Edge Function.
 * Handles dry-run (count estimation) and job submission.
 *
 * POST /api/bulk-action
 * Body: { action, filters, params?, dry_run }
 *
 * M9: the body is validated by `bulkActionRequestSchema` before it reaches
 * any business logic — unknown keys are stripped and every field consumed
 * below is fully typed (no more `Record<string, unknown>` re-casts).
 */

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

function errorJson(code: string, message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ code, message, error: message, ...extra }, { status });
}

async function updateBulkJob(
  admin: SupabaseClient,
  jobId: string,
  opts: {
    status?: string;
    errorMessage?: string;
    finishedAt?: string;
    releaseLock?: boolean;
  },
) {
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
  body: BulkActionRequest,
  initiatorId: string,
  restrictTenantId: string | undefined,
) {
  // M9: build the filtered user query inline (typed), reusing the same
  // filter rules as the count query — no structural cast to a fake type.
  let builder = admin
    .from('users')
    .select(
      'id, tenant_id, email, first_name, last_name, phone, primary_role, account_status, warning_count, login_count, token_version, created_at, last_login, last_seen_at, region_id',
    )
    .is('deleted_at', null);

  const f = body.filters;
  if (f.user_ids && f.user_ids.length > 0) {
    builder = builder.in('id', f.user_ids);
    if (restrictTenantId) {
      builder = builder.eq('tenant_id', restrictTenantId);
    } else if (f.tenant_id) {
      builder = builder.eq('tenant_id', f.tenant_id);
    }
  } else {
    if (f.search) {
      builder = builder.or(
        `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
      );
    }
    if (f.primary_role) builder = builder.eq('primary_role', f.primary_role);
    if (f.account_status) builder = builder.eq('account_status', f.account_status);
    if (restrictTenantId) {
      builder = builder.eq('tenant_id', restrictTenantId);
    } else if (f.tenant_id) {
      builder = builder.eq('tenant_id', f.tenant_id);
    }
    if (f.region_id) builder = builder.eq('region_id', f.region_id);
  }

  const { data: users, error } = await builder.limit(MAX_BULK_SIZE);

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
  params: BulkParamsInput,
  initiatorId: string,
) {
  const now = new Date().toISOString();
  const reason = params.reason?.trim() || null;

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
      await admin.auth.admin.deleteUser(user.id as string).catch(() => {
        /* best-effort */
      });
      break;
    }
    case 'lock':
    case 'unlock':
    case 'suspend':
    case 'ban': {
      const status =
        action === 'unlock'
          ? 'active'
          : action === 'lock'
            ? 'locked'
            : action === 'suspend'
              ? 'suspended'
              : 'banned';
      const suspendHours = params.suspend_hours ?? 24;
      const { error } = await admin
        .from('users')
        .update({
          account_status: status,
          lock_reason: action === 'unlock' ? null : reason,
          locked_at: action === 'lock' || action === 'ban' ? now : null,
          locked_by: action === 'lock' || action === 'ban' ? initiatorId : null,
          suspension_until:
            action === 'suspend'
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
  body: BulkActionRequest,
  initiatorId: string,
) {
  const format = body.params?.export_format ?? 'json';
  // P1-SEC-005 FIX: derive the storage path from the actual exported rows'
  // tenant, not the client-supplied filter -- after the tenant-scoping fix
  // above, `users` only ever contains one tenant's rows for non-super_admin
  // callers, but the path shouldn't trust unvalidated client input either way.
  const tenantId = String(users[0]?.tenant_id ?? body.filters.tenant_id ?? 'default');
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
  const fields = [
    'id',
    'email',
    'first_name',
    'last_name',
    'phone',
    'primary_role',
    'account_status',
    'warning_count',
    'login_count',
    'created_at',
    'last_login',
    'tenant_id',
  ];
  const escape = (value: unknown) => {
    if (value == null) return '';
    const text = String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    fields.join(','),
    ...users.map((user) => fields.map((field) => escape(user[field])).join(',')),
  ].join('\n');
}

export async function POST(request: NextRequest) {
  try {
    // ── Parse + validate body (M9: single typed boundary) ─────
    const rawBody: unknown = await request.json().catch(() => null);
    const parsedBody = bulkActionRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return errorJson('INVALID_BODY', parsedBody.error.issues[0]?.message ?? 'Invalid body', 400);
    }
    const body = parsedBody.data;

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
    const admin = createAdminClient();

    // P1-SEC-005 FIX: this route runs every query below through the
    // service_role client, which bypasses RLS entirely -- so tenant scoping
    // has to be enforced here, in application code, or it doesn't exist at
    // all. Previously `filters.tenant_id` was client-supplied and optional,
    // so a non-super_admin caller (e.g. a teacher, who has `users.read` and
    // can therefore hit action:'export') could omit it or set it to another
    // tenant's id and act on/export users outside their own tenant.
    // super_admin is the only role allowed to choose/omit a tenant filter.
    const isSuperAdmin = callerProfile.primary_role === 'super_admin';
    const restrictTenantId: string | undefined = isSuperAdmin ? undefined : callerProfile.tenant_id;

    // ── Count matching users ──────────────────────────────────
    // v13: users_with_pii_access includes decrypted email for search;
    //      it inherits soft-delete exclusion from the underlying users_active join.
    let query = admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null);

    const f = body.filters;
    if (f.user_ids && f.user_ids.length > 0) {
      // User explicitly selected individual users via checkboxes.
      // Bypass general search/filters to honor user intent, but retain tenant_id check.
      query = query.in('id', f.user_ids);
      if (restrictTenantId) {
        query = query.eq('tenant_id', restrictTenantId);
      } else if (f.tenant_id) {
        query = query.eq('tenant_id', f.tenant_id);
      }
    } else {
      // User did not select checkboxes (e.g. bulk action on entire search results).
      // Apply full search and filters.
      if (f.search) {
        // v13: search against decrypted PII column
        query = query.or(
          `email.ilike.%${f.search}%,first_name.ilike.%${f.search}%,last_name.ilike.%${f.search}%`,
        );
      }
      if (f.primary_role) query = query.eq('primary_role', f.primary_role);
      if (f.account_status) query = query.eq('account_status', f.account_status);
      if (restrictTenantId) {
        query = query.eq('tenant_id', restrictTenantId);
      } else if (f.tenant_id) {
        query = query.eq('tenant_id', f.tenant_id);
      }
      if (f.region_id) query = query.eq('region_id', f.region_id);
    }

    const { count: estimatedCount, error: countErr } = await query;

    if (countErr) {
      // P1-SEC-003 / P1-SEC-006: never forward raw DB error text to the client
      // (internal schema/column details). Log full detail server-side only.
      console.error('[bulk-action] count query failed:', countErr);
      return errorJson('QUERY_ERROR', 'Failed to evaluate the given filters', 400);
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

    const { data: job, error: insertErr } = await admin.rpc('admin_enqueue_bulk_job', {
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
        return errorJson(
          'DUPLICATE_JOB',
          'An identical bulk action is already processing. Please wait for it to finish.',
          409,
        );
      }
      // P1-SEC-003 / P1-SEC-006: same rationale as the count-query error above —
      // the specific `.includes()` checks above still inspect the raw DB error
      // server-side; only the generic fallback is returned to the client.
      console.error('[bulk-action] enqueue failed:', insertErr);
      return errorJson('QUEUE_ERROR', 'Failed to queue the bulk action', 500);
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

    await processInlineBulkJob(admin, job, body, userData.user.id, restrictTenantId);

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
