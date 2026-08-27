import fs from 'fs';

const content = fs.readFileSync('src/application/actions/admin.actions.ts', 'utf8');

const regex = /export async function (\w+)/g;
let match;
const functions = [];
while ((match = regex.exec(content)) !== null) {
  functions.push(match[1]);
}

console.log('Functions in admin.actions.ts:');
console.log(functions);
