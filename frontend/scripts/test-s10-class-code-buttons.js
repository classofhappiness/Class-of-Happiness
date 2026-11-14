// Run from frontend/:  node scripts/test-s10-class-code-buttons.js
const assert = require('assert'), fs = require('fs');
const s = fs.readFileSync(__dirname + '/../app/teacher/dashboard.tsx', 'utf8');
assert(/classCodeBtn: \{ width:40, height:40, borderRadius:20/.test(s));
assert.strictEqual((s.match(/style=\{st\.classCodeBtn\}/g) || []).length, 2);
assert.strictEqual((s.match(/size=\{20\} color="#5C6BC0"/g) || []).length, 2);
console.log('ok');
