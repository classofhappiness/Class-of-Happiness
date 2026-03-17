import React, { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import { useApp } from '../../src/context/AppContext';
import { analyticsApi, zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');

const ZONE_COLORS = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

export default function TeacherDashboardScreen() {
  const router = useRouter();
  const { students, classrooms, presetAvatars, refreshStudents, refreshClassrooms, t } = useApp();
  const [selectedPeriod, setSelectedPeriod] = useState<7 | 14 | 30>(7);
  const [recentLogs, setRecentLogs] = useState<ZoneLog[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      // Fetch recent logs
      const logs = await zoneLogsApi.getAll(undefined, selectedClassroom || undefined, selectedPeriod);
      setRecentLogs(logs);

      // Calculate aggregate analytics from logs
      const zoneCounts = { blue: 0, green: 0, yellow: 0, red: 0 };
      logs.forEach((log: ZoneLog) => {
        if (log.zone in zoneCounts) {
          zoneCounts[log.zone as keyof typeof zoneCounts]++;
        }
      });
      setAnalytics({ zone_counts: zoneCounts, total_logs: logs.length });
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

  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown';
  };

  const getStudent = (studentId: string) => {
    return students.find(s => s.id === studentId);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const chartData = analytics ? [
    { value: analytics.zone_counts.blue, frontColor: ZONE_COLORS.blue, label: 'Blue' },
    { value: analytics.zone_counts.green, frontColor: ZONE_COLORS.green, label: 'Green' },
    { value: analytics.zone_counts.yellow, frontColor: ZONE_COLORS.yellow, label: 'Yellow' },
    { value: analytics.zone_counts.red, frontColor: ZONE_COLORS.red, label: 'Red' },
  ] : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/teacher/students')}
          >
            <MaterialIcons name="people" size={28} color="#5C6BC0" />
            <Text style={styles.actionText}>{t('students')}</Text>
            <Text style={styles.actionCount}>{students.length}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => router.push('/teacher/classrooms')}
          >
            <MaterialIcons name="school" size={28} color="#5C6BC0" />
            <Text style={styles.actionText}>{t('classrooms')}</Text>
            <Text style={styles.actionCount}>{classrooms.length}</Text>
          </TouchableOpacity>
        </View>

        {/* Resources Button */}
        <TouchableOpacity
          style={styles.resourcesButton}
          onPress={() => router.push('/teacher/resources')}
        >
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
                    style={[
                      styles.filterChip,
                      selectedClassroom === classroom.id && styles.filterChipActive
                    ]}
                    onPress={() => setSelectedClassroom(classroom.id)}
                  >
                    <Text style={[
                      styles.filterChipText,
                      selectedClassroom === classroom.id && styles.filterChipTextActive
                    ]}>
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
          {[7, 14, 30].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.periodButton,
                selectedPeriod === days && styles.periodButtonActive
              ]}
              onPress={() => setSelectedPeriod(days as 7 | 14 | 30)}
            >
              <Text style={[
                styles.periodButtonText,
                selectedPeriod === days && styles.periodButtonTextActive
              ]}>
                {days === 7 ? t('days_7') : days === 14 ? t('days_14') : t('days_30')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Zone Distribution Chart */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{t('week_overview')}</Text>
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
                maxValue={Math.max(...Object.values(analytics.zone_counts)) + 2}
                isAnimated
                barBorderRadius={8}
                width={width - 80}
              />
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
                  onPress={() => router.push({
                    pathname: '/teacher/student-detail',
                    params: { studentId: log.student_id }
                  })}
                >
                  <Avatar
                    type={student?.avatar_type || 'preset'}
                    preset={student?.avatar_preset}
                    custom={student?.avatar_custom}
                    size={44}
                    presetAvatars={presetAvatars}
                  />
                  <View style={styles.logInfo}>
                    <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                  </View>
                  <View style={[styles.zoneIndicator, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                    <Text style={styles.zoneText}>{log.zone}</Text>
                  </View>
                  {log.strategies_selected.length > 0 && (
                    <View style={styles.strategyBadge}>
                      <MaterialIcons name="lightbulb" size={16} color="#FFC107" />
                      <Text style={styles.strategyCount}>{log.strategies_selected.length}</Text>
                    </View>
                  )}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  actionText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  actionCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  resourcesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  resourcesButtonContent: {
    flex: 1,
  },
  resourcesButtonTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  resourcesButtonSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterChips: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#5C6BC0',
    borderColor: '#5C6BC0',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
  },
  filterChipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  periodButtonActive: {
    backgroundColor: '#5C6BC0',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#666',
  },
  periodButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  chartSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chartSubtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 12,
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyChartText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  recentSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  logInfo: {
    flex: 1,
    marginLeft: 12,
  },
  logName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  logTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  zoneIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  zoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'white',
    textTransform: 'capitalize',
  },
  strategyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  strategyCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F9A825',
    marginLeft: 4,
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyLogsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
});
