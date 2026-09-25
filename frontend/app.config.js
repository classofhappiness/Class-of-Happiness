// Real fix Sep 14: app.json's plugins array is static, so the withAbiSplits plugin (see
// plugins/withAbiSplits.js) applied to every EAS build profile - confirmed Sep 13 that both
// the "development" and "preview" builds got ABI-split, when only "preview" should (the
// website self-hosts the preview APK directly; development is for internal testing on
// whatever device is on hand and should stay a single universal APK).
//
// app.config.js is evaluated per-build, and EAS Build sets EAS_BUILD_PROFILE in the build
// environment, so gating here restricts the split to preview only. Locally (expo start,
// expo prebuild without EAS) EAS_BUILD_PROFILE is unset, so the split is skipped there too
// - matches pre-Sep-13 behavior everywhere except an actual `eas build -p android -e preview`.
// Real feature Sep 25 (item 13): the Sentry Expo config plugin only gets appended when
// EXPO_PUBLIC_SENTRY_DSN is actually set (an EAS secret, never committed - same
// EXPO_PUBLIC_ convention EXPO_PUBLIC_BACKEND_URL already uses elsewhere in this codebase,
// so the runtime init code in _layout.tsx can read the identical env var via
// process.env.EXPO_PUBLIC_SENTRY_DSN with no expo-constants plumbing needed) - without it,
// this build has no Sentry plugin at all and behaves exactly as before. SENTRY_ORG/
// SENTRY_PROJECT are needed too (for the plugin's build-time debug-symbol upload, which
// needs SENTRY_AUTH_TOKEN as its own EAS secret) but aren't secrets themselves; still read
// from env rather than hardcoded so nothing here has to change once Jono's real Sentry
// project exists - just set the EAS secrets/vars and rebuild.
module.exports = ({ config }) => {
  const isPreviewBuild = process.env.EAS_BUILD_PROFILE === 'preview';
  const sentryEnabled = !!process.env.EXPO_PUBLIC_SENTRY_DSN;

  let plugins = (config.plugins || []).filter((plugin) => {
    const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
    if (pluginName === './plugins/withAbiSplits') {
      return isPreviewBuild;
    }
    return true;
  });

  if (sentryEnabled) {
    plugins = [
      ...plugins,
      [
        '@sentry/react-native/expo',
        {
          organization: process.env.SENTRY_ORG,
          project: process.env.SENTRY_PROJECT,
          url: 'https://sentry.io/',
        },
      ],
    ];
  }

  return {
    ...config,
    plugins,
  };
};
