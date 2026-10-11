import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, Image, View, StyleSheet, AccessibilityInfo } from 'react-native';
import { FadeContent, FadePlan, FadeState, Slot, contentKey, createRequestGate, initialFadeState, planChange } from '../utils/creatureFade';

// Real feature Aug 22 (item 2): the old CreatureCollection.tsx modal (retired when the
// creature system was unified) gave each colour zone its own distinct idle movement -
// this was genuinely lost in the redesign, not deliberately dropped. Ported verbatim rather
// than reinvented, and generalised to also animate a community creature's photo (an Image),
// not just a default creature's emoji (a Text) - the old version only ever had to handle
// emoji, since community creatures didn't exist as a concept in the old modal.
export type CreatureZone = 'blue' | 'green' | 'yellow' | 'red';

// Shared by AnimatedCreatureVisual (icon-sized, used in the My Creatures detail modal) and
// world-creatures.tsx's full-width card - same 4 real per-zone patterns, different host layout.
// fix47: the base amplitude (px) of each zone's pattern, used to scale a pattern DOWN when a caller passes maxAmplitude.
const BASE_AMPLITUDE: Record<string, number> = { blue: 12, green: 16, yellow: 6 };
export function useZoneMovement(zone: CreatureZone | string, active: boolean = true, maxAmplitude?: number) {
  const moveAnim = useRef(new Animated.Value(0)).current;
  // Only the detail sheet passes maxAmplitude (so the art stays inside the circle); every other caller gets k = 1, i.e. exactly the old patterns.
  const k = maxAmplitude ? Math.min(1, maxAmplitude / (BASE_AMPLITUDE[zone as string] ?? 10)) : 1;

  useEffect(() => {
    // Oct 11: always restart from the resting position, so a zone/active change never continues from an offset
    moveAnim.setValue(0);
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
          Animated.timing(moveAnim, { toValue: 12 * k, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -12 * k, duration: 500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        break;
      case 'green':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -16 * k, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(200),
        ]));
        break;
      case 'yellow':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: 6 * k, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -6 * k, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.delay(600),
        ]));
        break;
      default:
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -10 * k, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 300, easing: Easing.bounce, useNativeDriver: true }),
          Animated.delay(400),
        ]));
    }
    animation.start();
    return () => { animation.stop(); moveAnim.setValue(0); };
  }, [active, zone, k]);

  const isHorizontal = zone === 'blue';
  return { transform: isHorizontal ? [{ translateX: moveAnim }] : [{ translateY: moveAnim }], value: moveAnim };
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
  // Oct 11 (fix41 part 4): used ONLY by the creature detail sheet. Draws the creature in a fixed frame with a small margin
  // (contain-fit, no rounded-corner clipping, emoji sized to fit), with NO movement at all, and cross-fades (opacity only,
  // ~400 ms) between stages instead of swapping. Every other caller (grid cards, thumbnails) is unchanged.
  sheetMode?: boolean;
  /** fix46: sheetMode only. Clips the whole frame to a circle (borderRadius size/2) so an opaque square or edge-touching art can never leave the coloured circle behind it. */
  circleMask?: boolean;
  /** fix47: sheetMode only. The creature moves with its zone's pattern INSIDE the fixed frame (only the creature layer carries a transform; the frame and the circle never move). Off with Reduce Motion. */
  sheetMovement?: boolean;
}

// Oct 11 (fix41 part 4): the emoji glyph is sized to FIT its frame. Apple/Google colour emoji draw about 1.17 x fontSize
// wide/high, so fontSize 0.82 x box gives a glyph of ~0.96 x box, and lineHeight 1.2 x fontSize (0.98 x box) keeps the Text's
// own box inside the frame (Android clips a glyph to its Text box; the old 1.3 x 1.35 box was bigger than the frame).
export const EMOJI_FIT = 0.82;
const emojiTextStyle = (box: number) => ({
  fontSize: box * EMOJI_FIT, lineHeight: box * EMOJI_FIT * 1.2, width: box, textAlign: 'center' as const, includeFontPadding: false,
});
const FADE_MS = 400;
const SHEET_INSET = 0.04;

