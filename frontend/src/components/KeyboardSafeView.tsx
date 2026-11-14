import React from 'react';
import { KeyboardAvoidingView, Keyboard, Platform, ScrollView, FlatList, StyleProp, ViewStyle } from 'react-native';
import { useAndroidKeyboardOffset } from '../utils/useAndroidKeyboardOffset';

// Keeps the focused field above the on-screen keyboard. iOS uses KeyboardAvoidingView's own
// 'padding'. Android cannot rely on adjustResize (app.json has edgeToEdgeEnabled: true, so the
// system leaves keyboard insets to the app - see useAndroidKeyboardOffset), so the container is
// padded by the live keyboard height instead; the ScrollView inside then has a shorter viewport
// and Android scrolls the focused input into it. Put the form's ScrollView
// (keyboardShouldPersistTaps="handled") inside this view.
// S09 shared keyboard behaviour for every screen that uses this wrapper:
//   - dragging a direct child ScrollView/FlatList dismisses the keyboard (keyboardDismissMode="on-drag"; a screen that set its own keeps it);
//   - tapping any non-interactive area dismisses it (buttons and inputs still get their own taps first);
//   - single-line Return = Done and multi-line "Done" bar come from AppTextInput.
const withDismissOnDrag = (child: React.ReactNode) => {
  if (!React.isValidElement(child)) return child;
  const type: any = child.type;
  if (type === ScrollView || type === FlatList) {
    const p: any = child.props;
    return React.cloneElement(child as React.ReactElement<any>, {
      keyboardDismissMode: p.keyboardDismissMode ?? 'on-drag',
      keyboardShouldPersistTaps: p.keyboardShouldPersistTaps ?? 'handled',
    });
  }
  return child;
};

export function KeyboardSafeView({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const androidOffset = useAndroidKeyboardOffset();
  return (
    <KeyboardAvoidingView
      style={[style, Platform.OS === 'android' && { paddingBottom: androidOffset }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // Tap outside: the deepest touchable (button, input) claims its own tap first, so this only fires for empty areas.
      // No wrapper view is added, so every screen's own layout style is untouched.
      onStartShouldSetResponder={() => Keyboard.isVisible()}
      onResponderRelease={() => Keyboard.dismiss()}
    >
      {React.Children.map(children, withDismissOnDrag)}
    </KeyboardAvoidingView>
  );
}
