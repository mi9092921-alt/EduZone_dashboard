import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({
    connectionString: dbUrl,
  });

  await client.connect();
  console.log('Connected to database!');

  try {
    const res = await client.query(`
      SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'eduzone_kms_key' LIMIT 1;
    `);
    
    if (res.rows.length > 0) {
      console.log('Secret eduzone_kms_key already exists in vault.');
    } else {
      console.log('Creating secret eduzone_kms_key in vault...');
      await client.query(`
        SELECT vault.create_secret('eduzone_kms_key_v1', 'eduzone_kms_key');
      `);
      console.log('Secret created successfully!');
    }
  } catch (error) {
    console.error('Error executing query:', error);
  } finally {
    await client.end();
  }
}

run().catch(console.error);
