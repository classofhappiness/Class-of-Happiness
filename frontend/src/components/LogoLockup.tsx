import React, { useRef } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useHomeIntroRound } from '../utils/launchState';
import Svg, { Path } from 'react-native-svg';
import { ColourCycleLogo } from './ColourCycleLogo';
import { WORDMARK_COLOUR, WORDMARK_PATH, WORDMARK_VIEWBOX } from './logoPaths';

// Mark + name side by side, in resting colours (matches COH-logo-lockup.svg proportions:
// mark 96 wide, 10 gap, name ~146 wide, vertically centred on the mark).
const MARK_SIZE = 96;
const GAP = 10;
const NAME_WIDTH = 146;
const NAME_HEIGHT = (NAME_WIDTH * WORDMARK_VIEWBOX.height) / WORDMARK_VIEWBOX.width;

// introRound (Home only): once per app launch, after the launch overlay is gone, the mark plays one
// full colour round (3 s, same timing as the launch), lands on its resting colours, then settles
// with a gentle 1.00 -> 1.04 -> 1.00 scale (~500 ms, ease-out, no bounce). Reduced motion: static.
// Layout never changes - the scale is a transform on the mark only.
export const LogoLockup: React.FC<{ style?: ViewStyle; introRound?: boolean }> = ({ style, introRound = false }) => {
  const reduceMotion = useReducedMotion();
  const claimed = useHomeIntroRound(introRound && !reduceMotion);
  const scale = useRef(new Animated.Value(1)).current;

  const settle = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.04, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 250, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  };

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }, style]}>
      {introRound ? (
        <Animated.View style={{ transform: [{ scale }] }}>
          <ColourCycleLogo size={MARK_SIZE} settleWhen start={claimed} onSettled={claimed ? settle : undefined} />
        </Animated.View>
      ) : (
        <ColourCycleLogo size={MARK_SIZE} />
      )}
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
};