const SheetCreature: React.FC<{ size: number; emoji?: string | null; imageUrl?: string | null; localSource?: any; maskSilhouette: boolean; circleMask?: boolean; zone: string; moving: boolean }> = ({ size, emoji, imageUrl, localSource, maskSilhouette, circleMask = false, zone, moving }) => {
  const toContent = (): FadeContent => {
    if (localSource) return { kind: 'local', local: localSource, key: contentKey({ kind: 'local', local: localSource }) };
    if (imageUrl) return { kind: 'remote', url: imageUrl, mask: maskSilhouette, key: contentKey({ kind: 'remote', url: imageUrl, mask: maskSilhouette }) };
    return { kind: 'emoji', emoji: emoji || '🥚', key: contentKey({ kind: 'emoji', emoji: emoji || '🥚' }) };
  };
  const [fade, setFade] = useState<FadeState>(() => initialFadeState(toContent()));
  const fadeRef = useRef(fade);
  const opacity = { A: useRef(new Animated.Value(1)).current, B: useRef(new Animated.Value(0)).current };
  const running = useRef<Animated.CompositeAnimation | null>(null);
  const gate = useRef(createRequestGate()).current;
  const reduceMotion = useRef(false);
  const [reduceMotionOn, setReduceMotionOn] = useState(false);
  // fix47: ONE movement value for the whole life of the sheet creature. It is not reset on a stage change (the effect in
  // useZoneMovement depends only on zone / on / amplitude), so the loop keeps going smoothly through the cross-fade.
  // Amplitude cap: the art is at most 80% of the 138 px box (about 55 px from the centre) for photos, up to about 66 px for
  // emoji / bundled silhouettes, in a circle of radius 75: 18 px of room for photos (which the circle mask clips anyway) and 8 px otherwise.
  const move = useZoneMovement(zone, moving && !reduceMotionOn, circleMask ? 18 : 8);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(v => { reduceMotion.current = !!v; setReduceMotionOn(!!v); }).catch(() => {});
    const sub: any = AccessibilityInfo.addEventListener('reduceMotionChanged', (v: boolean) => { reduceMotion.current = !!v; setReduceMotionOn(!!v); });
    return () => { sub?.remove?.(); running.current?.stop(); };
  }, []);

  const apply = (plan: FadePlan) => {
    if (plan.kind === 'noop') return;
    running.current?.stop();                       // a new tap cancels a fade in progress; the newest target wins
    running.current = null;
    fadeRef.current = plan.state;
    setFade(plan.state);
    if (plan.kind === 'instant') {
      opacity[plan.show].setValue(1); opacity[plan.hide].setValue(0);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(opacity[plan.show], { toValue: 1, duration: FADE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(opacity[plan.hide], { toValue: 0, duration: FADE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]);
    running.current = anim;
    anim.start(({ finished }) => { if (finished) { running.current = null; } });
  };

  useEffect(() => {
    const next = toContent();
    const token = gate.begin();                    // any earlier, slower request is now stale
    if (next.key === fadeRef.current.targetKey) return;   // same content again: nothing to do
    const go = () => { if (gate.isCurrent(token)) apply(planChange(fadeRef.current, next, reduceMotion.current)); };
    if (next.kind === 'remote' && next.url && !reduceMotion.current) Image.prefetch(next.url).then(go, go);   // keep the old image until the new one is cached
    else go();
  }, [emoji, imageUrl, localSource, maskSilhouette]);

  const inset = Math.round(size * SHEET_INSET);
  const inner = size - 2 * inset;
  const draw = (c: FadeContent) => {
    if (c.kind === 'emoji') return <Text style={emojiTextStyle(inner)}>{c.emoji}</Text>;
    if (c.kind === 'local') return <Image source={c.local} style={{ width: '100%', height: '100%' }} resizeMode="contain" />;
    return <Image source={{ uri: c.url! }} resizeMode="contain" style={c.mask ? { width: '100%', height: '100%', tintColor: '#000' } : { width: '100%', height: '100%' }} />;
  };
  const layer = (id: Slot) => {
    const c = fade.slots[id];
    if (!c) return null;
    return (
      <Animated.View key={id} pointerEvents="none" style={{ position: 'absolute', top: inset, left: inset, width: inner, height: inner, alignItems: 'center', justifyContent: 'center', overflow: 'visible', opacity: opacity[id] }}>
        {draw(c)}
      </Animated.View>
    );
  };
  return (
    <View style={circleMask ? { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' } : { width: size, height: size, overflow: 'visible' }}>
      {/* fix47: the ONLY element with a transform. It fills the fixed frame; both cross-fade layers are inside it, so the
          movement continues unbroken through a stage change. The frame, the circle behind it and everything outside never move. */}
      <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, width: size, height: size, transform: move.transform }}>
        {layer('A')}
        {layer('B')}
      </Animated.View>
    </View>
  );
};

export const AnimatedCreatureVisual: React.FC<Props> = ({ zone, size = 52, unlocked = true, emoji, imageUrl, localSource, maskSilhouette = false, animated = true, sheetMode = false, circleMask = false, sheetMovement = false }) => {
  const { transform } = useZoneMovement(zone, unlocked && animated);

  // Oct 11: when imageUrl (or the silhouette mask) changes, keep drawing the PREVIOUS image until
  // the next one is in the image cache, so switching stages never flashes an empty box. First render
  // shows the current url straight away; a failed prefetch switches anyway (the Image then loads it itself).
  const [shown, setShown] = useState<{ url?: string | null; mask: boolean }>({ url: imageUrl, mask: maskSilhouette });
  useEffect(() => {
    if (!imageUrl) { setShown({ url: imageUrl, mask: maskSilhouette }); return; }
    if (shown.url === imageUrl) { if (shown.mask !== maskSilhouette) setShown({ url: imageUrl, mask: maskSilhouette }); return; }
    let cancelled = false;
    const done = () => { if (!cancelled) setShown({ url: imageUrl, mask: maskSilhouette }); };
    Image.prefetch(imageUrl).then(done, done);
    return () => { cancelled = true; };
  }, [imageUrl, maskSilhouette]);

  if (sheetMode && typeof size === 'number') {
    return <SheetCreature size={size} emoji={emoji} imageUrl={imageUrl} localSource={localSource} maskSilhouette={maskSilhouette} circleMask={circleMask} zone={zone as string} moving={unlocked && sheetMovement} />;
  }

  // Oct 11 (layout root fix): EVERY state (local silhouette, remote photo, masked photo, emoji) renders inside ONE
  // fixed-size, centred wrapper (`size` x `size`), and the animated element is absolutely positioned inside it
  // (filling the wrapper, content centred). The wrapper's own width/height therefore never depends on which branch
  // is drawn, on the emoji's line box, or on the image having loaded, and the animation only moves the inner layer.
  const boxSize: number | `${number}%` = typeof size === 'number' ? size : size;
  const frame = { width: boxSize, height: boxSize, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'visible' as const };
  const layer = (opacity: number) => ({ overflow: 'visible' as const, position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center' as const, justifyContent: 'center' as const, transform, opacity });

  if (localSource) {
    return (
      <View style={frame}>
        <Animated.View style={layer(1)}>
          {/* Real fix Sep 21: no placeholder background for a bundled silhouette (transparent PNG). */}
          <Image source={localSource} style={{ width: '100%', height: '100%', borderRadius: typeof size === 'number' ? size / 6 : 8 }} resizeMode="contain" />
        </Animated.View>
      </View>
    );
  }

  if (imageUrl && (shown.url || imageUrl)) {
    const drawUrl = shown.url || imageUrl;
    const drawMask = shown.url ? shown.mask : maskSilhouette;
    // tintColor turns every non-transparent pixel solid black while keeping the alpha shape (silhouette).
    const imgStyle = drawMask
      ? { width: '100%' as const, height: '100%' as const, borderRadius: typeof size === 'number' ? size / 6 : 8, tintColor: '#000' }
      : { width: '100%' as const, height: '100%' as const, borderRadius: typeof size === 'number' ? size / 6 : 8 };
    return (
      <View style={frame}>
        <Animated.View style={layer(unlocked || drawMask ? 1 : 0.3)}>
          <Image source={{ uri: drawUrl }} resizeMode="contain" style={imgStyle} />
        </Animated.View>
      </View>
    );
  }
  // Text/emoji fontSize can't be a percentage - fall back to the default numeric size. fix41: the glyph and its Text box
  // are sized to FIT the size x size frame (see emojiTextStyle), so neither the frame nor Android's Text-box clipping
  // can cut a head off; the frame and layer are overflow visible.
  const emojiFontSize = typeof size === 'number' ? size : 52;
  return (
    <View style={frame}>
      <Animated.View style={layer(unlocked ? 1 : 0.3)}>
        <Text style={emojiTextStyle(emojiFontSize)}>{emoji || '🥚'}</Text>
      </Animated.View>
    </View>
  );
};
