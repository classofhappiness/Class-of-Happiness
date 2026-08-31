import { I18nManager, Platform, DevSettings } from 'react-native';

// Arabic RTL phase 1 (build 26). Real infrastructure below, deliberately kept inert.
//
// I18nManager.forceRTL() only takes effect after a full JS reload - there is no live
// re-render workaround. The only reload primitive available without adding a new
// dependency is DevSettings.reload(), which only works in a __DEV__ build; production
// needs either `expo-updates` (Updates.reloadAsync()) or `react-native-restart`, and
// neither is currently a dependency (checked package.json - not present). Flipping this
// flag also needs a real device to confirm forceRTL + reload actually re-renders RTL
// correctly, which this environment can't do. Until both are true, leave this false so
// Arabic keeps rendering LTR exactly as it does today (see app/settings.tsx's existing
// "Arabic is TEXT ONLY" comment) - flipping it is the one remaining step once a restart
// mechanism is added and device-verified.
export const RTL_RESTART_FLOW_READY = false;

export function needsRtlRestart(langCode: string): boolean {
  const wantsRtl = langCode === 'ar';
  return wantsRtl !== I18nManager.isRTL;
}

export function applyRtlAndRestart(langCode: string) {
  if (Platform.OS === 'web') return; // web stays LTR text-only regardless, same as today
  const wantsRtl = langCode === 'ar';
  I18nManager.allowRTL(wantsRtl || I18nManager.isRTL);
  I18nManager.forceRTL(wantsRtl);
  if (__DEV__ && typeof DevSettings?.reload === 'function') {
    DevSettings.reload();
    return;
  }
  // Production reload mechanism not wired yet - see RTL_RESTART_FLOW_READY above.
}
