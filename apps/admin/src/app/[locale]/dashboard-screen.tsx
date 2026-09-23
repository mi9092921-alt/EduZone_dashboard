'use client';

import { useAuthUser, useIsTeacher } from '@/adapters/stores/auth.store';
import { AdminDashboard } from '@/features/dashboard/components/AdminDashboard';
import { TeacherDashboard } from '@/features/dashboard/components/TeacherDashboard';
import { AdminShell } from '@/features/layout';

export default function DashboardScreen() {
  const user = useAuthUser();
  const isTeacher = useIsTeacher();

  if (!user) return null;

  return <AdminShell>{isTeacher ? <TeacherDashboard /> : <AdminDashboard />}</AdminShell>;
}
