// Real feature Aug 26 (item 13): one consistent password/sensitive-code input pattern,
// generalized from the best-built existing example in the app (settings.tsx's trial-code
// field: a wrapper that owns the border, an input with none of its own, and an in-flow -
// not absolutely positioned - eye icon). Applied everywhere a password or sensitive code is
// typed, replacing several inconsistent one-off implementations: some fields had no
// show/hide toggle at all, one had a redundant double border, one silently shared another
// field's visibility state, one rendered with no visible border/box at all.
//
// Border width is constant (never changes on focus) - only borderColor changes, so focusing
// a field never shifts layout by a pixel. This is deliberate: a borderWidth change on focus
// looks like the more "obvious" way to highlight focus, but it nudges every sibling element
// on the screen by however many extra pixels the border grew, which reads as a layout glitch
// rather than a clean focus state.
import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet, TextInputProps, ViewStyle, StyleProp } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SecureFieldProps extends Omit<TextInputProps, 'secureTextEntry' | 'style'> {
  // 'code' centers and letter-spaces the text (unlock codes, trial codes) instead of the
  // plain left-aligned layout a password field wants.
  variant?: 'password' | 'code';
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  iconColor?: string;
  focusColor?: string;
  borderColor?: string;
}

export function SecureField({
  variant = 'password',
  containerStyle,
  inputStyle,
  iconColor = '#888',
  focusColor = '#5C6BC0',
  borderColor = '#E0E0E0',
  onFocus,
  onBlur,
  ...rest
}: SecureFieldProps) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.wrapper,
        { borderColor: focused ? focusColor : borderColor },
        containerStyle,
      ]}
    >
      <TextInput
        {...rest}
        secureTextEntry={!visible}
        onFocus={(e) => { setFocused(true); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); onBlur?.(e); }}
        style={[
          styles.input,
          variant === 'code' && styles.inputCode,
          inputStyle,
        ]}
      />
      <TouchableOpacity
        onPress={() => setVisible(v => !v)}
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide' : 'Show'}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons name={visible ? 'visibility-off' : 'visibility'} size={20} color={iconColor} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 12,
    backgroundColor: 'white',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#333',
  },
  inputCode: {
    textAlign: 'center',
    letterSpacing: 4,
    fontSize: 18,
  },
  iconButton: {
    padding: 6,
  },
});
