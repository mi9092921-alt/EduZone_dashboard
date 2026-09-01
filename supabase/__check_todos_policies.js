const { Client } = require('pg');
const fs = require('fs'),
  path = require('path');

let dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  const f = path.join(__dirname, 'db_url.txt');
  if (fs.existsSync(f)) {
    let c = fs.readFileSync(f, 'utf8');
    if (c.includes('\u0000')) c = fs.readFileSync(f, 'utf16le');
    for (const l of c.split('\n')) {
      const cl = l.replace(/\r/g, '').trim();
      if (cl.startsWith('DATABASE_URL=')) {
        dbUrl = cl.substring('DATABASE_URL='.length).trim();
        break;
      }
    }
  }
}

const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
client
  .connect()
  .then(() =>
    client.query(
      `SELECT policyname, cmd, roles FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'todos'
     ORDER BY policyname`,
    ),
  )
  .then((r) => {
    console.log(JSON.stringify(r.rows, null, 2));
    client.end();
  })
  .catch((e) => {
    console.error(e.message);
    client.end();
  });
