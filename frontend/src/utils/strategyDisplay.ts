// Pure helpers for how a strategy is coloured and listed (no React Native imports, so scripts/test-strategy-display.js can run them).
import { EMOTION_COLOURS } from '../constants/emotionColours';

const COLOUR_KEYS = ['blue', 'green', 'yellow', 'red'] as const;
export const STRATEGY_COLOUR_FALLBACK = '#9E9E9E';   // neutral grey: an unknown colour must never look like a real (or purple) one

/** Colour name of a strategy: lowercased, first of blue/green/yellow/red found in a value like "Yellow" or "blue,yellow"; 'all', empty or unknown -> null. */
export function strategyColourName(value: unknown): (typeof COLOUR_KEYS)[number] | null {
  const parts = String(value ?? '').toLowerCase().split(',').map(p => p.trim());
  return COLOUR_KEYS.find(k => parts.includes(k)) || null;
}

/** Hex colour for a strategy's colour value; grey when it is not one of the four. */
export function strategyColour(value: unknown): string {
  const name = strategyColourName(value);
  return name ? EMOTION_COLOURS[name] : STRATEGY_COLOUR_FALLBACK;
}

/** Same colour at ~15% opacity, for card backgrounds (grey fallback stays neutral). */
export function strategyTint(value: unknown): string {
  return strategyColour(value) + '26';
}

/** Personal strategies minus any whose name (case/space-insensitive) a school-entered strategy already shows; the school one is kept. */
export function dropNamesAlreadyShown<T extends { name?: string }>(personal: T[], schoolShown: { name?: string }[]): T[] {
  const taken = new Set(schoolShown.map(s => String(s.name || '').trim().toLowerCase()).filter(Boolean));
  return personal.filter(p => !taken.has(String(p.name || '').trim().toLowerCase()));
}
