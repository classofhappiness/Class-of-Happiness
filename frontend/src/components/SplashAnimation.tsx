import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

// Real feature Aug 30: animated launch sequence, per Jono's confirmed design - logo fades
// in, the yellow blob (and "of", which already matches the blob's colour in the source
// artwork) cycles through the app's own emotion colours, ends on yellow, then the whole
// thing fades out into the home screen. Same 4 hex values EmotionColourLoader already uses
// (not the slightly different brand EMOTION_COLOURS constant), per Jono's explicit request
// to match that component's style - order is green -> blue -> red -> yellow, his own
// explicit sequence, not EmotionColourLoader's internal order.
//
// The 4 source images (splash_green/blue/red/yellow.png) are pre-generated, real recoloured
// exports of the actual logo artwork - the black outline and "CLASS"/"Happiness" text are
// untouched, only the blob + "of" (already yellow in the source) are recoloured, and the
// canvas is a squared, generously-padded 620x620 (the original was 503x448 with the blob
// touching the very top edge with zero margin - the real, confirmed cause of Android 12+'s
// native splash safe-zone cropping "cutting off the top").
//
// Total duration is a fixed ~1.6s, never extended to wait for real app init (which proceeds
// in true parallel underneath) - 2026 platform guidance is explicit that splash/launch
// screens should never be artificially prolonged for animation's own sake.
const PHASE_MS = 350;
const FADE_IN_MS = 150;
const FADE_OUT_MS = 200;

const PHASES = [
  { colour: 'green', source: require('../../assets/images/splash_green.png') },
  { colour: 'blue', source: require('../../assets/images/splash_blue.png') },
  { colour: 'red', source: require('../../assets/images/splash_red.png') },
  { colour: 'yellow', source: require('../../assets/images/splash_yellow.png') },
];

interface SplashAnimationProps {
  onFinish: () => void;
}

export const SplashAnimation: React.FC<SplashAnimationProps> = ({ onFinish }) => {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Hide the native splash the moment this component is ready to render its own first
    // frame (same green image the native splash itself now shows, per app.json) - the
    // closest achievable handoff given Expo's real platform limits (no native animation
    // capability, confirmed during investigation) - then take over with the real animation.
    SplashScreen.hideAsync().catch(() => {});

    Animated.timing(opacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();

    const phaseTimer = setInterval(() => {
      setPhaseIndex(i => {
        const next = i + 1;
        if (next >= PHASES.length) {
          clearInterval(phaseTimer);
          Animated.timing(opacity, {
            toValue: 0,
            duration: FADE_OUT_MS,
            useNativeDriver: true,
          }).start(() => onFinish());
          return i;
        }
        return next;
      });
    }, PHASE_MS);

    return () => clearInterval(phaseTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = PHASES[phaseIndex];

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="none">
      <Image source={current.source} style={styles.logo} resizeMode="contain" />
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
  logo: {
    width: 240,
    height: 240,
  },
});
