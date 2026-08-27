import { readFileSync } from 'node:fs';

const raw = readFileSync('supabase dashboard project advisors.txt', 'utf8');
const parts = raw.split(/={10,}/).map((p) => p.trim()).filter((p) => p.startsWith('['));
const allData = parts.flatMap((p) => JSON.parse(p));

const securityFindings = allData.filter(x => x.categories && x.categories.includes('SECURITY'));

const groups = {};

for (const item of securityFindings) {
  const name = item.name;
  if (!groups[name]) {
    groups[name] = {
      name: name,
      count: 0,
      severity: item.level,
      objects: []
    };
  }
  groups[name].count++;
  
  // Extract object name from metadata or detail
  let objectName = '';
  if (item.metadata) {
    const schema = item.metadata.schema || '';
    const name = item.metadata.name || '';
    objectName = schema ? `${schema}.${name}` : name;
  } else {
    // Fallback to parsing detail
    const match = item.detail.match(/`(.+?)`/);
    objectName = match ? match[1] : 'unknown';
  }
  
  if (groups[name].objects.length < 5 && !groups[name].objects.includes(objectName)) {
    groups[name].objects.push(objectName);
  }
}

const result = Object.values(groups).sort((a, b) => b.count - a.count);

console.log(JSON.stringify(result, null, 2));
