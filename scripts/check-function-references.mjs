import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';

const audit = JSON.parse(readFileSync('function_security_audit.json', 'utf8'));
const categories = ['AUTHENTICATED ONLY', 'ADMIN ONLY', 'INTERNAL ONLY'];

const functions = [];
for (const cat of categories) {
  for (const f of audit.report[cat]) {
    functions.push({ ...f, classification: cat });
  }
}

const results = [];

for (const f of functions) {
  const name = f.name;
  console.log(`Searching for: ${name}`);
  
  let references = [];
  try {
    // Search for function name in all files except schema files (where they are defined)
    const grepCmd = `rg -l "${name}" --glob "!supabase/schema/**" --glob "!all-advisors.json" --glob "!function_security_audit.json" --glob "!live_functions.json" --glob "!security_report.json" --glob "!unused_indexes_report.json" --glob "!advisors-after.json"`;
    const output = execSync(grepCmd, { encoding: 'utf8' });
    references = output.split('\n').filter(Boolean);
  } catch (e) {
    // rg returns 1 if no matches found
  }

  const refTypes = {
    frontend: false,
    edge_functions: false,
    triggers: false, // already checked schema but let's be sure
    cron_jobs: false,
    workers: false
  };

  for (const ref of references) {
    if (ref.includes('supabase/functions/')) refTypes.edge_functions = true;
    if (ref.match(/\.(ts|tsx|js|jsx|vue|swift|java)$/)) {
        if (!ref.includes('scripts/')) refTypes.frontend = true;
        else if (ref.includes('worker')) refTypes.workers = true;
    }
    if (ref.includes('cron') || ref.includes('schedule')) refTypes.cron_jobs = true;
  }

  // Check if safe to revoke
  let safeToRevoke = 'YES';
  
  if (f.classification === 'AUTHENTICATED ONLY') {
    // If it's authenticated only, we want to revoke from 'anon'.
    // It's safe if it's NOT used by frontend code in a way that implies anon access.
    // Heuristic: if it's used in frontend, we assume it's for authenticated users unless we see specific anon usage patterns.
    // For now, if it's used in frontend, we'll mark it as YES but with a note.
  }
  
  if (f.classification === 'ADMIN ONLY' || f.classification === 'INTERNAL ONLY') {
    // If it's used in frontend, it might NOT be safe to revoke from 'authenticated' if users need it.
    if (refTypes.frontend) {
        safeToRevoke = 'NO (Used in frontend)';
    }
  }

  results.push({
    name: f.name,
    classification: f.classification,
    references,
    refTypes,
    safeToRevoke
  });
}

writeFileSync('function_reference_check.json', JSON.stringify(results, null, 2));
console.log(`Reference check complete. Results in function_reference_check.json`);
