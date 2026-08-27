#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(2);
}

const out = execSync(`npx supabase db advisors --db-url "${url}" --level info`, {
  encoding: 'utf8',
  cwd: ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});

const start = out.indexOf('[');
const json = JSON.parse(out.slice(start));
const targets = [
  'duplicate_index',
  'unindexed_foreign_keys',
  'multiple_permissive_policies',
  'rls_enabled_no_policy',
];
const counts = Object.fromEntries(targets.map((t) => [t, json.filter((i) => i.name === t).length]));
writeFileSync(join(ROOT, 'advisors-after.json'), JSON.stringify(json, null, 2));
console.log('AFTER counts:', counts);
console.log('Total issues:', json.length);
