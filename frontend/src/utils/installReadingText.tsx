import React from 'react';
import { getActiveConfig, computeOverrides, isEmojiOnly, spaceWords, SPACER_FONT_FAMILY } from './readingStore';

// Central place that applies the "Reading font" settings (OpenDyslexic, letter and word
// spacing) to the app's text. Import this file FIRST in app/_layout.tsx.
//
// How: react-native's `Text` and `TextInput` exports are getters. We replace them with
// getters that return the ORIGINAL component while no reading setting is on, and a thin
// wrapper once one is. So with everything off, every <Text> in the app is the very same
// component it always was - no wrapper, no extra work.
//
// (Not done by patching `Text.render`: in React Native 0.81 Text is a plain function component
// taking `ref` as a prop, so there is no `.render` to patch. `Text.defaultProps` is not an option
// either - React 19 ignores defaultProps on function components.)
//
// When the settings change, AppContext's value changes, so every useApp() screen re-renders and
// its JSX picks up the new Text type - the same mechanism the language switch relies on.
// Text inside React.memo'd components that don't re-render keeps its old look until they do.
try {
  const rn = require('react-native');
  const OriginalText = rn.Text;
  const OriginalTextInput = rn.TextInput;
  const { StyleSheet } = rn;

  const makeSpacer = (key: string, size: number) => (
    <OriginalText
      key={key}
      style={{ fontFamily: SPACER_FONT_FAMILY, fontSize: size, fontWeight: 'normal', fontStyle: 'normal', letterSpacing: 0 }}
    >
      {' '}
    </OriginalText>
  );

  const ReadingText = (props: any) => {
    const cfg = getActiveConfig();
    if (!cfg || isEmojiOnly(props.children)) return <OriginalText {...props} />;
    const flat = StyleSheet.flatten(props.style) || {};
    const overrides = computeOverrides(flat, cfg);
    const fontSize = typeof flat.fontSize === 'number' ? flat.fontSize : 14;
    const children = spaceWords(props.children, fontSize, cfg.wordExtraEm, makeSpacer);
    if (!overrides && children === props.children) return <OriginalText {...props} />;
    return <OriginalText {...props} style={overrides ? [props.style, overrides] : props.style}>{children}</OriginalText>;
  };
  ReadingText.displayName = 'Text';

  // Inputs get the font only - never spacing, which would alter what the person types.
  const ReadingTextInput = React.forwardRef((props: any, ref: any) => {
    const cfg = getActiveConfig();
    const flat = cfg?.useDyslexicFont ? StyleSheet.flatten(props.style) || {} : null;
    const overrides = cfg && flat ? computeOverrides(flat, { ...cfg, letterEm: 0, wordExtraEm: 0 }) : null;
    return <OriginalTextInput {...props} ref={ref} style={overrides ? [props.style, overrides] : props.style} />;
  });
  ReadingTextInput.displayName = 'TextInput';

  // The inputs' wrapper also needs the static members some code reads off TextInput (State, ...).
  Object.assign(ReadingTextInput, { State: OriginalTextInput.State });

  Object.defineProperty(rn, 'Text', {
    configurable: true,
    enumerable: true,
    get: () => (getActiveConfig() ? ReadingText : OriginalText),
  });
  Object.defineProperty(rn, 'TextInput', {
    configurable: true,
    enumerable: true,
    get: () => (getActiveConfig()?.useDyslexicFont ? ReadingTextInput : OriginalTextInput),
  });
} catch (e) {
  // If anything about this fails, the app keeps the normal Text.
  console.warn('Reading font could not be installed', e);
}
