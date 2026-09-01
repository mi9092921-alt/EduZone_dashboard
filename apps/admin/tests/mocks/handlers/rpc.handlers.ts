import { http, HttpResponse } from 'msw';

// ── Shared test constants ────────────────────────────────────────
export const MOCK_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const MOCK_USER_ID = '00000000-0000-0000-0000-000000000002';
export const MOCK_JOB_ID = '00000000-0000-0000-0000-000000000099';
export const SUPABASE_URL = 'http://127.0.0.1:54321'; // local dev fallback

// ── RPC handlers ─────────────────────────────────────────────────
export const rpcHandlers = [
  // ── check_dashboard_access — happy path ──────────────────────────
  http.post('*/rest/v1/rpc/check_dashboard_access', () =>
    HttpResponse.json({ allowed: true, role: 'admin', tenant_id: MOCK_TENANT_ID }),
  ),

  // ── get_users ────────────────────────────────────────────────────
  http.post('*/rest/v1/rpc/get_users', () =>
    HttpResponse.json([
      {
        id: MOCK_USER_ID,
        email: 'user@test.com',
        primary_role: 'student',
        account_status: 'active',
        tenant_id: MOCK_TENANT_ID,
        warning_count: 0,
        shard_key: 1,
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        email: 'user2@test.com',
        primary_role: 'teacher',
        account_status: 'active',
        tenant_id: MOCK_TENANT_ID,
        warning_count: 0,
        shard_key: 1,
      },
    ]),
  ),

  // ── control_user_account ─────────────────────────────────────────
  http.post('*/rest/v1/rpc/control_user_account', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const action = body.p_action as string;

    // Missing reason for ban → ADMIN_ONLY error
    if (action === 'ban' && !body.p_reason) {
      return HttpResponse.json(
        { code: 'ADMIN_ONLY', message: 'Reason is required for ban action.' },
        { status: 403 },
      );
    }

    const statusMap: Record<string, string> = {
      lock: 'locked',
      unlock: 'active',
      suspend: 'suspended',
      ban: 'banned',
    };

    return HttpResponse.json({
      status: statusMap[action] ?? 'active',
      suspension_until:
        action === 'suspend' ? new Date(Date.now() + 48 * 3600_000).toISOString() : null,
    });
  }),

  // ── issue_warning ────────────────────────────────────────────────
  http.post('*/rest/v1/rpc/issue_warning', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (!body.p_reason || (body.p_reason as string).length < 20) {
      return HttpResponse.json(
        { code: 'INVALID_FILTERS', message: 'Reason must be at least 20 characters.' },
        { status: 400 },
      );
    }
    return HttpResponse.json({ warning_id: 'warn-001', auto_suspended: false });
  }),

  // ── terminate_user_sessions ──────────────────────────────────────
  http.post('*/rest/v1/rpc/terminate_user_sessions', () =>
    HttpResponse.json({ terminated_count: 3 }),
  ),

  // ── reset_user_device ────────────────────────────────────────────
  http.post('*/rest/v1/rpc/reset_user_device', () => HttpResponse.json({ deactivated_count: 2 })),

  // ── bind_device_for_current_user — rate limit test ───────────────
  http.post('*/rest/v1/rpc/bind_device_for_current_user', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    // Simulate rate-limit trigger when special marker device_id is sent
    if ((body.p_device_id as string)?.startsWith('rate-limit-test')) {
      return HttpResponse.json(
        { code: 'RATE_LIMITED', message: 'Too many bind attempts. Try again later.' },
        { status: 429 },
      );
    }
    return HttpResponse.json({ success: true, device_id: body.p_device_id });
  }),

  // ── get_setting ──────────────────────────────────────────────────
  http.post('*/rest/v1/rpc/get_setting', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    const settingMap: Record<string, string> = {
      maintenance_mode: 'false',
      maintenance_message: 'System is under maintenance.',
      app_locked: 'false',
    };
    return HttpResponse.json(settingMap[body.p_key as string] ?? null);
  }),

  // ── set_setting ──────────────────────────────────────────────────
  http.post('*/rest/v1/rpc/set_setting', () => HttpResponse.json({ success: true })),

  // ── get_audit_chain_state ────────────────────────────────────────
  http.post('*/rest/v1/rpc/get_audit_chain_state', () =>
    HttpResponse.json({
      genesis_hash: 'genesis_abc123',
      last_seq: 100,
      last_hash: 'abc123def456',
      total_entries: 100,
    }),
  ),

  // ── Edge Function: bulk-action ───────────────────────────────────
  http.post('*/functions/v1/bulk-action', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    if (body.dry_run) {
      return HttpResponse.json({
        estimated_count: 12,
        dry_run: true,
      });
    }
    return HttpResponse.json({
      job_id: MOCK_JOB_ID,
      estimated_count: 12,
      status: 'pending',
      created_at: new Date().toISOString(),
    });
  }),

  // ── job_queue polling ────────────────────────────────────────────
  http.get('*/rest/v1/job_queue', () =>
    HttpResponse.json([
      {
        id: MOCK_JOB_ID,
        status: 'done',
        error_msg: JSON.stringify({ processed: 12, total: 12, failed_ids: [] }),
      },
    ]),
  ),
];
