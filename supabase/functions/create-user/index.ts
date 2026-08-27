import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" &&
    value.trim().length <= 255 &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value.trim());
}

function isValidOptionalText(value: unknown, max = 255): value is string | null | undefined {
  return value == null || (typeof value === "string" && value.length <= max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("create-user configuration is incomplete");
      return jsonResponse({ error: "SERVICE_UNAVAILABLE" }, 503);
    }

    // Keep the caller on the user-scoped client. The permission RPC and the
    // profile query are both session/tenant-aware; the service-role client is
    // reserved for the actual Auth-admin create + profile write.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: authUser, error: authError } = await userClient.auth.getUser();
    if (authError || !authUser.user) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const { data: sessionValid, error: sessionError } = await userClient.rpc(
      "validate_user_session",
    );
    if (sessionError || sessionValid !== true) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const { data: adminProfile, error: profileError } = await userClient
      .from("users")
      .select("tenant_id, primary_role")
      .eq("id", authUser.user.id)
      .is("deleted_at", null)
      .single();

    if (profileError || !adminProfile) {
      return jsonResponse({ error: "UNAUTHORIZED" }, 401);
    }

    const { data: hasPerm, error: permError } = await userClient.rpc(
      "user_has_permission",
      {
        p_user_id: authUser.user.id,
        p_permission: "users.write",
        p_tenant_id: adminProfile.tenant_id,
      },
    );

    if (permError || hasPerm !== true) {
      return jsonResponse({ error: "PERMISSION_DENIED" }, 403);
    }

    const body = await req.json();
    const { email, password, first_name, last_name, phone, primary_role } = body ?? {};

    if (!isValidEmail(email) || typeof password !== "string" || password.length < 8) {
      return jsonResponse({ error: "INVALID_INPUT" }, 400);
    }

    if (!isValidOptionalText(first_name) ||
        !isValidOptionalText(last_name) ||
        !isValidOptionalText(phone, 32)) {
      return jsonResponse({ error: "INVALID_INPUT" }, 400);
    }

    const allowedRoles = new Set(["student", "teacher", "admin"]);
    if (primary_role != null && (!allowedRoles.has(primary_role) ||
        (primary_role === "admin" && adminProfile.primary_role !== "super_admin"))) {
      return jsonResponse({ error: "INVALID_ROLE" }, 403);
    }

    const requestedRole = primary_role ?? "student";

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: email.trim(),
      password,
      email_confirm: true,
      user_metadata: {
        first_name: first_name ?? null,
        last_name: last_name ?? null,
        phone: phone ?? null,
      },
    });

    if (createError || !created.user) {
      console.error("create-user auth creation failed", createError);
      return jsonResponse({ error: "USER_CREATION_FAILED" }, 409);
    }

    const profilePayload = {
      id: created.user.id,
      email: email.trim(),
      first_name: first_name ?? null,
      last_name: last_name ?? null,
      phone: phone ?? null,
      primary_role: requestedRole,
      tenant_id: adminProfile.tenant_id,
    };

    let profileError: { message?: string } | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const { error } = await adminClient.from("users").upsert(profilePayload);
      profileError = error;
      if (!profileError) break;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }

    if (profileError) {
      const { error: rollbackError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (rollbackError) {
        console.error("create-user rollback failed", rollbackError);
      } else {
        console.error("create-user profile write failed; auth user rolled back");
      }
      return jsonResponse({ error: "USER_CREATION_FAILED" }, 500);
    }

    return jsonResponse({ success: true, userId: created.user.id }, 201);
  } catch (err) {
    console.error("create-user unexpected failure", err);
    return jsonResponse({ error: "INTERNAL_ERROR" }, 500);
  }
});
