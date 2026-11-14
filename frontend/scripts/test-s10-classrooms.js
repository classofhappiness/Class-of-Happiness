// Run from frontend/:  node scripts/test-s10-classrooms.js
const assert = require('assert'), fs = require('fs');
const { load } = require('./_load-ts');
const m = load('src/utils/classroomRefresh.ts');
assert.strictEqual(m.classroomAccess(null), 'unknown');            // auth transition: no role yet, never treated as a parent
assert.strictEqual(m.classroomAccess({}), 'unknown');
assert.strictEqual(m.classroomAccess({ role: 'parent' }), 'parent');
assert.strictEqual(m.classroomAccess({ role: 'family' }), 'parent');
assert.strictEqual(m.classroomAccess({ role: 'teacher' }), 'staff');
assert.strictEqual(m.classroomAccess({ role: 'school_admin' }), 'staff');
assert.strictEqual(m.classroomsStillFresh(1000, 20000), true);     // 19 s after a success: skip
assert.strictEqual(m.classroomsStillFresh(1000, 40000), false);    // 39 s: refetch
assert.strictEqual(m.classroomsStillFresh(1000, 2000, true), false); // force always fetches
assert.strictEqual(m.classroomsStillFresh(0, 5000), false);        // never succeeded (stamp still 0): always fetch
assert.strictEqual(m.isAuthTransitionError(new Error('401 Unauthorized')), true);
assert.strictEqual(m.isAuthTransitionError(new Error('Network request failed')), false);
const ctx = fs.readFileSync(__dirname + '/../src/context/AppContext.tsx', 'utf8');
assert(/if \(ok\) lastClassroomsFetchAtRef\.current = Date\.now\(\)/.test(ctx), 'stamp only after success');
assert(!/finally\(\(\) => \{[^}]*lastClassroomsFetchAtRef/.test(ctx), 'no stamp in finally');
assert(/setClassroomsError\(true\)/.test(ctx));
const dash = fs.readFileSync(__dirname + '/../app/teacher/dashboard.tsx', 'utf8');
assert(/refreshClassrooms\(\{ force: true \}\)/.test(dash) && /classrooms_load_failed/.test(dash));
for (const l of ['en','pt','es','fr','de','it','ru','zh','hi','ar']) assert(require(`../src/translations/${l}.json`).classrooms_load_failed, l);
console.log('ok');
