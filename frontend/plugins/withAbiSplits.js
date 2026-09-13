// Real fix Sep 13: this is a CNG/managed project - there's no committed android/ directory,
// EAS regenerates it from scratch (via `expo prebuild`) on every build server run, so a
// hand-edited build.gradle would never survive past the first build. A config plugin runs
// as part of that same prebuild step, so it applies every time instead.
//
// Splits the app-level build.gradle's `android {}` block into one APK per CPU architecture
// (armeabi-v7a, arm64-v8a, x86, x86_64) instead of one universal APK bundling all four -
// confirmed live tonight that the universal build was ~225MB, with each of the 4 native
// architectures' .so libraries duplicated in it even though any one real device only ever
// uses one. Matters specifically because the website self-hosts this APK directly (not
// through Google Play, which does this same per-device split for free) - real users
// downloading it directly pay for the full universal size otherwise.
//
// universalApk: false - don't also produce the big combined file; every /preview build from
// here on emits 4 real, separately-sized per-architecture APKs instead.
const { withAppBuildGradle } = require('@expo/config-plugins');

const SPLIT_BLOCK = `
    splits {
        abi {
            reset()
            enable true
            universalApk false
            include "armeabi-v7a", "arm64-v8a", "x86", "x86_64"
        }
    }
`;

function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.contents.includes('splits {')) {
      return config; // already applied - don't double-inject on a re-run
    }
    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      (match) => `${match}\n${SPLIT_BLOCK}`
    );
    return config;
  });
}

module.exports = withAbiSplits;
