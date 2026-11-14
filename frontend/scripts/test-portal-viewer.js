// Run from frontend/:  node scripts/test-portal-viewer.js
// Checks the portal creature viewer's pure helpers by lifting them out of portal/index.html.
const assert = require('assert'), fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(__dirname + '/../../portal/index.html', 'utf8');
const grab = (name) => { const i = html.indexOf('function ' + name + '('); assert(i > 0, name); let d = 0, j = html.indexOf('{', i); for (let k = j; k < html.length; k++) { if (html[k] === '{') d++; if (html[k] === '}' && --d === 0) return html.slice(i, k + 1); } };
const ctx = { esc: (x) => String(x).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]) };
vm.createContext(ctx);
vm.runInContext('var CR_EMO={green:"#4CAF73"};' + ['crRoleLabel', 'crSubmittedBy', 'crScopeLabel', 'crStatusText', 'crJudge', 'crAiLine', 'crAiPlain', 'crCompactHTML', 'crWhen', 'crCountry'].map(grab).join('\n'), ctx);
assert.strictEqual(ctx.crSubmittedBy({ student_name: 'Rex', submitted_by_role: 'teacher' }), 'Rex (Teacher)');
assert.strictEqual(ctx.crSubmittedBy({ student_name: 'Rex' }), 'Rex');                 // awaiting list: role blank
assert.strictEqual(ctx.crSubmittedBy({ student_name: 'Rex', submitted_by_role: 'unknown' }), 'Rex');
assert.ok(!ctx.crCompactHTML({ creature_name: 'A', student_name: 'S', real_student_name: 'SECRET CHILD' }, 'pending').includes('SECRET CHILD'));
assert.ok(!/real_student_name/.test(html.slice(html.indexOf('function crSubmittedBy'), html.indexOf('function openCreatureViewer') + 9000)), 'viewer never reads real_student_name');
assert.ok(ctx.crCompactHTML({ creature_name: '<img src=x onerror=alert(1)>' }, 'pending').indexOf('<img') === -1, 'names are escaped');
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.crJudge({ w: 1024, h: 1024, pixels: true, opaque: false, artW: 800, artH: 700 }))).ok, true);
assert.strictEqual(ctx.crJudge({ w: 1024, h: 1024, pixels: true, opaque: false, artW: 1000, artH: 900 }).ok, false);   // art over 80%
assert.strictEqual(ctx.crJudge({ w: 512, h: 512, pixels: true, opaque: false, artW: 300, artH: 300 }).ok, false);     // wrong size
assert.strictEqual(ctx.crJudge({ w: 1024, h: 1024, pixels: true, opaque: true }).ok, false);                           // no transparency
assert.strictEqual(ctx.crJudge({ w: 1024, h: 1024, pixels: false }).ok, null);                                         // browser cannot read pixels
assert.strictEqual(ctx.crJudge({ error: true }).ok, null);
assert.ok(/Finished by '\+\(c\.global_uses/.test(html) && !/ uses'\;/.test(html.slice(html.indexOf('var openApproved'), html.indexOf('var openApproved') + 1500)));
assert.ok(/Top creatures \(last 30 days\)/.test(html));      // note text kept
console.log('ok');
