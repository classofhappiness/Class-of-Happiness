// Run from frontend/:  node scripts/test-strategy-display.js
// Transpiles src/utils/strategyDisplay.ts (pure, no React Native imports) and checks colour fallback and name de-duplication.
const fs = require('fs'), path = require('path'), assert = require('assert'), ts = require('typescript');
const load = (rel, cache = {}) => {
  const file = path.resolve(__dirname, '..', rel);
  if (cache[file]) return cache[file].exports;
  const mod = (cache[file] = { exports: {} });
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  new Function('require', 'module', 'exports', code)((r) => (r.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), r + '.ts')), cache) : require(r)), mod, mod.exports);
  return mod.exports;
};
const { strategyColour, strategyColourName, strategyTint, dropNamesAlreadyShown, STRATEGY_COLOUR_FALLBACK } = load('src/utils/strategyDisplay.ts');
const { EMOTION_COLOURS } = load('src/constants/emotionColours.ts');

assert.strictEqual(strategyColour('yellow'), EMOTION_COLOURS.yellow);
assert.strictEqual(strategyColour('Yellow'), EMOTION_COLOURS.yellow);              // case
assert.strictEqual(strategyColour(' RED '), EMOTION_COLOURS.red);                   // spaces
assert.strictEqual(strategyColour('blue,yellow'), EMOTION_COLOURS.blue);            // first match of a list
assert.strictEqual(strategyColour('purple,green'), EMOTION_COLOURS.green);          // unknown parts skipped
for (const bad of ['all', '', null, undefined, 'purple', 42]) {
  assert.strictEqual(strategyColour(bad), STRATEGY_COLOUR_FALLBACK, String(bad));   // neutral grey, never indigo
  assert.notStrictEqual(strategyColour(bad), '#5C6BC0');
}
assert.strictEqual(strategyColourName('all'), null);
assert.strictEqual(strategyTint('green'), EMOTION_COLOURS.green + '26');
assert.strictEqual(strategyTint('nonsense'), STRATEGY_COLOUR_FALLBACK + '26');

const personal = [{ id: 'p1', name: 'Staff Room' }, { id: 'p2', name: 'my own' }, { id: 'p3', name: ' calm  ' }, { id: 'p4', name: 'calm  down' }];
const school = [{ name: 'staff room' }, { name: 'Calm' }, { name: '' }];
assert.deepStrictEqual(dropNamesAlreadyShown(personal, school).map(p => p.id), ['p2', 'p4']);   // case/outer-space-insensitive, the school one stays; a different name is kept
assert.deepStrictEqual(dropNamesAlreadyShown(personal, []).map(p => p.id), ['p1', 'p2', 'p3', 'p4']);
assert.deepStrictEqual(dropNamesAlreadyShown([{ name: '' }], [{ name: '' }]).map(p => p.name), ['']);   // empty names never match
console.log('strategyDisplay: all checks passed');
