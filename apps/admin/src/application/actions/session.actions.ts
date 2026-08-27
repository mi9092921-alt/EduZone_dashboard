'use server';

import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@/infrastructure/supabase/server';

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase environment variables missing');
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getClientIp(headerStore: Awaited<ReturnType<typeof headers>>) {
  const forwarded = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headerStore.get('x-real-ip') || null;
}

export async function recordCurrentSessionAction(sessionId: string): Promise<{
  success: boolean;
  active?: boolean;
  error?: string;
}> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) {
    return { success: false, error: 'Invalid session id' };
  }

  const supabase = await createServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { success: false, error: 'Unauthorized' };
  }

  const supabaseAdmin = createAdminClient();
  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users')
    .select('id, tenant_id, region_id, deleted_at, account_status, login_count')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.deleted_at || profile.account_status !== 'active') {
    return { success: false, active: false, error: 'User is not active' };
  }

  const headerStore = await headers();
  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await supabaseAdmin
    .from('sessions')
    .select('id, is_active, deleted_at')
    .eq('id', sessionId)
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (existingError) {
    return { success: false, error: existingError.message };
  }

  if (existing) {
    if (!existing.is_active || existing.deleted_at) {
      return { success: false, active: false, error: 'Session is inactive' };
    }

    const { error: touchError } = await supabaseAdmin
      .from('sessions')
      .update({ updated_at: now })
      .eq('id', sessionId)
      .eq('user_id', userData.user.id);

    if (!touchError) {
      await supabaseAdmin
        .from('users')
        .update({ last_login: now })
        .eq('id', userData.user.id);
    }

    return touchError
      ? { success: false, error: touchError.message }
      : { success: true, active: true };
  }

  const { error: insertError } = await supabaseAdmin
    .from('sessions')
    .insert({
      id: sessionId,
      user_id: userData.user.id,
      tenant_id: profile.tenant_id,
      region_id: profile.region_id,
      ip_address: getClientIp(headerStore),
      user_agent: headerStore.get('user-agent'),
      is_active: true,
      started_at: now,
      updated_at: now,
    });

  if (insertError) {
    return { success: false, error: insertError.message };
  }

  const { error: updateUserError } = await supabaseAdmin
    .from('users')
    .update({
      last_login: now,
      login_count: (profile.login_count ?? 0) + 1,
    })
    .eq('id', userData.user.id);

  if (updateUserError) {
    return { success: false, error: updateUserError.message };
  }

  return { success: true, active: true };
}
