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
module.exports = ({ config }) => {
  const isPreviewBuild = process.env.EAS_BUILD_PROFILE === 'preview';

  return {
    ...config,
    plugins: (config.plugins || []).filter((plugin) => {
      const pluginName = Array.isArray(plugin) ? plugin[0] : plugin;
      if (pluginName === './plugins/withAbiSplits') {
        return isPreviewBuild;
      }
      return true;
    }),
  };
};
