import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function hasValidCronSecret(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET;
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('Cron worker is not configured');
  }
  return createClient(url, serviceRoleKey);
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
    const { data: prunedData, error: pruneErr } = await supabaseAdmin.rpc('prune_expired_access_cache');
    if (pruneErr) throw new Error(`prune_expired_access_cache failed: ${pruneErr.message}`);
    results['pruned_count'] = prunedData;

    // 3. Process Course Enrollment Totals
    const { data: enrollmentTotalsJobs, error: totalsErr } = await supabaseAdmin.rpc(
      'process_update_enrollment_totals_jobs',
      { p_limit: 100 },
    );
    results['enrollment_totals_jobs_processed'] = totalsErr
      ? `Skipped: ${totalsErr.message}`
      : enrollmentTotalsJobs;

    // 4. Process Cache Purges from Job Queue
    // Generate a unique worker ID to maintain lease ownership and avoid race conditions
    const workerId = crypto.randomUUID();
    const { data: processedJobs, error: purgeErr } = await supabaseAdmin.rpc('process_cache_purges', {
      p_worker_id: workerId,
      p_limit: 1000
    });
    
    if (purgeErr) throw new Error(`process_cache_purges failed: ${purgeErr.message}`);
    results['jobs_processed'] = processedJobs;

    // 5. Fan-out pending Notification jobs to user_notifications + push_deliveries rows.
    //
    // BUG-NOTIF-01: this used to be a hand-rolled TypeScript reimplementation of
    // internal.process_notification_fanout_jobs() that (a) called the `dequeue_job`
    // RPC with a parameter named `p_lock_duration_seconds`, while the actual SQL
    // function parameter is `p_lock_ttl_seconds` — PostgREST cannot resolve a
    // function overload for an unknown named parameter, so every single call
    // failed, the error was swallowed into
    // `results.notification_fanout_jobs_processed = 'Worker error'`, and the
    // route still returned `success: true`, masking the failure; and (b) even if
    // the dequeue had worked, it only ever inserted `user_notifications` rows and
    // never created `push_deliveries` / `notification_push` job rows, so push
    // notifications could never fire even for the notifications that did land in
    // a student's in-app inbox.
    //
    // Net effect: any audience-targeted broadcast ('all'/'students'/'teachers'/
    // 'admins') was queued in internal.job_queue by the `fanout_notification`
    // trigger, but never dequeued — so it never reached a single student, in-app
    // or via push. (Notifications sent to explicit target_user_ids were not
    // affected: send_notification() inserts those directly into
    // user_notifications.)
    //
    // Fix: delegate to the canonical SQL worker, which fans out user_notifications
    // *and* push_deliveries/notification_push rows atomically per job, and is
    // granted to service_role (see BUG-NOTIF-01 in 10_permissions.sql).
    const fanoutWorkerId = crypto.randomUUID();
    const { data: fanoutProcessed, error: fanoutErr } = await supabaseAdmin.rpc(
      'process_notification_fanout_jobs',
      { p_limit: 500, p_worker_id: fanoutWorkerId },
    );

    if (fanoutErr) {
      console.error('[CRON_ROUTINE_FANOUT_ERROR]', fanoutErr);
      results['notification_fanout_jobs_processed'] = `Worker error: ${fanoutErr.message}`;
    } else {
      results['notification_fanout_jobs_processed'] = fanoutProcessed ?? 0;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });
  } catch (err: any) {
    console.error('[CRON_ROUTINE_ERROR]', err);
    // Return 500 to signal a cron failure out to Next.js Error Monitoring (e.g. Sentry)
    return NextResponse.json({
      success: false,
      error: 'Cron worker failed',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
