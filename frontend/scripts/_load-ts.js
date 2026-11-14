// Shared by the node test scripts: loads a pure TypeScript file (no React Native imports) by transpiling it on the fly.
const fs = require('fs'), path = require('path'), ts = require('typescript');
const load = (rel, cache = {}) => {
  const file = path.resolve(__dirname, '..', rel);
  if (cache[file]) return cache[file].exports;
  const mod = (cache[file] = { exports: {} });
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  new Function('require', 'module', 'exports', code)((r) => (r.startsWith('.') ? load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), r + '.ts')), cache) : require(r)), mod, mod.exports);
  return mod.exports;
};
module.exports = { load };
