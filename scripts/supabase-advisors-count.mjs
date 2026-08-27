#!/usr/bin/env node
/**
 * Fetch Security + Performance advisor counts from Supabase Management API.
 *
 * Requires: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(ROOT, 'apps', 'admin', '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL || '')
    .replace(/^https?:\/\//, '')
    .replace(/\.supabase\.co\/?$/, '');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const targets = new Set([
  'duplicate_index',
  'unindexed_foreign_keys',
  'multiple_permissive_policies',
  'rls_enabled_no_policy',
]);

async function fetchAdvisors(kind) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/advisors/${kind}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${kind} ${res.status}: ${text}`);
  const data = JSON.parse(text);
  return Array.isArray(data) ? data : data.lints || data.issues || [];
}

function summarize(items) {
  const byName = {};
  for (const item of items) {
    const name = item.name || item.check_name || item.title;
    byName[name] = (byName[name] || 0) + 1;
  }
  const targetCounts = Object.fromEntries(
    [...targets].map((t) => [t, items.filter((i) => (i.name || i.check_name) === t).length]),
  );
  return { total: items.length, byName, targetCounts };
}

async function main() {
  if (!token || !projectRef) {
    console.error('Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF (or NEXT_PUBLIC_SUPABASE_URL)');
    process.exit(2);
  }

  const security = await fetchAdvisors('security');
  const performance = await fetchAdvisors('performance');
  const all = [...security, ...performance];

  console.log(`Project: ${projectRef}`);
  console.log('Security advisors:', summarize(security).targetCounts, `(total ${security.length})`);
  console.log('Performance advisors:', summarize(performance).targetCounts, `(total ${performance.length})`);
  console.log('Combined target lint counts:', summarize(all).targetCounts);
  console.log('Combined total:', all.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
