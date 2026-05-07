import React, { useState, useLayoutEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, RefreshControl, Dimensions,
} from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { registerForPushNotifications } from '../../src/utils/notifications';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_EMOJI: Record<string, string> = {
  blue: '🔵', green: '🟢', yellow: '🟡', red: '🔴',
};

type Tab = 'today' | 'week' | 'students';

export default function TeacherDashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, students, classrooms, presetAvatars, refreshStudents, refreshClassrooms, t } = useApp();
  const [tab, setTab] = useState<Tab>('today');
  const [recentLogs, setRecentLogs] = useState<ZoneLog[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [todaySnap, setTodaySnap] = useState({ blue: 0, green: 0, yellow: 0, red: 0, total: 0 });
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [alertCount, setAlertCount] = useState(0);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    registerForPushNotifications().catch(() => {});
  }, [navigation]);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const headers = { Authorization: `Bearer ${token}` };
      const [logsData, analyticsData, alertsData] = await Promise.all([
        zoneLogsApi.getAll(undefined, undefined, 7).catch(() => []),
        fetch(`${BACKEND_URL}/api/analytics/classroom/all?days=7`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const logs = Array.isArray(logsData) ? logsData : [];
      setRecentLogs(logs);
      setAnalytics(analyticsData);
      setAlertCount(Array.isArray(alertsData) ? alertsData.filter((a: any) => !a.resolved).length : 0);
      const today = new Date().toISOString().split('T')[0];
      const todayLogs = logs.filter((l: any) => (l.timestamp || '').startsWith(today));
      const snap: any = { blue: 0, green: 0, yellow: 0, red: 0, total: todayLogs.length };
      todayLogs.forEach((l: any) => { const z = l.zone || l.feeling_colour || ''; if (z in snap) snap[z]++; });
      setTodaySnap(snap);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadData();
    refreshStudents();
    refreshClassrooms();
  }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const getStudentName = (id: string) => students.find(s => s.id === id)?.name || 'Student';
  const getStudent = (id: string) => students.find(s => s.id === id);
  const formatTime = (ts: string) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
  };

  const filteredLogs = selectedClassroom
    ? recentLogs.filter(l => getStudent(l.student_id)?.classroom_id === selectedClassroom)
    : recentLogs;

  const chartData = [
    { value: analytics?.zone_counts?.blue || 0, frontColor: ZONE_COLORS.blue, label: '🔵' },
    { value: analytics?.zone_counts?.green || 0, frontColor: ZONE_COLORS.green, label: '🟢' },
    { value: analytics?.zone_counts?.yellow || 0, frontColor: ZONE_COLORS.yellow, label: '🟡' },
    { value: analytics?.zone_counts?.red || 0, frontColor: ZONE_COLORS.red, label: '🔴' },
  ];

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <View>
          <Text style={st.headerTitle}>{t('teacher_dashboard') || 'Dashboard'}</Text>
          <Text style={st.headerSub}>{students.length} {t('students') || 'students'} · {classrooms.length} {t('classrooms') || 'classes'}</Text>
        </View>
        <View style={st.headerRight}>
          <TouchableOpacity style={st.alertBtn} onPress={() => router.push('/teacher/alerts')}>
            <MaterialIcons name="notifications" size={22} color="#5C6BC0" />
            {alertCount > 0 && (
              <View style={st.alertBadge}><Text style={st.alertBadgeTxt}>{alertCount}</Text></View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={st.checkinBtn} onPress={() => router.push('/teacher/checkin')}>
            <MaterialIcons name="self-improvement" size={15} color="white" />
            <Text style={st.checkinBtnTxt}>Check In</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Mood Snapshot Pills */}
      <View style={st.snapRow}>
        {(['blue','green','yellow','red'] as const).map(z => (
          <View key={z} style={[st.snapPill, { borderColor: ZONE_COLORS[z] + '40', backgroundColor: ZONE_COLORS[z] + '12' }]}>
            <Text style={st.snapEmoji}>{ZONE_EMOJI[z]}</Text>
            <Text style={[st.snapCount, { color: ZONE_COLORS[z] }]}>{todaySnap[z]}</Text>
          </View>
        ))}
        <View style={[st.snapPill, { borderColor: '#5C6BC020', backgroundColor: '#F3F4FF' }]}>
          <MaterialIcons name="today" size={13} color="#5C6BC0" />
          <Text style={[st.snapCount, { color: '#5C6BC0' }]}>{todaySnap.total}</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={st.tabs}>
        {(['today','week','students'] as Tab[]).map(tb => (
          <TouchableOpacity key={tb} style={[st.tab, tab === tb && st.tabActive]} onPress={() => setTab(tb)}>
            <Text style={[st.tabTxt, tab === tb && st.tabTxtActive]}>
              {tb === 'today' ? (t('today') || 'Today') : tb === 'week' ? (t('week') || 'Week') : (t('students') || 'Students')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={st.tabContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}>

        {/* TODAY */}
        {tab === 'today' && (
          <>
            {classrooms.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity style={[st.chip, !selectedClassroom && st.chipActive]} onPress={() => setSelectedClassroom(null)}>
                    <Text style={[st.chipTxt, !selectedClassroom && st.chipTxtActive]}>{t('all') || 'All'}</Text>
                  </TouchableOpacity>
                  {classrooms.map(c => (
                    <TouchableOpacity key={c.id} style={[st.chip, selectedClassroom === c.id && st.chipActive]} onPress={() => setSelectedClassroom(c.id)}>
                      <Text style={[st.chipTxt, selectedClassroom === c.id && st.chipTxtActive]}>{c.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}
            {filteredLogs.length === 0 ? (
              <View style={st.empty}>
                <Text style={{ fontSize: 36 }}>📋</Text>
                <Text style={st.emptyTxt}>{t('no_recent_checkins') || 'No check-ins yet'}</Text>
              </View>
            ) : (
              filteredLogs.slice(0, 15).map(log => {
                const student = getStudent(log.student_id);
                const zone = (log as any).zone || (log as any).feeling_colour || '';
                return (
                  <TouchableOpacity key={log.id} style={st.logCard}
                    onPress={() => router.push({ pathname: '/teacher/student-detail', params: { studentId: log.student_id } })}>
                    <Avatar type={student?.avatar_type || 'preset'} preset={student?.avatar_preset}
                      custom={student?.avatar_custom} size={40} presetAvatars={presetAvatars} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={st.logName}>{getStudentName(log.student_id)}</Text>
                        {(log as any).logged_by === 'parent' && (
                          <View style={st.homeBadge}><Text style={st.homeBadgeTxt}>HOME</Text></View>
                        )}
                      </View>
                      {(log as any).strategies_selected?.length > 0 && (
                        <Text style={st.logStrats} numberOfLines={1}>
                          {(log as any).strategies_selected.slice(0,2).join(', ')}
                          {(log as any).strategies_selected.length > 2 ? ` +${(log as any).strategies_selected.length-2}` : ''}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      <View style={[st.zonePill, { backgroundColor: ZONE_COLORS[zone] || '#999' }]}>
                        <Text style={st.zonePillTxt}>{ZONE_EMOJI[zone] || '💙'}</Text>
                      </View>
                      <Text style={st.logTime}>{formatTime((log as any).timestamp)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            <View style={st.quickNav}>
              <TouchableOpacity style={st.quickNavBtn} onPress={() => router.push('/teacher/resources')}>
                <MaterialIcons name="library-books" size={20} color="#5C6BC0" />
                <Text style={st.quickNavTxt}>{t('resources') || 'Resources'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.quickNavBtn} onPress={() => router.push('/teacher/students')}>
                <MaterialIcons name="people" size={20} color="#4CAF50" />
                <Text style={st.quickNavTxt}>{t('students') || 'Students'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.quickNavBtn} onPress={() => router.push('/teacher/widget')}>
                <MaterialIcons name="widgets" size={20} color="#9C27B0" />
                <Text style={st.quickNavTxt}>Widget</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* WEEK */}
        {tab === 'week' && (
          <View style={st.card}>
            <Text style={st.cardTitle}>{t('class_mood_graph') || '7-Day Overview'}</Text>
            {chartData.reduce((a,d) => a+d.value,0) > 0 ? (
              <>
                <BarChart data={chartData} barWidth={44} spacing={20} roundedTop
                  xAxisThickness={0} yAxisThickness={0}
                  yAxisTextStyle={{ color: '#999', fontSize: 10 }}
                  noOfSections={3}
                  maxValue={Math.max(...chartData.map(d => d.value),1)+1}
                  isAnimated barBorderRadius={6} width={width - 80}
                  xAxisLabelTextStyle={{ fontSize: 16, color: '#666', width: 50, textAlign: 'center' }}
                />
                <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                  {(['blue','green','yellow','red'] as const).map(z => (
                    <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: ZONE_COLORS[z] }} />
                      <Text style={{ fontSize: 11, color: '#666' }}>{analytics?.zone_counts?.[z] || 0}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <View style={st.empty}>
                <Text style={{ fontSize: 36 }}>📊</Text>
                <Text style={st.emptyTxt}>{t('no_data_yet') || 'No data this week'}</Text>
              </View>
            )}
          </View>
        )}

        {/* STUDENTS */}
        {tab === 'students' && (
          <>
            {students.length === 0 ? (
              <View style={st.empty}>
                <Text style={{ fontSize: 36 }}>👥</Text>
                <Text style={st.emptyTxt}>{t('add_first_student') || 'Add your first student'}</Text>
                <TouchableOpacity style={st.addBtn} onPress={() => router.push('/teacher/students')}>
                  <Text style={{ color: 'white', fontWeight: '700' }}>+ Add Student</Text>
                </TouchableOpacity>
              </View>
            ) : (
              students.map(student => (
                <TouchableOpacity key={student.id} style={st.logCard}
                  onPress={() => router.push({ pathname: '/teacher/student-detail', params: { studentId: student.id } })}>
                  <Avatar type={student.avatar_type || 'preset'} preset={student.avatar_preset}
                    custom={student.avatar_custom} size={40} presetAvatars={presetAvatars} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={st.logName}>{student.name}</Text>
                    <Text style={st.logStrats}>{classrooms.find(c => c.id === student.classroom_id)?.name || '—'}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={20} color="#CCC" />
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E' },
  headerSub: { fontSize: 12, color: '#999', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertBtn: { position: 'relative', padding: 6 },
  alertBadge: { position: 'absolute', top: 2, right: 2, width: 16, height: 16, borderRadius: 8, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  alertBadgeTxt: { fontSize: 9, color: 'white', fontWeight: '700' },
  checkinBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#5C6BC0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  checkinBtnTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
  snapRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, marginBottom: 12 },
  snapPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  snapEmoji: { fontSize: 12 },
  snapCount: { fontSize: 15, fontWeight: '800' },
  tabs: { flexDirection: 'row', marginHorizontal: 20, backgroundColor: '#EDEDF5', borderRadius: 12, padding: 3, marginBottom: 12 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: 'white', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  tabTxt: { fontSize: 13, fontWeight: '600', color: '#999' },
  tabTxtActive: { color: '#5C6BC0', fontWeight: '700' },
  tabContent: { paddingHorizontal: 20, paddingBottom: 40 },
  logCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 14, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  logName: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  logStrats: { fontSize: 11, color: '#999', marginTop: 2 },
  logTime: { fontSize: 11, color: '#BBB' },
  zonePill: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  zonePillTxt: { fontSize: 14 },
  homeBadge: { backgroundColor: '#E8F5E9', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 },
  homeBadgeTxt: { fontSize: 9, color: '#4CAF50', fontWeight: '700' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#E0E0E0' },
  chipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  chipTxt: { fontSize: 13, color: '#666' },
  chipTxtActive: { color: 'white', fontWeight: '600' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 12 },
  quickNav: { flexDirection: 'row', gap: 10, marginTop: 8 },
  quickNavBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'white', borderRadius: 12, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  quickNavTxt: { fontSize: 12, fontWeight: '600', color: '#555' },
  empty: { alignItems: 'center', paddingTop: 48, gap: 10 },
  emptyTxt: { fontSize: 15, color: '#BBB', textAlign: 'center' },
  addBtn: { backgroundColor: '#5C6BC0', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 8 },
});
