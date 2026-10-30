import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ResourceFacts, outcomeList } from '../utils/resourceMeta';
import { ResourceFactsChips } from './ResourceFactsChips';

// Detail-screen block: goal, "Use when", outcomes (bullets) and the chips.
export const ResourceDetailFacts: React.FC<{ facts: ResourceFacts; t: (k: string) => string }> = ({ facts, t }) => {
  const outcomes = outcomeList(facts);
  if (!facts.goal && !facts.use_when && !outcomes.length && !facts.age_min && !facts.age_max && !facts.duration_minutes && !facts.grouping) return null;
  return (
    <View style={styles.box}>
      {!!facts.goal && <Text style={styles.goal}>{facts.goal}</Text>}
      <ResourceFactsChips facts={facts} t={t} />
      {!!facts.use_when && (
        <View style={styles.block}>
          <Text style={styles.label}>{t('resource_use_when') || 'Use when'}</Text>
          <Text style={styles.body}>{facts.use_when}</Text>
        </View>
      )}
      {outcomes.length > 0 && (
        <View style={styles.block}>
          <Text style={styles.label}>{t('resource_outcomes') || 'Outcomes'}</Text>
          {outcomes.map((o, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={[styles.body, { flex: 1 }]}>{o}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: { marginBottom: 14 },
  goal: { fontSize: 15, color: '#222', fontWeight: '600', lineHeight: 21 },
  block: { marginTop: 12 },
  label: { fontSize: 12, fontWeight: '700', color: '#666', marginBottom: 4 },
  body: { fontSize: 14, color: '#333', lineHeight: 20 },
  bulletRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  bullet: { fontSize: 14, color: '#666', lineHeight: 20 },
});
