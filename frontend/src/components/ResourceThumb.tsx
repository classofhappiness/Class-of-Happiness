import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Dimensions, Image, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { loadThumbs, cachedThumbs } from '../utils/resourceThumbs';

// Page-preview thumbnail on a resource list card. A ThumbRegistry (one per list screen) works out which
// thumbnails are on screen: those load their images (on demand, cached); the one most in view plays the
// slideshow (2 s per page, soft cross-fade) and the rest show a still of the first page. Playback stops
// when the screen loses focus, the app goes to the background, a modal is open, or reduce motion is on.
export const SLIDE_MS = 2000;
const FADE_MS = 600;
export const THUMB_W = 56;
export const THUMB_H = 72;
const MEASURE_DELAY_MS = 120;

type Status = 'hidden' | 'visible' | 'winner';

export class ThumbRegistry {
  private items = new Map<string, any>();
  private subs = new Map<string, (s: Status) => void>();
  private last = new Map<string, Status>();
  private viewport: any = null;
  private timer: any = null;
  private paused = false;
  private seq = 0;

  setViewport = (r: any) => { this.viewport = r; };
  register(id: string, ref: any, cb: (s: Status) => void) { this.items.set(id, ref); this.subs.set(id, cb); this.schedule(); }
  unregister(id: string) { this.items.delete(id); this.subs.delete(id); this.last.delete(id); this.schedule(); }
  setPaused(p: boolean) { if (this.paused !== p) { this.paused = p; this.schedule(0); } }
  onScroll = (_e?: NativeSyntheticEvent<NativeScrollEvent>) => this.schedule();
  schedule = (delay = MEASURE_DELAY_MS) => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.measure(); }, delay);
  };

  private measureWindow(ref: any): Promise<{ y: number; h: number } | null> {
    return new Promise((resolve) => {
      if (!ref || !ref.measureInWindow) return resolve(null);
      try { ref.measureInWindow((_x: number, y: number, _w: number, h: number) => resolve(Number.isFinite(y) ? { y, h } : null)); } catch { resolve(null); }
    });
  }

  private async measure() {
    const seq = ++this.seq;
    const vp = (await this.measureWindow(this.viewport)) || { y: 0, h: Dimensions.get('window').height };
    const top = vp.y, bottom = vp.y + vp.h;
    const entries = await Promise.all(Array.from(this.items.entries()).map(async ([id, ref]) => ({ id, m: await this.measureWindow(ref) })));
    if (seq !== this.seq) return;   // a newer measurement is already running
    let best: { id: string; shown: number; y: number } | null = null;
    const next = new Map<string, Status>();
    for (const { id, m } of entries) {
      if (!m || m.h <= 0) { next.set(id, 'hidden'); continue; }
      const shown = Math.min(bottom, m.y + m.h) - Math.max(top, m.y);
      if (shown <= 0) { next.set(id, 'hidden'); continue; }
      next.set(id, 'visible');
      if (!best || shown > best.shown + 1 || (Math.abs(shown - best.shown) <= 1 && m.y < best.y)) best = { id, shown, y: m.y };
    }
    if (best && !this.paused) next.set(best.id, 'winner');
    next.forEach((s, id) => {
      if (this.last.get(id) !== s) { this.last.set(id, s); this.subs.get(id)?.(s); }
    });
  }
}

const Ctx = createContext<ThumbRegistry | null>(null);
export const ThumbRegistryProvider = Ctx.Provider;

// One call per list screen: attach `scrollProps` + `viewportRef` to the list's ScrollView, wrap the
// list in <ThumbRegistryProvider value={registry}>, and pass `paused` when something covers the list.
export function useThumbPlayback(paused: boolean) {
  const registry = useRef(new ThumbRegistry()).current;
  useEffect(() => { registry.setPaused(paused); }, [paused]);
  return {
    registry,
    viewportRef: registry.setViewport,
    scrollProps: { onScroll: registry.onScroll, scrollEventThrottle: 100, onLayout: () => registry.schedule(), onMomentumScrollEnd: () => registry.schedule(0), onScrollEndDrag: () => registry.schedule(0) },
  };
}

interface Props {
  resourceId: string;
  // Shown until the images arrive, and kept when there are none (no previews, locked, offline).
  fallback: React.ReactNode;
  style?: any;
}

export const ResourceThumb: React.FC<Props> = ({ resourceId, fallback, style }) => {
  const registry = useContext(Ctx);
  const boxRef = useRef<View>(null);
  const [status, setStatus] = useState<Status>('hidden');
  const [uris, setUris] = useState<string[] | null>(() => cachedThumbs(resourceId));
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [shown, setShown] = useState(0);
  const [next, setNext] = useState<number | null>(null);
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!registry) return;
    registry.register(resourceId, boxRef.current, setStatus);
    return () => registry.unregister(resourceId);
  }, [registry, resourceId]);

  useFocusEffect(React.useCallback(() => { setFocused(true); registry?.schedule(0); return () => setFocused(false); }, [registry]));

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => live && setReduceMotion(!!v)).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduceMotion(!!v));
    return () => { live = false; sub.remove(); };
  }, []);

  // Load only once the card has been on screen.
  useEffect(() => {
    if (status === 'hidden' || uris) return;
    let live = true;
    loadThumbs(resourceId).then((u) => live && setUris(u));
    return () => { live = false; };
  }, [status, uris, resourceId]);

  const count = uris?.length || 0;
  const playing = status === 'winner' && focused && appActive && !reduceMotion && count > 1;

  // Slideshow: wait SLIDE_MS on the current page, then cross-fade to the next.
  useEffect(() => {
    if (!playing) return;
    if (next !== null) return;
    const timer = setTimeout(() => {
      const n = (shown + 1) % count;
      fade.setValue(0);
      setNext(n);
      Animated.timing(fade, { toValue: 1, duration: FADE_MS, useNativeDriver: true }).start(({ finished }) => {
        if (finished) { setShown(n); setNext(null); }
      });
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [playing, shown, next, count]);

  // Anything that stops the show goes back to a still of the first page.
  useEffect(() => {
    if (playing) return;
    fade.stopAnimation();
    setNext(null);
    setShown(0);
  }, [playing]);

  const ready = count > 0;
  return (
    <View ref={boxRef} collapsable={false} style={[styles.box, style]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {ready ? (
        <>
          <Image source={{ uri: uris![Math.min(shown, count - 1)] }} style={styles.img} resizeMode="cover" />
          {next !== null && (
            <Animated.Image source={{ uri: uris![Math.min(next, count - 1)] }} style={[styles.img, StyleSheet.absoluteFill, { opacity: fade }]} resizeMode="cover" />
          )}
        </>
      ) : fallback}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { width: THUMB_W, height: THUMB_H, borderRadius: 8, overflow: 'hidden', backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  img: { width: '100%', height: '100%' },
});
