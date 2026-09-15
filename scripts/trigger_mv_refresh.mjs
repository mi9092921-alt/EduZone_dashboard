#!/usr/bin/env node
/**
 * Trigger public.refresh_all_materialized_views() on the remote project via
 * PostgREST using the service-role key (the function is granted to
 * service_role only). Then report whether the RPC succeeded.
 * Secrets are read from apps/admin/.env.local and never printed.
 */
import fs from 'node:fs';

for (const line of fs.readFileSync(
  new URL('../apps/admin/.env.local', import.meta.url),
  'utf8',
).split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in apps/admin/.env.local');
  process.exit(1);
}

const res = await fetch(`${url}/rest/v1/rpc/refresh_all_materialized_views`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${key}`,
    apikey: key,
    'Content-Type': 'application/json',
  },
  body: '{}',
});

const text = await res.text();
if (!res.ok) {
  console.error(`REFRESH FAILED — HTTP ${res.status}`);
  console.error(text.slice(0, 600));
  process.exit(1);
}
console.log('REFRESH OK (empty response = success)');
