// Portal dashboard rows (superadmin): new labels, "no data yet" instead of a bare dash, suppressed values pass through untouched.
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'portal', 'index.html'), 'utf8');
const statRowSrc = html.match(/function statRow\(label,value,color\)\{[\s\S]*?\n    \}/)[0];
eval(statRowSrc.replace('function statRow', 'global.statRow = function'));
const row = (v) => global.statRow('L', v, '#000');
for (const missing of [undefined, null, '', '—']) assert(row(missing).includes('>no data yet<'), String(missing));
assert(row('fewer than 5').includes('>fewer than 5<'));
assert(row('Not enough data yet').includes('>Not enough data yet<'));
assert(row(0).includes('>0<'));                         // a real zero from an unrelated row is still shown
assert(!row(undefined).includes('—'));
for (const label of ['Community creatures collected', 'Starter creatures started (counts child-creature pairs)',
  'Most used student strategy (last 30 days)', 'Check-ins with a helper chosen (last 30 days)', 'Home check-ins total', 'Linked families', 'Avg check-ins to evolve'])
  assert(html.includes(`statRow('${label}'`), label);
assert(!html.includes("statRow('Total creatures collected'"));
assert(/COH-PORTAL-VERSION: 2026-11-15b/.test(html));
console.log('test-portal-dashboard-stats: OK');
// teacher wellbeing: no false-zero bars, support requests row relabelled
const tw = html.match(/if\(twEl\)twEl\.innerHTML=[\s\S]*?;\n/)[0];
assert(tw.includes('Not enough teachers yet') && !tw.includes('colourBar'));
assert(tw.includes("statRow('Support requests (last 30 days)'"));
assert(!html.includes('Support requests this month'));
console.log('test-portal-dashboard-stats (wellbeing): OK');
