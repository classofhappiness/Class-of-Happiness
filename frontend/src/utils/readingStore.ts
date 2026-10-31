// "Reading font" settings: OpenDyslexic + letter spacing + word spacing.
//
// This file is the plain-TypeScript core (no React, no react-native imports) so the maths
// can be unit-checked on its own. installReadingText.tsx applies it to every <Text>.
//
// Limits are the WCAG 1.4.12 text-spacing values and are HARD caps so layouts cannot break:
//   letter spacing  max 0.12em   (0.06em with OpenDyslexic on - its letters are already wide)
//   word spacing    max 0.16em
// Each control has 4 steps: Off, Small (1/3 of the cap), Medium (2/3), Large (the cap).

export type Step = 0 | 1 | 2 | 3;
export const STEP_FRACTIONS = [0, 1 / 3, 2 / 3, 1] as const;

export const LETTER_MAX_EM = 0.12;
export const LETTER_MAX_EM_DYSLEXIC = 0.06;
export const WORD_MAX_EM = 0.16;

// OpenDyslexic covers Latin, Cyrillic and Greek (checked against the font's cmap: every
// letter used by the en/es/fr/pt/de/it/ru translations is present; hi/zh/ar are not).
export const OPENDYSLEXIC_LANGS = ['en', 'es', 'fr', 'pt', 'de', 'it', 'ru'];
export const isDyslexicSupported = (language: string) => OPENDYSLEXIC_LANGS.includes(language);

// Letter spacing would break the joins in Arabic and the headline bar in Devanagari.
const NO_LETTER_SPACING_LANGS = ['ar', 'hi'];

// OpenDyslexic-Regular's space glyph is 0.847em wide. Word spacing is added as a nested,
// smaller space set in OpenDyslexic, so its width is known exactly whatever font the
// surrounding text uses (hair/thin-space widths differ wildly between fonts: 0.46em in
// OpenDyslexic, 0.1em in Nunito).
export const SPACER_FONT_FAMILY = 'OpenDyslexic-Regular';
const SPACER_SPACE_EM = 0.847;

export const FONT_FAMILIES = {
  regular: 'OpenDyslexic-Regular',
  bold: 'OpenDyslexic-Bold',
  italic: 'OpenDyslexic-Italic',
  boldItalic: 'OpenDyslexic-BoldItalic',
} as const;

// Families we are allowed to replace. Anything else (icon fonts, monospace, ...) is left alone.
const REPLACEABLE_FAMILIES = [undefined, 'Nunito', 'Fredoka_700Bold'];

export interface ReadingState {
  dyslexic: boolean;
  letterStep: Step;
  wordStep: Step;
  language: string;
  // OpenDyslexic files are loaded (they load lazily, only when needed).
  fontsReady: boolean;
}

export interface ActiveConfig {
  useDyslexicFont: boolean;
  letterEm: number;
  wordExtraEm: number;
}

let active: ActiveConfig | null = null;

// null = nothing to apply. While null, install's Text getter hands out the ORIGINAL
// react-native Text, so people who never use these settings run exactly the code they ran before.
export const getActiveConfig = () => active;

export function setReadingState(s: ReadingState) {
  const dyslexicApplies = s.dyslexic && isDyslexicSupported(s.language);
  const letterMax = dyslexicApplies ? LETTER_MAX_EM_DYSLEXIC : LETTER_MAX_EM;
  const letterEm = NO_LETTER_SPACING_LANGS.includes(s.language) ? 0 : letterMax * STEP_FRACTIONS[s.letterStep];
  // Word spacing needs the OpenDyslexic space glyph, so it waits for the fonts.
  const wordExtraEm = s.fontsReady ? WORD_MAX_EM * STEP_FRACTIONS[s.wordStep] : 0;
  const useDyslexicFont = dyslexicApplies && s.fontsReady;
  active = useDyslexicFont || letterEm > 0 || wordExtraEm > 0 ? { useDyslexicFont, letterEm, wordExtraEm } : null;
}

export const letterCapEm = (dyslexicApplies: boolean) => (dyslexicApplies ? LETTER_MAX_EM_DYSLEXIC : LETTER_MAX_EM);

