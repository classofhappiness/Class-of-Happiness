import React from 'react';
import { View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { ColourCycleLogo } from './ColourCycleLogo';
import { WORDMARK_COLOUR, WORDMARK_PATH, WORDMARK_VIEWBOX } from './logoPaths';

// Mark + name side by side, in resting colours (matches COH-logo-lockup.svg proportions:
// mark 96 wide, 10 gap, name ~146 wide, vertically centred on the mark).
const MARK_SIZE = 96;
const GAP = 10;
const NAME_WIDTH = 146;
const NAME_HEIGHT = (NAME_WIDTH * WORDMARK_VIEWBOX.height) / WORDMARK_VIEWBOX.width;

export const LogoLockup: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, style]}>
    <ColourCycleLogo size={MARK_SIZE} />
    <View style={{ width: GAP }} />
    <Svg
      width={NAME_WIDTH}
      height={NAME_HEIGHT}
      viewBox={`0 0 ${WORDMARK_VIEWBOX.width} ${WORDMARK_VIEWBOX.height}`}
      accessibilityLabel="Class of Happiness"
    >
      <Path d={WORDMARK_PATH} fillRule="evenodd" fill={WORDMARK_COLOUR} />
    </Svg>
  </View>
);
