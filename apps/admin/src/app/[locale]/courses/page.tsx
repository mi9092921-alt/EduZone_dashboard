'use client';

import { useAuthUser } from '@/adapters/stores/auth.store';
import { CoursesPage } from '@/features/courses';
import { AdminShell } from '@/features/layout';
import { MyCoursesPage } from '@/features/teacher';

export default function CoursesRoute() {
  const user = useAuthUser();
  const isTeacher = user?.primary_role === 'teacher';

  return (
    <AdminShell>
      {isTeacher ? <MyCoursesPage /> : <CoursesPage />}
    </AdminShell>
  );
}