const isBold = (w: unknown) => w === 'bold' || (typeof w === 'string' && /^[6-9]00$/.test(w)) || (typeof w === 'number' && w >= 600);

// True for a string that is only emoji / pictographs / arrows (plus spaces, ZWJ, variation
// selectors). Such text is not set in a reading font: OpenDyslexic has no emoji, so the Text only
// gets OpenDyslexic's tall line box (1.82em, up to 2.13em on Android) and letter spacing - which
// is what pushed emoji out of their fixed-size circles and slots. Code points are checked by
// range (no \p{} regex) so it behaves the same on every JS engine.
export function isEmojiOnly(children: any) {
  if (typeof children !== 'string' || children.length === 0) return false;
  let seen = false;
  for (const ch of children) {
    const cp = ch.codePointAt(0) as number;
    if (cp === 0x20 || cp === 0xfe0f || cp === 0x200d || cp === 0x20e3) continue;
    const pictograph = cp >= 0x1f000 || (cp >= 0x2190 && cp <= 0x2bff) || cp === 0x00a9 || cp === 0x00ae || cp === 0x203c || cp === 0x2049 || cp === 0x2122 || cp === 0x2139;
    if (!pictograph) return false;
    seen = true;
  }
  return seen;
}

// Style overrides for one Text, from its flattened style. Returns null when nothing applies.
export function computeOverrides(flat: Record<string, any>, cfg: ActiveConfig) {
  const o: Record<string, any> = {};
  // A Text with its own explicit font (icon glyphs, monospace codes) is left completely alone.
  if (!REPLACEABLE_FAMILIES.includes(flat.fontFamily)) return null;
  if (cfg.useDyslexicFont) {
    const bold = isBold(flat.fontWeight) || flat.fontFamily === 'Fredoka_700Bold';
    const italic = flat.fontStyle === 'italic';
    o.fontFamily = bold ? (italic ? FONT_FAMILIES.boldItalic : FONT_FAMILIES.bold) : italic ? FONT_FAMILIES.italic : FONT_FAMILIES.regular;
    // The weight/slant is in the file; asking for it again would fake-bold it on Android.
    o.fontWeight = 'normal';
    o.fontStyle = 'normal';
    // OpenDyslexic's built-in line box is much taller than the normal fonts', which pushes
    // text out of fixed-height buttons and cards. A Text with no lineHeight of its own gets
    // one close to the normal font's, so layouts keep their shape; an explicit lineHeight wins.
    if (flat.lineHeight === undefined) {
      o.lineHeight = Math.round((typeof flat.fontSize === 'number' ? flat.fontSize : 14) * 1.3);
    }
  }
  if (cfg.letterEm > 0 && flat.letterSpacing === undefined) {
    o.letterSpacing = (typeof flat.fontSize === 'number' ? flat.fontSize : 14) * cfg.letterEm;
  }
  return Object.keys(o).length ? o : null;
}

// Plain string children only: each space gets a small extra OpenDyslexic space after it.
// Returns the children unchanged unless there is a string with a space in it.
export function spaceWords(
  children: any,
  fontSize: number,
  extraEm: number,
  makeSpacer: (key: string, size: number) => any,
) {
  if (extraEm <= 0) return children;
  const size = (extraEm * fontSize) / SPACER_SPACE_EM;
  let n = 0;
  const split = (s: string): any[] => {
    const parts = s.split(' ');
    if (parts.length === 1) return [s];
    const out: any[] = [];
    parts.forEach((p, i) => {
      if (i > 0) out.push(' ', makeSpacer('rs' + n++, size));
      if (p) out.push(p);
    });
    return out;
  };
  if (typeof children === 'string') {
    const out = split(children);
    return out.length === 1 ? children : out;
  }
  if (Array.isArray(children)) {
    let changed = false;
    const out: any[] = [];
    children.forEach((c) => {
      if (typeof c === 'string' && c.includes(' ')) {
        changed = true;
        out.push(...split(c));
      } else out.push(c);
    });
    return changed ? out : children;
  }
  return children;
}
