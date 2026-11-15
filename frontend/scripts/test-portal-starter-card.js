// Portal "Starter creatures" card: renderStarterCreatures builds one row per starter with the right numbers, superadmin-gated markup, notes present.
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'portal', 'index.html'), 'utf8');
const fn = html.match(/async function renderStarterCreatures\(\)\{[\s\S]*?\n\}\n/)[0];
const el = { innerHTML: '' };
global.document = { getElementById: id => (id === 'starterCreatures' ? el : null) };
global.api = async () => ({ children: 5, creatures: {
  aqua_buddy: { started: 3, stage_counts: [1, 0, 1, 1], finished: 1, active: 1, ready_to_evolve: 1 },
  leaf_friend: { started: 1, stage_counts: [0, 1, 0, 0], finished: 0, active: 1, ready_to_evolve: 1 },
  blaze_heart: { started: 0, stage_counts: [0, 0, 0, 0], finished: 0, active: 0, ready_to_evolve: 0 },
  spark_pal: { started: 2, stage_counts: [2, 0, 0, 0], finished: 0, active: 2, ready_to_evolve: 0 } } });
global.console.error = () => {};
eval(fn + '; global.__r = renderStarterCreatures;');
(async () => {
  await global.__r();
  for (const n of ['Aqua Buddy', 'Leaf Friend', 'Blaze Heart', 'Spark Pal']) assert(el.innerHTML.includes(n), n);
  assert.strictEqual((el.innerHTML.match(/<tr/g) || []).length, 5);            // header + 4
  assert(el.innerHTML.includes('Ready to evolve, not evolved') && el.innerHTML.includes('Stage 3 (finished)'));
  assert(el.innerHTML.includes('5 children counted'));
  assert(/Aqua Buddy<\/td><td[^>]*>3<\/td><td[^>]*>1<\/td><td[^>]*>0<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td><td[^>]*>1<\/td>/.test(el.innerHTML));
  // failure path shows a message, not a crash
  global.api = async () => { throw new Error('x'); };
  await global.__r(); assert(el.innerHTML.includes('Could not load'));
  // static markup checks
  assert(html.includes("renderTopCreatures(); renderStarterCreatures();"));
  assert((html.match(/community creatures only/gi) || []).length >= 3);
  assert(html.includes('<h2>Starter creatures</h2>'));
  assert(!/real_student_name/.test(fn));
  console.log('test-portal-starter-card: OK');
})().catch(e => { console.error(e); process.exit(1); });
