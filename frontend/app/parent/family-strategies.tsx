import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

const ZONE_BG: Record<string, string> = {
  blue: '#E8F0FB',
  green: '#E8F5E9',
  yellow: '#FFF8E1',
  red: '#FFEBEE',
};

// Built-in family strategies — always visible regardless of DB
const DEFAULT_STRATEGIES: Array<{ zone: string; name: string; description: string; icon: string }> = [
  { zone: 'green', name: 'Family Walk', description: 'Go for a short walk together outside.', icon: 'directions-walk' },
  { zone: 'green', name: 'Gratitude Sharing', description: 'Each person shares one thing they are grateful for today.', icon: 'favorite' },
  { zone: 'green', name: 'Family Dance', description: 'Put on a favourite song and have a dance together.', icon: 'music-note' },
  { zone: 'blue', name: 'Quiet Time Together', description: 'Sit quietly side by side reading or drawing.', icon: 'book' },
  { zone: 'blue', name: 'Comfort Hug', description: 'Give a long, warm hug to someone who needs it.', icon: 'child-care' },
  { zone: 'blue', name: 'Hot Chocolate Moment', description: 'Make a warm drink and chat about your day.', icon: 'local-cafe' },
  { zone: 'yellow', name: 'Deep Breathing', description: 'Breathe in for 4, hold for 4, out for 4. Do it together.', icon: 'air' },
  { zone: 'yellow', name: 'Feelings Journal', description: 'Write or draw about how you are feeling right now.', icon: 'edit' },
  { zone: 'yellow', name: 'Shake It Out', description: 'Stand up and shake your whole body for 30 seconds!', icon: 'accessibility' },
  { zone: 'red', name: 'Calm Corner', description: 'Go to a quiet space and take 5 slow deep breaths.', icon: 'self-improvement' },
  { zone: 'red', name: 'Cold Water', description: 'Splash cold water on your face or hold a cold drink.', icon: 'water' },
  { zone: 'red', name: 'Count to 10', description: 'Slowly count to 10 together before responding.', icon: 'timer' },
];

export default function FamilyStrategiesScreen() {
  const router = useRouter();
  const { t, language } = useApp();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const zones = ['green', 'blue', 'yellow', 'red'];

  const getZoneLabel = (zone: string) => {
    const key = `${zone}_label`;
    const labels: Record<string, string> = {
      blue: language === 'pt' ? 'Azul' : 'Blue',
      green: language === 'pt' ? 'Verde' : 'Green',
      yellow: language === 'pt' ? 'Amarelo' : 'Yellow',
      red: language === 'pt' ? 'Vermelho' : 'Red',
    };
    return t(key) || labels[zone] || zone;
  };

  const filteredStrategies = selectedZone
    ? DEFAULT_STRATEGIES.filter(s => s.zone === selectedZone)
    : DEFAULT_STRATEGIES;

  const onRefresh = async () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
          <Text style={styles.backText}>{t('back') || 'Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('family_strategies') || 'Family Strategies'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {language === 'pt'
            ? 'Estratégias para apoiar o bem-estar emocional em casa'
            : 'Strategies to support emotional wellbeing at home'}
        </Text>

        {/* Zone Filter */}
        <View style={styles.zoneFilter}>
          <TouchableOpacity
            style={[styles.zoneChip, !selectedZone && styles.zoneChipAll]}
            onPress={() => setSelectedZone(null)}
          >
            <Text style={[styles.zoneChipText, !selectedZone && styles.zoneChipTextActive]}>
              {t('all_students')?.replace('Alunos', '') || 'All'}
            </Text>
          </TouchableOpacity>
          {zones.map(zone => (
            <TouchableOpacity
              key={zone}
              style={[
                styles.zoneChip,
                { borderColor: ZONE_COLORS[zone] },
                selectedZone === zone && { backgroundColor: ZONE_COLORS[zone] },
              ]}
              onPress={() => setSelectedZone(selectedZone === zone ? null : zone)}
            >
              <View style={[styles.zoneDot, { backgroundColor: ZONE_COLORS[zone] }]} />
              <Text style={[
                styles.zoneChipText,
                selectedZone === zone && { color: 'white' },
              ]}>
                {getZoneLabel(zone)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Strategy Cards */}
        {filteredStrategies.map((strategy, index) => (
          <View key={index} style={[styles.strategyCard, { borderLeftColor: ZONE_COLORS[strategy.zone] }]}>
            <View style={[styles.iconContainer, { backgroundColor: ZONE_BG[strategy.zone] }]}>
              <MaterialIcons
                name={strategy.icon as any}
                size={28}
                color={ZONE_COLORS[strategy.zone]}
              />
            </View>
            <View style={styles.strategyContent}>
              <View style={styles.strategyHeader}>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <View style={[styles.zonePill, { backgroundColor: ZONE_BG[strategy.zone] }]}>
                  <Text style={[styles.zonePillText, { color: ZONE_COLORS[strategy.zone] }]}>
                    {getZoneLabel(strategy.zone)}
                  </Text>
                </View>
              </View>
              <Text style={styles.strategyDesc}>{strategy.description}</Text>
            </View>
          </View>
        ))}

        {/* Info card */}
        <View style={styles.infoCard}>
          <MaterialIcons name="info" size={20} color="#5C6BC0" />
          <Text style={styles.infoText}>
            {language === 'pt'
              ? 'Estas estratégias ajudam as famílias a apoiar o bem-estar emocional em casa.'
              : 'These strategies help families support emotional wellbeing at home together.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText: { fontSize: 14, color: '#333' },
  topBarTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 16, lineHeight: 20 },
  zoneFilter: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20,
  },
  zoneChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 20, borderWidth: 1.5,
    borderColor: '#E0E0E0', backgroundColor: 'white', gap: 6,
  },
  zoneChipAll: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  zoneChipText: { fontSize: 13, fontWeight: '500', color: '#666' },
  zoneChipTextActive: { color: 'white' },
  zoneDot: { width: 10, height: 10, borderRadius: 5 },
  strategyCard: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 14,
    padding: 14, marginBottom: 12, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 3, elevation: 2,
    alignItems: 'center', gap: 14,
  },
  iconContainer: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  strategyContent: { flex: 1 },
  strategyHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 4, gap: 8,
  },
  strategyName: { fontSize: 15, fontWeight: '600', color: '#333', flex: 1 },
  strategyDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
  zonePill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, flexShrink: 0,
  },
  zonePillText: { fontSize: 11, fontWeight: '600' },
  infoCard: {
    flexDirection: 'row', backgroundColor: '#E8EAF6', borderRadius: 12,
    padding: 14, marginTop: 8, gap: 10, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#5C6BC0', lineHeight: 18 },
});
