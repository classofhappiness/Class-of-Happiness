// Real fix Aug 19 (A7): single source of truth for the 4 emotion colours. Before this,
// every screen hardcoded its own copy — 42 files landed on an old Material palette
// (#4CAF50/#F44336/#FFC107), only 5 used the documented brand palette
// (#4CAF73/#E05252/#4A90D9/#FFD93D), and one file (teacher/dashboard.tsx) disagreed with
// itself across three separate local declarations.
//
// Yellow is intentionally NOT the design doc's #FFD93D: every real screen that already
// used a "correct-looking" yellow used #FFC107, and #FFD93D barely appears live anywhere.
// Canonising #FFC107 here matches reality instead of repainting 45+ files to chase a value
// nothing actually uses. If a future decision revisits this, change it in exactly one place.
export const EMOTION_COLOURS = {
  blue: '#4A90D9',
  green: '#4CAF73',
  yellow: '#FFC107',
  red: '#E05252',
} as const;

export type EmotionZone = keyof typeof EMOTION_COLOURS;

export const EMOTION_LIGHT_COLOURS: Record<EmotionZone, string> = {
  blue: '#E3F2FD',
  green: '#E8F5E9',
  yellow: '#FFF8E1',
  red: '#FFEBEE',
};
