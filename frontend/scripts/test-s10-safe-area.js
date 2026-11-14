// Run from frontend/:  node scripts/test-s10-safe-area.js
const assert = require('assert'), fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const rnImport = s => (s.match(/import\s*\{([^}]*)\}\s*from\s*'react-native';/) || [])[1] || '';
// Screens under TranslatedHeader (which applies the top inset itself): no top edge on the safe area.
for (const f of ['app/teacher/students.tsx', 'app/teacher/resources.tsx', 'app/teacher/support-request.tsx']) {
  const s = rd(f);
  assert(!rnImport(s).split(',').some(x => x.trim() === 'SafeAreaView'), f + ' still uses the iOS-only RN SafeAreaView');
  assert(/from 'react-native-safe-area-context'/.test(s), f);
  const opens = (s.match(/<SafeAreaView\b/g) || []).length, edged = (s.match(/edges=\{\['left', 'right', 'bottom'\]\}/g) || []).length;
  assert.strictEqual(opens, edged, f + ': every SafeAreaView must exclude the top edge');
}
// Screens with their own header row: the cross-platform SafeAreaView keeps the top inset (iOS identical, Android fixed).
for (const f of ['app/teacher/bulk-checkin.tsx', 'app/teacher/widget.tsx']) {
  const s = rd(f);
  assert(!rnImport(s).split(',').some(x => x.trim() === 'SafeAreaView'), f);
  assert(/from 'react-native-safe-area-context'/.test(s) && !/edges=/.test(s), f);
}
console.log('ok');
