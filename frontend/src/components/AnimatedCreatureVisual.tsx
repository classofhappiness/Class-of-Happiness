import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, Image, StyleSheet } from 'react-native';

// Real feature Aug 22 (item 2): the old CreatureCollection.tsx modal (retired when the
// creature system was unified) gave each colour zone its own distinct idle movement -
// this was genuinely lost in the redesign, not deliberately dropped. Ported verbatim rather
// than reinvented, and generalised to also animate a community creature's photo (an Image),
// not just a default creature's emoji (a Text) - the old version only ever had to handle
// emoji, since community creatures didn't exist as a concept in the old modal.
export type CreatureZone = 'blue' | 'green' | 'yellow' | 'red';

// Shared by AnimatedCreatureVisual (icon-sized, used in the My Creatures detail modal) and
// world-creatures.tsx's full-width card - same 4 real per-zone patterns, different host layout.
export function useZoneMovement(zone: CreatureZone | string, active: boolean = true) {
  const moveAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    let animation: Animated.CompositeAnimation;
    switch (zone) {
      case 'blue':
        // Real fix Sep 15 (Marisa build-26, S07): was 800+800=1600ms - noticeably slower than
        // every other zone's ~1000ms cycle (green 400+400+200, yellow 100+100+200+600,
        // default 300+300+400), so blue crept along next to the others' snappier pace.
        // Halved to match their cycle length while keeping the same distinct slow-sine-sway
        // character (movement style stays zone-specific, only the tempo is now uniform).
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: 12, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -12, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        break;
      case 'green':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -16, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(200),
        ]));
        break;
      case 'yellow':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: 6, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -6, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.delay(600),
        ]));
        break;
      default:
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -10, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 300, easing: Easing.bounce, useNativeDriver: true }),
          Animated.delay(400),
        ]));
    }
    animation.start();
    return () => animation.stop();
  }, [active, zone]);

  const isHorizontal = zone === 'blue';
  return { transform: isHorizontal ? [{ translateX: moveAnim }] : [{ translateY: moveAnim }] };
}

interface Props {
  zone: CreatureZone | string;
  size?: number;
  unlocked?: boolean;
  emoji?: string | null;
  imageUrl?: string | null;
  // Real fix Sep 15 (Marisa build-26, S07): My Creatures ("Top Trumps cards" - static,
  // readable) wants the idle bobbing stopped entirely, while World Creatures keeps it (just
  // at a uniform speed now, see useZoneMovement's blue case above) - one shared visual
  // component, per-screen opt-out rather than forking it.
  animated?: boolean;
}

export const AnimatedCreatureVisual: React.FC<Props> = ({ zone, size = 52, unlocked = true, emoji, imageUrl, animated = true }) => {
  const { transform } = useZoneMovement(zone, unlocked && animated);

  if (imageUrl) {
    return (
      <Animated.View style={{ transform, opacity: unlocked ? 1 : 0.3, width: size, height: size }}>
        <Image source={{ uri: imageUrl }} style={[styles.image, { width: size, height: size, borderRadius: size / 6 }]} />
      </Animated.View>
    );
  }
  return (
    <Animated.View style={{ transform, opacity: unlocked ? 1 : 0.3 }}>
      {/* Real fix Sep 15 (Marisa build-26, S08): lone emoji Text wasn't centring in its
          circle - Android's default font padding, not a layout/alignment bug - same root
          cause and fix as CreatureDisplay.tsx and EvolutionAnimation.tsx. This is the shared
          component both of those use elsewhere, so this instance was the one still missing
          it (CreatureDetailModal's big evolution-stage circle, this screen's dolphin). */}
      <Text style={{ fontSize: size, lineHeight: size * 1.2, textAlign: 'center', includeFontPadding: false }}>{emoji || '🥚'}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  image: { backgroundColor: '#F5F5F5' },
});
