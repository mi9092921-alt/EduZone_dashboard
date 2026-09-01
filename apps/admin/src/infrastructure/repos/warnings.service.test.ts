import { describe, it, expect, vi, beforeEach } from 'vitest';

import { container } from '@/container';

// ── Mock the container ────────────────────────────────────────────
vi.mock('@/container', () => ({
  container: {
    supabase: {
      rpc: vi.fn(),
      from: vi.fn(),
      auth: { getUser: vi.fn() },
    },
  },
}));

vi.mock('@/application/actions/user.actions', () => ({
  issueWarningAction: vi.fn(),
}));

// ── Helper: build a chainable query-builder mock ──────────────────
function setupQuery(resolved: unknown) {
  const q: Record<string, unknown> = {};
  [
    'select',
    'eq',
    'is',
    'in',
    'or',
    'order',
    'range',
    'limit',
    'gte',
    'lte',
    'not',
    'update',
    'insert',
    'delete',
  ].forEach((fn) => {
    q[fn] = vi.fn().mockReturnValue(q);
  });
  q['single'] = vi.fn().mockResolvedValue(resolved);
  q['maybeSingle'] = vi.fn().mockResolvedValue(resolved);
  q['then'] = vi.fn().mockImplementation((cb: (v: unknown) => unknown) => cb(resolved));
  return q;
}

describe('warnings.service', () => {
  const mockFrom = container.supabase.from as ReturnType<typeof vi.fn>;

  beforeEach(() => vi.clearAllMocks());

  async function importService() {
    return await import('./warnings.service');
  }

  // ── getWarnings ─────────────────────────────────────────────────
  it('getWarnings — returns paginated warnings with student info joined', async () => {
    const q = setupQuery({
      data: [
        {
          id: 'w1',
          user_id: 'u1',
          severity: 2,
          reason: 'Late submissions',
          action_taken: 'none',
          created_at: '2026-01-01',
          // v13: student is joined from users_with_pii_access; email is in email_decrypted
          student: { first_name: 'Ali', last_name: 'Hassan', email: 'ali@t.com', avatar_url: null },
          issuer: { first_name: 'Admin', last_name: 'User' },
        },
      ],
      count: 1,
      error: null,
    });
    mockFrom.mockReturnValue(q);

    const { getWarnings } = await importService();
    const result = await getWarnings({}, 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.student_name).toBe('Ali Hassan');
    expect(result.data[0]?.student_email).toBe('ali@t.com');
    expect(result.data[0]?.issuer_name).toBe('Admin User');
    expect(result.count).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it('getWarnings — applies issued_by and severity filters', async () => {
    const q = setupQuery({ data: [], count: 0, error: null });
    mockFrom.mockReturnValue(q);

    const { getWarnings } = await importService();
    await getWarnings({ issued_by: 'admin1', severity: 3 }, 1, 20);

    expect(q.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('issued_by', 'admin1');
    expect(q.eq as ReturnType<typeof vi.fn>).toHaveBeenCalledWith('severity', 3);
  });

  it('getWarnings — throws on Supabase error', async () => {
    const q = setupQuery({ data: null, error: { code: 'DB_ERROR', message: 'fail' }, count: null });
    mockFrom.mockReturnValue(q);

    const { getWarnings } = await importService();
    await expect(getWarnings({}, 1, 10)).rejects.toMatchObject({ code: 'DB_ERROR' });
  });

  // ── issueWarning ────────────────────────────────────────────────
  it('issueWarning — delegates to issueWarningAction', async () => {
    const { issueWarningAction } = await import('@/application/actions/user.actions');
    (issueWarningAction as any).mockResolvedValue({ success: true, warningId: 'warning-uuid-001' });

    const { issueWarning } = await importService();
    const id = await issueWarning('user-1', 'Violating community guidelines', 2, 'none');

    expect(issueWarningAction).toHaveBeenCalledWith(
      'user-1',
      'Violating community guidelines',
      2,
      'none',
    );
    expect(id).toBe('warning-uuid-001');
  });

  it('issueWarning — throws when the action reports failure', async () => {
    const { issueWarningAction } = await import('@/application/actions/user.actions');
    (issueWarningAction as any).mockResolvedValue({ success: false, error: 'Too many warnings' });

    const { issueWarning } = await importService();
    await expect(issueWarning('u1', 'reason', 1, 'none')).rejects.toThrow('Too many warnings');
  });

  // ── getTeacherStudents ──────────────────────────────────────────
  it('getTeacherStudents — returns empty array when teacher has no courses', async () => {
    mockFrom.mockImplementation(() => setupQuery({ data: [], error: null }));

    const { getTeacherStudents } = await importService();
    const result = await getTeacherStudents('teacher-1');
    expect(result).toEqual([]);
  });

  it('getTeacherStudents — deduplicates students enrolled in multiple courses', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // courses_active query
        return setupQuery({
          data: [
            { id: 'c1', title: 'Course A' },
            { id: 'c2', title: 'Course B' },
          ],
          error: null,
        });
      }
      // enrollments_active query — student u1 appears in both courses
      // v13: user data is in users_with_pii_access with email_decrypted
      return setupQuery({
        data: [
          {
            user_id: 'u1',
            course_id: 'c1',
            users: { first_name: 'Sara', last_name: 'Ali', email: 's@t.com', avatar_url: null },
          },
          {
            user_id: 'u1',
            course_id: 'c2',
            users: { first_name: 'Sara', last_name: 'Ali', email: 's@t.com', avatar_url: null },
          },
          {
            user_id: 'u2',
            course_id: 'c1',
            users: { first_name: 'Omar', last_name: 'K', email: 'o@t.com', avatar_url: null },
          },
        ],
        error: null,
      });
    });

    const { getTeacherStudents } = await importService();
    const result = await getTeacherStudents('teacher-1');

    // u1 appears once (deduped by user_id+course_id combination)
    // u1 in c1, u1 in c2 → 2 entries (different courses), u2 in c1 → 3 total
    expect(result).toHaveLength(3);
    const names = result.map((s) => s.email);
    expect(names).toEqual(expect.arrayContaining(['s@t.com', 'o@t.com']));
  });

  // ── getStudentProgress ──────────────────────────────────────────
  it('getStudentProgress — joins progress data from user_progress table', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // enrollments_active query
        // v13: user data is in users_with_pii_access with email_decrypted
        return setupQuery({
          data: [
            {
              user_id: 'u1',
              status: 'active',
              enrolled_at: '2026-01-01',
              completed_at: null,
              progress_pct: 75,
              last_watched_at: '2026-03-01',
              users: { first_name: 'Ali', last_name: 'H', email: 'ali@t.com', avatar_url: null },
            },
          ],
          count: 1,
          error: null,
        });
      }
      // user_progress query (not called in new implementation — progress_pct is in enrollments)
      return setupQuery({
        data: [{ user_id: 'u1', progress_pct: 75, last_watched: '2026-03-01', completed: false }],
        error: null,
      });
    });

    const { getStudentProgress } = await importService();
    const result = await getStudentProgress('course-1', 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.progress_pct).toBe(75);
    expect(result.data[0]?.email).toBe('ali@t.com');
  });
});
