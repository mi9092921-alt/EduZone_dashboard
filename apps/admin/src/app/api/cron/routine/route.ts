import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  jobsAdminClient,
  managePartitions,
  processCachePurges,
  processNotificationFanoutJobs,
  processUpdateEnrollmentTotalsJobs,
  pruneExpiredAccessCache,
} from '@/infrastructure/repos/jobs-rpc.service';
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

export async function GET(request: Request) {
  if (!hasValidCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // M11: all RPC call sites live in infrastructure/repos/jobs-rpc.service.ts
  const supabaseAdmin = jobsAdminClient();
  const results: Record<string, unknown> = {};

  try {
    // 1. Manage Partitions
    await managePartitions(supabaseAdmin);
    results['manage_partitions'] = 'Success';

    // 2. Prune Expired Cache
    const prunedData = await pruneExpiredAccessCache(supabaseAdmin);
    results['pruned_count'] = prunedData;

    // 3. Process Course Enrollment Totals
    // P1-SEC-003 FIX: don't put the raw RPC/Postgres error message in the
    // response body (this is the one place in this route that did -- every
    // other RPC error is thrown and caught below, which already logs
    // server-side via console.error and returns a generic client response).
    try {
      const enrollmentTotalsJobs = await processUpdateEnrollmentTotalsJobs(supabaseAdmin, 100);
      results['enrollment_totals_jobs_processed'] = enrollmentTotalsJobs;
    } catch (err) {
      console.error('[CRON_ROUTINE_ENROLLMENT_TOTALS_ERROR]', err);
      results['enrollment_totals_jobs_processed'] = 'Skipped: worker error';
    }

    // 4. Process Cache Purges from Job Queue
    // Generate a unique worker ID to maintain lease ownership and avoid race conditions
    const workerId = crypto.randomUUID();
    const processedJobs = await processCachePurges(supabaseAdmin, workerId, 1000);
    results['jobs_processed'] = processedJobs;

    // 5. Fan-out pending Notification jobs to user_notifications + push_deliveries rows.
    //
    // BUG-NOTIF-01: delegate to the canonical SQL worker, which fans out user_notifications
    // *and* push_deliveries/notification_push rows atomically per job, and is
    // granted to service_role (see BUG-NOTIF-01 in 10_permissions.sql).
    const fanoutWorkerId = crypto.randomUUID();
    try {
      const fanoutCount = await processNotificationFanoutJobs(supabaseAdmin, fanoutWorkerId, 500);
      results['notification_fanout_jobs_processed'] = fanoutCount;
    } catch (err) {
      console.error('[CRON_ROUTINE_FANOUT_ERROR]', err);
      results['notification_fanout_jobs_processed'] = 'Worker error';
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
