'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';

import { useAuthUser } from '@/adapters/stores/auth.store';
import { CourseDetailPage } from '@/features/courses';
import { AdminShell } from '@/features/layout';
import { TeacherCourseDetailPage } from '@/features/teacher';

export default function CourseDetailRoute() {
  const user = useAuthUser();
  const { id } = useParams() as { id: string };
  const isTeacher = user?.primary_role === 'teacher';

  return (
    <AdminShell>
      <Suspense>
        {isTeacher ? (
          <TeacherCourseDetailPage />
        ) : (
          <CourseDetailPage courseId={id} />
        )}
      </Suspense>
    </AdminShell>
  );
}
