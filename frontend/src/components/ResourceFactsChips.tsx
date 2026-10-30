import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EMOTION_LIGHT_COLOURS } from '../constants/emotionColours';
import { ResourceFacts, agesLabel, groupingLabels, minutesLabel } from '../utils/resourceMeta';

// Wrapping row of small round chips: ages, minutes, grouping. Blank facts are omitted.
// Plain system text (no custom font), so it follows the Reading font setting automatically.
export const ResourceFactsChips: React.FC<{ facts: ResourceFacts; t: (k: string) => string }> = ({ facts, t }) => {
  const chips: { label: string; bg: string }[] = [];
  const age = agesLabel(facts, t);
  if (age) chips.push({ label: age, bg: EMOTION_LIGHT_COLOURS.blue });
  const mins = minutesLabel(facts, t);
  if (mins) chips.push({ label: mins, bg: EMOTION_LIGHT_COLOURS.green });
  groupingLabels(facts, t).forEach((g) => chips.push({ label: g, bg: EMOTION_LIGHT_COLOURS.yellow }));
  if (!chips.length) return null;
  return (
    <View style={styles.row}>
      {chips.map((c) => (
        <View key={c.label} style={[styles.chip, { backgroundColor: c.bg }]}>
          <Text style={styles.text}>{c.label}</Text>
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, maxWidth: '100%' },
  text: { fontSize: 12, color: '#333', fontWeight: '600', flexShrink: 1 },
});
