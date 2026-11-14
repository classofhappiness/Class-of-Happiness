// Run from frontend/:  node scripts/test-s09-keyboard.js
// Every screen/component that renders a text field must use the shared AppTextInput (except the PIN boxes and the font patch).
const assert = require('assert'), fs = require('fs'), path = require('path');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const root = path.join(__dirname, '..');
const skip = ['app/_layout.tsx', 'src/components/PinInput.tsx', 'src/components/AppTextInput.tsx', 'src/utils/installReadingText.tsx'];
let n = 0;
for (const f of [...walk(path.join(root, 'app')), ...walk(path.join(root, 'src'))].filter(f => f.endsWith('.tsx'))) {
  const rel = path.relative(root, f);
  if (skip.includes(rel)) continue;
  const s = fs.readFileSync(f, 'utf8');
  if (!/<TextInput\b/.test(s)) continue;
  n++;
  assert(/AppTextInput as TextInput/.test(s), rel + ' still uses the plain react-native TextInput');
  const rn = (s.match(/import\s*\{([^}]*)\}\s*from\s*'react-native'/) || [])[1] || '';
  assert(!rn.split(',').some(x => x.trim() === 'TextInput'), rel + ' imports TextInput from react-native');
}
const ksv = fs.readFileSync(path.join(root, 'src/components/KeyboardSafeView.tsx'), 'utf8');
assert(/keyboardDismissMode: p\.keyboardDismissMode \?\? 'on-drag'/.test(ksv));
assert(/onResponderRelease/.test(ksv));
const inp = fs.readFileSync(path.join(root, 'src/components/AppTextInput.tsx'), 'utf8');
assert(/returnKeyType = 'done'/.test(inp) && /blurOnSubmit = true/.test(inp) && /InputAccessoryView/.test(inp));
console.log('ok, ' + n + ' files use AppTextInput');
