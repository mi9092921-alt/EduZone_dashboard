#!/usr/bin/env node
import pg from 'pg';

const ref = process.env.SUPABASE_PROJECT_REF || 'xpvljdyyjxxrlcqmfisl';
const pwd = process.env.DB_PASSWORD || "fpimmo5-boop's Project";

const regions = [
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-south-1',
  'sa-east-1',
  'ca-central-1',
];

for (const region of regions) {
  for (const port of [5432, 6543]) {
    const client = new pg.Client({
      host: `aws-0-${region}.pooler.supabase.com`,
      port,
      user: `postgres.${ref}`,
      password: pwd,
      database: 'postgres',
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      const res = await client.query('SELECT 1 AS ok');
      console.log('OK', { region, port, ...res.rows[0] });
      const url = `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
      console.log('DATABASE_URL=' + url);
      await client.end();
      process.exit(0);
    } catch (e) {
      const m = e.message;
      if (!m.includes('tenant') && !m.includes('Tenant') && !m.includes('ENOTFOUND')) {
        console.log(region, port, m.slice(0, 100));
      }
    }
  }
}
console.error('No pooler region matched project', ref);
process.exit(1);
