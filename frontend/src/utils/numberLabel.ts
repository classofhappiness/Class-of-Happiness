// Number labels that follow the APP language without depending on the phone's Intl/ICU data (same idea as dateLabel.ts).
// Western digits for every language (like the rest of the app); only the decimal separator changes.
const DECIMAL_COMMA = new Set(['pt', 'es', 'fr', 'de', 'it', 'ru']);

/** One-decimal rating such as 4.5 (en, hi, zh, ar) or 4,5 (pt, es, fr, de, it, ru). */
export function formatRating(value: number | null | undefined, language?: string): string {
  const s = (Number(value) || 0).toFixed(1);
  return DECIMAL_COMMA.has(language || 'en') ? s.replace('.', ',') : s;
}
