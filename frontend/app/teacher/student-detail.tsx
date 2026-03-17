import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  Share
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { useApp } from '../../src/context/AppContext';
import { analyticsApi, zoneLogsApi, ZoneLog, strategiesApi, Strategy, reportsApi, parentApi } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');

const ZONE_COLORS = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

const ZONE_LABELS: Record<string, string> = {
  blue: 'Blue Zone',
  green: 'Green Zone',
  yellow: 'Yellow Zone',
  red: 'Red Zone',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function StudentDetailScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { students, presetAvatars, classrooms, t } = useApp();
  
  const student = students.find(s => s.id === studentId);
  
  const [selectedPeriod, setSelectedPeriod] = useState<7 | 14 | 30>(7);
  const [analytics, setAnalytics] = useState<any>(null);
  const [logs, setLogs] = useState<ZoneLog[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showLinkCodeModal, setShowLinkCodeModal] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const fetchData = async () => {
    if (!studentId) return;
    try {
      const [analyticsData, logsData, strategiesData, months] = await Promise.all([
        analyticsApi.getStudent(studentId, selectedPeriod),
        zoneLogsApi.getByStudent(studentId, selectedPeriod),
        strategiesApi.getAll(),
        reportsApi.getAvailableMonths(studentId),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setStrategies(strategiesData);
      setAvailableMonths(months);
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  useEffect(() => {
    fetchData();
  }, [studentId, selectedPeriod]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getClassroomName = (classroomId?: string) => {
    if (!classroomId) return 'No Classroom';
    const classroom = classrooms.find(c => c.id === classroomId);
    return classroom?.name || 'Unknown';
  };

  const getStrategyName = (strategyId: string) => {
    const strategy = strategies.find(s => s.id === strategyId);
    return strategy?.name || strategyId;
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const downloadReport = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const pdfUrl = reportsApi.getPdfUrl(studentId!, year, month);
    
    if (typeof window !== 'undefined') {
      window.open(pdfUrl, '_blank');
    } else {
      Linking.openURL(pdfUrl);
    }
    setShowReportModal(false);
  };

  const formatMonthYear = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} ${year}`;
  };

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('student_not_found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pieData = analytics ? [
    { value: analytics.zone_counts.blue || 0, color: ZONE_COLORS.blue, text: 'Blue' },
    { value: analytics.zone_counts.green || 0, color: ZONE_COLORS.green, text: 'Green' },
    { value: analytics.zone_counts.yellow || 0, color: ZONE_COLORS.yellow, text: 'Yellow' },
    { value: analytics.zone_counts.red || 0, color: ZONE_COLORS.red, text: 'Red' },
  ].filter(d => d.value > 0) : [];

  const barData = analytics ? [
    { value: analytics.zone_counts.blue || 0, frontColor: ZONE_COLORS.blue, label: 'Blue' },
    { value: analytics.zone_counts.green || 0, frontColor: ZONE_COLORS.green, label: 'Green' },
    { value: analytics.zone_counts.yellow || 0, frontColor: ZONE_COLORS.yellow, label: 'Yellow' },
    { value: analytics.zone_counts.red || 0, frontColor: ZONE_COLORS.red, label: 'Red' },
  ] : [];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Student Header */}
        <View style={styles.studentHeader}>
          <Avatar
            type={student.avatar_type}
            preset={student.avatar_preset}
            custom={student.avatar_custom}
            size={80}
            presetAvatars={presetAvatars}
          />
          <View style={styles.studentInfo}>
            <Text style={styles.studentName}>{student.name}</Text>
            <Text style={styles.studentClassroom}>
              {getClassroomName(student.classroom_id)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push({
              pathname: '/profiles/edit',
              params: { studentId: student.id }
            })}
          >
            <MaterialIcons name="edit" size={20} color="#5C6BC0" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.strategiesButton}
            onPress={() => router.push({
              pathname: '/teacher/strategies',
              params: { studentId: student.id }
            })}
          >
            <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shareParentButton}
            onPress={() => setShowLinkCodeModal(true)}
          >
            <MaterialIcons name="family-restroom" size={20} color="#4A90D9" />
          </TouchableOpacity>
        </View>

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
                {days === 7 ? '7 Days' : days === 14 ? '2 Weeks' : '30 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Stats Summary */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics?.total_logs || 0}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: ZONE_COLORS.green }]}>
              {analytics?.zone_counts.green || 0}
            </Text>
            <Text style={styles.statLabel}>Green Zone</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {Object.keys(analytics?.strategy_counts || {}).length}
            </Text>
            <Text style={styles.statLabel}>Strategies</Text>
          </View>
        </View>

        {/* Zone Distribution */}
        <View style={styles.chartSection}>
          <Text style={styles.sectionTitle}>{t('zone_distribution')}</Text>
          {pieData.length > 0 ? (
            <View style={styles.chartRow}>
              <PieChart
                data={pieData}
                donut
                radius={60}
                innerRadius={35}
                centerLabelComponent={() => (
                  <Text style={styles.pieCenter}>{analytics?.total_logs}</Text>
                )}
              />
              <View style={styles.legendContainer}>
                {pieData.map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.text}: {item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartText}>{t('no_data_period')}</Text>
            </View>
          )}
        </View>

        {/* Bar Chart */}
        {analytics && analytics.total_logs > 0 && (
          <View style={styles.chartSection}>
            <Text style={styles.sectionTitle}>{t('zone_comparison')}</Text>
            <View style={styles.barChartContainer}>
              <BarChart
                data={barData}
                barWidth={40}
                spacing={20}
                roundedTop
                roundedBottom
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: '#666', fontSize: 11 }}
                noOfSections={4}
                maxValue={Math.max(...Object.values(analytics.zone_counts)) + 1}
                isAnimated
                barBorderRadius={6}
                width={width - 100}
              />
            </View>
          </View>
        )}

        {/* Download Reports Section */}
        {availableMonths.length > 0 && (
          <View style={styles.reportsSection}>
            <Text style={styles.sectionTitle}>Download Monthly Reports</Text>
            <Text style={styles.reportsSubtitle}>
              Select a month to download a PDF report
            </Text>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => setShowReportModal(true)}
            >
              <MaterialIcons name="picture-as-pdf" size={24} color="white" />
              <Text style={styles.downloadButtonText}>{t('download_report')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Top Strategies */}
        {analytics && Object.keys(analytics.strategy_counts || {}).length > 0 && (
          <View style={styles.strategiesSection}>
            <Text style={styles.sectionTitle}>Most Used Strategies</Text>
            {Object.entries(analytics.strategy_counts).map(([strategyId, count]) => (
              <View key={strategyId} style={styles.strategyItem}>
                <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
                <Text style={styles.strategyName}>{getStrategyName(strategyId)}</Text>
                <View style={styles.strategyCount}>
                  <Text style={styles.strategyCountText}>{count as number}x</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Recent Logs */}
        <View style={styles.logsSection}>
          <Text style={styles.sectionTitle}>Recent Check-ins</Text>
          {logs.length > 0 ? (
            logs.slice(0, 15).map((log) => (
              <View key={log.id} style={styles.logItem}>
                <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                  <Text style={styles.logZoneText}>{log.zone[0].toUpperCase()}</Text>
                </View>
                <View style={styles.logDetails}>
                  <Text style={styles.logZoneName}>{ZONE_LABELS[log.zone]}</Text>
                  <Text style={styles.logTime}>
                    {formatDate(log.timestamp)} at {formatTime(log.timestamp)}
                  </Text>
                  {log.strategies_selected.length > 0 && (
                    <View style={styles.logStrategies}>
                      <MaterialIcons name="lightbulb" size={14} color="#FFC107" />
                      <Text style={styles.logStrategiesText}>
                        {log.strategies_selected.map(s => getStrategyName(s)).join(', ')}
                      </Text>
                    </View>
                  )}
                  {log.comment && (
                    <View style={styles.logComment}>
                      <MaterialIcons name="chat-bubble" size={14} color="#5C6BC0" />
                      <Text style={styles.logCommentText}>"{log.comment}"</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.emptyLogs}>
              <MaterialIcons name="history" size={48} color="#CCC" />
              <Text style={styles.emptyLogsText}>No check-ins yet</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Report Month Selection Modal */}
      <Modal
        visible={showReportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Month</Text>
              <TouchableOpacity
                onPress={() => setShowReportModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.monthsList}>
              {availableMonths.map((monthStr) => (
                <TouchableOpacity
                  key={monthStr}
                  style={styles.monthItem}
                  onPress={() => downloadReport(monthStr)}
                >
                  <MaterialIcons name="calendar-today" size={20} color="#5C6BC0" />
                  <Text style={styles.monthItemText}>{formatMonthYear(monthStr)}</Text>
                  <MaterialIcons name="download" size={20} color="#4CAF50" />
                </TouchableOpacity>
              ))}
              
              {availableMonths.length === 0 && (
                <View style={styles.noMonthsContainer}>
                  <Text style={styles.noMonthsText}>No data available yet</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Parent Link Code Modal */}
      <Modal
        visible={showLinkCodeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowLinkCodeModal(false);
          setLinkCode(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share with Parent</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLinkCodeModal(false);
                  setLinkCode(null);
                }}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.linkCodeContent}>
              {!linkCode ? (
                <>
                  <MaterialIcons name="family-restroom" size={64} color="#4A90D9" />
                  <Text style={styles.linkCodeDescription}>
                    Generate a code that {student.name}'s parent can use to link their account and view check-ins from home.
                  </Text>
                  <TouchableOpacity
                    style={[styles.generateCodeButton, generatingCode && styles.generateCodeButtonDisabled]}
                    onPress={async () => {
                      setGeneratingCode(true);
                      try {
                        const result = await parentApi.generateLinkCode(student.id);
                        setLinkCode(result.link_code);
                      } catch (error) {
                        Alert.alert('Error', 'Failed to generate link code');
                      } finally {
                        setGeneratingCode(false);
                      }
                    }}
                    disabled={generatingCode}
                  >
                    <MaterialIcons name="vpn-key" size={24} color="white" />
                    <Text style={styles.generateCodeButtonText}>
                      {generatingCode ? 'Generating...' : 'Generate Code'}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
                  <Text style={styles.linkCodeLabel}>Parent Link Code:</Text>
                  <Text style={styles.linkCodeValue}>{linkCode}</Text>
                  <Text style={styles.linkCodeNote}>
                    This code expires in 7 days. Share it with the parent so they can link their account.
                  </Text>
                  <TouchableOpacity
                    style={styles.shareCodeButton}
                    onPress={() => {
                      Share.share({
                        message: `Link code for ${student.name} in Class of Happiness app: ${linkCode}\n\nUse this code in the Parent section to connect your account.`,
                      });
                    }}
                  >
                    <MaterialIcons name="share" size={24} color="white" />
                    <Text style={styles.shareCodeButtonText}>Share Code</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
  },
  studentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  studentInfo: {
    flex: 1,
    marginLeft: 16,
  },
  studentName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  studentClassroom: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  editButton: {
    padding: 8,
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
  },
  strategiesButton: {
    padding: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    marginLeft: 8,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
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
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  chartSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  pieCenter: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  legendContainer: {
    marginLeft: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#666',
  },
  barChartContainer: {
    alignItems: 'center',
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyChartText: {
    fontSize: 14,
    color: '#999',
  },
  strategiesSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  strategyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  strategyName: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  strategyCount: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  strategyCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9A825',
  },
  logsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
  },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  logZone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logZoneText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  logDetails: {
    flex: 1,
    marginLeft: 12,
  },
  logZoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  logTime: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  logStrategies: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  logStrategiesText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  logComment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    backgroundColor: '#F0F4FF',
    padding: 8,
    borderRadius: 8,
    gap: 6,
  },
  logCommentText: {
    fontSize: 13,
    color: '#5C6BC0',
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 18,
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
  reportsSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  reportsSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    padding: 4,
  },
  monthsList: {
    padding: 16,
  },
  monthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  monthItemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  noMonthsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noMonthsText: {
    fontSize: 16,
    color: '#999',
  },
  shareParentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  linkCodeContent: {
    padding: 24,
    alignItems: 'center',
  },
  linkCodeDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  generateCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  generateCodeButtonDisabled: {
    backgroundColor: '#CCC',
  },
  generateCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  linkCodeLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 16,
  },
  linkCodeValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4A90D9',
    letterSpacing: 6,
    marginTop: 8,
    marginBottom: 16,
  },
  linkCodeNote: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  shareCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  shareCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
