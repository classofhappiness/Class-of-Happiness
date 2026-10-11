// Oct 11 (fix41 part 4): the pure logic behind the creature detail sheet's calm cross-fade (no React / RN imports so
// it can be tested with plain node). Two stacked layers (A and B) live in one fixed frame; `active` is the layer
// that is (or is fading) IN. A tap on a stage asks for new content:
//   - same content as the current target  -> nothing happens (no restart, no flicker)
//   - reduce-motion on, or nothing shown yet -> swap instantly in the active layer
//   - otherwise -> put the content in the OTHER layer and fade that one in while the active one fades out.
// Rapid taps: the caller stops the running animation and asks again; the newest target always wins, and the layer that
// is currently the faintest is reused, so nothing is ever left half-faded or queued.

export interface FadeContent {
  key: string;
  kind: 'remote' | 'local' | 'emoji';
  url?: string | null;
  mask?: boolean;
  local?: any;
  emoji?: string;
}

export type Slot = 'A' | 'B';

export interface FadeState {
  active: Slot;
  slots: { A: FadeContent | null; B: FadeContent | null };
  targetKey: string | null;
}

export type FadePlan =
  | { kind: 'noop' }
  | { kind: 'instant'; state: FadeState; show: Slot; hide: Slot }
  | { kind: 'fade'; state: FadeState; show: Slot; hide: Slot };

export const other = (s: Slot): Slot => (s === 'A' ? 'B' : 'A');

export function contentKey(c: { kind: string; url?: string | null; mask?: boolean; local?: any; emoji?: string }): string {
  if (c.kind === 'remote') return `remote:${c.url || ''}:${c.mask ? 'm' : 'p'}`;
  if (c.kind === 'local') return `local:${String(c.local)}`;
  return `emoji:${c.emoji || ''}`;
}

export function initialFadeState(first: FadeContent): FadeState {
  return { active: 'A', slots: { A: first, B: null }, targetKey: first.key };
}

export function planChange(state: FadeState, next: FadeContent, reduceMotion: boolean): FadePlan {
  if (state.targetKey === next.key) return { kind: 'noop' };
  const hasShown = !!state.slots[state.active];
  if (reduceMotion || !hasShown) {
    const show = state.active;
    return { kind: 'instant', show, hide: other(show), state: { active: show, slots: { A: show === 'A' ? next : null, B: show === 'B' ? next : null }, targetKey: next.key } };
  }
  const show = other(state.active);
  const slots = { ...state.slots, [show]: next } as FadeState['slots'];
  return { kind: 'fade', show, hide: state.active, state: { active: show, slots, targetKey: next.key } };
}

/** Latest-request-wins gate for the async step (image prefetch): a slow earlier request can never overwrite a newer one. */
export function createRequestGate() {
  let latest = 0;
  return {
    begin: () => { latest += 1; return latest; },
    isCurrent: (token: number) => token === latest,
  };
}
