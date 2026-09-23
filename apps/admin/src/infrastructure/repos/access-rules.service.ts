import type { AccessRule, PaginatedResult } from '@eduzone/types';

import { container } from '@/container';
import { mapDbError } from '@/domain/errors';
import type { UpsertAccessRuleInput } from '@/domain/schemas/settings.schema';

/**
 * Access Rules service — browser-safe management for the access_rules table.
 *
 * P1 FIX (server/client boundary): this module MUST NOT import the
 * service-role client — it is bundled for client components. Privileged
 * variants (`getAccessRulesAdmin`, `upsertAccessRuleAdmin`,
 * `getAccessRuleTenantId`, `deleteAccessRuleAdmin`, `toggleAccessRuleAdmin`)
 * live in `./access-rules.admin` (server-only).
 */

export async function getAccessRules(
  tenantId?: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<AccessRule>> {
  const { supabase } = container;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from('access_rules').select('*', { count: 'exact' });

  if (tenantId) {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) {
    return { data: [], count: 0, page, pageSize, totalPages: 0 };
  }

  const total = count ?? 0;
  return {
    data: (data ?? []) as AccessRule[],
    count: total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function upsertAccessRule(rule: UpsertAccessRuleInput): Promise<AccessRule> {
  const { supabase } = container;
  const { data, error } = await supabase
    .from('access_rules')
    .upsert({ ...rule, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw mapDbError(error, 'access-rules.service.ts');
  return data as AccessRule;
}

export async function deleteAccessRule(id: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('access_rules').delete().eq('id', id);
  if (error) throw mapDbError(error, 'access-rules.service.ts');
}

export async function toggleAccessRule(id: string, isActive: boolean): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('access_rules')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw mapDbError(error, 'access-rules.service.ts');
}