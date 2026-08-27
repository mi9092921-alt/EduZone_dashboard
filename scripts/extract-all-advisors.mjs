import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync('supabase dashboard project advisors.txt', 'utf8');
const parts = raw.split(/={10,}/).map((p) => p.trim()).filter((p) => p.startsWith('['));
const allData = parts.flatMap((p) => JSON.parse(p));

writeFileSync('all-advisors.json', JSON.stringify(allData, null, 2));
console.log(`Extracted ${allData.length} total items to all-advisors.json`);
