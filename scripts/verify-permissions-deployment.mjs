import pg from 'pg';
import { readFileSync } from 'node:fs';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const path = 'supabase/schema/10_permissions.sql';
const content = readFileSync(path, 'utf8');

// Extract some REVOKE statements to verify
const revokes = content.match(/REVOKE EXECUTE ON FUNCTION public\.(.+?)\s+FROM (anon|authenticated);/g) || [];
console.log(`Found ${revokes.length} REVOKE statements in file.`);

const sampleSize = 10;
const samples = revokes.sort(() => 0.5 - Math.random()).slice(0, sampleSize);

let matches = 0;
for (const stmt of samples) {
    const match = stmt.match(/public\.(.+?)\((.*?)\)\s+FROM (anon|authenticated)/);
    if (!match) continue;
    const [, name, rawArgs, role] = match;
    
    try {
        const res = await c.query(`
            SELECT COALESCE(proacl::text, '{}') as acl_text FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' AND p.proname = '${name}'
        `);
        
        const aclText = res.rows[0]?.acl_text || '{}';
        // Check if role name appears as a grantee in the ACL string
        const hasExplicitGrant = aclText.includes(`${role}=`);
        
        if (!hasExplicitGrant) {
            console.log(`Verified: ${role} has no explicit grant on ${name}`);
            matches++;
        } else {
            console.log(`DRIFT: ${role} STILL HAS explicit grant in ACL for ${name} (${aclText})`);
        }
    } catch (e) {
        console.error(`Error checking ${name}: ${e.message}`);
    }
}

console.log(`Verification complete: ${matches}/${samples.length} sampled permissions match the schema file.`);
await c.end();
