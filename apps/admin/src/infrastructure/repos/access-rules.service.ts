import type { AccessRule, PaginatedResult } from '@eduzone/types';

import { container } from '@/container';
import type { UpsertAccessRuleInput } from '@/domain/schemas/settings.schema';
import { createAdminClient } from '@/infrastructure/supabase/admin';

/**
 * Access Rules service — management for the access_rules table.
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

/** Server-action variant — uses service_role to bypass RLS. */
export async function getAccessRulesAdmin(
  tenantId?: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<PaginatedResult<AccessRule>> {
  const admin = createAdminClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = admin.from('access_rules').select('*', { count: 'exact' });
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

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
  if (error) throw error;
  return data as AccessRule;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function upsertAccessRuleAdmin(rule: UpsertAccessRuleInput): Promise<AccessRule> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('access_rules')
    .upsert({ ...rule, updated_at: new Date().toISOString() })
    .select('*')
    .single();
  if (error) throw error;
  return data as AccessRule;
}

export async function deleteAccessRule(id: string): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase.from('access_rules').delete().eq('id', id);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function deleteAccessRuleAdmin(id: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('access_rules').delete().eq('id', id);
  if (error) throw error;
}

export async function toggleAccessRule(id: string, isActive: boolean): Promise<void> {
  const { supabase } = container;
  const { error } = await supabase
    .from('access_rules')
    .update({ is_active: isActive })
    .eq('id', id);
  if (error) throw error;
}

/** Server-action variant — uses service_role to bypass RLS. */
export async function toggleAccessRuleAdmin(id: string, isActive: boolean): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('access_rules').update({ is_active: isActive }).eq('id', id);
  if (error) throw error;
}
