import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const workerAuthToken = Deno.env.get("PUSH_WORKER_AUTH_TOKEN") ?? "";
const projectId = Deno.env.get("FCM_PROJECT_ID") ?? "";
const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL") ?? "";
const privateKey = Deno.env.get("FCM_PRIVATE_KEY") ?? "";
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function authorized(req: Request): boolean {
  return Boolean(workerAuthToken) &&
    req.headers.get("X-Push-Worker-Token") === workerAuthToken;
}

function base64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function textBase64Url(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function pemToDer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return bytes.buffer;
}

async function accessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = textBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = textBase64Url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claim}`),
  );
  const assertion = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`FCM_OAUTH_${response.status}`);
  const payload = await response.json();
  if (typeof payload.access_token !== "string") throw new Error("FCM_OAUTH_NO_TOKEN");
  return payload.access_token;
}

async function sendToFcm(delivery: Record<string, unknown>, token: string) {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: {
        token: delivery.token,
        notification: { title: delivery.title, body: delivery.body },
        data: {
          notification_id: String(delivery.notification_id),
          destination: "/home/notifications",
        },
        android: { priority: "high", notification: { channel_id: "eduzone_high_importance" } },
        apns: { payload: { aps: { sound: "default" } } },
      } }),
    },
  );
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function processJob(job: Record<string, unknown>, token: string) {
  const deliveryId = (job.payload as Record<string, unknown>)?.push_delivery_id;
  if (typeof deliveryId !== "string") throw new Error("INVALID_PUSH_JOB_PAYLOAD");

  const { data: delivery, error: claimError } = await admin.rpc("claim_push_delivery", {
    p_delivery_id: deliveryId,
  });
  if (claimError) throw new Error(`CLAIM_DELIVERY: ${claimError.message}`);
  if (!delivery) {
    await admin.rpc("complete_notification_push_job", { p_job_id: job.id, p_retryable: false });
    return "skipped";
  }

  try {
    const result = await sendToFcm(delivery, token);
    if (result.response.ok) {
      await admin.rpc("complete_push_delivery", {
        p_delivery_id: deliveryId,
        p_provider_message_id: result.body.name ?? null,
      });
      await admin.rpc("complete_notification_push_job", { p_job_id: job.id, p_retryable: false });
      return "sent";
    }

    const details = Array.isArray(result.body?.error?.details) ? result.body.error.details : [];
    const errorCode = details.find((item: Record<string, unknown>) => item.errorCode)?.errorCode ??
      result.body?.error?.status ?? `HTTP_${result.response.status}`;
    const retryable = [429, 500, 502, 503, 504].includes(result.response.status);
    await admin.rpc("fail_push_delivery", {
      p_delivery_id: deliveryId,
      p_error_code: String(errorCode),
      p_error_message: JSON.stringify(result.body?.error ?? result.body),
      p_retryable: retryable,
    });
    await admin.rpc("complete_notification_push_job", {
      p_job_id: job.id,
      p_retryable: retryable,
      p_error_message: String(errorCode),
    });
    return retryable ? "retry" : "failed";
  } catch (error) {
    await admin.rpc("fail_push_delivery", {
      p_delivery_id: deliveryId,
      p_error_code: "SENDER_EXCEPTION",
      p_error_message: String(error),
      p_retryable: true,
    });
    await admin.rpc("complete_notification_push_job", {
      p_job_id: job.id,
      p_retryable: true,
      p_error_message: String(error),
    });
    return "retry";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  if (!authorized(req)) return json({ error: "UNAUTHORIZED" }, 401);
  if (!supabaseUrl || !projectId || !clientEmail || !privateKey) {
    return json({ error: "FCM_NOT_CONFIGURED" }, 500);
  }

  try {
    const token = await accessToken();
    const { data: jobs, error } = await admin.rpc("dequeue_job", {
      p_worker_id: "notification-push-worker",
      p_job_types: ["notification_push"],
      p_lock_ttl_seconds: 300,
    });
    if (error) return json({ error: "DEQUEUE_FAILED", message: error.message }, 500);

    const results: string[] = [];
    for (const job of (jobs ?? []).slice(0, 20)) {
      results.push(await processJob(job, token));
    }
    return json({ processed: results.length, results });
  } catch (error) {
    console.error("send-push-notification failed", error);
    return json({ error: "PUSH_WORKER_FAILED" }, 500);
  }
});
