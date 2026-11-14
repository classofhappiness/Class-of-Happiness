import React, { useContext, useId } from 'react';
import * as RN from 'react-native';
import { Platform, InputAccessoryView, Keyboard, TouchableOpacity, Text, View } from 'react-native';
import { AppContext } from '../context/AppContext';

// S09: the app's TextInput. Same props as react-native's, with three shared keyboard defaults:
//   1. single-line fields get returnKeyType="done" and blur on submit (a caller that sets its own returnKeyType, e.g. "next",
//      or its own submit behaviour keeps it);
//   2. multi-line fields (where Return must stay a new line) get a "Done" bar above the iOS keyboard;
//   3. nothing else changes (style, ref, reading-font patching all pass straight through - RN.TextInput is read at render
//      time so installReadingText's swap still applies).
// Android has no accessory bar: multi-line fields there are dismissed by dragging or tapping outside (see KeyboardSafeView).
export const AppTextInput = React.forwardRef<RN.TextInput, RN.TextInputProps>(function AppTextInput(props, ref) {
  const ctx = useContext(AppContext);
  const id = `coh-done-${useId().replace(/:/g, '')}`;
  const multiline = !!props.multiline;
  const Input: any = RN.TextInput;
  const accessory = multiline && Platform.OS === 'ios' && props.inputAccessoryViewID === undefined;
  const extra: any = {};
  if (!multiline) {
    if (props.returnKeyType === undefined) extra.returnKeyType = 'done';
    if (props.blurOnSubmit === undefined && props.submitBehavior === undefined) extra.blurOnSubmit = true;
  }
  if (accessory) extra.inputAccessoryViewID = id;
  return (
    <>
      <Input {...props} {...extra} ref={ref} />
      {accessory ? (
        <InputAccessoryView nativeID={id}>
          <View style={{ backgroundColor: '#F2F2F7', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 6 }}>
            <TouchableOpacity onPress={() => Keyboard.dismiss()} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={{ color: '#007AFF', fontSize: 17, fontWeight: '600' }}>{ctx?.t?.('done') || 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      ) : null}
    </>
  );
});
