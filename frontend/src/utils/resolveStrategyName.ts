// Shared check-in strategy ID -> display name resolver.
//
// Real fix (localisation audit): 9 screens each hardcoded their own copy of an
// id -> English-name lookup table for check-in strategies (STRAT / STRATEGY_NAMES /
// STRATEGY_NAMES_LOCAL / STRATEGY_NAME_MAP), so strategy names never went through
// t() and never localised for non-English users. This file is the single place
// that turns a raw strategy id into a translated display name.
//
// Strategy ids come from several eras/schemes that all coexist in real production
// data (real students' and families' check-in history references these):
//   - canonical:      blue_1..blue_6, green_1..green_6, yellow_1..yellow_6, red_1..red_6
//                      (translated today as strat_blue_1 .. strat_red_6)
//   - short codes:     b1..b6, g1..g6, y1..y6, r1..r6 (legacy alias of the canonical set)
//   - named slugs:     bubble_breathing, slow_breathing, safe_space, etc (legacy alias)
//   - parent codes:    p_b1..p_b5, p_g1..p_g5, p_y1..p_y5, p_r1..p_r5 (family strategies —
//                      distinct content from the canonical 24, not just an alias of it)
//   - teacher/dashboard-only legacy codes: s_b1..s_r5, and raw R1-R9/G1-G9/Y1-Y9/B1-B9
//
// Several of these schemes reuse the exact same short code for different content in
// different screens (eg teacher/checkin.tsx's own TEACHER_STRATEGIES table intentionally
// reuses the ids "blue_1".."red_4" for a completely different, teacher-facing strategy
// list — that table must stay checked BEFORE this resolver, which this file has no
// visibility into and does not attempt to handle).
//
// STRATEGY_ID_ALIASES below only maps an id to a shared t() key when the underlying
// English content is either textually identical, or is the exact same real-world
// strategy already given a proper translation elsewhere in the app (eg the parent
// strategies content in app/parent/family-strategies.tsx). Ids whose content genuinely
// differs between screens (eg teacher/dashboard.tsx's own p_* / s_* / raw-letter table,
// which disagrees with the other 5 screens that define p_* codes) are deliberately left
// out of the alias table — for those, the caller's own `legacyNames` fallback (its
// existing local dictionary, unchanged) keeps producing exactly the name it always has,
// so nothing regresses for real users even though it isn't newly localised.

