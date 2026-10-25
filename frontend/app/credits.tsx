import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useApp } from '../src/context/AppContext';
import { OFL_FREDOKA, OFL_OPENDYSLEXIC } from '../src/constants/licences';

// Licences & credits. The licence texts live in assets/licences/*.txt and are mirrored into
// src/constants/licences.ts (Metro can't import .txt as a string).
export default function Credits() {
  const { t } = useApp();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>OpenDyslexic</Text>
      <Text style={styles.line}>SIL Open Font License 1.1</Text>
      <Text style={styles.line}>{t('credits_opendyslexic_by') || 'Copyright (c) Abbie Gonzalez'}</Text>
      <View style={styles.box}><Text style={styles.licence}>{OFL_OPENDYSLEXIC}</Text></View>

      <Text style={[styles.name, { marginTop: 28 }]}>Fredoka</Text>
      <Text style={styles.line}>SIL Open Font License 1.1</Text>
      <View style={styles.box}><Text style={styles.licence}>{OFL_FREDOKA}</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 20, paddingBottom: 48 },
  name: { fontSize: 20, fontWeight: '700', color: '#222' },
  line: { fontSize: 14, color: '#555', marginTop: 4 },
  box: { backgroundColor: '#FFF', borderRadius: 10, padding: 14, marginTop: 12 },
  licence: { fontSize: 12, color: '#444', lineHeight: 17 },
});
