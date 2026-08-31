import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, useWindowDimensions, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const INDIGO = '#5C6BC0';
const ZONE_COLORS: Record<string,string> = EMOTION_COLOURS;
const ZONE_EMOJI: Record<string,string> = { blue:'😢', green:'😊', yellow:'😰', red:'😠' };
const ZONE_LABELS: Record<string,string> = { blue:'Blue', green:'Green', yellow:'Yellow', red:'Red' };

export default function TeacherWidgetScreen() {
  const { width } = useWindowDimensions();
  const CARD_SIZE = (width - 48) / 4;
  const router = useRouter();
  const { t, user, students, classrooms } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string|null>(null);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const [logsRes, alertsRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/zone-logs?days=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (logsRes.ok) {
        const data = await logsRes.json();
        setRecentLogs(Array.isArray(data) ? data : []);
      }
      if (alertsRes.ok) {
        const aData = await alertsRes.json();
        setAlerts(Array.isArray(aData) ? aData.filter((a:any) => !a.resolved) : []);
      }
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Get latest log per student
  const latestByStudent: Record<string,any> = {};
  recentLogs.forEach(log => {
    const sid = log.student_id;
    if (!latestByStudent[sid] || new Date(log.timestamp) > new Date(latestByStudent[sid].timestamp)) {
      latestByStudent[sid] = log;
    }
  });

  const filteredStudents = selectedClassroom
    ? students.filter(s => s.classroom_id === selectedClassroom)
    : students;

  const checkedInCount = filteredStudents.filter(s => latestByStudent[s.id]).length;
  const total = filteredStudents.length;

  // Zone distribution
  const zoneDist: Record<string,number> = { green:0, yellow:0, blue:0, red:0 };
  filteredStudents.forEach(s => {
    const z = latestByStudent[s.id]?.zone || latestByStudent[s.id]?.feeling_colour;
    if (z && zoneDist[z] !== undefined) zoneDist[z]++;
  });

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return t('just_now') || 'Just now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins/60)}h`;
  };

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>😊 {t('classroom_widget') || 'Classroom Widget'}</Text>
          <Text style={st.headerSub}>{checkedInCount}/{total} {t('check_ins') || 'checked in today'}</Text>
        </View>
        {alerts.length > 0 && (
          <TouchableOpacity onPress={() => router.push('/teacher/alerts')} style={st.alertBadge}>
            <Text style={st.alertBadgeText}>{alerts.length}</Text>
            <MaterialIcons name="notifications-active" size={18} color="white" />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onRefresh} style={{ padding: 8 }}>
          <MaterialIcons name="refresh" size={22} color={INDIGO} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {/* Classroom filter */}
        {classrooms.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, paddingVertical: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity
                style={[st.classChip, !selectedClassroom && st.classChipActive]}
                onPress={() => setSelectedClassroom(null)}>
                <Text style={[st.classChipText, !selectedClassroom && st.classChipTextActive]}>
                  {t('zone_all') || 'All'}
                </Text>
              </TouchableOpacity>
              {classrooms.map(c => (
                <TouchableOpacity key={c.id}
                  style={[st.classChip, selectedClassroom === c.id && st.classChipActive]}
                  onPress={() => setSelectedClassroom(c.id)}>
                  <Text style={[st.classChipText, selectedClassroom === c.id && st.classChipTextActive]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}

        {/* Zone distribution bar */}
        {checkedInCount > 0 && (
          <View style={st.distCard}>
            <Text style={st.distTitle}>{t('emotion_distribution') || 'Class Emotions Today'}</Text>
            <View style={st.distBar}>
              {(['green','yellow','blue','red'] as const).map(z => {
                const pct = total > 0 ? (zoneDist[z] / total) * 100 : 0;
                return pct > 0 ? (
                  <View key={z} style={{ width: `${pct}%` as any, height: '100%', backgroundColor: ZONE_COLORS[z] }} />
                ) : null;
              })}
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
              {(['green','yellow','blue','red'] as const).map(z => zoneDist[z] > 0 ? (
                <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: 16 }}>{ZONE_EMOJI[z]}</Text>
                  <Text style={{ fontSize: 12, color: ZONE_COLORS[z], fontWeight: '700' }}>{zoneDist[z]}</Text>
                </View>
              ) : null)}
              <Text style={{ fontSize: 12, color: '#AAA', marginLeft: 'auto' as any }}>
                {total - checkedInCount} {t('no_checkin_yet') || 'not checked in'}
              </Text>
            </View>
          </View>
        )}

        {/* Alerts section */}
        {alerts.length > 0 && (
          <View style={[st.distCard, { borderLeftWidth: 4, borderLeftColor: '#F44336' }]}>
            {/* Real fix (i18n sweep): `t('no_alerts') ? '' : 'Support Request'` always evaluated
                to '' - t('no_alerts') resolves to a real, non-empty string ("No pending alerts")
                whenever the key exists, so the ternary's true branch always fired and "Support
                Request(s)" never rendered at all. */}
            <Text style={[st.distTitle, { color: '#F44336' }]}>
              🚨 {alerts.length} {alerts.length > 1 ? (t('support_requests_plural') || 'Support Requests') : (t('request_support') || 'Support Request')}
            </Text>
            {alerts.slice(0, 3).map((alert, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <MaterialIcons name="notifications-active" size={16} color="#F44336" />
                <Text style={{ fontSize: 12, color: '#333', flex: 1 }}>
                  {(t('student_needs_support') || '{name} needs support').replace('{name}', students.find(s => s.id === alert.student_id)?.name || (t('student') || 'Student'))}
                </Text>
                <Text style={{ fontSize: 11, color: '#AAA' }}>{timeAgo(alert.created_at)}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => router.push('/teacher/alerts')} style={{ marginTop: 10 }}>
              <Text style={{ fontSize: 12, color: '#F44336', fontWeight: '700' }}>
                {t('view_all_alerts') || 'View all alerts'} →
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Student grid */}
        {loading ? (
          <View style={{ marginTop: 40 }}><EmotionColourLoader visible size={56} /></View>
        ) : (
          <View style={{ padding: 16 }}>
            <Text style={st.distTitle}>{t('students_in_class') || 'Students'}</Text>
            <View style={st.studentGrid}>
              {filteredStudents.map(student => {
                const log = latestByStudent[student.id];
                const zone = log?.zone || log?.feeling_colour;
                const color = zone ? ZONE_COLORS[zone] : '#E0E0E0';
                const emoji = zone ? ZONE_EMOJI[zone] : '😶';
                const hasAlert = alerts.some(a => a.student_id === student.id);
                return (
                  <TouchableOpacity
                    key={student.id}
                    style={[st.studentCard, { width: CARD_SIZE }, { borderColor: color }]}
                    onPress={() => router.push({ pathname: '/teacher/student-detail', params: { studentId: student.id } })}>
                    {hasAlert && (
                      <View style={st.alertDot}>
                        <MaterialIcons name="priority-high" size={10} color="white" />
                      </View>
                    )}
                    <Text style={{ fontSize: 28 }}>{emoji}</Text>
                    <Text style={st.studentName} numberOfLines={1}>{student.name.split(' ')[0]}</Text>
                    {log ? (
                      <Text style={[st.studentTime, { color }]}>{timeAgo(log.timestamp)}</Text>
                    ) : (
                      <Text style={st.studentNotIn}>—</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Kiosk launcher */}
        <View style={st.kioskCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.kioskTitle}>📱 {t('classroom_kiosk_title') || 'Classroom Kiosk'}</Text>
            <Text style={st.kioskHint}>{t('classroom_kiosk_hint') || 'Let students check in from this shared device'}</Text>
          </View>
          <TouchableOpacity style={st.kioskBtn} onPress={() => router.push('/kiosk')}>
            <Text style={st.kioskBtnText}>{t('checkin_btn') || 'Launch'}</Text>
            <MaterialIcons name="open-in-new" size={14} color="white" />
          </TouchableOpacity>
        </View>

        {/* My wellbeing */}
        <TouchableOpacity style={st.myWellbeing} onPress={() => router.push('/teacher/checkin')}>
          <MaterialIcons name="spa" size={20} color={INDIGO} />
          <Text style={st.myWellbeingText}>{t('teacher_checkin') || 'Check in on my own wellbeing'}</Text>
          <MaterialIcons name="chevron-right" size={18} color={INDIGO} />
        </TouchableOpacity>

        {/* COH branding footer */}
        <Text style={st.copyright}>😊 {(t('widget_copyright') || 'Class of Happiness · classofhappiness.com · © {year}').replace('{year}', String(new Date().getFullYear()))}</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F44336', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  alertBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
  classChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0' },
  classChipActive: { backgroundColor: INDIGO },
  classChipText: { fontSize: 12, color: '#666', fontWeight: '600' },
  classChipTextActive: { color: 'white' },
  distCard: { margin: 16, backgroundColor: 'white', borderRadius: 14, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 },
  distTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  distBar: { height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#F0F0F0', flexDirection: 'row' },
  studentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  studentCard: { backgroundColor: 'white', borderRadius: 12, padding: 8, alignItems: 'center', gap: 4, borderWidth: 2, elevation: 1 },
  alertDot: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  studentName: { fontSize: 11, fontWeight: '700', color: '#333', textAlign: 'center' },
  studentTime: { fontSize: 9, fontWeight: '600' },
  studentNotIn: { fontSize: 11, color: '#CCC' },
  kioskCard: { margin: 16, flexDirection: 'row', alignItems: 'center', backgroundColor: INDIGO + '12', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: INDIGO + '30', gap: 12 },
  kioskTitle: { fontSize: 14, fontWeight: '700', color: INDIGO },
  kioskHint: { fontSize: 11, color: '#888', marginTop: 2 },
  kioskBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: INDIGO, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  kioskBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  myWellbeing: { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: 'white', borderRadius: 14, padding: 14, gap: 10, elevation: 1 },
  myWellbeingText: { flex: 1, fontSize: 13, fontWeight: '600', color: INDIGO },
  copyright: { textAlign: 'center', fontSize: 10, color: '#CCC', marginTop: 8, marginBottom: 20 },
});
