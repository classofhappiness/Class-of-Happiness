// Run from frontend/:  node scripts/test-s10-alert-count.js
const assert = require('assert');
const { load } = require('./_load-ts');
const { openAlertCount } = load('src/utils/alertCount.ts');
assert.strictEqual(openAlertCount([{ alert_type: 'zone_alert' }, { alert_type: 'help_request', resolved: true }, { alert_type: 'support_request' }, { alert_type: 'support_request', resolved: false }]), 1);
assert.strictEqual(openAlertCount([]), 0);
assert.strictEqual(openAlertCount(null), 0);
assert.strictEqual(openAlertCount({ detail: 'x' }), 0);
console.log('ok');
