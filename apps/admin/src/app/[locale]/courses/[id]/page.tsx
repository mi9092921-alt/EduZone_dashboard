'use client';

import { AdminShell } from '@/features/layout';
import { TeacherCourseDetailPage } from '@/features/teacher';

export default function CourseDetailRoute() {
  return (
    <AdminShell>
      <TeacherCourseDetailPage />
    </AdminShell>
  );
}
