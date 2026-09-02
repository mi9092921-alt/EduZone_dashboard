import type { SupabaseClient } from '@supabase/supabase-js';

import type { ITenantAdminRepository, NewTenantRow } from '@/application/ports/ITenantAdminRepository';
import { mapDbError } from '@/domain/errors';
import type { Tenant, UpdateTenantInput } from '@/domain/types/tenant.types';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Supabase implementation of ITenantAdminRepository.
 *
 * Uses the service-role (admin) client — tenant administration bypasses RLS
 * and is super-admin gated at the action boundary (see tenants.actions.ts).
 */
export function makeTenantAdminRepository(
  admin: SupabaseClient = createAdminClient(),
): ITenantAdminRepository {
  return {
    async slugExists(slug: string): Promise<boolean> {
      const { count } = await admin
        .from('tenants')
        .select('id', { count: 'exact', head: true })
        .eq('slug', slug)
        .is('deleted_at', null);
      return (count ?? 0) > 0;
    },

    async create(row: NewTenantRow): Promise<Tenant> {
      const { data, error } = await admin
        .from('tenants')
        .insert({
          slug: row.slug,
          name: row.name,
          plan: row.plan,
          region_id: row.region_id,
          max_users: row.max_users,
          max_courses: row.max_courses,
          max_storage_bytes: row.max_storage_bytes,
          metadata: row.metadata,
        })
        .select()
        .single();

      if (error) throw mapDbError(error, 'tenant-admin.repository.ts');
      return data as Tenant;
    },

    async update(id: string, input: UpdateTenantInput): Promise<Tenant> {
      const { data, error } = await admin
        .from('tenants')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw mapDbError(error, 'tenant-admin.repository.ts');
      return data as Tenant;
    },

    async suspend(id: string, reason: string, suspendedAt: string): Promise<void> {
      const { error } = await admin
        .from('tenants')
        .update({
          status: 'suspended',
          metadata: { suspended_reason: reason, suspended_at: suspendedAt },
          updated_at: suspendedAt,
        })
        .eq('id', id);

      if (error) throw mapDbError(error, 'tenant-admin.repository.ts');
    },

    async softDelete(id: string): Promise<void> {
      const now = new Date().toISOString();
      const { error } = await admin
        .from('tenants')
        .update({
          status: 'deleted',
          deleted_at: now,
          updated_at: now,
        })
        .eq('id', id);

      if (error) throw mapDbError(error, 'tenant-admin.repository.ts');
    },

    async logSuspension(input: {
      userId: string;
      tenantId: string;
      reason: string;
    }): Promise<void> {
      await admin.from('activity_logs').insert({
        user_id: input.userId,
        tenant_id: input.tenantId,
        activity_type: 'tenant_suspended',
        details: { reason: input.reason },
        risk_level: 'high',
      });
    },
  };
}
