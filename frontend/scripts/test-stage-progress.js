const { load } = require('./_load-ts');
const assert = require('assert');
const m = load('src/utils/stageProgress.ts');
assert.strictEqual(m.stageNumber('community', 0), 1);   // before the first unlock: never "Stage 0"
assert.strictEqual(m.stageNumber('community', 2), 2);
assert.strictEqual(m.stageNumber('default', 0), 1);
assert.strictEqual(m.stageNumber('default', 3), 4);
assert.strictEqual(m.stageOfTotal('Stage {n} of {total}', 2, 4), 'Stage 2 of 4');
for (const l of ['en','pt','es','fr','de','it','ru','zh','hi','ar']) {
  const v = require(`../src/translations/${l}.json`).stage_of_total;
  assert(v && v.includes('{n}') && v.includes('{total}'), l);
}
console.log('ok');
