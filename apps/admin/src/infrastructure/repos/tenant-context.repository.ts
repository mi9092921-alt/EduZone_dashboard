import type { ITenantContextRepository, TenantContextResult } from '@/application/ports/ITenantContextRepository';
import { mapDbError } from '@/domain/errors';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Supabase implementation of ITenantContextRepository.
 *
 * Uses the session-bound server client (not the admin/service-role
 * client): switch_tenant_context (07_functions.sql) is SECURITY DEFINER
 * but reads auth.uid() to know which super_admin is switching, and the
 * admin client carries no JWT at all — calling it with that client would
 * silently operate on nobody.
 */
export function makeTenantContextRepository(): ITenantContextRepository {
  return {
    async switchContext(tenantId: string | null): Promise<TenantContextResult> {
      const supabase = await createServerClient();
      const { data, error } = await supabase.rpc('switch_tenant_context', {
        p_tenant_id: tenantId,
      });
      if (error) throw mapDbError(error, 'tenant-context.repository.ts');

      // switch_tenant_context RETURNS TABLE(...) -> PostgREST returns an
      // array with exactly one row.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        throw mapDbError(
          { code: 'INFRA_ERROR', message: 'switch_tenant_context returned no row' },
          'tenant-context.repository.ts',
        );
      }

      return { tenantId: row.tenant_id as string, tenantName: row.tenant_name as string };
    },
  };
}
