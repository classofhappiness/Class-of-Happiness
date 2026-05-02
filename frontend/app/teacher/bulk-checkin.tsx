import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';

const ZONES = ['b', 'g', 'y', 'r'] as const;
type ZoneKey = typeof ZONES[number];

const ZONE_FULL: Record<ZoneKey, string> = { b: 'blue', g: 'green', y: 'yellow', r: 'red' };
const ZONE_COLORS: Record<ZoneKey, string> = {
  b: '#4A90D9', g: '#4CAF50', y: '#FFC107', r: '#F44336',
};
const ZONE_LABEL: Record<ZoneKey, string> = {
  b: 'B', g: 'G', y: 'Y', r: 'R',
};

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function BulkCheckinScreen() {
  const router = useRouter();
  const { classroomId, classroomName } = useLocalSearchParams<{ classroomId: string; classroomName: string }>();
  const { students, presetAvatars, t, language } = useApp();

  const classroomStudents = students.filter(s => s.classroom_id === classroomId);

  // Map studentId -> selected zone key (or null)
  const [selections, setSelections] = useState<Record<string, ZoneKey | null>>({});
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Initialise all students with no selection
  useEffect(() => {
    const init: Record<string, ZoneKey | null> = {};
    classroomStudents.forEach(s => { init[s.id] = null; });
    setSelections(init);
  }, [classroomId, students.length]);

  const setZone = (studentId: string, zone: ZoneKey) => {
    setSelections(prev => ({
      ...prev,
      [studentId]: prev[studentId] === zone ? null : zone, // tap same to deselect
    }));
  };

  const selectAll = (zone: ZoneKey) => {
    const next: Record<string, ZoneKey | null> = {};
    classroomStudents.forEach(s => { next[s.id] = zone; });
    setSelections(next);
  };

  const clearAll = () => {
    const next: Record<string, ZoneKey | null> = {};
    classroomStudents.forEach(s => { next[s.id] = null; });
    setSelections(next);
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;

  const handleSubmit = async () => {
    if (selectedCount === 0) {
      Alert.alert(
        t('error') || 'Nothing selected',
        'Please select a colour for at least one student.'
      );
      return;
    }

    Alert.alert(
      'Check In Class',
      `Save ${selectedCount} check-in${selectedCount !== 1 ? 's' : ''}? No points will be awarded.`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: 'Check In',
          onPress: async () => {
            setSaving(true);
            try {
              const token = await AsyncStorage.getItem('session_token');
              const timestamp = new Date().toISOString();

              const logs = classroomStudents
                .filter(s => selections[s.id])
                .map(s => ({
                  student_id: s.id,
                  feeling_colour: ZONE_FULL[selections[s.id]!],
                  helpers_selected: [],
                  comment: null,
                  logged_by: 'teacher_bulk',
                  timestamp,
                  award_points: false,
                }));

              // Batch insert via backend
              const res = await fetch(`${BACKEND_URL}/api/checkins/bulk`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ logs }),
              });

              if (!res.ok) {
                // Fallback: insert individually if bulk endpoint not yet deployed
                await Promise.allSettled(
                  logs.map(log =>
                    fetch(`${BACKEND_URL}/api/checkins`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`,
                      },
                      body: JSON.stringify(log),
                    })
                  )
                );
              }

              setSavedCount(logs.length);
              setTimeout(() => {
                router.back();
              }, 1500);
            } catch (error) {
              Alert.alert(t('error') || 'Error', 'Could not save check-ins. Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const getDayLabel = () => {
    const days = language === 'pt'
      ? ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const now = new Date();
    return `${days[now.getDay()]} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  };

  if (savedCount !== null) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <MaterialIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>
            {savedCount} {savedCount === 1 ? 'check-in' : 'check-ins'} saved!
          </Text>
          <Text style={styles.successSub}>{getDayLabel()}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {classroomName || t('classrooms') || 'Classroom'}
          </Text>
          <Text style={styles.headerSub}>{getDayLabel()} · {classroomStudents.length} students</Text>
        </View>
        <TouchableOpacity
          style={[styles.submitBtn, selectedCount === 0 && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={saving || selectedCount === 0}
        >
          {saving
            ? <ActivityIndicator color="white" size="small" />
            : <Text style={styles.submitBtnText}>✓ {selectedCount}</Text>
          }
        </TouchableOpacity>
      </View>

      {/* Quick select all row */}
      <View style={styles.quickSelectBar}>
        <Text style={styles.quickSelectLabel}>All →</Text>
        {ZONES.map(zone => (
          <TouchableOpacity
            key={zone}
            style={[styles.quickBtn, { backgroundColor: ZONE_COLORS[zone] }]}
            onPress={() => selectAll(zone)}
          >
            <Text style={styles.quickBtnText}>{ZONE_LABEL[zone]}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.clearBtn} onPress={clearAll}>
          <MaterialIcons name="clear" size={18} color="#999" />
        </TouchableOpacity>
      </View>

      {/* Student list */}
      {classroomStudents.length === 0 ? (
        <View style={styles.empty}>
          <MaterialIcons name="people-outline" size={64} color="#CCC" />
          <Text style={styles.emptyText}>No students in this classroom</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {classroomStudents.map(student => {
            const selected = selections[student.id];
            return (
              <View key={student.id} style={[
                styles.studentRow,
                selected && { borderLeftColor: ZONE_COLORS[selected], borderLeftWidth: 4 },
              ]}>
                {/* Avatar */}
                <Avatar
                  type={student.avatar_type || 'preset'}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={40}
                  presetAvatars={presetAvatars}
                />
                {/* Name */}
                <Text style={styles.studentName} numberOfLines={1}>{student.name}</Text>

                {/* Zone buttons */}
                <View style={styles.zoneButtons}>
                  {ZONES.map(zone => (
                    <TouchableOpacity
                      key={zone}
                      style={[
                        styles.zoneBtn,
                        { backgroundColor: ZONE_COLORS[zone] },
                        selected !== zone && styles.zoneBtnUnselected,
                        selected === zone && styles.zoneBtnActive,
                      ]}
                      onPress={() => setZone(student.id, zone)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.zoneBtnText,
                        selected !== zone && styles.zoneBtnTextUnselected,
                      ]}>
                        {ZONE_LABEL[zone]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })}

          {/* Bottom submit button */}
          <TouchableOpacity
            style={[styles.bottomSubmit, selectedCount === 0 && styles.bottomSubmitDisabled]}
            onPress={handleSubmit}
            disabled={saving || selectedCount === 0}
          >
            {saving
              ? <ActivityIndicator color="white" />
              : <Text style={styles.bottomSubmitText}>
                  Check In {selectedCount} Student{selectedCount !== 1 ? 's' : ''}
                </Text>
            }
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 10,
    paddingTop: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8,
  },
  backBtn: { padding: 6 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },
  submitBtn: {
    backgroundColor: '#4CAF50', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8, minWidth: 52, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#CCC' },
  submitBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  quickSelectBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8,
  },
  quickSelectLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginRight: 4 },
  quickBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  quickBtnText: { color: 'white', fontWeight: '800', fontSize: 14 },
  clearBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F0F0F0',
  },

  list: { padding: 12, paddingBottom: 40 },

  studentRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: 8, gap: 10,
    borderLeftWidth: 4, borderLeftColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  studentName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },

  zoneButtons: { flexDirection: 'row', gap: 6 },
  zoneBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  zoneBtnUnselected: { opacity: 0.25 },
  zoneBtnActive: { opacity: 1, transform: [{ scale: 1.1 }] },
  zoneBtnText: { color: 'white', fontWeight: '800', fontSize: 13 },
  zoneBtnTextUnselected: { color: 'white' },

  bottomSubmit: {
    backgroundColor: '#4CAF50', borderRadius: 14,
    padding: 16, alignItems: 'center', marginTop: 12,
  },
  bottomSubmitDisabled: { backgroundColor: '#CCC' },
  bottomSubmitText: { color: 'white', fontWeight: '700', fontSize: 16 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, textAlign: 'center' },

  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#333', marginTop: 16 },
  successSub: { fontSize: 14, color: '#888', marginTop: 8 },
});
