// Fallback deployer for environments that cannot reach Supabase Postgres
// directly. It uses the official Management API and splits large SQL files
// at statement boundaries to stay below the API request-size limit.
//
// Usage:
//   node supabase/deploy_management_api.js
//   DEPLOY_FROM=schema/03_tables.sql node supabase/deploy_management_api.js
//
// 12_seed_qa_demo.sql is intentionally never included.
const fs = require('fs');
const path = require('path');

const PROJECT_REF =
  process.env.SUPABASE_PROJECT_REF ||
  readSetting('SUPABASE_URL')?.match(/^https?:\/\/([^.]+)\./i)?.[1];
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || readSetting('SUPABASE_ACCESS_TOKEN');
const API_URL = PROJECT_REF
  ? `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`
  : null;
const MAX_QUERY_BYTES = 50_000;

function readSetting(name) {
  const filePath = path.join(__dirname, 'db_url.txt');
  if (!fs.existsSync(filePath)) return undefined;
  const line = fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .find((value) => value.trim().startsWith(`${name}=`));
  return line ? line.trim().slice(name.length + 1).trim() : undefined;
}

function splitSql(sql) {
  const statements = [];
  let start = 0;
  let state = 'normal';
  let blockCommentDepth = 0;
  let dollarTag = null;

  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    const next = sql[i + 1];

    if (state === 'line-comment') {
      if (c === '\n') state = 'normal';
      continue;
    }
    if (state === 'block-comment') {
      if (c === '/' && next === '*') {
        blockCommentDepth += 1;
        i += 1;
      } else if (c === '*' && next === '/') {
        blockCommentDepth -= 1;
        i += 1;
        if (blockCommentDepth === 0) state = 'normal';
      }
      continue;
    }
    if (state === 'single-quote') {
      if (c === "'" && next === "'") i += 1;
      else if (c === "'") state = 'normal';
      else if (c === '\\') i += 1;
      continue;
    }
    if (state === 'double-quote') {
      if (c === '"' && next === '"') i += 1;
      else if (c === '"') state = 'normal';
      continue;
    }
    if (state === 'dollar-quote') {
      if (sql.startsWith(dollarTag, i)) {
        i += dollarTag.length - 1;
        dollarTag = null;
        state = 'normal';
      }
      continue;
    }

    if (c === '-' && next === '-') {
      state = 'line-comment';
      i += 1;
    } else if (c === '/' && next === '*') {
      state = 'block-comment';
      blockCommentDepth = 1;
      i += 1;
    } else if (c === "'") {
      state = 'single-quote';
    } else if (c === '"') {
      state = 'double-quote';
    } else if (c === '$') {
      const tag = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/)?.[0];
      if (tag) {
        dollarTag = tag;
        state = 'dollar-quote';
        i += tag.length - 1;
      }
    } else if (c === ';') {
      const statement = sql.slice(start, i + 1).trim();
      if (statement) statements.push(statement);
      start = i + 1;
    }
  }

  const tail = sql.slice(start).trim();
  if (tail) statements.push(tail);
  return statements;
}

function makeChunks(sql) {
  const chunks = [];
  let current = '';
  for (const statement of splitSql(sql)) {
    const candidate = current ? `${current}\n${statement}` : statement;
    if (current && Buffer.byteLength(candidate, 'utf8') > MAX_QUERY_BYTES) {
      chunks.push(current);
      current = statement;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

async function runQuery(query, parameters) {
  const payload = { query, read_only: false };
  if (parameters) payload.parameters = parameters;
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 4000)}`);
  }
  return body;
}

async function main() {
  if (!PROJECT_REF || !ACCESS_TOKEN) {
    throw new Error('SUPABASE_PROJECT_REF/SUPABASE_URL and SUPABASE_ACCESS_TOKEN are required.');
  }

  const files = [
    'schema/01_extensions.sql',
    'schema/02_types.sql',
    'schema/03_tables.sql',
    'schema/04_constraints.sql',
    'schema/05_indexes.sql',
    'schema/07_functions.sql',
    'schema/06_views.sql',
    'schema/08_triggers.sql',
    'schema/09_rls.sql',
    'schema/10_permissions.sql',
    'schema/11_seed_reference.sql',
    'schema/VALIDATION.sql',
  ];
  const startFile = process.env.DEPLOY_FROM || files[0];
  const startIndex = files.indexOf(startFile);
  if (startIndex < 0) throw new Error(`DEPLOY_FROM is not in the deployment list: ${startFile}`);

  // Match deploy_schema.js: provision the key only when the Vault objects exist.
  const vaultCheck = JSON.parse(
    await runQuery("SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'vault') AS exists"),
  );
  if (vaultCheck.exists) {
    const kmsCheck = JSON.parse(
      await runQuery("SELECT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name = 'eduzone_kms_key') AS exists"),
    );
    if (!kmsCheck.exists) {
      const key = require('crypto').randomBytes(32).toString('hex');
      await runQuery('SELECT vault.create_secret($1, $2, $3)', [
        key,
        'eduzone_kms_key',
        'EduZone KMS key for PII encryption (auto-provisioned)',
      ]);
      console.log('Vault KMS key provisioned.');
    }
  }

  for (const file of files.slice(startIndex)) {
    const filePath = path.join(__dirname, file);
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const sql = fs.readFileSync(filePath, 'utf8');
    // VALIDATION.sql intentionally uses one temporary table across all checks;
    // keep it in one API request/session instead of splitting it.
    const chunks = file === 'schema/VALIDATION.sql' ? [sql] : makeChunks(sql);
    console.log(`Executing ${file} in ${chunks.length} API chunk(s)...`);
    for (let i = 0; i < chunks.length; i += 1) {
      const responseBody = await runQuery(chunks[i]);
      console.log(`  OK chunk ${i + 1}/${chunks.length}`);
      if (file === 'schema/VALIDATION.sql' && responseBody.trim()) {
        console.log(responseBody.slice(0, 20_000));
      }
    }
  }
  console.log('DEPLOYMENT_COMPLETED_WITHOUT_QA_SEED');
}

main().catch((error) => {
  console.error('DEPLOYMENT_FAILED');
  console.error(error.message || error);
  process.exitCode = 1;
});
