// To re-run at any time:  node supabase/deploy.js
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const configFileName = process.argv[2] || 'db_url.test.txt';
  let dbUrl;

  const urlFilePath = path.isAbsolute(configFileName)
    ? configFileName
    : path.join(__dirname, path.basename(configFileName));

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

  if (!dbUrl) {
    dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  }

  if (!dbUrl) {
    console.error(
      `Error: SUPABASE_DB_URL or DATABASE_URL must be set in environment, or supabase/${configFileName} must exist.`,
    );
    process.exit(1);
  }

  // Ensure unencoded '#' in password does not break connection URL parsing
  const urlMatch = dbUrl.match(/^(postgres(?:ql)?:\/\/[^:]+:)(.*)(@.+)$/);
  if (urlMatch) {
    const prefix = urlMatch[1];
    let pass = urlMatch[2];
    const suffix = urlMatch[3];
    if (pass.includes('#') && !pass.includes('%23')) {
      pass = pass.replace(/#/g, '%23');
      dbUrl = `${prefix}${pass}${suffix}`;
    }
  }

  console.log(`Connecting to remote database using ${configFileName}...`);
  const client = new Client({
    connectionString: dbUrl,
    ssl: {
      rejectUnauthorized:
        process.env.SUPABASE_DB_SSL_STRICT === 'true'
          ? true
          : Boolean(process.env.SUPABASE_DB_CA_CERT),
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

    for (const file of files) {
      const filePath = path.join(__dirname, file);
      console.log(`\n--------------------------------------------`);
      console.log(`Executing: ${file}`);
      console.log(`--------------------------------------------`);

      if (!fs.existsSync(filePath)) {
        console.error(`File not found: ${filePath}`);
        process.exit(1);
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
