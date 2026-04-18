import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

type FeelingZone = 'blue' | 'green' | 'yellow' | 'red';

const ZONES: Array<{ id: FeelingZone; label: string; emoji: string; color: string }> = [
  { id: 'blue', label: 'Low energy', emoji: '😔', color: '#4A90D9' },
  { id: 'green', label: 'Steady', emoji: '🙂', color: '#4CAF50' },
  { id: 'yellow', label: 'Stressed', emoji: '😟', color: '#FFC107' },
  { id: 'red', label: 'Overloaded', emoji: '😣', color: '#F44336' },
];

const TEACHER_STRATEGIES: Record<FeelingZone, Array<{ id: string; name: string; description: string; icon: string }>> = {
  blue: [
    { id: 'blue_1', name: 'Talk to a trusted colleague', description: 'Use a 5-minute peer check-in to reduce isolation.', icon: 'chat' },
    { id: 'blue_2', name: 'Brief outdoor walk', description: 'Step outside the school building for light and movement.', icon: 'directions-walk' },
    { id: 'blue_3', name: 'Safe staff space reset', description: 'Use staff room or quiet corner for a short reset.', icon: 'meeting-room' },
    { id: 'blue_4', name: 'Hydrate and breathe', description: 'Drink water and complete 4 slow breaths.', icon: 'local-drink' },
  ],
  green: [
    { id: 'green_1', name: 'Protect what works', description: 'Keep routines that are helping you stay regulated.', icon: 'check-circle' },
    { id: 'green_2', name: 'Positive micro-moment', description: 'Name one student success from today.', icon: 'thumb-up' },
    { id: 'green_3', name: 'Prep buffer time', description: 'Reserve 10 minutes before/after class transition.', icon: 'schedule' },
    { id: 'green_4', name: 'Boundary reminder', description: 'Use a clear stop-time for work tonight.', icon: 'lock-clock' },
  ],
  yellow: [
    { id: 'yellow_1', name: 'Movement break', description: 'Exercise before, during, or after school to discharge stress.', icon: 'fitness-center' },
    { id: 'yellow_2', name: 'Guided meditation', description: 'Use a short educator-friendly mindfulness resource.', icon: 'self-improvement' },
    { id: 'yellow_3', name: 'Challenge log', description: 'Record triggers/challenges for pattern tracking.', icon: 'description' },
    { id: 'yellow_4', name: 'Deep breathing set', description: 'Box breathing for 2-3 minutes.', icon: 'air' },
    { id: 'yellow_5', name: 'Quick yoga stretch', description: 'Two standing stretches between lessons.', icon: 'accessibility-new' },
  ],
  red: [
    { id: 'red_1', name: 'Ask for immediate cover', description: 'Request brief support from nearby staff if possible.', icon: 'support-agent' },
    { id: 'red_2', name: 'Grounding routine', description: '5-4-3-2-1 sensory grounding to regain control.', icon: 'psychology' },
    { id: 'red_3', name: 'Pause before response', description: 'Delay difficult conversations until regulated.', icon: 'pause-circle-filled' },
    { id: 'red_4', name: 'De-escalation script', description: 'Use your prepared calm script with students.', icon: 'record-voice-over' },
  ],
};

export default function TeacherCheckInScreen() {
  const router = useRouter();
  const { user } = useApp();
  const [selectedZone, setSelectedZone] = useState<FeelingZone | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const strategiesForZone = useMemo(() => {
    if (!selectedZone) return [];
    return TEACHER_STRATEGIES[selectedZone];
  }, [selectedZone]);

  const toggleStrategy = (id: string) => {
    setSelectedStrategies((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const saveCheckIn = async () => {
    if (!selectedZone || !user?.user_id) {
      Alert.alert('Select a feeling', 'Please choose a colour before saving.');
      return;
    }

    setSaving(true);
    try {
      const storageKey = `teacher_checkins_${user.user_id}`;
      const existingRaw = await AsyncStorage.getItem(storageKey);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const newEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toISOString(),
        zone: selectedZone,
        strategies_selected: selectedStrategies,
        notes: notes.trim() || null,
      };
      const updated = [newEntry, ...existing].slice(0, 90);
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));
      Alert.alert('Saved', 'Teacher check-in saved.');
      router.back();
    } catch (error) {
      Alert.alert('Error', 'Could not save check-in right now.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Teacher Check-in</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.subtitle}>Simple wellbeing check-in for educators</Text>

        <View style={styles.zoneRow}>
          {ZONES.map((zone) => (
            <TouchableOpacity
              key={zone.id}
              style={[
                styles.zoneChip,
                { borderColor: zone.color },
                selectedZone === zone.id && { backgroundColor: zone.color },
              ]}
              onPress={() => {
                setSelectedZone(zone.id);
                setSelectedStrategies([]);
              }}
            >
              <Text style={styles.zoneEmoji}>{zone.emoji}</Text>
              <Text style={[styles.zoneLabel, selectedZone === zone.id && { color: 'white' }]}>{zone.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {selectedZone && (
          <>
            <Text style={styles.sectionTitle}>Recommended strategies for teachers</Text>
            {strategiesForZone.map((strategy) => {
              const selected = selectedStrategies.includes(strategy.id);
              return (
                <TouchableOpacity
                  key={strategy.id}
                  style={[styles.strategyCard, selected && styles.strategyCardSelected]}
                  onPress={() => toggleStrategy(strategy.id)}
                >
                  <MaterialIcons
                    name={(strategy.icon as never) || 'lightbulb'}
                    size={22}
                    color={selected ? '#5C6BC0' : '#666'}
                  />
                  <View style={styles.strategyText}>
                    <Text style={styles.strategyName}>{strategy.name}</Text>
                    <Text style={styles.strategyDescription}>{strategy.description}</Text>
                  </View>
                  <MaterialIcons
                    name={selected ? 'check-circle' : 'radio-button-unchecked'}
                    size={20}
                    color={selected ? '#5C6BC0' : '#AAA'}
                  />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <Text style={styles.sectionTitle}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything you want to capture?"
          style={styles.notesInput}
          multiline
        />
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.cancelButton} onPress={() => router.back()} disabled={saving}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.saveButton, !selectedZone && styles.saveDisabled]}
          onPress={saveCheckIn}
          disabled={!selectedZone || saving}
        >
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Check-in'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white' },
  backButton: { padding: 4, marginRight: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#333' },
  content: { padding: 16, paddingBottom: 120 },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 12 },
  zoneRow: { gap: 10, marginBottom: 18 },
  zoneChip: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'white',
  },
  zoneEmoji: { fontSize: 20 },
  zoneLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 10, marginTop: 8 },
  strategyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EEE',
  },
  strategyCardSelected: {
    borderColor: '#5C6BC0',
    backgroundColor: '#F4F6FF',
  },
  strategyText: { flex: 1 },
  strategyName: { fontSize: 14, fontWeight: '600', color: '#333' },
  strategyDescription: { fontSize: 12, color: '#666', marginTop: 2 },
  notesInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minHeight: 84,
    textAlignVertical: 'top',
    padding: 12,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    padding: 14,
    gap: 10,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#EEE',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCC',
    alignItems: 'center',
  },
  cancelText: { color: '#666', fontWeight: '600' },
  saveButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#5C6BC0',
    alignItems: 'center',
  },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: 'white', fontWeight: '700' },
});
