// How long the praise text and the creature loading page stay up after a check-in: the length of the spoken praise plus one
// second, never under 3 s and never over 6 s. With no speech (voice off, or the roll with no clip) it is the 3 s minimum.
export const PRAISE_HOLD_MIN_MS = 3000;
export const PRAISE_HOLD_MAX_MS = 6000;
export const PRAISE_HOLD_EXTRA_MS = 1000;

export function praiseHoldMs(speechMs: number | null | undefined): number {
  if (typeof speechMs !== 'number' || !isFinite(speechMs) || speechMs <= 0) return PRAISE_HOLD_MIN_MS;
  return Math.min(PRAISE_HOLD_MAX_MS, Math.max(PRAISE_HOLD_MIN_MS, Math.round(speechMs) + PRAISE_HOLD_EXTRA_MS));
}
