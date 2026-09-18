import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, ViewStyle } from 'react-native';

// Real fix Sep 18: extracted from SplashAnimation.tsx (Marisa build-26, S01 fix) so the
// launch splash and any other use of this animation (the TranslatedHeader logo circle)
// share one tuned implementation instead of two separately-drifting copies. Same 4
// keyframe images, same hold/crossfade timings, same green -> blue -> red -> yellow
// sequence, same crossfade-between-flattened-raster-exports approach (see SplashAnimation's
// own docstring for why this isn't a true continuous colour interpolation).
export const HOLD_MS = 400;
export const CROSSFADE_MS = 350;

export const CYCLE_PHASES = [
  { colour: 'green', hex: '#5FA252', source: require('../../assets/images/splash_green.png') },
  { colour: 'blue', hex: '#5182CE', source: require('../../assets/images/splash_blue.png') },
  { colour: 'red', hex: '#DD4C3B', source: require('../../assets/images/splash_red.png') },
  { colour: 'yellow', hex: '#F2BA41', source: require('../../assets/images/splash_yellow.png') },
];

interface Props {
  size: number;
  // false (SplashAnimation's use): run the sequence once, ending on yellow, then call
  // onCycleComplete. true (the header's use): keep looping green->blue->red->yellow->green...
  // indefinitely for as long as this component stays mounted.
  loop?: boolean;
  onCycleComplete?: () => void;
  style?: ViewStyle;
}

export const ColourCycleLogo: React.FC<Props> = ({ size, loop = false, onCycleComplete, style }) => {
  const [frontIndex, setFrontIndex] = useState(0);
  const [backIndex, setBackIndex] = useState(1);
  const frontOpacity = useRef(new Animated.Value(1)).current;
  const backOpacity = useRef(new Animated.Value(0)).current;
  const frontIsCurrent = useRef(true);

  useEffect(() => {
    let cancelled = false;
    let phase = 0;
    let timer: ReturnType<typeof setTimeout>;

    const runNextTransition = () => {
      if (cancelled) return;
      const nextPhase = (phase + 1) % CYCLE_PHASES.length;
      const completedFullCycle = nextPhase === 0;
      if (completedFullCycle && !loop) {
        onCycleComplete?.();
        return;
      }
      const incomingOpacity = frontIsCurrent.current ? backOpacity : frontOpacity;
      const outgoingOpacity = frontIsCurrent.current ? frontOpacity : backOpacity;
      if (frontIsCurrent.current) setBackIndex(nextPhase); else setFrontIndex(nextPhase);
      // Let the source-swap render before starting the crossfade, so the incoming layer
      // never briefly shows the wrong image at opacity 0->visible.
      requestAnimationFrame(() => {
        if (cancelled) return;
        Animated.parallel([
          Animated.timing(incomingOpacity, { toValue: 1, duration: CROSSFADE_MS, useNativeDriver: true }),
          Animated.timing(outgoingOpacity, { toValue: 0, duration: CROSSFADE_MS, useNativeDriver: true }),
        ]).start(() => {
          if (cancelled) return;
          frontIsCurrent.current = !frontIsCurrent.current;
          phase = nextPhase;
          timer = setTimeout(runNextTransition, HOLD_MS);
        });
      });
    };

    timer = setTimeout(runNextTransition, HOLD_MS);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={[{ width: size, height: size }, style]}>
      <Animated.Image
        source={CYCLE_PHASES[frontIndex].source}
        style={{ width: size, height: size, position: 'absolute', opacity: frontOpacity }}
        resizeMode="contain"
      />
      <Animated.Image
        source={CYCLE_PHASES[backIndex].source}
        style={{ width: size, height: size, position: 'absolute', opacity: backOpacity }}
        resizeMode="contain"
      />
    </View>
  );
};
