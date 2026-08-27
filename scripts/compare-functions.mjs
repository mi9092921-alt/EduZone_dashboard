import { readFileSync } from 'node:fs';

const liveFunctions = JSON.parse(readFileSync('live_functions.json', 'utf8'));
const schemaFile = readFileSync('supabase/schema/07_functions.sql', 'utf8');

const drift = [];
const modified = [];

for (const func of liveFunctions) {
  const { schema, function_name, definition } = func;
  
  if (schema === 'vault' || schema === 'pgbouncer') continue;

  const funcSig = `CREATE OR REPLACE FUNCTION ${schema}.${function_name}`;
  const startIndex = schemaFile.toLowerCase().indexOf(funcSig.toLowerCase());
  
  if (startIndex === -1) {
    drift.push({ name: `${schema}.${function_name}`, type: 'Missing in schema file' });
    continue;
  }

  const endIndex = schemaFile.indexOf('$$;', startIndex);
  if (endIndex === -1) {
    drift.push({ name: `${schema}.${function_name}`, type: 'Incomplete definition in schema file' });
    continue;
  }

  const schemaDefinition = schemaFile.slice(startIndex, endIndex + 3);
  
  // Normalize live definition's search_path for comparison
  // pg_get_functiondef returns "SET search_path TO 'public', 'pg_temp'"
  // Schema file has "SET search_path = public, pg_temp"
  const liveSearchPathMatch = definition.match(/SET search_path TO (.*)/i);
  const schemaSearchPathMatch = schemaDefinition.match(/SET search_path = (.*)/i);

  const liveSearchPath = liveSearchPathMatch ? liveSearchPathMatch[1].replace(/['\s]/g, '').toLowerCase() : 'missing';
  const schemaSearchPath = schemaSearchPathMatch ? schemaSearchPathMatch[1].replace(/['\s]/g, '').toLowerCase() : 'missing';

  if (liveSearchPath !== schemaSearchPath) {
    drift.push({ 
      name: `${schema}.${function_name}`, 
      type: 'Search path mismatch',
      live: liveSearchPathMatch ? liveSearchPathMatch[1] : 'missing',
      schema: schemaSearchPathMatch ? schemaSearchPathMatch[1] : 'missing'
    });
  } else {
    if (schemaSearchPath.includes('public,pg_temp')) {
      modified.push(`${schema}.${function_name}`);
    }
  }
}

console.log(JSON.stringify({ drift, modified }, null, 2));
