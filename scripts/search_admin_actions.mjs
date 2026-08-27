import fs from 'fs';

const content = fs.readFileSync('src/application/actions/admin.actions.ts', 'utf8');

const regex = /requirePermission\(([^)]+)\)/g;
let match;
const permissions = new Set();
while ((match = regex.exec(content)) !== null) {
  permissions.add(match[1]);
}

console.log('Permissions referenced in admin.actions.ts:');
console.log(Array.from(permissions));
