import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ColourCycleLogo } from './ColourCycleLogo';

// Real feature Aug 30: animated launch sequence, per Jono's confirmed design - logo fades
// in, the yellow blob (and "of", which already matches the blob's colour in the source
// artwork) cycles through colour, ends on yellow, then the whole thing fades out into the
// home screen. Order is green -> blue -> red -> yellow, Jono's own explicit sequence.
//
// Real fix Sep 18: the actual phase-crossfade engine (4 keyframe PNGs, hold/crossfade
// timings) moved into ColourCycleLogo.tsx so the TranslatedHeader logo circle can reuse the
// exact same tuned animation instead of a second, separately-drifting copy. This component
// now only owns what's genuinely splash-specific: the full-screen white overlay, the
// fade-in on mount, and the fade-out once ColourCycleLogo finishes a single (non-looping)
// pass through all 4 phases.
const FADE_IN_MS = 150;
const FADE_OUT_MS = 200;

interface SplashAnimationProps {
  onFinish: () => void;
}

export const SplashAnimation: React.FC<SplashAnimationProps> = ({ onFinish }) => {
  const containerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Hide the native splash the moment this component is ready to render its own first
    // frame (same green image the native splash itself now shows, per app.json) - the
    // closest achievable handoff given Expo's real platform limits (no native animation
    // capability, confirmed during investigation) - then take over with the real animation.
    SplashScreen.hideAsync().catch(() => {});

    Animated.timing(containerOpacity, {
      toValue: 1,
      duration: FADE_IN_MS,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleCycleComplete = () => {
    // Held on yellow (the last phase) for HOLD_MS already happened inside ColourCycleLogo
    // before it called this - now fade the whole thing out.
    Animated.timing(containerOpacity, {
      toValue: 0,
      duration: FADE_OUT_MS,
      useNativeDriver: true,
    }).start(() => onFinish());
  };

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
      <ColourCycleLogo size={240} loop={false} onCycleComplete={handleCycleComplete} />
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
