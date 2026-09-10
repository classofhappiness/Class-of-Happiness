import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { supportRequestsApi, SupportRequestType, StaffShortcut } from '../../src/utils/api';

const RECENTS_KEY = 'support_request_recent_staff_names';
const MAX_RECENTS = 5;

type Step = 'classroom' | 'student' | 'type' | 'detail' | 'success';

const REQUEST_TYPES: { type: SupportRequestType; icon: keyof typeof MaterialIcons.glyphMap; label: string; needsTarget?: 'staff' | 'note' }[] = [
  { type: 'STAFF_MEMBER', icon: 'person-search', label: 'Student to a staff member', needsTarget: 'staff' },
  { type: 'BACK_ON_TRACK', icon: 'self-improvement', label: "Student to 'Back on Track' Space" },
  { type: 'INCIDENT', icon: 'warning', label: 'Incident — urgent' },
  { type: 'OTHER', icon: 'more-horiz', label: 'Other', needsTarget: 'note' },
];

// Real feature Sep 10 (build 27): teacher-side entry point for the Support Request
// "buzz" system. Mirrors bulk-checkin.tsx's classroom -> student picker structure and
// styling exactly (same header/row-card/success-screen conventions) rather than
// inventing a new pattern. Ordering follows the brief precisely: classroom/student
// first, then request type - CLASSROOM_SUPPORT is reached via "Whole classroom" on the
// student step (schema-consistent: that type carries no student_id at all), every other
// type requires picking a real student first.
export default function SupportRequestScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { classrooms, students, t } = useApp();

  const [step, setStep] = useState<Step>('classroom');
  const [classroomId, setClassroomId] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [requestType, setRequestType] = useState<SupportRequestType | null>(null);
  const [targetText, setTargetText] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [shortcuts, setShortcuts] = useState<StaffShortcut[]>([]);
  const [saving, setSaving] = useState(false);

  const classroomStudents = (students || []).filter((s: any) => s.classroom_id === classroomId);

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY).then(raw => {
      if (raw) { try { setRecents(JSON.parse(raw)); } catch {} }
    });
    supportRequestsApi.getShortcuts().then(setShortcuts).catch(() => {});
  }, []);

  const pickClassroom = (c: any) => {
    setClassroomId(c.id); setClassroomName(c.name); setStep('student');
  };

  const pickWholeClassroom = () => {
    setStudentId(null); setStudentName('');
    setRequestType('CLASSROOM_SUPPORT');
    setStep('detail');
  };

  const pickStudent = (s: any) => {
    setStudentId(s.id); setStudentName(s.name); setStep('type');
  };

  const pickType = (type: SupportRequestType) => {
    setRequestType(type);
    const needsTarget = REQUEST_TYPES.find(r => r.type === type)?.needsTarget;
    if (needsTarget) { setTargetText(''); setStep('detail'); }
    else { handleSubmit(type, ''); }
  };

  const saveRecent = async (name: string) => {
    const next = [name, ...recents.filter(n => n !== name)].slice(0, MAX_RECENTS);
    setRecents(next);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  };

  const handleSubmit = async (typeOverride?: SupportRequestType, textOverride?: string) => {
    const finalType = typeOverride || requestType;
    const finalText = textOverride !== undefined ? textOverride : targetText;
    if (!finalType) return;
    if (finalType === 'STAFF_MEMBER' && !finalText.trim()) {
      Alert.alert(t('error') || 'Error', 'Enter a staff member name');
      return;
    }
    setSaving(true);
    try {
      await supportRequestsApi.create({
        request_type: finalType,
        student_id: studentId || undefined,
        classroom_id: finalType === 'CLASSROOM_SUPPORT' ? classroomId : undefined,
        target_text: finalText.trim() || undefined,
      });
      if (finalType === 'STAFF_MEMBER' && finalText.trim()) {
        await saveRecent(finalText.trim());
      }
      setStep('success');
      setTimeout(() => router.back(), 1500);
    } catch (e: any) {
      Alert.alert(t('error') || 'Error', e.message || 'Could not send request');
    } finally {
      setSaving(false);
    }
  };

  if (step === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successScreen}>
          <MaterialIcons name="check-circle" size={80} color="#4CAF50" />
          <Text style={styles.successTitle}>Request sent</Text>
          <Text style={styles.successSub}>The school admin has been notified</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'classroom') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>🔔 Support Request</Text>
            <Text style={styles.headerSub}>Select a classroom</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          {(classrooms || []).length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="school" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No classrooms yet</Text>
            </View>
          ) : (classrooms || []).map((c: any) => (
            <TouchableOpacity key={c.id} style={styles.rowCard} onPress={() => pickClassroom(c)}>
              <MaterialIcons name="school" size={24} color="#5C6BC0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.rowSub}>{(students || []).filter((s: any) => s.classroom_id === c.id).length} students</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'student') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('classroom')} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{classroomName}</Text>
            <Text style={styles.headerSub}>Select a student, or the whole classroom</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <TouchableOpacity style={[styles.rowCard, styles.wholeClassCard]} onPress={pickWholeClassroom}>
            <MaterialIcons name="groups" size={24} color="#5C6BC0" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>Whole classroom</Text>
              <Text style={styles.rowSub}>Support to the classroom — no specific student</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>
          {classroomStudents.map((s: any) => (
            <TouchableOpacity key={s.id} style={styles.rowCard} onPress={() => pickStudent(s)}>
              <Avatar type={s.avatar_type || 'preset'} preset={s.avatar_preset} custom={s.avatar_custom} size={36} />
              <Text style={[styles.rowTitle, { flex: 1 }]}>{s.name}</Text>
              <MaterialIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'type') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setStep('student')} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{studentName}</Text>
            <Text style={styles.headerSub}>What's needed?</Text>
          </View>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          {REQUEST_TYPES.map(rt => (
            <TouchableOpacity
              key={rt.type}
              style={[styles.rowCard, rt.type === 'INCIDENT' && styles.incidentCard]}
              onPress={() => pickType(rt.type)}
            >
              <MaterialIcons name={rt.icon} size={24} color={rt.type === 'INCIDENT' ? '#F44336' : '#5C6BC0'} />
              <Text style={[styles.rowTitle, { flex: 1 }, rt.type === 'INCIDENT' && styles.incidentText]}>{rt.label}</Text>
              <MaterialIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // step === 'detail'
  const needsStaffPicker = requestType === 'STAFF_MEMBER';
  const isClassroomSupport = requestType === 'CLASSROOM_SUPPORT';
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep(isClassroomSupport ? 'student' : 'type')} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{isClassroomSupport ? 'Whole classroom' : studentName}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {isClassroomSupport ? (
          <Text style={styles.rowSub}>Someone will come to {classroomName} to help.</Text>
        ) : needsStaffPicker ? (
          <>
            <Text style={styles.sectionLabel}>Who?</Text>
            {(recents.length > 0 || shortcuts.length > 0) && (
              <View style={styles.chipRow}>
                {shortcuts.map(sc => (
                  <TouchableOpacity key={sc.id} style={styles.chip} onPress={() => setTargetText(sc.name)}>
                    <Text style={styles.chipText}>{sc.name}</Text>
                  </TouchableOpacity>
                ))}
                {recents.filter(r => !shortcuts.some(sc => sc.name === r)).map(name => (
                  <TouchableOpacity key={name} style={styles.chip} onPress={() => setTargetText(name)}>
                    <Text style={styles.chipText}>🕓 {name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Staff member's name"
              value={targetText}
              onChangeText={setTargetText}
            />
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="What's needed?"
              value={targetText}
              onChangeText={setTargetText}
              multiline
            />
          </>
        )}
        <TouchableOpacity style={styles.bottomSubmit} onPress={() => handleSubmit()} disabled={saving}>
          {saving ? <ActivityIndicator color="white" /> : <Text style={styles.bottomSubmitText}>Send Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'white', paddingHorizontal: 12, paddingVertical: 10, paddingTop: 16,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8,
  },
  backBtn: { padding: 6 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  wholeClassCard: { backgroundColor: '#EEF1FB' },
  incidentCard: { borderColor: '#F44336', borderWidth: 1.5 },
  incidentText: { color: '#F44336', fontWeight: '800' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#555' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { backgroundColor: '#EEF1FB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#5C6BC0' },
  input: {
    backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0',
    padding: 12, fontSize: 15, color: '#333',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  bottomSubmit: { backgroundColor: '#4CAF50', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  bottomSubmitText: { color: 'white', fontWeight: '700', fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, textAlign: 'center' },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#333', marginTop: 16 },
  successSub: { fontSize: 14, color: '#888', marginTop: 8 },
});
