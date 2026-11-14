// A numeric PIN / one-time-code field that iOS treats as exactly that - not as a password to autofill.
//
// Why: on recent iPhones a secureTextEntry field (and a numeric field next to other secure fields) can make iOS show its
// Passwords / "Strong Password" autofill UI instead of the number pad, so the PIN field looks dead and the screen just says
// "autofill". textContentType="oneTimeCode" is the documented opt-out; autoComplete="off" does the same on Android. The other
// half of the problem is autoFocus: focusing during the first frame of a screen or while a Modal is still sliding in is dropped
// by iOS (no keyboard), so PIN fields focus themselves a moment after mounting instead (autoFocusDelay).
import React, { useEffect, useRef } from 'react';
import { TextInput, TextInputProps } from 'react-native';

export const PIN_FIELD_PROPS = {
  textContentType: 'oneTimeCode',
  autoComplete: 'off',
  importantForAutofill: 'no',
  autoCorrect: false,
  autoCapitalize: 'none',
  spellCheck: false,
} as const;

// Long enough for a Modal's fade/slide-in (about 300 ms) to finish before the keyboard is requested.
export const PIN_AUTOFOCUS_DELAY_MS = 450;

interface PinInputProps extends TextInputProps {
  secure?: boolean;             // mask the digits (sign-in PIN, set PIN); off for a visible code
  autoFocusDelay?: number;      // ms after mount to focus the field; omit for no auto focus
}

export function PinInput({ secure = false, autoFocusDelay, ...rest }: PinInputProps) {
  const ref = useRef<TextInput>(null);
  useEffect(() => {
    if (autoFocusDelay == null) return;
    const id = setTimeout(() => ref.current?.focus(), autoFocusDelay);
    return () => clearTimeout(id);
  }, []);
  return <TextInput keyboardType="number-pad" {...PIN_FIELD_PROPS} {...rest} ref={ref} secureTextEntry={secure} />;
}
