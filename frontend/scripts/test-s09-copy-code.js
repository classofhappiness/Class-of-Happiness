// Run from frontend/:  node scripts/test-s09-copy-code.js
const assert = require('assert'), fs = require('fs');
for (const l of ['en','pt','es','fr','de','it','ru','zh','hi','ar']) {
  const t = require(`../src/translations/${l}.json`);
  for (const k of ['creature_copy_code_btn', 'creature_code_copied']) {
    assert(t[k] && !/[—]/.test(t[k]), `${l}.${k}`);
  }
}
const src = fs.readFileSync(__dirname + '/../src/components/CreatureManagement.tsx', 'utf8');
assert(/Clipboard\.setStringAsync\(code\)/.test(src), 'copies the bare code, not the share sentence');
console.log('ok');
