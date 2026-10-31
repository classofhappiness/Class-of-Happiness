import { Platform } from 'react-native';
import Constants from 'expo-constants';

// "Version 1.4.0 (14) - Android": version, build and platform, all read from the app config (app.json) so they can
// never drift from what was built. versionCode on Android, buildNumber on iOS.
export function appVersionLabel(versionWord: string): string {
  const cfg: any = Constants.expoConfig || {};
  const version = cfg.version || '';
  const build = Platform.OS === 'android' ? cfg.android?.versionCode : Platform.OS === 'ios' ? cfg.ios?.buildNumber : undefined;
  const platform = Platform.OS === 'android' ? 'Android' : Platform.OS === 'ios' ? 'iOS' : 'Web';
  return `${versionWord} ${version}${build != null && build !== '' ? ` (${build})` : ''} - ${platform}`;
}
