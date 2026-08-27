import { readFileSync, writeFileSync } from 'node:fs';

const path = 'supabase/schema/07_functions.sql';
const content = readFileSync(path, 'utf8');

// Replace "SECURITY DEFINER\nSET search_path = ''" or "SECURITY DEFINER SET search_path = ''"
// handle any whitespace between them
let newContent = content.replace(/SECURITY DEFINER\s+SET search_path = ''/g, "SECURITY DEFINER SET search_path = public, pg_temp");

// Also check for ones that might not have the space after =
newContent = newContent.replace(/SECURITY DEFINER\s+SET search_path='' /g, "SECURITY DEFINER SET search_path = public, pg_temp ");

if (newContent !== content) {
  writeFileSync(path, newContent);
  console.log(`Updated ${path}`);
  const count = (newContent.match(/SET search_path = public, pg_temp/g) || []).length;
  console.log(`Found ${count} hardened functions`);
} else {
  console.log(`No changes needed in ${path}`);
}
