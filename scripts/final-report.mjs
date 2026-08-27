import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync('advisors-after.json', 'utf8'));

const security = data.filter(x => x.categories.includes('SECURITY') && x.level !== 'INFO');
const performance = data.filter(x => x.categories.includes('PERFORMANCE') && x.level !== 'INFO');

const getCounts = (items) => {
  const counts = {};
  for (const item of items) {
    counts[item.name] = (counts[item.name] || 0) + 1;
  }
  return counts;
};

const report = {
  security: {
    counts: getCounts(security),
    findings: security.map(x => ({ name: x.name, detail: x.detail, level: x.level }))
  },
  performance: {
    counts: getCounts(performance),
    findings: performance.map(x => ({ name: x.name, detail: x.detail, level: x.level }))
  }
};

console.log(JSON.stringify(report, null, 2));
