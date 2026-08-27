import pg from 'pg';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('all-advisors.json', 'utf8'));
const unusedIndexes = data.filter(x => x.name === 'unused_index');

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const results = [];

for (const item of unusedIndexes) {
  const schema = item.metadata.schema;
  const table = item.metadata.name;
  const indexName = item.detail.match(/Index \\?`(.+?)\\?`/)[1];

  const sql = `
    SELECT
      pg_size_pretty(pg_relation_size(c.oid)) as index_size,
      s.idx_scan as scan_count,
      t.relkind = 'p' as is_partitioned,
      EXISTS (
        SELECT 1 FROM pg_constraint WHERE conindid = c.oid AND contype = 'f'
      ) as supports_fk,
      EXISTS (
        SELECT 1 FROM pg_class tc JOIN pg_index i ON tc.oid = i.indrelid WHERE i.indexrelid = c.oid AND tc.relrowsecurity = true
      ) as supports_rls,
      i.indisunique as is_unique
    FROM pg_class c
    JOIN pg_index i ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = c.oid
    WHERE n.nspname = '${schema}' AND c.relname = '${indexName}'
  `;

  try {
    const res = await c.query(sql);
    if (res.rows.length > 0) {
      results.push({
        schema,
        table,
        indexName,
        ...res.rows[0]
      });
    } else {
      results.push({
        schema,
        table,
        indexName,
        error: 'Not found'
      });
    }
  } catch (e) {
    results.push({
      schema,
      table,
      indexName,
      error: e.message
    });
  }
}

console.log(JSON.stringify(results, null, 2));
await c.end();
