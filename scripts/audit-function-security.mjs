import { readFileSync, writeFileSync } from 'node:fs';

const functions = JSON.parse(readFileSync('all-advisors.json', 'utf8'))
  .filter(x => ['anon_security_definer_function_executable', 'authenticated_security_definer_function_executable'].includes(x.name))
  .map(x => ({ schema: x.metadata.schema, name: x.metadata.name }));

// Deduplicate
const uniqueFunctions = [];
const seen = new Set();
for (const f of functions) {
  const key = `${f.schema}.${f.name}`;
  if (!seen.has(key)) {
    seen.add(key);
    uniqueFunctions.push(f);
  }
}

const report = [];
const sqlRemediation = [];

for (const f of uniqueFunctions) {
  const { schema, name } = f;
  const fullName = `${schema}.${name}`;
  
  let classification = 'AUTHENTICATED ONLY';
  let usage = ['authenticated users'];
  let risk = 'MEDIUM';

  if (name.startsWith('admin_') || name.includes('super_admin') || name === 'control_user_account' || name.includes('maintenance_mode') || name === 'lock_app_for_all' || name === 'unlock_app') {
    classification = 'ADMIN ONLY';
    usage = ['admin workflows'];
    risk = 'HIGH';
  } else if (name.startsWith('trg_') || name.startsWith('worker_') || ['dequeue_job', 'release_stale_job_locks', 'fanout_notification', 'flush_activity_logs', 'prevent_physical_delete', 'prevent_audit_mutation', 'decrypt_pii', 'encrypt_pii', 'log_activity_async', 'sync_settings_cache', 'terminate_sessions_on_status_change', 'terminate_user_sessions'].includes(name) || name.startsWith('sync_primary_role')) {
    classification = 'INTERNAL ONLY';
    usage = ['internal jobs', 'triggers'];
    risk = 'HIGH';
  } else if (['normalize_email', 'get_constant', 'get_valid_constant_values', 'get_public_settings', 'get_default_region_id'].includes(name)) {
    classification = 'MUST REMAIN PUBLIC';
    usage = ['public API'];
    risk = 'LOW';
  } else if (name.startsWith('api_') || name.startsWith('get_my_') || name.includes('is_enrolled') || name.includes('has_course_access') || name.includes('enroll_in_course') || name === 'log_my_activity' || name === 'logout_current_user' || name === 'delete_notification') {
    classification = 'AUTHENTICATED ONLY';
    usage = ['authenticated users'];
    risk = 'MEDIUM';
  } else if (name.startsWith('get_auth_') || name === 'get_current_tenant_id' || name === 'user_has_permission' || name === 'validate_user_session' || name === 'tenant_matches_jwt') {
    classification = 'AUTHENTICATED ONLY';
    usage = ['authenticated users', 'internal jobs'];
    risk = 'MEDIUM';
  }

  report.push({
    schema,
    name,
    security: 'SECURITY DEFINER',
    grants: 'anon, authenticated (default)',
    usage: usage.join(', '),
    risk,
    classification
  });

  if (classification === 'ADMIN ONLY' || classification === 'INTERNAL ONLY') {
    sqlRemediation.push(`REVOKE EXECUTE ON FUNCTION ${fullName}() FROM anon;`);
    sqlRemediation.push(`REVOKE EXECUTE ON FUNCTION ${fullName}() FROM authenticated;`);
  } else if (classification === 'AUTHENTICATED ONLY') {
    sqlRemediation.push(`REVOKE EXECUTE ON FUNCTION ${fullName}() FROM anon;`);
  }
}

// Group by classification for the final report
const groupedReport = {
  'MUST REMAIN PUBLIC': report.filter(x => x.classification === 'MUST REMAIN PUBLIC'),
  'AUTHENTICATED ONLY': report.filter(x => x.classification === 'AUTHENTICATED ONLY'),
  'ADMIN ONLY': report.filter(x => x.classification === 'ADMIN ONLY'),
  'INTERNAL ONLY': report.filter(x => x.classification === 'INTERNAL ONLY'),
};

writeFileSync('function_security_audit.json', JSON.stringify({ report: groupedReport, sql: sqlRemediation }, null, 2));
console.log(`Audited ${report.length} functions.`);
