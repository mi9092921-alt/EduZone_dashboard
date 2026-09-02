import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  AssignRoleInput,
  ControlAccountInput,
  CreateAuthUserInput,
  IssueWarningInput,
  IUserAdminRepository,
  StepResult,
  UpsertProfileInput,
} from '@/application/ports/IUserAdminRepository';
import { createAdminClient } from '@/infrastructure/supabase/admin';
import { createServerClient } from '@/infrastructure/supabase/server';

/**
 * Supabase implementation of IUserAdminRepository.
 *
 * Owns the service-role (admin) client for privileged user lifecycle
 * operations (auth user create/delete, profile & role sync, account
 * control RPC, session termination). `issueWarning` intentionally uses
 * the request-scoped server client — the issue_warning RPC is RLS-backed
 * and validates the caller server-side (same as before the refactor).
 */
export function makeUserAdminRepository(
  admin: SupabaseClient = createAdminClient(),
): IUserAdminRepository {
  return {
    async createAuthUser(
      input: CreateAuthUserInput,
    ): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
      const { data: authData, error: authCreateError } = await admin.auth.admin.createUser({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: {
          first_name: input.first_name,
          last_name: input.last_name,
          phone: input.phone,
        },
      });

      if (authCreateError) {
        return { ok: false, message: authCreateError.message };
      }

      if (!authData?.user) {
        return { ok: false, message: 'User creation failed silently' };
      }

      return { ok: true, userId: authData.user.id };
    },

    async upsertProfile(input: UpsertProfileInput): Promise<StepResult> {
      const { error } = await admin.from('users').upsert({
        id: input.id,
        email: input.email,
        first_name: input.first_name,
        last_name: input.last_name,
        phone: input.phone,
        primary_role: input.primary_role,
        tenant_id: input.tenant_id,
      });

      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },

    async findRoleIdByName(name: string): Promise<string | null> {
      const { data: role, error: roleLookupError } = await admin
        .from('roles')
        .select('id')
        .eq('name', name)
        .maybeSingle();

      if (roleLookupError || !role?.id) {
        return null;
      }
      return role.id;
    },

    async assignRole(input: AssignRoleInput): Promise<StepResult> {
      const { error } = await admin.from('user_roles').upsert(
        {
          user_id: input.user_id,
          role_id: input.role_id,
          tenant_id: input.tenant_id,
          granted_by: input.granted_by,
          is_active: true,
        },
        { onConflict: 'user_id,role_id,tenant_id' },
      );

      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },

    async deleteAuthUser(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        return { ok: false, message: error.message };
      }
      return { ok: true };
    },

    async softDeleteProfile(userId: string): Promise<void> {
      await admin
        .from('users')
        .update({ deleted_at: new Date().toISOString(), account_status: 'banned' })
        .eq('id', userId);
    },

    async controlAccount(
      input: ControlAccountInput,
    ): Promise<{ status?: string; until?: string } | null> {
      const { data, error } = await admin.rpc('control_user_account', {
        p_user_id: input.userId,
        p_action: input.action,
        p_reason: input.reason,
        p_suspend_hours: input.suspendHours,
      });

      if (error) throw error;
      return data as { status?: string; until?: string } | null;
    },

    async terminateSessions(userId: string, reason: string): Promise<number | null> {
      const { data, error } = await admin.rpc('terminate_user_sessions', {
        p_user_id: userId,
        p_reason: reason,
      });

      if (error) throw error;
      return data as number | null;
    },

    async issueWarning(input: IssueWarningInput): Promise<string> {
      const supabase = await createServerClient();
      const { data, error } = await supabase.rpc('issue_warning', {
        p_user_id: input.userId,
        p_reason: input.reason,
        p_severity: input.severity,
        p_note: input.note,
      });

      if (error) throw error;
      return data as string;
    },
  };
}
