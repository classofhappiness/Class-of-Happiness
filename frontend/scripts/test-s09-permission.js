// Run from frontend/:  node scripts/test-s09-permission.js
const assert = require('assert'), fs = require('fs');
const rd = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');
const h = rd('src/utils/permissionAlert.ts');
assert(/Linking\.openSettings/.test(h) && /open_settings/.test(h));
for (const f of ['app/student/submit-creature.tsx', 'app/parent/dashboard.tsx', 'app/parent/checkin.tsx']) {
  assert(/showPermissionAlert\(t/.test(rd(f)), f);
}
assert(!/Alert\.alert\(t\('permission_needed'\) \|\| 'Permission needed'\); return/.test(rd('app/student/submit-creature.tsx')));
for (const l of ['en','pt','es','fr','de','it','ru','zh','hi','ar']) {
  const t = require(`../src/translations/${l}.json`);
  for (const k of ['permission_needed', 'allow_library_access_settings', 'camera_permission_desc', 'open_settings', 'cancel']) assert(t[k], l + '.' + k);
}
assert(/creature drawings/.test(JSON.parse(rd('app.json')).expo.ios.infoPlist.NSPhotoLibraryUsageDescription));
console.log('ok');
