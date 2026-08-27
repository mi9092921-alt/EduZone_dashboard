import pg from 'pg';

async function run() {
  const dbUrl = "postgresql://postgres.xpvljdyyjxxrlcqmfisl:fpimmo5-boop's%20Project@aws-0-eu-west-1.pooler.supabase.com:5432/postgres";
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  console.log('Connected!');

  const permissions = await client.query(`
    SELECT id, name, description 
    FROM public.permissions 
    ORDER BY name;
  `);
  console.log('Database Permissions:');
  console.log(JSON.stringify(permissions.rows, null, 2));

  // Let's also check which permissions are assigned to the roles
  const rolePerms = await client.query(`
    SELECT r.name as role, p.name as permission
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    ORDER BY r.name, p.name;
  `);
  console.log('Role Permissions:');
  console.log(JSON.stringify(rolePerms.rows, null, 2));

  await client.end();
}
run().catch(console.error);
