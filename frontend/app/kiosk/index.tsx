import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, SafeAreaView,
  ScrollView, ActivityIndicator, Animated, useWindowDimensions, Image
} from 'react-native';
import { useRouter } from 'expo-router';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Avatar } from '../../src/components/Avatar';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const INDIGO = '#5C6BC0';
const ZONE_COLORS: Record<string,string> = EMOTION_COLOURS;
const ZONE_EMOJI: Record<string,string> = { blue:'😢', green:'😊', yellow:'😰', red:'😠' };
const INACTIVITY_TIMEOUT = 60000; // 60 seconds

export default function KioskScreen() {
  const { width } = useWindowDimensions();
  const CARD_W = (width - 48) / 3;
  const router = useRouter();
  const { t, setCurrentStudent } = useApp();
  const [students, setStudents] = useState<any[]>([]);
  const [presetAvatars, setPresetAvatars] = useState<any[]>([]);
  const [recentLogs, setRecentLogs] = useState<Record<string,any>>({});
  const [loading, setLoading] = useState(true);
  const [kioskToken, setKioskToken] = useState<string|null>(null);
  const [teacherName, setTeacherName] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [setupCode, setSetupCode] = useState('');
  const [setupMode, setSetupMode] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const inactivityTimer = useRef<any>(null);

  // Pulse animation for idle state
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Inactivity reset
  useEffect(() => {
    const reset = () => {
      setLastActivity(Date.now());
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      inactivityTimer.current = setTimeout(() => {
        // Auto-refresh student list after inactivity
        if (kioskToken) loadStudents(kioskToken);
      }, INACTIVITY_TIMEOUT);
    };
    reset();
    return () => { if (inactivityTimer.current) clearTimeout(inactivityTimer.current); };
  }, [kioskToken]);

  const loadKioskData = useCallback(async () => {
    const token = await AsyncStorage.getItem('kiosk_token');
    const tName = await AsyncStorage.getItem('kiosk_teacher_name') || '';
    const cName = await AsyncStorage.getItem('kiosk_classroom_name') || '';
    setTeacherName(tName);
    setClassroomName(cName);
    if (token) {
      setKioskToken(token);
      await loadStudents(token);
    } else {
      setSetupMode(true);
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKioskData(); }, [loadKioskData]);

  const loadStudents = async (token: string) => {
    setLoading(true);
    try {
      const [studentsRes, avatarsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/students`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/avatars/presets`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(Array.isArray(data) ? data : []);
        // Load recent checkins
        await loadRecentLogs(token, Array.isArray(data) ? data : []);
      }
      if (avatarsRes.ok) {
        const avData = await avatarsRes.json();
        setPresetAvatars(Array.isArray(avData) ? avData : []);
      }
    } catch {}
    setLoading(false);
  };

  const loadRecentLogs = async (token: string, studentList: any[]) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/zone-logs?days=1`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const logs = await res.json();
        const logMap: Record<string,any> = {};
        if (Array.isArray(logs)) {
          logs.forEach((log: any) => {
            if (!logMap[log.student_id] || new Date(log.timestamp) > new Date(logMap[log.student_id].timestamp)) {
              logMap[log.student_id] = log;
            }
          });
        }
        setRecentLogs(logMap);
      }
    } catch {}
  };

  const setupKiosk = async () => {
    if (!setupCode.trim()) return;
    setSetupLoading(true);
    // Real fix Aug 31 (build-26, kiosk pairing): this used to silently treat ANY failed/garbage
    // code as a literal working session token on both the non-ok and network-error paths -
    // meaning a mistyped or expired code looked like a successful setup (empty student list,
    // no error shown) instead of a real, understandable failure. Now surfaces the real error.
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/kiosk-setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: setupCode.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        await AsyncStorage.setItem('kiosk_token', data.token);
        await AsyncStorage.setItem('kiosk_teacher_name', data.teacher_name || '');
        await AsyncStorage.setItem('kiosk_classroom_name', data.classroom_name || '');
        setKioskToken(data.token);
        setTeacherName(data.teacher_name || '');
        setClassroomName(data.classroom_name || '');
        setSetupMode(false);
        setSetupCode('');
        await loadStudents(data.token);
      } else {
        setSetupError(data.detail || t('kiosk_setup_error') || 'That code is invalid or expired. Ask your teacher for a new one.');
        setSetupCode('');
      }
    } catch (e: any) {
      setSetupError(t('kiosk_setup_network_error') || 'Could not reach the server. Check the connection and try again.');
    }
    setSetupLoading(false);
  };

  const resetKiosk = async () => {
    await AsyncStorage.removeItem('kiosk_token');
    await AsyncStorage.removeItem('kiosk_teacher_name');
    await AsyncStorage.removeItem('kiosk_classroom_name');
    setKioskToken(null);
    setStudents([]);
    setSetupMode(true);
    setSetupCode('');
  };

  const handleStudentPress = (student: any) => {
    setLastActivity(Date.now());
    // Real fix Aug 30 (build-26, kiosk restore): zone.tsx (and every screen after it) reads
    // the checking-in student from AppContext's currentStudent, not from URL params - the
    // studentId/studentName/fromKiosk params this used to pass were silently ignored, so
    // tapping a student here always landed on zone.tsx's "no student selected" state. Matches
    // the exact pattern student/select.tsx's handleSelectStudent uses for the same handoff.
    const enriched = {
      ...student,
      is_family_member: !!(student as any).is_family_member,
      family_member_id: (student as any).family_member_id || null,
    };
    setCurrentStudent(enriched as any);
    router.push({ pathname: '/student/zone', params: { returnTo: 'kiosk' } });
  };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    // Real fix Aug 30 (build-26, kiosk restore): matches the exact pattern already used in
    // parent/widget.tsx and teacher/widget.tsx - unit letters stay literal, only "ago" is t().
    if (mins < 2) return t('just_now') || 'Just now';
    if (mins < 60) return `${mins}m ${t('minutes_ago') || 'ago'}`;
    return `${Math.floor(mins/60)}h ${t('hours_ago') || 'ago'}`;
  };

  // Setup screen
  if (setupMode) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.setupScreen}>
          {/* COH Branding */}
          <View style={st.brandBox}>
            <Text style={st.brandEmoji}>😊</Text>
            <Text style={st.brandTitle}>Class of Happiness</Text>
            <Text style={st.brandTagline}>{t('kiosk_tagline') || 'Emotional Wellbeing for Schools'}</Text>
          </View>

          <View style={st.setupCard}>
            <Text style={st.setupTitle}>{t('kiosk_setup_title') || 'Set Up Classroom Kiosk'}</Text>
            <Text style={st.setupHint}>
              {t('kiosk_setup_hint') || "Ask your teacher for a 6-digit code from their Class Check-In screen, and enter it below to link this device to your classroom."}
            </Text>
            <View style={st.codeInput}>
              {setupCode.split('').map((c, i) => (
                <View key={i} style={st.codeDot}><Text style={st.codeDotText}>{c}</Text></View>
              ))}
              {Array.from({length: Math.max(0, 6 - setupCode.length)}).map((_, i) => (
                <View key={`e${i}`} style={[st.codeDot, {opacity:0.3}]}><Text style={st.codeDotText}>·</Text></View>
              ))}
            </View>
            {setupError && (
              <Text style={st.setupErrorText}>{setupError}</Text>
            )}
            {/* Number pad */}
            <View style={st.numPad}>
              {['1','2','3','4','5','6','7','8','9','←','0','✓'].map(k => (
                <TouchableOpacity key={k} style={[st.numKey, k==='✓' && {backgroundColor:INDIGO}]}
                  onPress={() => {
                    setSetupError(null);
                    if (k === '←') setSetupCode(c => c.slice(0,-1));
                    else if (k === '✓') setupKiosk();
                    else setSetupCode(c => (c.length < 6 ? c + k : c));
                  }}>
                  {setupLoading && k === '✓'
                    ? <ActivityIndicator color="white" size="small"/>
                    : <Text style={[st.numKeyText, k==='✓' && {color:'white'}]}>{k}</Text>
                  }
                </TouchableOpacity>
              ))}
            </View>
            <Text style={st.setupHint}>
              {t('kiosk_setup_token_hint') || 'Codes expire after 10 minutes - if yours stopped working, ask your teacher to generate a new one.'}
            </Text>
          </View>

          <Text style={st.copyright}>© {new Date().getFullYear()} Class of Happiness · classofhappiness.com</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View style={st.headerBrand}>
          <Text style={st.headerEmoji}>😊</Text>
          <View>
            <Text style={st.headerTitle}>Class of Happiness</Text>
            {classroomName ? <Text style={st.headerSub}>{classroomName}{teacherName ? ` · ${teacherName}` : ''}</Text> : null}
          </View>
        </View>
        <TouchableOpacity onPress={() => loadStudents(kioskToken!)} style={st.refreshBtn}>
          <MaterialIcons name="refresh" size={22} color={INDIGO} />
        </TouchableOpacity>
      </View>

      {/* Main prompt */}
      <Animated.View style={[st.promptBox, { transform: [{ scale: pulseAnim }] }]}>
        <Text style={st.promptTitle}>{t('how_are_you_feeling') || 'How are you feeling today?'}</Text>
        <Text style={st.promptSub}>{t('kiosk_tap_name_hint') || 'Tap your name to check in'} 👇</Text>
      </Animated.View>

      {/* Student grid */}
      {loading ? (
        <View style={{ marginTop: 60 }}><EmotionColourLoader visible size={56} /></View>
      ) : students.length === 0 ? (
        <View style={st.emptyBox}>
          <Text style={{ fontSize: 48 }}>🏫</Text>
          <Text style={st.emptyText}>{t('no_students_found') || 'No students found'}</Text>
          <Text style={st.emptyHint}>{t('kiosk_no_students_hint') || 'Ask your teacher to add students to the class'}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={st.grid}>
          {students.map(student => {
            const log = recentLogs[student.id];
            const zone = log?.zone || log?.feeling_colour;
            const cfg = zone ? { color: ZONE_COLORS[zone], emoji: ZONE_EMOJI[zone] } : null;
            const checkedIn = !!log && (Date.now() - new Date(log.timestamp).getTime()) < 8 * 3600000;
            return (
              <TouchableOpacity
                key={student.id}
                style={[st.studentCard, { width: CARD_W }, checkedIn && { borderColor: cfg?.color || INDIGO, borderWidth: 3, backgroundColor: (cfg?.color || INDIGO) + '10' }]}
                onPress={() => handleStudentPress(student)}
                activeOpacity={0.75}>
                {checkedIn && (
                  <View style={[st.checkedBadge, { backgroundColor: cfg?.color || INDIGO }]}>
                    <Text style={{ fontSize: 14 }}>{cfg?.emoji || '✅'}</Text>
                  </View>
                )}
                <Avatar
                  type={student.avatar_type || 'preset'}
                  preset={student.avatar_preset || 'bear'}
                  custom={student.avatar_custom}
                  size={64}
                  presetAvatars={presetAvatars}
                />
                <Text style={st.studentName} numberOfLines={1}>{student.name}</Text>
                {checkedIn ? (
                  <Text style={[st.checkinTime, { color: cfg?.color || INDIGO }]}>{timeAgo(log.timestamp)}</Text>
                ) : (
                  <Text style={st.notCheckedIn}>{t('tap_to_check_in') || 'Tap to check in'}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Footer */}
      <View style={st.footer}>
        <Text style={st.footerText}>© {new Date().getFullYear()} Class of Happiness · classofhappiness.com</Text>
        <TouchableOpacity onPress={resetKiosk} style={st.resetBtn}>
          <MaterialIcons name="settings" size={14} color="#CCC" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  // Setup
  setupScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 24 },
  brandBox: { alignItems: 'center', gap: 6 },
  brandEmoji: { fontSize: 64 },
  brandTitle: { fontSize: 28, fontWeight: '800', color: INDIGO },
  brandTagline: { fontSize: 14, color: '#888' },
  setupCard: { width: '100%', backgroundColor: 'white', borderRadius: 20, padding: 24, gap: 16, elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 },
  setupTitle: { fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center' },
  setupHint: { fontSize: 12, color: '#888', textAlign: 'center', lineHeight: 18 },
  setupErrorText: { fontSize: 13, color: '#E74C3C', textAlign: 'center', fontWeight: '600' },
  codeInput: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 8 },
  codeDot: { width: 36, height: 44, backgroundColor: '#F0F0F0', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  codeDotText: { fontSize: 18, fontWeight: '700', color: INDIGO },
  numPad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  numKey: { width: 72, height: 52, backgroundColor: '#F0F0F0', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  numKeyText: { fontSize: 20, fontWeight: '600', color: '#333' },
  copyright: { fontSize: 11, color: '#CCC', textAlign: 'center' },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 28 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INDIGO },
  headerSub: { fontSize: 11, color: '#888' },
  refreshBtn: { padding: 8 },
  // Prompt
  promptBox: { alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16 },
  promptTitle: { fontSize: 24, fontWeight: '800', color: '#333', textAlign: 'center' },
  promptSub: { fontSize: 14, color: '#888', marginTop: 6 },
  // Grid
  grid: { padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
  studentCard: { backgroundColor: 'white', borderRadius: 16, padding: 12, alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: '#E8E8E8', elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  checkedBadge: { position: 'absolute', top: -6, right: -6, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  studentName: { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'center' },
  checkinTime: { fontSize: 10, fontWeight: '600' },
  notCheckedIn: { fontSize: 10, color: '#BBB' },
  // Empty
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#999' },
  emptyHint: { fontSize: 13, color: '#BBB', textAlign: 'center' },
  // Footer
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  footerText: { fontSize: 10, color: '#CCC' },
  resetBtn: { padding: 4 },
});
