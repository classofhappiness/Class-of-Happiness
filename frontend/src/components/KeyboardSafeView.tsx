import React from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';
import { useAndroidKeyboardOffset } from '../utils/useAndroidKeyboardOffset';

// Keeps the focused field above the on-screen keyboard. iOS uses KeyboardAvoidingView's own
// 'padding'. Android cannot rely on adjustResize (app.json has edgeToEdgeEnabled: true, so the
// system leaves keyboard insets to the app - see useAndroidKeyboardOffset), so the container is
// padded by the live keyboard height instead; the ScrollView inside then has a shorter viewport
// and Android scrolls the focused input into it. Put the form's ScrollView
// (keyboardShouldPersistTaps="handled") inside this view.
export function KeyboardSafeView({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const androidOffset = useAndroidKeyboardOffset();
  return (
    <KeyboardAvoidingView
      style={[style, Platform.OS === 'android' && { paddingBottom: androidOffset }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
