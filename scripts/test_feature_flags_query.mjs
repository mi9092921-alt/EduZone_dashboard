import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Simple mockup of mapDbRowToFeatureFlag
function mapDbRowToFeatureFlag(row) {
  if (!row) return row;
  const metadata = row.metadata || {};
  const defaultLabel = row.key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    id: row.id,
    key: row.key,
    description: row.description,
    is_enabled: row.is_enabled,
    rollout_pct: row.rollout_pct,
    metadata: row.metadata,
    created_at: row.created_at,
    updated_at: row.updated_at,
    label: metadata.label || defaultLabel,
    starts_at: metadata.starts_at || null,
    ends_at: metadata.ends_at || null,
  };
}

async function run() {
  const envFile = fs.readFileSync('.env.local', 'utf8');
  let url = '';
  let serviceKey = '';
  for (const line of envFile.split('\n')) {
    if (line.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) serviceKey = line.split('=')[1].trim();
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.from('feature_flags').select('*').order('key');
  if (error) {
    console.error('Error fetching feature flags:', error);
    return;
  }

  console.log('Raw DB Rows:');
  console.log(JSON.stringify(data, null, 2));

  console.log('Mapped Feature Flags:');
  const mapped = (data || []).map(mapDbRowToFeatureFlag);
  console.log(JSON.stringify(mapped, null, 2));
}

run().catch(console.error);
