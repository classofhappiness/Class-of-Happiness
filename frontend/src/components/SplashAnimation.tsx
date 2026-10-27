import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { ColourCycleLogo } from './ColourCycleLogo';
import appJson from '../../app.json';

// Animated launch sequence, taking over from the native splash image with no visible jump:
//  1. The overlay is opaque white with the logo on its resting colours from its first frame -
//     the same picture as splash-native.png - and is drawn BEFORE the native splash is hidden.
//  2. Only then does the colour clock start (so the whole 3 s round is on screen, not hidden
//     behind a fade-in or the native splash), cycling green -> yellow -> red -> blue.
//  3. At least one full 3 s round plays; once `appReady` it lands on the resting colours at the
//     next round boundary (or eases there if that wait would exceed 1.5 s - only after the first
//     round), holds 700 ms, then fades into the app.
//  Tap anywhere: jump straight to the resting logo, then fade as soon as the app is ready.
const HOLD_RESTING_MS = 700;
const FADE_OUT_MS = 200;

// Size so the overlay's visible mark matches the visible mark in the native splash image.
// The image is drawn imageWidth wide (app.json, expo-splash-screen plugin), and the mark's ink is
// 426/1024 of that image (splash-native.png). ColourCycleLogo's SVG box is 1097 and the mark's
// ink is 1032 of it (x 33-1065), so the box is bigger than the ink by 1097/1032.
const splashPlugin = (appJson.expo.plugins as any[]).find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
const SPLASH_IMAGE_WIDTH: number = splashPlugin?.[1]?.imageWidth ?? 300;
const SPLASH_IMAGE_INK_RATIO = 426 / 1024;
const MARK_INK_RATIO = 1032 / 1097;
export const SPLASH_LOGO_SIZE = (SPLASH_IMAGE_WIDTH * SPLASH_IMAGE_INK_RATIO) / MARK_INK_RATIO;

interface SplashAnimationProps {
  appReady: boolean;
  onFinish: () => void;
}

export const SplashAnimation: React.FC<SplashAnimationProps> = ({ appReady, onFinish }) => {
  const containerOpacity = useRef(new Animated.Value(1)).current;
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fading = useRef(false);
  const drawnOnce = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const skippedRef = useRef(false);
  const settledEarly = useRef(false);
  const drawnRef = useRef(false);

  const fadeOut = useCallback(() => {
    if (fading.current) return;
    fading.current = true;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    Animated.timing(containerOpacity, { toValue: 0, duration: FADE_OUT_MS, useNativeDriver: true }).start(() => onFinish());
  }, [onFinish]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  // The overlay has laid out; wait two frames for it to be painted, then reveal it by hiding the
  // native splash and start the colour clock.
  const handleLayout = () => {
    if (drawnOnce.current) return;
    drawnOnce.current = true;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        SplashScreen.hideAsync().catch(() => {});
        drawnRef.current = true;
        setDrawn(true);
        if (settledEarly.current) handleSettled(); // reduced motion: nothing to wait for
      }),
    );
  };

  const handleSettled = () => {
    // Before the first draw (reduced motion reports settled at once), or after a tap (which
    // fades by itself when the app is ready): don't start the hold/fade here.
    if (!drawnRef.current) {
      settledEarly.current = true;
      return;
    }
    if (skippedRef.current || fading.current || holdTimer.current) return;
    holdTimer.current = setTimeout(fadeOut, HOLD_RESTING_MS);
  };

  // Skipped: the logo is already on its resting colours; leave as soon as the app is ready.
  useEffect(() => {
    if (skipped && appReady) fadeOut();
  }, [skipped, appReady, fadeOut]);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]} onLayout={handleLayout}>
      <Pressable style={styles.fill} onPress={() => {
          skippedRef.current = true;
          setSkipped(true);
        }}>
        <View pointerEvents="none">
          <ColourCycleLogo size={SPLASH_LOGO_SIZE} settleWhen={appReady} onSettled={handleSettled} start={drawn} skip={skipped} />
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 999,
    elevation: 999,
  },
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
