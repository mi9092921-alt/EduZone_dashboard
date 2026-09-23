import DashboardScreen from './dashboard-screen';

import { requirePageAccess } from '@/infrastructure/auth/page-guard';

/**
 * PHASE 2.5 (G1): the dashboard root is a server wrapper so the staff-role
 * gate runs at the server boundary before any client bundle is served
 * (the role matrix previously lived only in client-side AdminShell).
 */
export default async function DashboardPage() {
  await requirePageAccess('dashboard');
  return <DashboardScreen />;
}
