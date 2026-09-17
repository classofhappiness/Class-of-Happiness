// Real feature Sep 15 (points economy v2 / progress bar unification): single implementation
// of the colour-matched evolve-progress bar, used identically on the reward screen, My
// Creatures, and creature detail - proved out first on the reward screen, then extracted here
// per Jono's explicit instruction rather than left as three separately-maintained copies (same
// discipline as the header-consistency fix).
//
// Percent is deliberately computed from a raw current value + an absolute threshold table,
// never from a "points/checkins remaining" field - those fields (points_for_next_evolution,
// needed_for_next) are correctly 0 the instant a threshold is crossed, which is
// indistinguishable from "not started" under a naive truthy check and would hide the bar at
// exactly the moment it's most worth seeing (see rewards.tsx's original bug).
//
// Default creatures and community creatures evolve on genuinely different mechanics - points
// (0/25/60/120) vs a rolling 30-day check-in count (0/5/10/15/20) - so the caller must pass the
// right current value and threshold table for the creature type; this component only knows how
// to turn (current, stageIndex, thresholds) into a bar, not which mechanic applies.
//
// Real note Sep 15: a colour-blind secondary cue (a per-emotion icon alongside the bar) was
// considered here - Jono's explicit call was to defer it, not build it tonight. Left out
// entirely rather than half-wired, so there's nothing dead to trip over later.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { EMOTION_COLOURS, EmotionZone } from '../constants/emotionColours';

export const DEFAULT_CREATURE_THRESHOLDS = [0, 25, 60, 120];
export const COMMUNITY_CREATURE_THRESHOLDS = [0, 5, 10, 15, 20];

interface EvolutionProgressBarProps {
  zone: EmotionZone | string | undefined;
  current: number;
  stageIndex: number;
  thresholds: number[];
  style?: any;
  // Real feature Sep 15 (Jono-requested): a bar alone doesn't tell a child how many points
  // (or check-ins) they still need - a plain "X / Y" count underneath it now does. Shown by
  // default in all three locations; only ever hidden if a future caller has a real reason to.
  showLabel?: boolean;
}

export const EvolutionProgressBar: React.FC<EvolutionProgressBarProps> = ({
  zone, current, stageIndex, thresholds, style, showLabel = true,
}) => {
  // Fully evolved - no next threshold to show progress toward.
  if (stageIndex >= thresholds.length - 1) return null;

  const colour = (EMOTION_COLOURS as Record<string, string>)[zone as string] || EMOTION_COLOURS.green;
  const prevThreshold = thresholds[stageIndex];
  const nextThreshold = thresholds[stageIndex + 1];
  const pct = Math.max(0, Math.min(100,
    Math.round(((current - prevThreshold) / (nextThreshold - prevThreshold)) * 100)
  ));
  // Real fix Sep 15: clamped to nextThreshold for display - current can genuinely exceed it
  // once a threshold's been crossed but the explicit Evolve tap hasn't happened yet (the bar
  // itself is already visually full via the pct clamp above), so the label reads "60/60"
  // rather than an odd-looking overshoot like "72/60" in that moment.
  const displayCurrent = Math.min(current, nextThreshold);

  return (
    <View style={style}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: colour }]} />
      </View>
      {showLabel && (
        <Text style={styles.label}>{displayCurrent} / {nextThreshold}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  track: { width: '100%', height: 10, backgroundColor: '#E0E0E0', borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 5 },
  label: { fontSize: 11, fontWeight: '700', color: '#999', textAlign: 'right', marginTop: 3 },
});
