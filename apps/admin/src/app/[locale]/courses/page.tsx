'use client';

import { AdminShell } from '@/features/layout';
import { CoursesPage } from '@/features/courses';
import { MyCoursesPage } from '@/features/teacher';
import { useAuthUser } from '@/adapters/stores/auth.store';

export default function CoursesRoute() {
  const user = useAuthUser();
  const isTeacher = user?.primary_role === 'teacher';

  return (
    <AdminShell>
      {isTeacher ? <MyCoursesPage /> : <CoursesPage />}
    </AdminShell>
  );
}
