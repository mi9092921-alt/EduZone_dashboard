import { readFileSync, writeFileSync } from 'node:fs';

const audit = JSON.parse(readFileSync('function_security_audit.json', 'utf8'));
const refCheck = JSON.parse(readFileSync('function_reference_check.json', 'utf8'));

const report = [];
const sqlRemediation = [];

// Helper to check if a function is used in frontend
const isFrontendUsed = (name) => {
    const ref = refCheck.find(r => r.name === name);
    return ref && ref.refTypes.frontend;
};

const categories = ['AUTHENTICATED ONLY', 'ADMIN ONLY', 'INTERNAL ONLY'];

for (const cat of categories) {
    for (const f of audit.report[cat]) {
        const name = f.name;
        const fullName = `${f.schema}.${name}`;
        const usedInFrontend = isFrontendUsed(name);
        
        let safeToRevokeAnon = 'YES';
        let safeToRevokeAuth = 'YES';
        let note = '';

        if (usedInFrontend) {
            safeToRevokeAuth = 'NO (Used in frontend)';
            note = 'Function is called via supabase.rpc() in apps/';
        }

        report.push({
            name,
            classification: cat,
            usedInFrontend,
            safeToRevokeAnon,
            safeToRevokeAuth,
            note
        });

        // Generate SQL
        if (safeToRevokeAnon === 'YES') {
            sqlRemediation.push(`REVOKE EXECUTE ON FUNCTION ${fullName}() FROM anon;`);
        }
        if (safeToRevokeAuth === 'YES') {
            sqlRemediation.push(`REVOKE EXECUTE ON FUNCTION ${fullName}() FROM authenticated;`);
        }
    }
}

writeFileSync('function_security_final_report.json', JSON.stringify(report, null, 2));

// Generate the SQL block for 10_permissions.sql
const sqlBlock = [
    '-- ============================================================================',
    '-- Security Hardening - Function Permissions (Reference Checked)',
    '-- ============================================================================',
    '',
    '-- 1. AUTHENTICATED ONLY (Revoke from anon)',
    ...report.filter(r => r.classification === 'AUTHENTICATED ONLY' && r.safeToRevokeAnon === 'YES').map(r => `REVOKE EXECUTE ON FUNCTION public.${r.name}() FROM anon;`),
    '',
    '-- 2. ADMIN ONLY (Revoke from anon; revoke from authenticated only if not used in frontend)',
    ...report.filter(r => r.classification === 'ADMIN ONLY').flatMap(r => {
        const lines = [];
        if (r.safeToRevokeAnon === 'YES') lines.push(`REVOKE EXECUTE ON FUNCTION public.${r.name}() FROM anon;`);
        if (r.safeToRevokeAuth === 'YES') lines.push(`REVOKE EXECUTE ON FUNCTION public.${r.name}() FROM authenticated;`);
        return lines;
    }),
    '',
    '-- 3. INTERNAL ONLY (Revoke from anon and authenticated)',
    ...report.filter(r => r.classification === 'INTERNAL ONLY').flatMap(r => {
        const lines = [];
        if (r.safeToRevokeAnon === 'YES') lines.push(`REVOKE EXECUTE ON FUNCTION public.${r.name}() FROM anon;`);
        if (r.safeToRevokeAuth === 'YES') lines.push(`REVOKE EXECUTE ON FUNCTION public.${r.name}() FROM authenticated;`);
        return lines;
    })
].join('\n');

writeFileSync('hardening_patch.sql', sqlBlock);
console.log('Final report and SQL patch generated.');
