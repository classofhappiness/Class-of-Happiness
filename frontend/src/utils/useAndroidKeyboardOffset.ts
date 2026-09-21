import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

// Real fix Sep 21 (device report - keyboard STILL covering the comment field after the
// first "fix"): that first attempt set KeyboardAvoidingView's behavior to undefined on
// Android, on the assumption that the OS's own windowSoftInputMode="adjustResize" (Expo's
// default when unset) would resize the window itself. Confirmed via research this was a
// false assumption for THIS app specifically: app.json has edgeToEdgeEnabled:true, and
// Android 15+ does not reliably run adjustResize under edge-to-edge - the system assumes
// the app handles keyboard insets itself instead. So neither behavior:'height' (the
// original code) nor behavior:undefined (the first "fix") ever had a working native
// resize signal to lean on - both were guesses against a broken assumption.
//
// This sidesteps native resize entirely: Keyboard.addListener's DID_SHOW/DID_HIDE events
// fire directly from the IME's own show/hide state, independent of windowSoftInputMode or
// edge-to-edge - they're the one signal that still works regardless. Returns the live
// keyboard height on Android (0 when hidden, always 0 on iOS - KeyboardAvoidingView's own
// 'padding' behavior already works correctly there, untouched by any of this).
export function useAndroidKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setOffset(e.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setOffset(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return offset;
}
