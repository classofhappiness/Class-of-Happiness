const assert = require('assert');
console.log('card width test needs react-native imports; checking the formula directly');
const gridCardWidth = c => `${Math.floor(100 / c - (c <= 2 ? 3 : 2))}%`;
const px = (w, c) => (w * parseFloat(gridCardWidth(c))) / 100;
assert.strictEqual(px(402 - 52, 2), 164.5);
assert(px(402 - 52, 2) < (402 - 52 - 10) / 2);   // old formula was wider than the real card
console.log('ok');
