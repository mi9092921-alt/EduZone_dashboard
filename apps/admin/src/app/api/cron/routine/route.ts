import { randomUUID, timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import {
  jobsAdminClient,
  processCourseNotifyJobs,
  managePartitions,
  processCachePurges,
  processNotificationFanoutJobs,
  processUpdateEnrollmentTotalsJobs,
  pruneExpiredAccessCache,
  getCronQueueHealth,
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
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  // M11: all RPC call sites live in infrastructure/repos/jobs-rpc.service.ts
  const supabaseAdmin = jobsAdminClient();
  const results: Record<string, unknown> = {};

  try {
    const failures: string[] = [];
    const runStep = async <T>(name: string, work: () => Promise<T>) => {
      try {
        results[name] = await work();
      } catch (err) {
        failures.push(name);
        results[name] = 'Worker error';
        console.error(`[CRON_ROUTINE_${name.toUpperCase()}_ERROR]`, err);
      }
    };

    // Each step is isolated so a maintenance failure cannot prevent
    // notification fan-out from running on the same tick.
    await runStep('manage_partitions', () => managePartitions(supabaseAdmin));
    await runStep('pruned_count', () => pruneExpiredAccessCache(supabaseAdmin));
    await runStep('enrollment_totals_jobs_processed', () =>
      processUpdateEnrollmentTotalsJobs(supabaseAdmin, 100),
    );
    await runStep('jobs_processed', () => processCachePurges(supabaseAdmin, randomUUID(), 1000));
    await runStep('notification_fanout_jobs_processed', () =>
      processNotificationFanoutJobs(supabaseAdmin, randomUUID(), 500),
    );
    await runStep('course_notify_jobs_processed', () =>
      processCourseNotifyJobs(supabaseAdmin, randomUUID(), 500),
    );
    await runStep('queue_health', () => getCronQueueHealth(supabaseAdmin));

    return NextResponse.json(
      {
        success: failures.length === 0,
        timestamp: new Date().toISOString(),
        results,
        ...(failures.length > 0 ? { failed_steps: failures } : {}),
      },
      {
        status: failures.length > 0 ? 500 : 200,
        // PHASE 3 (WEB-002): auth/ops-sensitive JSON must never be stored
        // by a shared cache — set explicitly at the handler so the guarantee
        // does not depend on middleware header-merge behavior.
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (err: unknown) {
    console.error('[CRON_ROUTINE_ERROR]', err);
    // Return 500 to signal a cron failure out to Next.js Error Monitoring (e.g. Sentry)
    return NextResponse.json(
      {
        success: false,
        error: 'Cron worker failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