const STRATEGY_ID_ALIASES: Record<string, string> = {
  // Short codes -> canonical strat_<zone>_<n> keys (identical content everywhere checked)
  b1: 'strat_blue_1', b2: 'strat_blue_2', b3: 'strat_blue_3',
  b4: 'strat_blue_4', b5: 'strat_blue_5', b6: 'strat_blue_6',
  g1: 'strat_green_1', g2: 'strat_green_2', g3: 'strat_green_3',
  g4: 'strat_green_4', g5: 'strat_green_5', g6: 'strat_green_6',
  y1: 'strat_yellow_1', y2: 'strat_yellow_2', y3: 'strat_yellow_3',
  y4: 'strat_yellow_4', y5: 'strat_yellow_5', y6: 'strat_yellow_6',
  r1: 'strat_red_1', r2: 'strat_red_2', r3: 'strat_red_3',
  r4: 'strat_red_4', r5: 'strat_red_5', r6: 'strat_red_6',

  // Named slugs that don't already have their own strat_<slug> translation key
  // (most named slugs — bubble_breathing, slow_breathing, count_to_10, talk_about_it,
  // tell_someone, gentle_stretch, gratitude, help_friend, favourite_song,
  // squeeze_release, keep_going, set_goal, 5_senses — already resolve directly via
  // their own strat_<slug> key and need no alias entry here)
  safe_space: 'strat_red_4',
  ask_for_help: 'strat_red_5',
  self_hug: 'strat_red_6',
  big_breaths: 'strat_red_2',
  cosy_spot: 'strat_blue_4',
  warm_drink: 'strat_blue_2',
  body_shake: 'strat_yellow_2',
  count_backwards: 'strat_red_3',
  five_senses: 'strat_yellow_4',

  // Parent (family) strategy codes -> the matching, already-translated content keys
  // from app/parent/family-strategies.tsx (exact English text match confirmed)
  p_b1: 'strat_side_by_side_name',
  p_b2: 'strat_warm_drink_name',
  p_b3: 'strat_name_it_name',
  p_b4: 'strat_movement_name',
  p_g1: 'strat_gratitude_name',
  p_g2: 'strat_strength_name',
  p_y1: 'strat_box_breathing_name',
  p_y3: 'strat_body_checkin_name',
  p_r3: 'strat_cold_water_name',
  // p_b5, p_g3, p_g4, p_g5, p_y2, p_y4, p_y5, p_r1, p_r2, p_r4, p_r5 have no exact-text
  // match anywhere else, so each got its own new strat_p_* key (added to all 10 locale
  // files) and resolves via the direct strat_<id> lookup below — no alias needed.

  // teacher/dashboard.tsx-only legacy codes (student-scheme s_*, and raw single-letter
  // codes) — only aliased where the English text is an exact match to an existing key,
  // so this never changes what teacher/dashboard.tsx already shows for the entries left
  // out here (those keep resolving through its own legacyNames fallback, unchanged).
  s_b1: 'strat_blue_6', s_b2: 'strat_red_4', s_b3: 'strat_blue_1',
  s_b4: 'strat_blue_3', s_b5: 'strat_yellow_6',
  s_g1: 'strat_green_1', s_g2: 'strat_green_5', s_g3: 'strat_green_2',
  s_g4: 'strat_green_6', s_g5: 'strat_yellow_4',
  s_y1: 'strat_yellow_1', s_y2: 'strat_yellow_3', s_y3: 'strat_walk_away',
  s_y4: 'strat_yellow_5', s_y5: 'strat_blue_5',
  s_r1: 'strat_walk_away', s_r3: 'strat_red_4', s_r4: 'strat_blue_5', s_r5: 'strat_blue_6',

  R1: 'strat_blue_5', R2: 'strat_walk_away', R3: 'strat_red_4', R4: 'strat_blue_6',
  R7: 'strat_yellow_5', R9: 'strat_yellow_3',
  G1: 'strat_green_1', G2: 'strat_green_5', G3: 'strat_green_2', G4: 'strat_green_6',
  G6: 'strat_yellow_4', G7: 'strat_blue_3', G8: 'strat_blue_1',
  Y1: 'strat_yellow_1', Y2: 'strat_yellow_3', Y3: 'strat_walk_away',
  Y4: 'strat_body_checkin_name', Y6: 'strat_p_y4', Y9: 'strat_yellow_4',
  B1: 'strat_blue_6', B2: 'strat_red_4', B6: 'strat_blue_3', B7: 'strat_blue_1',
  B8: 'strat_yellow_6', B9: 'strat_green_2',
};

const ZONE_WORDS = new Set(['blue', 'green', 'yellow', 'red', 'Blue', 'Green', 'Yellow', 'Red']);

/**
 * Resolve a check-in strategy id to a translated display name.
 *
 * Order: known alias -> direct strat_<id> translation -> customNames (eg strategy
 * rows fetched from the DB, keyed by their real id/UUID) -> legacyNames (the calling
 * screen's own historical id->English-name dictionary, kept as a safety net so
 * nothing that used to resolve correctly can start showing blank/undefined) -> a
 * prettified version of the raw id as an absolute last resort.
 */
export function resolveStrategyName(
  id: string | null | undefined,
  t: (key: string) => string,
  legacyNames?: Record<string, string>,
  customNames?: Record<string, string>,
): string {
  if (!id) return '';
  const trimmed = String(id).trim();
  if (!trimmed || ZONE_WORDS.has(trimmed)) return '';

  const aliasKey = STRATEGY_ID_ALIASES[trimmed];
  if (aliasKey) {
    const v = t(aliasKey);
    if (v) return v;
  }

  const direct = t(`strat_${trimmed}`);
  if (direct) return direct;

  if (customNames && customNames[trimmed]) return customNames[trimmed];
  if (legacyNames && legacyNames[trimmed]) return legacyNames[trimmed];

  const clean = trimmed.toLowerCase().replace(/^(helper_|strategy_|strat_)/, '');
  if (clean && clean !== trimmed) {
    const cleanAliasKey = STRATEGY_ID_ALIASES[clean];
    if (cleanAliasKey) {
      const v = t(cleanAliasKey);
      if (v) return v;
    }
    const cleanDirect = t(`strat_${clean}`);
    if (cleanDirect) return cleanDirect;
    if (customNames && customNames[clean]) return customNames[clean];
    if (legacyNames && legacyNames[clean]) return legacyNames[clean];
  }

  const stripped = trimmed
    .replace(/^[rgybRGYB]\d+$/, '')
    .replace(/^[pbs]_[rgby]\d+_?/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!stripped) return trimmed;
  return stripped.replace(/\b\w/g, (c: string) => c.toUpperCase());
}
