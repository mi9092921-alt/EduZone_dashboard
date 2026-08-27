#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = readFileSync(join(ROOT, 'supabase dashboard project advisors.txt'), 'utf8');
const parts = raw.split(/={10,}/).map((p) => p.trim()).filter((p) => p.startsWith('['));
const data = parts.flatMap((p) => JSON.parse(p));
console.log(`Parsed ${parts.length} advisor sections, ${data.length} total items`);

const targets = [
  'duplicate_index',
  'unindexed_foreign_keys',
  'multiple_permissive_policies',
  'rls_enabled_no_policy',
];

const counts = Object.fromEntries(targets.map((t) => [t, data.filter((x) => x.name === t).length]));
console.log('Counts:', counts);

for (const t of targets) {
  console.log(`\n=== ${t} ===`);
  const items = data.filter((x) => x.name === t);
  const seen = new Set();
  for (const item of items) {
    const key = (item.detail || '').replace(/\\`/g, '`').replace(/\\\\/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(key);
  }
}
