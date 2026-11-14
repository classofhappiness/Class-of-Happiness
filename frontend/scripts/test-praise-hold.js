// Run from frontend/:  node scripts/test-praise-hold.js
const assert = require('assert');
const { load } = require('./_load-ts');
const { praiseHoldMs } = load('src/utils/praiseHold.ts');
assert.strictEqual(praiseHoldMs(null), 3000);        // no speech: the minimum
assert.strictEqual(praiseHoldMs(undefined), 3000);
assert.strictEqual(praiseHoldMs(0), 3000);
assert.strictEqual(praiseHoldMs(NaN), 3000);
assert.strictEqual(praiseHoldMs(800), 3000);         // 0.8 s speech + 1 s is under the minimum
assert.strictEqual(praiseHoldMs(2000), 3000);        // exactly 3 s
assert.strictEqual(praiseHoldMs(3200), 4200);        // speech + 1 s
assert.strictEqual(praiseHoldMs(5000), 6000);        // exactly the maximum
assert.strictEqual(praiseHoldMs(9000), 6000);        // capped
console.log('praise hold: ok');
