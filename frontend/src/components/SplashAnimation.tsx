import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ColourCycleLogo } from './ColourCycleLogo';

// Animated launch sequence: the logo fades in and its four bars cycle colour while the app
// loads (at least one full 3 s round). Once `appReady`, ColourCycleLogo finishes the current
// round (or, if that wait would exceed 1.5 s, eases each bar to its resting colour over
// 450 ms) and reports back; we hold on the resting logo briefly, then fade into the app.
const FADE_IN_MS = 150;
const HOLD_RESTING_MS = 700;
const FADE_OUT_MS = 200;

interface SplashAnimationProps {
  appReady: boolean;
  onFinish: () => void;
}

export const SplashAnimation: React.FC<SplashAnimationProps> = ({ appReady, onFinish }) => {
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    // Hide the native splash the moment this component can render its own first frame
    // (the native splash shows splash-native.png) - Expo has no native animation hook, so
    // this is the closest achievable handoff.
    SplashScreen.hideAsync().catch(() => {});

    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
    return () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
  }, []);

  const handleSettled = () => {
    holdTimer.current = setTimeout(() => {
      Animated.timing(containerOpacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(() => onFinish());
    }, HOLD_RESTING_MS);
  };

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
      <ColourCycleLogo size={240} settleWhen={appReady} onSettled={handleSettled} />
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    elevation: 999,
  },
});
