import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Animated } from 'react-native';

// Real component, Aug 16: cycling emotion-colour loading indicator.
// Reuses the app's own emotion-colour visual language (same colours/faces
// as ZoneButton) instead of a logo or generic spinner. Only appears after
// a short delay so quick loads never flash it unnecessarily.

const COLOURS = [
  { colour: '#4A90D9', face: '\ud83d\ude14' },
  { colour: '#4CAF50', face: '\ud83d\ude0a' },
  { colour: '#FFC107', face: '\ud83d\ude2c' },
  { colour: '#F44336', face: '\ud83e\udd2f' },
];

const STEP_MS = 500;
const SHOW_DELAY_MS = 300;

interface EmotionColourLoaderProps {
  visible: boolean;
  size?: number;
  // Real feature Sep 27 (home-screen logo easter egg): lets a caller replay this exact same
  // component/animation - same shape, same emoji sequence, same scale-pulse motion - with a
  // different colour set, instead of a real loading context reusing the literal blue/green/
  // yellow/red palette. Optional and defaulting to COLOURS so every existing call site (the
  // real loading indicator, ~19 screens) is completely unaffected.
  palette?: { colour: string; face: string }[];
  // Real feature Sep 27: the easter egg wants to show immediately on tap, not after the
  // "don't flash on quick loads" debounce that makes sense for a real loading indicator.
  showDelayMs?: number;
}

export const EmotionColourLoader: React.FC<EmotionColourLoaderProps> = ({ visible, size = 56, palette = COLOURS, showDelayMs = SHOW_DELAY_MS }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [index, setIndex] = useState(0);
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    if (visible) {
      delayTimer = setTimeout(() => setShouldRender(true), showDelayMs);
    } else {
      setShouldRender(false);
    }
    return () => { if (delayTimer) clearTimeout(delayTimer); };
  }, [visible, showDelayMs]);

  useEffect(() => {
    if (!shouldRender) return;
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % palette.length);
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.08, duration: 200, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }, STEP_MS);
    return () => clearInterval(interval);
  }, [shouldRender, palette]);

  if (!shouldRender) return null;

  const current = palette[index];

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: current.colour,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}
      >
        <Text style={{ fontSize: size * 0.45 }}>{current.face}</Text>
      </Animated.View>
    </View>
  );
};
