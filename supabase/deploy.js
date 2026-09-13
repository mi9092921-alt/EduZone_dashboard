// To re-run at any time:  node supabase/deploy.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  let dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

  if (!dbUrl) {
    const urlFilePath = path.join(__dirname, 'db_url.txt');
    if (fs.existsSync(urlFilePath)) {
      let content = fs.readFileSync(urlFilePath, 'utf8');
      if (content.includes('\u0000')) {
        content = fs.readFileSync(urlFilePath, 'utf16le');
      }
      const lines = content.split('\n');
      for (const line of lines) {
        const cleanLine = line.replace(/\r/g, '').trim();
        if (cleanLine.startsWith('DATABASE_URL=')) {
          dbUrl = cleanLine.substring('DATABASE_URL='.length).trim();
          break;
        }
      }
    }
  }

  if (!dbUrl) {
    console.error(
      'Error: SUPABASE_DB_URL or DATABASE_URL must be set in environment, or supabase/db_url.txt must exist.',
    );
    process.exit(1);
  }

  console.log('Connecting to remote database...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      // Never disable TLS certificate verification for schema deployment.
      // If a private CA is required, provide its PEM via SUPABASE_DB_CA_CERT.
      rejectUnauthorized: true,
      ...(process.env.SUPABASE_DB_CA_CERT ? { ca: process.env.SUPABASE_DB_CA_CERT } : {}),
    },
  });

  try {
    await client.connect();
    console.log('Successfully connected to the database!');

    // Ensure eduzone_kms_key exists in Supabase Vault before running seeds/triggers
    try {
      const vaultCheck = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = 'vault'");
      if (vaultCheck.rowCount > 0) {
        const secretCheck = await client.query(
          "SELECT 1 FROM vault.decrypted_secrets WHERE name = 'eduzone_kms_key'",
        );
        if (secretCheck.rowCount === 0) {
          const crypto = require('crypto');
          console.log('Provisioning eduzone_kms_key in Supabase Vault...');
          const randomKey = crypto.randomBytes(32).toString('hex');
          await client.query('SELECT vault.create_secret($1, $2, $3)', [
            randomKey,
            'eduzone_kms_key',
            'EduZone KMS key for PII encryption (auto-provisioned)',
          ]);
          console.log('✓ Successfully provisioned eduzone_kms_key in Supabase Vault');
        }
      }
    } catch (vaultErr) {
      console.warn('Warning checking/provisioning Vault KMS key:', vaultErr.message);
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

    // F-01 (P0, review 2026-09-13): 11_seed_reference.sql plants the QA
    // accounts (*@eduzone-test.com) whose shared bcrypt password
    // (Admin@12345) is documented in git (.github/workflows/e2e.yml).
    // Applying it to a real project would create a known-password
    // super_admin — an open backdoor. The seed is therefore OPT-IN and
    // must only ever be enabled for a DISPOSABLE local/QA database;
    // the schema files themselves still apply unconditionally.
    const allowQaSeed = process.env.ALLOW_QA_SEED_DATA === 'true';

    for (const file of files) {
      const filePath = path.join(__dirname, file);
      console.log(`\n--------------------------------------------`);
      console.log(`Executing: ${file}`);
      console.log(`--------------------------------------------`);

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
      }

      if (file === 'schema/11_seed_reference.sql' && !allowQaSeed) {
        console.warn('⏭ SKIPPED: QA seed (11_seed_reference.sql).');
        console.warn('   It plants @eduzone-test.com accounts whose passwords are documented');
        console.warn('   in git — NEVER against staging/production. To apply it to a disposable');
        console.warn('   local/QA database only, re-run with ALLOW_QA_SEED_DATA=true.');
        continue;
      }

      const sql = fs.readFileSync(filePath, 'utf8');

      // Execute the entire SQL script
      const res = await client.query(sql);

      // Print validation outcomes if executing VALIDATION.sql
      if (file === 'schema/VALIDATION.sql') {
        if (Array.isArray(res)) {
          for (const r of res) {
            if (r.rows && r.rows.length > 0) {
              console.table(r.rows);
            }
          }
        } else if (res && res.rows && res.rows.length > 0) {
          console.table(res.rows);
        }
      }

      console.log(`✓ successfully executed ${file}`);
    }

    console.log('\n============================================');
    console.log('Deployment completed successfully!');
    console.log('============================================');
  } catch (error) {
    console.error('\nDeployment FAILED:');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
