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

    // 5. Fan-out pending Notification jobs to user_notifications rows in TypeScript
    const fanoutWorkerId = crypto.randomUUID();
    let fanoutCount = 0;

    const supabaseInternal = getSupabaseAdmin().schema('internal');

    try {
      const { data: jobs, error: dequeueErr } = await supabaseAdmin.rpc('dequeue_job', {
        p_worker_id: fanoutWorkerId,
        p_job_types: ['notification_fanout'],
        p_lock_duration_seconds: 300,
      });

      if (dequeueErr) {
        throw new Error(`dequeue_job for fanout failed: ${dequeueErr.message}`);
      }

      const activeJobs = (jobs || []) as any[];
      const jobsToProcess = activeJobs.slice(0, 500);

      for (const job of jobsToProcess) {
        const notifId = job.payload?.notification_id;
        const tenantId = job.payload?.tenant_id;
        const audience = job.payload?.target_audience;

        if (!notifId || !tenantId) {
          await supabaseInternal
            .from('job_queue')
            .update({
              status: 'failed',
              error_message: 'Invalid payload: missing notification_id or tenant_id',
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
          continue;
        }

        try {
          let query = supabaseAdmin
            .from('users')
            .select('id, primary_role')
            .eq('tenant_id', tenantId)
            .is('deleted_at', null)
            .eq('account_status', 'active');

          if (audience === 'students') {
            query = query.eq('primary_role', 'student');
          } else if (audience === 'teachers') {
            query = query.eq('primary_role', 'teacher');
          } else if (audience === 'admins') {
            query = query.in('primary_role', ['admin', 'super_admin']);
          }

          const { data: users, error: usersErr } = await query;
          if (usersErr) throw usersErr;

          if (users && users.length > 0) {
            const { data: existingNotifs } = await supabaseAdmin
              .from('user_notifications')
              .select('user_id')
              .eq('notification_id', notifId);

            const existingUserIds = new Set((existingNotifs || []).map((un: any) => un.user_id));

            const insertRows = users
              .filter(u => !existingUserIds.has(u.id))
              .map(u => ({
                user_id: u.id,
                notification_id: notifId,
                tenant_id: tenantId,
                is_read: false
              }));

            if (insertRows.length > 0) {
              const { error: insertErr } = await supabaseAdmin
                .from('user_notifications')
                .insert(insertRows);

              if (insertErr) throw insertErr;
            }
          }

          await supabaseInternal
            .from('job_queue')
            .update({
              status: 'done',
              finished_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);

          fanoutCount++;
        } catch (jobErr: any) {
          console.error(`[CRON_ROUTINE_FANOUT_JOB_ERROR] Job ID ${job.id} failed:`, jobErr);
          const attempts = (job.attempts || 0) + 1;
          const maxAttempts = job.max_attempts || 3;

          await supabaseInternal
            .from('job_queue')
            .update({
              status: attempts >= maxAttempts ? 'failed' : 'pending',
              error_message: jobErr.message,
              locked_by_worker_id: null,
              locked_at: null,
              lock_expires_at: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
        }
      }

      results['notification_fanout_jobs_processed'] = fanoutCount;
    } catch (fanoutErr: any) {
      console.error('[CRON_ROUTINE_FANOUT_ERROR]', fanoutErr);
      results['notification_fanout_jobs_processed'] = 'Worker error';
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
