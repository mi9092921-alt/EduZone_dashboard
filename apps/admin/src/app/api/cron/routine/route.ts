import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { createAdminClient } from '@/infrastructure/supabase/admin';
import { getServerEnv } from '@/lib/env';

function hasValidCronSecret(request: Request): boolean {
  const configuredSecret = getServerEnv().CRON_SECRET;
  const authorization = request.headers.get('authorization');
  const presentedSecret = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';

  if (!configuredSecret || !presentedSecret) return false;

  const expected = Buffer.from(configuredSecret);
  const actual = Buffer.from(presentedSecret);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getSupabaseAdmin() {
  return createAdminClient();
}

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const results: Record<string, unknown> = {};

  try {
    // 1. Manage Partitions
    const { error: partitionErr } = await supabaseAdmin.rpc('manage_partitions');
    if (partitionErr) throw new Error(`manage_partitions failed: ${partitionErr.message}`);
    results['manage_partitions'] = 'Success';

    // 2. Prune Expired Cache
    const { data: prunedData, error: pruneErr } = await supabaseAdmin.rpc(
      'prune_expired_access_cache',
    );
    if (pruneErr) throw new Error(`prune_expired_access_cache failed: ${pruneErr.message}`);
    results['pruned_count'] = prunedData;

    // 3. Process Course Enrollment Totals
    const { data: enrollmentTotalsJobs, error: totalsErr } = await supabaseAdmin.rpc(
      'process_update_enrollment_totals_jobs',
      { p_limit: 100 },
    );
    // P1-SEC-003 FIX: don't put the raw RPC/Postgres error message in the
    // response body (this is the one place in this route that did -- every
    // other RPC error is thrown and caught below, which already logs
    // server-side via console.error and returns a generic client response).
    if (totalsErr) {
      console.error('[CRON_ROUTINE_ENROLLMENT_TOTALS_ERROR]', totalsErr);
      results['enrollment_totals_jobs_processed'] = 'Skipped: worker error';
    } else {
      results['enrollment_totals_jobs_processed'] = enrollmentTotalsJobs;
    }

    // 4. Process Cache Purges from Job Queue
    // Generate a unique worker ID to maintain lease ownership and avoid race conditions
    const workerId = crypto.randomUUID();
    const { data: processedJobs, error: purgeErr } = await supabaseAdmin.rpc(
      'process_cache_purges',
      {
        p_worker_id: workerId,
        p_limit: 1000,
      },
    );

    if (purgeErr) throw new Error(`process_cache_purges failed: ${purgeErr.message}`);
    results['jobs_processed'] = processedJobs;

    // 5. Fan-out pending Notification jobs to user_notifications + push_deliveries rows.
    //
    // BUG-NOTIF-01: delegate to the canonical SQL worker, which fans out user_notifications
    // *and* push_deliveries/notification_push rows atomically per job, and is
    // granted to service_role (see BUG-NOTIF-01 in 10_permissions.sql).
    const fanoutWorkerId = crypto.randomUUID();
    const { data: fanoutCount, error: fanoutErr } = await supabaseAdmin.rpc(
      'process_notification_fanout_jobs',
      {
        p_worker_id: fanoutWorkerId,
        p_limit: 500,
      },
    );

    if (fanoutErr) {
      console.error('[CRON_ROUTINE_FANOUT_ERROR]', fanoutErr);
      results['notification_fanout_jobs_processed'] = 'Worker error';
    } else {
      results['notification_fanout_jobs_processed'] = fanoutCount;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (err: unknown) {
    console.error('[CRON_ROUTINE_ERROR]', err);
    // Return 500 to signal a cron failure out to Next.js Error Monitoring (e.g. Sentry)
    return NextResponse.json(
      {
        success: false,
        error: 'Cron worker failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
