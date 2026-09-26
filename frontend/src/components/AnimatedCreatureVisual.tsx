import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, Image, View, StyleSheet } from 'react-native';

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
  // Real fix Sep 27 (live feedback, item 1): number stays supported for existing small/
  // fixed-pixel callers (e.g. CreatureDetailModal's stage-icon row); '100%' (or any
  // percentage) lets a caller fill whatever container it's placed in instead of being
  // capped to a small hardcoded pixel value regardless of how much room is actually
  // available - see student/creatures.tsx's own fix for why this mattered there.
  size?: number | `${number}%`;
  unlocked?: boolean;
  emoji?: string | null;
  imageUrl?: string | null;
  // Real feature Sep 19: a bundled/require()'d local asset (e.g. a pre-generated silhouette
  // PNG) rather than a remote uri - Image needs `source={require(...)}` (a module number) for
  // these, not `source={{uri}}`, so this is a distinct prop rather than overloading imageUrl.
  localSource?: any;
  // Real feature Sep 19 (Jono correction to Sep 19 stage-navigation build): community
  // creatures are real uploaded photos with no alpha transparency around the subject, so
  // there's no clean way to derive a true shape-accurate silhouette from them (that needs
  // background removal, out of scope here). This draws a plain solid-black rounded overlay
  // on top of the real photo instead - mysterious/withholding like the default-creature
  // silhouette, just not shape-accurate to that specific photo. A known, deliberate
  // simplification for this one creature type, not an oversight.
  maskSilhouette?: boolean;
  // Real fix Sep 15 (Marisa build-26, S07): My Creatures ("Top Trumps cards" - static,
  // readable) wants the idle bobbing stopped entirely, while World Creatures keeps it (just
  // at a uniform speed now, see useZoneMovement's blue case above) - one shared visual
  // component, per-screen opt-out rather than forking it.
  animated?: boolean;
}

export const AnimatedCreatureVisual: React.FC<Props> = ({ zone, size = 52, unlocked = true, emoji, imageUrl, localSource, maskSilhouette = false, animated = true }) => {
  const { transform } = useZoneMovement(zone, unlocked && animated);

  if (localSource) {
    return (
      <Animated.View style={{ transform, width: size, height: size }}>
        {/* Real fix Sep 21 (device report, 2nd time - the first "fix" tinted evoStage's
            OUTER box in CreatureDetailModal, which was never the actual source): styles.image
            below carries backgroundColor:'#F5F5F5' as a loading placeholder for the remote
            imageUrl path just below - correct there, but this bundled localSource silhouette
            PNG loads instantly and is genuinely transparent outside the silhouette shape
            (confirmed against the actual asset pixels, not just the code) - #F5F5F5 was
            sitting visibly behind/around every unreached-stage silhouette as exactly the
            "white square" reported both times. No placeholder needed for a local asset. */}
        <Image source={localSource} style={{ width: size, height: size, borderRadius: typeof size === 'number' ? size / 6 : 8 }} resizeMode="contain" />
      </Animated.View>
    );
  }

  if (imageUrl) {
    // Root cause fix Sep 27 (live feedback): maskSilhouette used to draw a plain black
    // rectangle (StyleSheet.absoluteFillObject) ON TOP of the real photo - a box, not a
    // silhouette of the creature's actual shape. A community creature's photo is a real
    // <Image> (unlike a default creature's colour-emoji Text, which iOS/Android render as
    // pre-coloured glyphs that ignore `tintColor`/`color` entirely - a genuine OS limitation,
    // not something fixable here, which is why the 16 default-creature silhouettes still use
    // separate pre-generated assets, see CreatureDetailModal's SILHOUETTE_ASSETS comment) -
    // so `tintColor` on the image itself recolours every non-transparent pixel to solid black
    // while leaving the alpha channel (the creature's real shape) untouched. Works
    // automatically for any community/student-submitted creature's photo, no per-creature
    // asset work, now or ever, unlike the default-creature approach it deliberately doesn't
    // try to replace.
    const imgStyle = maskSilhouette
      ? { width: size, height: size, borderRadius: typeof size === 'number' ? size / 6 : 8, tintColor: '#000' }
      : { width: size, height: size, borderRadius: typeof size === 'number' ? size / 6 : 8 };
    return (
      <Animated.View style={{ transform, opacity: unlocked || maskSilhouette ? 1 : 0.3, width: size, height: size }}>
        {/* Real fix Sep 25 (item 17): styles.image's backgroundColor:'#F5F5F5' was a loading
            placeholder for the remote fetch - harmless while every community creature photo
            was itself an opaque JPEG (see the asset-side fix, same item), but a real grey box
            behind any image with genuine transparency, which these now have. resizeMode=
            "contain" added for the same reason localSource already has it explicitly below -
            default 'cover' would crop a non-square photo instead of showing the whole thing. */}
        <Image source={{ uri: imageUrl }} resizeMode="contain" style={imgStyle} />
      </Animated.View>
    );
  }
  // Text/emoji fontSize can't be a percentage - a caller wanting this creature to fill its
  // container needs a real pixel value (see student/creatures.tsx's own fix, which computes
  // one from the actual grid column width rather than passing '100%' here). Falls back to
  // the component's own default numeric size rather than crashing on `size * 1.2` if a
  // percentage ever does reach this branch.
  const emojiFontSize = typeof size === 'number' ? size : 52;
  return (
    <Animated.View style={{ transform, opacity: unlocked ? 1 : 0.3 }}>
      {/* Real fix Sep 15 (Marisa build-26, S08): lone emoji Text wasn't centring in its
          circle - Android's default font padding, not a layout/alignment bug - same root
          cause and fix as CreatureDisplay.tsx and EvolutionAnimation.tsx. This is the shared
          component both of those use elsewhere, so this instance was the one still missing
          it (CreatureDetailModal's big evolution-stage circle, this screen's dolphin). */}
      <Text style={{ fontSize: emojiFontSize, lineHeight: emojiFontSize * 1.2, textAlign: 'center', includeFontPadding: false }}>{emoji || '🥚'}</Text>
    </Animated.View>
  );
};

