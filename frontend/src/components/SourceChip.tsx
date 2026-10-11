import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';

// Oct 11: where a strategy comes from, shown as an icon AND a word (never colour alone): School (made or shared by
// the school) or Home (the family's own). Used on the parent's linked-child page and the teacher's strategy screens.
// Oct 11: which chip a strategy row gets. Uses `source` (backend 8bd31d09 adds it to /custom-strategies and
// /teacher/student/{id}/all-strategies), else `creator_role` / `created_by_role`; rows with none keep the old behaviour (school).
export function strategySource(row: any): 'school' | 'home' {
  if (row?.source === 'home' || row?.source === 'school') return row.source;
  const role = row?.creator_role || row?.created_by_role;
  return role === 'parent' || role === 'family' ? 'home' : 'school';
}

export function SourceChip({ source }: { source: 'school' | 'home' }) {
  const { t } = useApp();
  const isSchool = source === 'school';
  const fg = isSchool ? '#3F51B5' : '#2E7D32';
  return (
    <View style={[styles.chip, { backgroundColor: isSchool ? '#E8EAF6' : '#E8F5E9' }]}>
      <MaterialIcons name={isSchool ? 'school' : 'home'} size={11} color={fg} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{isSchool ? (t('school') || 'School') : (t('home') || 'Home')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  text: { fontSize: 10, fontWeight: '700' },
});
