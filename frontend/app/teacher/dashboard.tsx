import React, { useState, useEffect, useLayoutEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Dimensions,
  RefreshControl
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';

const { width } = Dimensions.get('window');

const ZONE_COLORS = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

export default function TeacherDashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user, students, classrooms, presetAvatars, refreshStudents, refreshClassrooms, t, language, translations } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 14 | 30>(7);
  const [recentLogs, setRecentLogs] = useState<ZoneLog[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [todaySnapshot, setTodaySnapshot] = useState({ blue: 0, green: 0, yellow: 0, red: 0, total: 0 });
  const [teacherCheckins, setTeacherCheckins] = useState<Array<{ id: string; zone: string; timestamp: string }>>([]);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  // Translated day names
  const getDayNames = () => {
    if (language === 'pt') {
      return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    }
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  };

  const DAY_NAMES = getDayNames();
  const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const fetchData = async () => {
    try {
      const logs = await zoneLogsApi.getAll(undefined, selectedClassroom || undefined, selectedPeriod);
      setRecentLogs(logs);

      const zoneCounts = { blue: 0, green: 0, yellow: 0, red: 0 };
      logs.forEach((log: ZoneLog) => {
        if (log.zone in zoneCounts) {
          zoneCounts[log.zone as keyof typeof zoneCounts]++;
        }
      });
      setAnalytics({ zone_counts: zoneCounts, total_logs: logs.length });

      const todayKey = new Date().toISOString().split('T')[0];
      const todayCounts = { blue: 0, green: 0, yellow: 0, red: 0 };
      logs.forEach((log: ZoneLog) => {
        if (!log.timestamp?.startsWith(todayKey)) return;
        if (log.zone in todayCounts) {
          todayCounts[log.zone as keyof typeof todayCounts]++;
        }
      });
      const todayTotal = Object.values(todayCounts).reduce((sum, value) => sum + value, 0);
      setTodaySnapshot({ ...todayCounts, total: todayTotal });

      if (user?.user_id) {
        const teacherCheckinRaw = await AsyncStorage.getItem(`teacher_checkins_${user.user_id}`);
        const teacherCheckinData = teacherCheckinRaw ? JSON.parse(teacherCheckinRaw) : [];
        setTeacherCheckins(teacherCheckinData.slice(0, 5));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedPeriod, selectedClassroom]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([refreshStudents(), refreshClassrooms(), fetchData()]);
    setRefreshing(false);
  };

  const getDayOfWeekKey = (dateStr: string): string => {
    const date = new Date(dateStr);
    return DAY_KEYS[date.getDay()];
  };

  const getWeeklyLogs = () => {
    const weekData: Record<string, { logs: ZoneLog[], times: string[] }> = {};
    DAY_KEYS.forEach(day => { weekData[day] = { logs: [], times: [] }; });
    recentLogs.forEach(log => {
      const dayKey = getDayOfWeekKey(log.timestamp);
      if (weekData[dayKey]) {
        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        weekData[dayKey].logs.push(log);
        weekData[dayKey].times.push(time);
      }
    });
    return weekData;
  };

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown';
  };

  const getStudent = (studentId: string) => {
    return students.find(s => s.id === studentId);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Translated zone labels for chart
  const getZoneLabel = (zone: string) => {
    const key = `${zone}_label`;
    return t(key) || (zone.charAt(0).toUpperCase() + zone.slice(1));
  };

  const chartData = analytics ? [
    { value: analytics.zone_counts.blue,   frontColor: ZONE_COLORS.blue,   label: getZoneLabel('blue') },
    { value: analytics.zone_counts.green,  frontColor: ZONE_COLORS.green,  label: getZoneLabel('green') },
    { value: analytics.zone_counts.yellow, frontColor: ZONE_COLORS.yellow, label: getZoneLabel('yellow') },
    { value: analytics.zone_counts.red,    frontColor: ZONE_COLORS.red,    label: getZoneLabel('red') },
  ] : [];

  const weeklyLogs = getWeeklyLogs();

  return (
    <View style={styles.container}>
      {/* ✅ Fixed: Teacher Dashboard title */}
      <TranslatedHeader title={t('teacher_dashboard') || 'Teacher Dashboard'} backTo="/" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/teacher/students')}>
            <MaterialIcons name="people" size={28} color="#5C6BC0" />
            <Text style={styles.actionText} numberOfLines={1}>{t('students')}</Text>
            <Text style={styles.actionCount}>{students.length}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/teacher/classrooms')}>
            <MaterialIcons name="school" size={28} color="#5C6BC0" />
            <Text style={styles.actionText} numberOfLines={1}>{t('classrooms')}</Text>
            <Text style={styles.actionCount}>{classrooms.length}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionButton} onPress={() => router.push('/teacher/checkin')}>
            <MaterialIcons name="self-improvement" size={28} color="#5C6BC0" />
            {/* ✅ Fixed: translatable label, no cut-off */}
            <Text style={styles.actionText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('teacher_checkin') || 'Check-in'}
            </Text>
            {/* ✅ Fixed: 'Now' translated */}
            <Text style={styles.actionCount}>{t('now') || 'Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* Teacher self check-ins */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>{t('your_check_ins') || 'Your Check-ins'}</Text>
          {teacherCheckins.length > 0 ? (
            teacherCheckins.map((checkin) => (
              <View key={checkin.id} style={styles.logItem}>
                <View style={[styles.zoneIndicator, { backgroundColor: ZONE_COLORS[checkin.zone as keyof typeof ZONE_COLORS] || '#999' }]}>
                  {/* ✅ Fixed: zone name translated */}
                  <Text style={styles.zoneText}>{getZoneLabel(checkin.zone)}</Text>
                </View>
                <View style={[styles.logInfo, { marginLeft: 10 }]}>
                  <Text style={styles.logName}>{t('teacher') || 'Teacher'}</Text>
                  <Text style={styles.logTime}>{formatTime(checkin.timestamp)}</Text>
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyLogs}>
              <MaterialIcons name="self-improvement" size={42} color="#CCC" />
              <Text style={styles.emptyLogsText}>{t('no_checkins_yet') || 'No self check-ins yet'}</Text>
            </View>
          )}
        </View>

        {/* Class mood snapshot */}
        <View style={styles.snapshotCard}>
          <View style={styles.snapshotHeader}>
            <Text style={styles.sectionTitle}>{t('class_mood_snapshot') || 'Class Mood Snapshot'}</Text>
            <Text style={styles.snapshotTotal}>{todaySnapshot.total} {t('check_ins') || 'check-ins'}</Text>
          </View>
          <View style={styles.snapshotRow}>
            {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => (
              <View key={zone} style={styles.snapshotItem}>
                <View style={[styles.snapshotDot, { backgroundColor: ZONE_COLORS[zone] }]} />
                {/* ✅ Fixed: colour names translated */}
                <Text style={styles.snapshotZoneText}>{getZoneLabel(zone)}</Text>
                <Text style={styles.snapshotValue}>{todaySnapshot[zone]}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Resources Button */}
        <TouchableOpacity style={styles.resourcesButton} onPress={() => router.push('/teacher/resources')}>
          <MaterialIcons name="library-books" size={24} color="white" />
          <View style={styles.resourcesButtonContent}>
            <Text style={styles.resourcesButtonTitle}>{t('teacher_resources')}</Text>
            <Text style={styles.resourcesButtonSubtitle}>{t('upload_share_materials')}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="white" />
        </TouchableOpacity>

        {/* Classroom Filter */}
        {classrooms.length > 0 && (
          <View style={styles.filterSection}>
            <Text style={styles.sectionTitle}>{t('filter_by_classroom')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.filterChips}>
                <TouchableOpacity
                  style={[styles.filterChip, !selectedClassroom && styles.filterChipActive]}
                  onPress={() => setSelectedClassroom(null)}
                >
                  <Text style={[styles.filterChipText, !selectedClassroom && styles.filterChipTextActive]}>
                    {t('all_students')}
                  </Text>
                </TouchableOpacity>
                {classrooms.map(classroom => (
                  <TouchableOpacity
                    key={classroom.id}
                    style={[styles.filterChip, selectedClassroom === classroom.id && styles.filterChipActive]}
                    onPress={() => setSelectedClassroom(classroom.id)}
                  >
                    <Text style={[styles.filterChipText, selectedClassroom === classroom.id && styles.filterChipTextActive]}>
                      {classroom.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Period Selector */}
        <View style={styles.periodSelector}>
          {[1, 7, 14, 30].map((days) => (
            <TouchableOpacity
              key={days}
              style={[styles.periodButton, selectedPeriod === days && styles.periodButtonActive]}
              onPress={() => setSelectedPeriod(days as 1 | 7 | 14 | 30)}
            >
              <Text style={[styles.periodButtonText, selectedPeriod === days && styles.periodButtonTextActive]}>
                {days === 1 ? t('today') || 'Day' : days === 7 ? t('days_7') : days === 14 ? t('days_14') : t('days_30')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Emotion Distribution Chart */}
        <View style={styles.chartSection}>
          {/* ✅ Fixed: 'Gráfico de Humor da Turma' colour labels translated in chart */}
          <Text style={styles.sectionTitle}>{t('class_mood_graph') || t('week_overview')}</Text>
          {analytics && analytics.total_logs > 0 ? (
            <View style={styles.chartContainer}>
              <BarChart
                data={chartData}
                barWidth={50}
                spacing={24}
                roundedTop
                roundedBottom
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: '#666', fontSize: 12 }}
                noOfSections={4}
                maxValue={Math.max(...Object.values(analytics.zone_counts).map(v => Number(v))) + 2}
                isAnimated
                barBorderRadius={8}
                width={width - 80}
                xAxisLabelTextStyle={{ fontSize: 11, color: '#666' }}
              />
              {/* ✅ Fixed: Translated colour legend below chart */}
              <View style={styles.chartLegend}>
                {(['blue', 'green', 'yellow', 'red'] as const).map(zone => (
                  <View key={zone} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: ZONE_COLORS[zone] }]} />
                    <Text style={styles.legendText}>{getZoneLabel(zone)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.chartSubtitle}>
                {t('check_ins')}: {analytics.total_logs}
              </Text>
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <MaterialIcons name="bar-chart" size={48} color="#CCC" />
              <Text style={styles.emptyChartText}>{t('no_data_yet')}</Text>
            </View>
          )}
        </View>

        {/* ✅ Fixed: Week at a Glance — days translated */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{t('week_at_a_glance') || 'Week at a Glance'}</Text>
          <View style={styles.weeklyTable}>
            <View style={styles.weeklyHeader}>
              {DAY_KEYS.map((dayKey, idx) => (
                <View key={dayKey} style={styles.weeklyDayHeader}>
                  <Text style={styles.weeklyDayText}>{DAY_NAMES[idx]}</Text>
                </View>
              ))}
            </View>
            <View style={styles.weeklyBody}>
              {DAY_KEYS.map((dayKey) => {
                const dayData = weeklyLogs[dayKey];
                return (
                  <View key={dayKey} style={styles.weeklyDayCell}>
                    {dayData.logs.length > 0 ? (
                      dayData.logs.slice(0, 3).map((log, idx) => (
                        <View key={idx} style={styles.weeklyLogItem}>
                          <View style={[styles.weeklyZoneDot, { backgroundColor: ZONE_COLORS[log.zone as keyof typeof ZONE_COLORS] || '#999' }]} />
                          <Text style={styles.weeklyTime}>{dayData.times[idx]}</Text>
                        </View>
                      ))
                    ) : (
                      <Text style={styles.weeklyNoData}>-</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* Recent Check-ins */}
        <View style={styles.recentSection}>
          <Text style={styles.sectionTitle}>{t('recent_check_ins')}</Text>
          {recentLogs.length > 0 ? (
            recentLogs.slice(0, 10).map((log) => {
              const student = getStudent(log.student_id);
              return (
                <TouchableOpacity
                  key={log.id}
                  style={styles.logItem}
                  onPress={() => router.push({ pathname: '/teacher/student-detail', params: { studentId: log.student_id } })}
                >
                  <Avatar
                    type={student?.avatar_type || 'preset'}
                    preset={student?.avatar_preset}
                    custom={student?.avatar_custom}
                    size={44}
                    presetAvatars={presetAvatars}
                  />
                  <View style={styles.logInfo}>
                    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                      <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                      {log.logged_by === 'parent' && (
                        <View style={{backgroundColor:'#E8F5E9',paddingHorizontal:5,paddingVertical:1,borderRadius:6}}>
                          <Text style={{fontSize:9,color:'#4CAF50',fontWeight:'600'}}>HOME</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                  </View>
                  <View style={[styles.zoneIndicator, { backgroundColor: ZONE_COLORS[log.zone as keyof typeof ZONE_COLORS] || '#999' }]}>
                    <Text style={styles.zoneText}>{getZoneLabel(log.zone)}</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyLogs}>
              <MaterialIcons name="history" size={48} color="#CCC" />
              <Text style={styles.emptyLogsText}>{t('no_recent_checkins')}</Text>
            </View>
          )}
        </View>

        {/* ✅ Fixed: Teacher Check-in moved to bottom */}
        <TouchableOpacity
          style={[styles.resourcesButton, { backgroundColor: '#26A69A', marginTop: 16 }]}
          onPress={() => router.push('/teacher/checkin')}
        >
          <MaterialIcons name="self-improvement" size={24} color="white" />
          <View style={styles.resourcesButtonContent}>
            <Text style={styles.resourcesButtonTitle}>{t('teacher_checkin') || 'Teacher Check-in'}</Text>
            <Text style={styles.resourcesButtonSubtitle}>{t('check_in_yourself') || 'Check in with yourself'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="white" />
        </TouchableOpacity>

        {/* ✅ Fixed: Widget button translated */}
        <TouchableOpacity
          style={[styles.resourcesButton, { backgroundColor: '#9C27B0', marginTop: 16, marginBottom: 24 }]}
          onPress={() => router.push('/teacher/widget')}
        >
          <MaterialIcons name="widgets" size={24} color="white" />
          <View style={styles.resourcesButtonContent}>
            <Text style={styles.resourcesButtonTitle}>{t('classroom_widget') || 'Classroom Widget'}</Text>
            {/* ✅ Fixed: 'Add widget to home' translated */}
            <Text style={styles.resourcesButtonSubtitle}>{t('add_widget_to_home') || t('add_quick_status') || 'Add quick status to home screen'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="white" />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  quickActions: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionButton: {
    flex: 1, backgroundColor: 'white', borderRadius: 16, padding: 16,
    alignItems: 'center', elevation: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 3,
  },
  snapshotCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16 },
  snapshotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 },
  snapshotTotal: { fontSize: 13, color: '#666', fontWeight: '600' },
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between' },
  snapshotItem: { alignItems: 'center', flex: 1 },
  snapshotDot: { width: 14, height: 14, borderRadius: 7, marginBottom: 4 },
  snapshotZoneText: { fontSize: 11, color: '#666', textTransform: 'capitalize' },
  snapshotValue: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 2 },
  actionText: { fontSize: 11, color: '#666', marginTop: 8, textAlign: 'center' },
  actionCount: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 4 },
  resourcesButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C6BC0',
    borderRadius: 16, padding: 16, marginBottom: 16, gap: 12,
  },
  resourcesButtonContent: { flex: 1 },
  resourcesButtonTitle: { fontSize: 16, fontWeight: '600', color: 'white' },
  resourcesButtonSubtitle: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  filterSection: { marginBottom: 16 },
  filterChips: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'white', borderWidth: 1, borderColor: '#E0E0E0',
  },
  filterChipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  filterChipText: { fontSize: 14, color: '#666' },
  filterChipTextActive: { color: 'white', fontWeight: '600' },
  periodSelector: {
    flexDirection: 'row', backgroundColor: 'white', borderRadius: 12,
    padding: 4, marginBottom: 20,
  },
  periodButton: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  periodButtonActive: { backgroundColor: '#5C6BC0' },
  periodButtonText: { fontSize: 14, color: '#666' },
  periodButtonTextActive: { color: 'white', fontWeight: '600' },
  chartSection: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 16 },
  chartContainer: { alignItems: 'center' },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: '#666' },
  chartSubtitle: { fontSize: 14, color: '#888', marginTop: 8 },
  emptyChart: { alignItems: 'center', paddingVertical: 40 },
  emptyChartText: { fontSize: 16, color: '#999', marginTop: 12 },
  recentSection: { backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 16 },
  logItem: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  logInfo: { flex: 1, marginLeft: 12 },
  logName: { fontSize: 16, fontWeight: '600', color: '#333' },
  logTime: { fontSize: 12, color: '#999', marginTop: 2 },
  zoneIndicator: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  zoneText: { fontSize: 12, fontWeight: '600', color: 'white', textTransform: 'capitalize' },
  emptyLogs: { alignItems: 'center', paddingVertical: 40 },
  emptyLogsText: { fontSize: 16, color: '#999', marginTop: 12 },
  weeklyTable: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginTop: 8 },
  weeklyHeader: { flexDirection: 'row', marginBottom: 8 },
  weeklyDayHeader: { flex: 1, alignItems: 'center' },
  weeklyDayText: { fontSize: 11, fontWeight: '600', color: '#888' },
  weeklyBody: { flexDirection: 'row' },
  weeklyDayCell: { flex: 1, alignItems: 'center', minHeight: 60, gap: 4 },
  weeklyLogItem: { alignItems: 'center', gap: 2 },
  weeklyZoneDot: { width: 18, height: 18, borderRadius: 9 },
  weeklyTime: { fontSize: 8, color: '#999' },
  weeklyNoData: { fontSize: 16, color: '#DDD', marginTop: 12 },
});
