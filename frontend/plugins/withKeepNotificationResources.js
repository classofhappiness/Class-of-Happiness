// Resource shrinking (enableShrinkResourcesInReleaseBuilds) removes resources nothing in the
// compiled code references. Two of ours are only ever looked up BY NAME at runtime, from
// strings that come from JS or from the push payload, so the shrinker can't see the use:
//   - raw/support_buzz            the incident buzz sound (channel/push sound)
//   - drawable*/notification_icon the small status-bar icon (notifee smallIcon: 'notification_icon')
// res/raw/keep.xml is the documented way to tell the shrinker to keep them.
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const KEEP_XML = `<?xml version="1.0" encoding="utf-8"?>
<resources xmlns:tools="http://schemas.android.com/tools"
    tools:keep="@raw/support_buzz,@drawable/notification_icon*" />
`;

module.exports = function withKeepNotificationResources(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const rawDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      fs.mkdirSync(rawDir, { recursive: true });
      fs.writeFileSync(path.join(rawDir, 'keep.xml'), KEEP_XML);
      return cfg;
    },
  ]);
};
