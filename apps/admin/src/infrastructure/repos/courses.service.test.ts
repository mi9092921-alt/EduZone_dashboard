import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  getCourses,
  getCourseById,
  createCourse,
  deleteCourse,
  getCourseSections,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createLesson,
  createLessons,
  updateLesson,
  deleteLesson,
  reorderLessons,
  getCourseEnrollments,
  getAllCourseEnrollments,
  enrollStudent,
  revokeEnrollment,
  getCourseStats,
} from './courses.service';

import { container } from '@/container';

vi.mock('@/container', () => ({
  container: {
    supabase: {
      from: vi.fn(),
      auth: { getUser: vi.fn() },
      rpc: vi.fn(),
    },
  },
}));

vi.mock('@/application/actions/admin.actions', () => ({
  deleteCourseAction: vi.fn(),
  getCourseStatsAction: vi.fn(),
}));

describe('courses.service', () => {
  const mockFrom = container.supabase.from as any;
  const mockAuth = container.supabase.auth.getUser as any;
  const mockRpc = (container.supabase as any).rpc as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const setupQuery = (resolvedValue: any) => {
    const mockQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(resolvedValue),
      maybeSingle: vi.fn().mockResolvedValue(resolvedValue),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      then: vi.fn().mockImplementation((cb) => cb(resolvedValue)),
    };
    return mockQuery;
  };

  it('getCourses filters and paginates', async () => {
    const q = setupQuery({
      data: [{ title: 'C1', teacher: { first_name: 'A', last_name: 'B' } }],
      count: 1,
      error: null,
    });
    mockFrom.mockReturnValue(q);
    const res = await getCourses(
      {
        search: 'react',
        status: 'published',
        category: 'IT',
        level: 'beginner',
        is_free: true,
        teacher_id: 't1',
        tenant_id: 'ten1',
      },
      1,
      10,
    );
    expect(res.data).toHaveLength(1);
    expect(res.data[0]!.teacher_name).toBe('A B');
    expect(q.ilike).toHaveBeenCalledWith('title', '%react%');
    expect(q.eq).toHaveBeenCalledWith('category', 'IT');
  });

  it('getCourseById joins sections and lessons', async () => {
    const courseQuery = setupQuery({
      data: { id: 'c1', teacher: { first_name: 'John' } },
      error: null,
    });
    const sectionsQuery = setupQuery({
      data: [{ id: 's1', lessons: [{ id: 'l1' }] }],
      error: null,
    });

    mockFrom.mockReturnValueOnce(courseQuery).mockReturnValueOnce(sectionsQuery);

    const res = await getCourseById('c1');
    expect(res!.teacher_name).toBe('John');
    expect(res!.sections).toHaveLength(1);
  });

  it('createCourse handles tenant logic', async () => {
    mockAuth.mockResolvedValue({ data: { user: { id: 'u' } } });

    // First query is `users` to get tenant_id, second is `courses` to insert
    mockFrom.mockImplementation((table: string) => {
      if (table === 'users') {
        return setupQuery({ data: { tenant_id: 'tenant-123' }, error: null });
      }
      return setupQuery({ data: { id: 'cnew' }, error: null });
    });

    const c = await createCourse({ title: 'New', is_free: true });
    expect(c.id).toBe('cnew');
  });

  it('deleteCourse delegates to deleteCourseAction', async () => {
    const { deleteCourseAction } = await import('@/application/actions/admin.actions');
    (deleteCourseAction as any).mockResolvedValue(undefined);
    await deleteCourse('c1');
    expect(deleteCourseAction).toHaveBeenCalledWith('c1');
  });

  it('enrollStudent success and duplicate handling', async () => {
    // 1. Success case
    mockRpc.mockResolvedValueOnce({ data: 'enrollment-123', error: null });
    const res = await enrollStudent('u1', 'c1', 'admin', '2025-01-01');
    expect(res).toBe('enrollment-123');
    expect(mockRpc).toHaveBeenLastCalledWith('enroll_student', {
      p_user_id: 'u1',
      p_course_id: 'c1',
      p_expires_at: '2025-01-01',
    });

    // 2. Duplicate case
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value', code: '23505' },
    });
    await expect(enrollStudent('u1', 'c1', 'admin', '2025-01-01')).rejects.toThrow('DUPLICATE');
  });

  it('getCourseSections, createSection, updateSection, deleteSection, reorderSections', async () => {
    const q = setupQuery({ data: [{ id: 's1', lessons: [] }], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'courses') {
        return setupQuery({ data: { tenant_id: 'tenant-123' }, error: null });
      }
      return q;
    });

    await getCourseSections('c1');
    expect(q.select).toHaveBeenCalled();

    await createSection('c1', { title: 'S1', order_index: 1 });
    expect(q.insert).toHaveBeenCalled();

    await updateSection('s1', { title: 'S1 updated' });
    expect(q.update).toHaveBeenCalled();

    await deleteSection('s1');
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );

    mockRpc.mockResolvedValue({ error: null });
    await reorderSections([{ id: 's1', order_index: 2 }]);
    expect(mockRpc).toHaveBeenCalledWith('reorder_course_sections', {
      p_section_updates: [{ id: 's1', order_index: 2 }],
    });
  });

  it('createLesson, createLessons, updateLesson, deleteLesson, reorderLessons', async () => {
    const q = setupQuery({ data: [{ id: 'l1' }], error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'sections') {
        return setupQuery({ data: { course_id: 'c1', tenant_id: 'tenant-123' }, error: null });
      }
      return q;
    });

    await createLesson('s1', { title: 'L1', order_index: 1 });
    expect(q.insert).toHaveBeenCalled();

    await createLessons('s1', [{ title: 'L2', order_index: 2 }]);
    expect(q.insert).toHaveBeenCalled();

    await updateLesson('l1', { title: 'L1 updated' });
    expect(q.update).toHaveBeenCalled();

    await deleteLesson('l1');
    expect(q.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    );

    await reorderLessons([{ id: 'l1', order_index: 2 }]);
    expect(q.update).toHaveBeenCalled();
  });

  it('getCourseEnrollments and getAllCourseEnrollments', async () => {
    const q = setupQuery({ data: [{ id: 'e1', users: { email: 'e' } }], count: 1, error: null });
    mockFrom.mockReturnValue(q);

    const res1 = await getCourseEnrollments('c1', 1, 10);
    expect(res1.data[0]!.user_email).toBe('e');

    const res2 = await getAllCourseEnrollments('c1');
    expect(res2[0]!.user_email).toBe('e');
  });

  it('revokeEnrollment', async () => {
    const q = setupQuery({ error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'enrollments') {
        return setupQuery({ data: { user_id: 'u1', course_id: 'c1' }, error: null });
      }
      return q;
    });
    mockRpc.mockResolvedValue({ error: null });

    await revokeEnrollment('e1', 'admin', 'reason');
    expect(mockRpc).toHaveBeenCalledWith(
      'revoke_enrollment',
      expect.objectContaining({
        p_user_id: 'u1',
        p_course_id: 'c1',
        p_reason: 'reason',
      }),
    );
  });

  it('getCourseStats handles success and catch block', async () => {
    const { getCourseStatsAction } = await import('@/application/actions/admin.actions');

    (getCourseStatsAction as any).mockResolvedValue({ course_id: 'c1' });
    const stats = await getCourseStats('c1');
    expect(stats!.course_id).toBe('c1');

    (getCourseStatsAction as any).mockRejectedValue(new Error('fail'));
    const stats2 = await getCourseStats('c1');
    expect(stats2).toBeNull();
  });
});
