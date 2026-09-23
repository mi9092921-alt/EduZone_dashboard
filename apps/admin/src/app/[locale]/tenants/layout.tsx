import { requirePageAccess } from '@/infrastructure/auth/page-guard';

/**
 * PHASE 2.5 (G1): server-side role gate for this segment — mirrors
 * config/route-access.config.ts. Data authorization itself remains with
 * RLS + server-action boundaries.
 */
export default async function TenantsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageAccess('tenants');
  return <>{children}</>;
}
