const fs = require('fs');
const html = fs.readFileSync('err.html', 'utf8');

// The error message is often present in plain text inside <title> or <h1 data-nextjs-dialog-header> or script payload
const match = html.match(/<title>(.*?)<\/title>/);
if (match) console.log("TITLE:", match[1]);

const scriptMatch = html.match(/\"message\":\"([^\"]+)\"/);
if (scriptMatch) console.log("MESSAGE:", scriptMatch[1]);
