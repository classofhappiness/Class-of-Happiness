import React, { useState, useEffect, useRef } from 'react';
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
  Share,
  Platform,
  Animated,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '../../src/context/AppContext';
import { analyticsApi, zoneLogsApi, ZoneLog, strategiesApi, Strategy, reportsApi, teacherApi, teacherHomeDataApi } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');


// Complete strategy name lookup - matches student/strategies.tsx fallback IDs
const STRATEGY_NAME_MAP: Record<string, string> = {
  // Blue zone
  b1: 'Gentle Stretch', b2: 'Favourite Song', b3: 'Tell Someone', b4: 'Slow Breathing',
  // Green zone  
  g1: 'Keep Going!', g2: 'Help a Friend', g3: 'Set a Goal', g4: 'Gratitude',
  // Yellow zone
  y1: 'Bubble Breathing', y2: 'Count to 10', y3: '5 Senses', y4: 'Talk About It',
  // Red zone
  r1: 'Freeze', r2: 'Big Breaths', r3: 'Safe Space', r4: 'Ask for Help',
  // Parent strategies
  p_b1: 'Side-by-Side Presence', p_b2: 'Warm Drink Ritual', p_b3: 'Name It to Tame It',
  p_b4: 'Movement Invitation', p_b5: 'Comfort & Closeness',
  p_g1: 'Gratitude Round', p_g2: 'Strength Spotting', p_g3: 'Creative Together',
  p_g4: 'Family Dance', p_g5: 'Calm Problem Solving',
  p_y1: 'Box Breathing Together', p_y2: 'Validate First', p_y3: 'Body Check-In',
  p_y4: 'Feelings Journal', p_y5: 'Give Space with Love',
  p_r1: 'Stay Calm Yourself', p_r2: 'Safe Space Together', p_r3: 'Cold Water Reset',
  p_r4: 'No Teaching Now', p_r5: 'Reconnect with Warmth',
};

const ZONE_COLORS = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

// Use translations for zone labels
const getZoneLabel = (zone: string, t: (key: string) => string) => {
  const labels: Record<string, string> = {
    blue: t('blue_zone') || 'Blue Emotions',
    green: t('green_zone') || 'Green Emotions',
    yellow: t('yellow_zone') || 'Yellow Emotions',
    red: t('red_zone') || 'Red Emotions',
  };
  return labels[zone] || zone;
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
  
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 14 | 30>(7);
  const [analytics, setAnalytics] = useState<any>(null);
  const [logs, setLogs] = useState<ZoneLog[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [combinedLogs, setCombinedLogs] = useState<any[]>([]);
  const [allStrategies, setAllStrategies] = useState<{school: any[]; family: any[]}>({school: [], family: []});
  const [showAddStrategyModal, setShowAddStrategyModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({name:'', description:'', zone:'green', icon:'star', shareWithParent: false});
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [activeDataTab, setActiveDataTab] = useState<'school'|'home'|'combined'>('combined');
  const [showLinkCodeModal, setShowLinkCodeModal] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  // Home data states
  const [homeData, setHomeData] = useState<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    total_home_checkins: number;
  } | null>(null);
  const [sharingStatus, setSharingStatus] = useState<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    parent_name: string | null;
    link_count: number;
    school_sharing_enabled: boolean;
  } | null>(null);
  const [showHomeDataTab, setShowHomeDataTab] = useState(false);

  // Tooltip fade animation states
  const [activeTooltip, setActiveTooltip] = useState<'strategies' | 'family' | null>('strategies');
  const tooltipOpacity = useRef(new Animated.Value(1)).current;

  // Show tooltips one at a time, then hide all.
  useEffect(() => {
    const firstTimer = setTimeout(() => {
      Animated.timing(tooltipOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setActiveTooltip('family');
        tooltipOpacity.setValue(1);
      });
    }, 2600);
    const secondTimer = setTimeout(() => {
      Animated.timing(tooltipOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setActiveTooltip(null);
      });
    }, 5200);
    return () => {
      clearTimeout(firstTimer);
      clearTimeout(secondTimer);
    };
  }, [tooltipOpacity]);

  const fetchData = async () => {
    if (!studentId) return;
    try {
      const [analyticsData, logsData, months, statusData] = await Promise.all([
        analyticsApi.getStudent(studentId, selectedPeriod),
        zoneLogsApi.getByStudent(studentId, selectedPeriod),
        reportsApi.getAvailableMonths(studentId).catch(() => []),
        teacherHomeDataApi.getSharingStatus(studentId).catch(() => null),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setAvailableMonths(months);
      // Fetch all strategies from helpers + custom helpers + family
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const token = await AsyncStorage.getItem('session_token');
        
        // Load helpers for all zones
        const helperPromises = ['blue','green','yellow','red'].map(zone =>
          fetch(`${BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=en`)
            .then(r => r.json()).catch(() => [])
        );
        const helperResults = await Promise.all(helperPromises);
        const allHelpers = helperResults.flat();
        
        // Load custom helpers for this student
        const customRes = await fetch(`${BACKEND_URL}/api/custom-strategies?student_id=${studentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const customHelpers = customRes.ok ? await customRes.json() : [];
        
        // Combine all
        const combined = [
          ...allHelpers.map((h: any) => ({ ...h, id: h.id || h.helper_id, source: 'school' })),
          ...customHelpers.map((h: any) => ({ ...h, source: 'custom', name: h.name || h.helper_name })),
        ];
        setStrategies(combined as any);
        
        // Also load teacher/family strategies
        try {
          const allStrats = await teacherHomeDataApi.getAllStrategies(studentId);
          const schoolStrats = (allStrats.school_strategies || []).map((s: any) => ({ ...s, source: 'school' }));
          const familyStrats = (allStrats.family_strategies || []).map((s: any) => ({
            ...s, name: s.name || s.strategy_name, description: s.description || s.strategy_description, source: 'home',
          }));
          setAllStrategies({ school: [...schoolStrats, ...customHelpers], family: familyStrats });
        } catch { setAllStrategies({ school: customHelpers, family: [] }); }
        
      } catch (stratErr) {
        console.log('Strategies fetch error:', stratErr);
        setStrategies([]);
      }
      
      if (statusData) {
        setSharingStatus(statusData);

        // Always fetch combined logs (school + home)
        try {
          const combined = await teacherHomeDataApi.getCombinedCheckins(studentId, selectedPeriod);
          setCombinedLogs(combined);
        } catch (e) { console.log('Combined checkins:', e); }

        // Fetch all strategies (school + family shared)
        try {
          const strats = await teacherHomeDataApi.getAllStrategies(studentId);
          setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
        } catch (e) { console.log('All strategies:', e); }

        // If linked, fetch home data regardless (teacher can see school data always)
        if (statusData.is_linked_to_parent) {
          try {
            const homeDataResult = await teacherHomeDataApi.getStudentHomeData(studentId, selectedPeriod);
            setHomeData(homeDataResult);
          } catch (error) {
            console.log('Could not fetch home data:', error);
          }
        }
      }
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
    if (!strategyId) return '';
    // Check the complete name map first
    if (STRATEGY_NAME_MAP[strategyId]) return STRATEGY_NAME_MAP[strategyId];
    // Check loaded strategies
    const strategy = strategies.find((s: any) => s.id === strategyId || s.name === strategyId);
    if (strategy?.name) return strategy.name;
    // Check allStrategies
    const schoolStrat = allStrategies.school.find((s: any) => s.id === strategyId);
    if (schoolStrat?.name) return schoolStrat.name;
    const familyStrat = allStrategies.family.find((s: any) => s.id === strategyId);
    if (familyStrat?.name || familyStrat?.strategy_name) return familyStrat.name || familyStrat.strategy_name;
    // If it looks like a readable name already, return it
    if (strategyId.length > 5 && !strategyId.match(/^[a-z]_?\d+$/)) return strategyId;
    // Last resort cleanup
    return strategyId.replace(/_/g, ' ').replace(/\w/g, l => l.toUpperCase());
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

  const downloadReport = async (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    const pdfUrl = reportsApi.getPdfUrl(studentId!, year, month);
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const fullUrl = `${BACKEND_URL}${pdfUrl}`;
    const filename = `${student?.name || 'student'}_report_${year}_${month}.pdf`;
    
    console.log('Downloading monthly report from:', fullUrl);
    setShowReportModal(false);
    
    try {
      if (Platform.OS === 'web') {
        // Web: Open in new tab
        window.open(fullUrl, '_blank');
      } else {
        // Mobile (Expo Go SDK 54+): Use new File/Directory API
        // Use cache directory directly to avoid create() issues
        const cacheDir = new Directory(Paths.cache);
        
        console.log('Saving report to cache directory');
        
        // Download file directly to cache
        const downloadedFile = await File.downloadFileAsync(fullUrl, cacheDir);
        
        console.log('Download result - exists:', downloadedFile.exists);
        console.log('Download result - uri:', downloadedFile.uri);
        
        if (!downloadedFile.exists) {
          throw new Error('Downloaded file does not exist');
        }
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadedFile.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Share ${student?.name}'s Monthly Report`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Success', 'Report downloaded successfully');
        }
      }
    } catch (error: any) {
      console.error('Report download error:', error);
      Alert.alert(
        'Download Error',
        `Failed to download report: ${error.message || 'Unknown error'}`
      );
    }
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
            <Text style={styles.studentName} numberOfLines={1} adjustsFontSizeToFit>{student.name}</Text>
            <Text style={styles.studentClassroom} numberOfLines={1}>
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
            <Text style={styles.iconBtnLabel}>Edit</Text>
          </TouchableOpacity>
          
          {/* Strategies Button with Tooltip */}
          <View style={styles.tooltipContainer}>
            <TouchableOpacity
              style={[styles.strategiesButton, {alignItems:'center'}]}
              onPress={() => router.push({
                pathname: '/teacher/strategies',
                params: { studentId: student.id }
              })}
            >
              <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
              <Text style={styles.iconBtnLabel}>Strategies</Text>
            </TouchableOpacity>
            {activeTooltip === 'strategies' && (
              <Animated.View style={[styles.tooltip, { opacity: tooltipOpacity }]}>
                <Text style={styles.tooltipText}>{t('manage_strategies') || 'Manage strategies'}</Text>
                <View style={styles.tooltipArrow} />
              </Animated.View>
            )}
          </View>
          
          {/* Family Button with Tooltip */}
          <View style={styles.tooltipContainer}>
            <TouchableOpacity
              style={styles.shareParentButton}
              onPress={() => setShowLinkCodeModal(true)}
            >
              <MaterialIcons name="family-restroom" size={20} color="#4A90D9" />
              <Text style={[styles.iconBtnLabel, {color:"#4A90D9",fontSize:9}]}>Family</Text>
            </TouchableOpacity>
            {activeTooltip === 'family' && (
              <Animated.View style={[styles.tooltip, styles.tooltipRight, { opacity: tooltipOpacity }]}>
                <Text style={styles.tooltipText}>{t('share_with_family') || 'Share with family'}</Text>
                <View style={[styles.tooltipArrow, styles.tooltipArrowRight]} />
              </Animated.View>
            )}
          </View>
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
            <Text style={styles.statLabel}>Green Emotions</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {Object.keys(analytics?.strategy_counts || {}).length}
            </Text>
            <Text style={styles.statLabel}>Strategies</Text>
          </View>
        </View>

        {/* Emotion Distribution */}
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
                maxValue={Math.max(...Object.values(analytics.zone_counts).map(v => Number(v))) + 1}
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
                  <Text style={styles.logZoneName}>{getZoneLabel(log.zone, t)}</Text>
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
        
        {/* ── Combined Calendar View ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.calendarSection}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="calendar-today" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Check-in Calendar</Text>
            </View>
            <View style={styles.calendarGrid}>
              {(() => {
                // Group by date
                const grouped: Record<string, any[]> = {};
                combinedLogs.forEach(log => {
                  const date = log.timestamp?.split('T')[0] || '';
                  if (!grouped[date]) grouped[date] = [];
                  grouped[date].push(log);
                });
                const dates = Object.keys(grouped).sort().slice(-14); // last 14 days with data
                return dates.map(date => {
                  const dayLogs = grouped[date];
                  const d = new Date(date);
                  const dayName = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
                  const dayNum = d.getDate();
                  const homeCount = dayLogs.filter(l => l.source === 'home').length;
                  const schoolCount = dayLogs.filter(l => l.source === 'school').length;
                  // dominant zone
                  const zones = dayLogs.map(l => l.zone);
                  const zoneCounts: Record<string,number> = {};
                  zones.forEach(z => { zoneCounts[z] = (zoneCounts[z]||0)+1; });
                  const dominant = Object.entries(zoneCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'green';
                  const ZONE_COLORS_MAP: Record<string,string> = {blue:'#4A90D9',green:'#4CAF50',yellow:'#FFC107',red:'#F44336'};
                  return (
                    <View key={date} style={styles.calendarDay}>
                      <Text style={styles.calendarDayName}>{dayName}</Text>
                      <View style={[styles.calendarDayCircle, {backgroundColor: ZONE_COLORS_MAP[dominant]}]}>
                        <Text style={styles.calendarDayNum}>{dayNum}</Text>
                      </View>
                      <View style={styles.calendarBadges}>
                        {schoolCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#5C6BC0'}]}><Text style={styles.calendarBadgeText}>S</Text></View>}
                        {homeCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#4CAF50'}]}><Text style={styles.calendarBadgeText}>H</Text></View>}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
            {/* Legend */}
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#5C6BC0'}]}/><Text style={styles.legendText}>S = School</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#4CAF50'}]}/><Text style={styles.legendText}>H = Home</Text></View>
            </View>
          </View>
        )}

        {/* ── Zone Distribution (combined) ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.zoneDistSection}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="pie-chart" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Zone Distribution</Text>
            </View>
            {/* Data source tabs */}
            <View style={styles.dataTabRow}>
              {(['combined','school','home'] as const).map(tab => (
                <TouchableOpacity key={tab}
                  style={[styles.dataTab, activeDataTab === tab && styles.dataTabActive]}
                  onPress={() => setActiveDataTab(tab)}>
                  <Text style={[styles.dataTabText, activeDataTab === tab && styles.dataTabTextActive]}>
                    {tab === 'combined' ? 'All' : tab === 'school' ? '🏫 School' : '🏠 Home'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(() => {
              const filtered = activeDataTab === 'combined' ? combinedLogs
                : activeDataTab === 'school' ? combinedLogs.filter(l => l.source === 'school')
                : combinedLogs.filter(l => l.source === 'home');
              const counts: Record<string,number> = {blue:0,green:0,yellow:0,red:0};
              filtered.forEach(l => { if (l.zone in counts) counts[l.zone]++; });
              const total = Object.values(counts).reduce((a,b)=>a+b,0);
              const ZONE_COLORS_MAP: Record<string,string> = {blue:'#4A90D9',green:'#4CAF50',yellow:'#FFC107',red:'#F44336'};
              const ZONE_NAMES: Record<string,string> = {blue:'Blue',green:'Green',yellow:'Yellow',red:'Red'};
              return (
                <View style={styles.zoneDistBars}>
                  {(['green','blue','yellow','red'] as const).map(zone => {
                    const pct = total > 0 ? Math.round((counts[zone]/total)*100) : 0;
                    return (
                      <View key={zone} style={styles.zoneDistRow}>
                        <View style={[styles.zoneDistDot, {backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        <Text style={styles.zoneDistLabel}>{ZONE_NAMES[zone]}</Text>
                        <View style={styles.zoneDistBarBg}>
                          <View style={[styles.zoneDistBar, {width: `${pct}%` as any, backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        </View>
                        <Text style={styles.zoneDistPct}>{pct}%</Text>
                        <Text style={styles.zoneDistCount}>({counts[zone]})</Text>
                      </View>
                    );
                  })}
                  {total === 0 && <Text style={styles.emptyText}>No check-ins for this view</Text>}
                </View>
              );
            })()}
          </View>
        )}

        {/* ── Strategy Management ── */}
        <View style={styles.strategiesSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
            <Text style={styles.sectionTitle}>Strategies</Text>
            <TouchableOpacity style={styles.addStratBtn} onPress={() => setShowAddStrategyModal(true)}>
              <MaterialIcons name="add" size={18} color="white" />
              <Text style={styles.addStratBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* School strategies */}
          {allStrategies.school.length > 0 && (
            <>
              <Text style={styles.stratSourceLabel}>🏫 School Strategies</Text>
              {allStrategies.school.map((s: any) => (
                <View key={s.id} style={styles.strategyRow}>
                  <MaterialIcons name={(s.icon || 'star') as any} size={20} color="#5C6BC0" />
                  <View style={styles.strategyInfo}>
                    <Text style={styles.strategyName}>{s.name}</Text>
                    {s.description ? <Text style={styles.strategyDesc}>{s.description}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.shareToggleBtn, s.is_shared && styles.shareToggleBtnActive]}
                    onPress={async () => {
                      try {
                        await teacherHomeDataApi.toggleStrategyShare(studentId!, s.id);
                        const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                        setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      } catch (e) { console.log(e); }
                    }}>
                    <MaterialIcons name={s.is_shared ? 'home' : 'home'} size={14} color={s.is_shared ? 'white' : '#999'} />
                    <Text style={[styles.shareToggleText, s.is_shared && styles.shareToggleTextActive]}>
                      {s.is_shared ? 'Shared ✓' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert('Delete Strategy', `Delete "${s.name}"?`, [
                      {text:'Cancel', style:'cancel'},
                      {text:'Delete', style:'destructive', onPress: async () => {
                        await teacherHomeDataApi.deleteStrategy(studentId!, s.id);
                        const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                        setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      }}
                    ]);
                  }} style={{padding:6}}>
                    <MaterialIcons name="delete" size={18} color="#F44336" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Family strategies shared with teacher */}
          {allStrategies.family.length > 0 && (
            <>
              <Text style={styles.stratSourceLabel}>🏠 From Home (shared by parent)</Text>
              {allStrategies.family.map((s: any) => (
                <View key={s.id} style={[styles.strategyRow, {borderLeftColor:'#4CAF50', borderLeftWidth:3}]}>
                  <MaterialIcons name={(s.icon || 'favorite') as any} size={20} color="#4CAF50" />
                  <View style={styles.strategyInfo}>
                    <Text style={styles.strategyName}>{s.name || s.strategy_name}</Text>
                    {(s.description || s.strategy_description) ?
                      <Text style={styles.strategyDesc}>{s.description || s.strategy_description}</Text> : null}
                  </View>
                  <View style={[styles.zonePill, {backgroundColor:(ZONE_COLORS[s.zone as keyof typeof ZONE_COLORS]||'#999')+'25'}]}>
                    <Text style={{fontSize:10, color: ZONE_COLORS[s.zone as keyof typeof ZONE_COLORS]||'#999'}}>{s.zone}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {allStrategies.school.length === 0 && allStrategies.family.length === 0 && (
            <View style={styles.emptyStrategies}>
              <MaterialIcons name="lightbulb-outline" size={40} color="#CCC" />
              <Text style={styles.emptyText}>No strategies yet. Tap Add to create one.</Text>
            </View>
          )}
        </View>

        {/* ── Add Strategy Modal ── */}
        <Modal visible={showAddStrategyModal} transparent animationType="slide" onRequestClose={() => setShowAddStrategyModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Strategy</Text>
                <TouchableOpacity onPress={() => setShowAddStrategyModal(false)}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{maxHeight:400}}>
                <Text style={styles.inputLabel}>Strategy Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStrategy.name}
                  onChangeText={(v: string) => setNewStrategy({...newStrategy, name: v})}
                  placeholder="e.g. Deep breathing, Take a walk..."
                  placeholderTextColor="#AAA"
                />
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, {height:60, textAlignVertical:'top'}]}
                  value={newStrategy.description}
                  onChangeText={(v: string) => setNewStrategy({...newStrategy, description: v})}
                  placeholder="How to use this strategy..."
                  placeholderTextColor="#AAA"
                  multiline
                />
                <Text style={styles.inputLabel}>Zone</Text>
                <View style={{flexDirection:'row', gap:8, marginBottom:16}}>
                  {(['blue','green','yellow','red'] as const).map(zone => (
                    <TouchableOpacity key={zone}
                      style={{flex:1, paddingVertical:10, borderRadius:8, alignItems:'center',
                        backgroundColor: newStrategy.zone === zone ? ZONE_COLORS[zone] : '#F0F0F0'}}
                      onPress={() => setNewStrategy({...newStrategy, zone})}>
                      <Text style={{fontSize:12, fontWeight:'600', color: newStrategy.zone === zone ? 'white' : '#666'}}>
                        {zone.charAt(0).toUpperCase() + zone.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{flexDirection:'row', alignItems:'center', gap:8, padding:12,
                    backgroundColor: newStrategy.shareWithParent ? '#E8F5E9' : '#F5F5F5',
                    borderRadius:10, marginBottom:16}}
                  onPress={() => setNewStrategy({...newStrategy, shareWithParent: !newStrategy.shareWithParent})}>
                  <MaterialIcons name={newStrategy.shareWithParent ? 'check-box' : 'check-box-outline-blank'} size={22} color={newStrategy.shareWithParent ? '#4CAF50' : '#999'} />
                  <View>
                    <Text style={{fontSize:14, fontWeight:'600', color:'#333'}}>Share with parent at home</Text>
                    <Text style={{fontSize:11, color:'#888'}}>Parent will see this strategy in their app</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#5C6BC0', borderRadius:12, padding:16, alignItems:'center',
                    opacity: savingStrategy ? 0.6 : 1}}
                  onPress={async () => {
                    if (!newStrategy.name.trim()) { Alert.alert('Name required'); return; }
                    setSavingStrategy(true);
                    try {
                      await teacherHomeDataApi.addStrategy(studentId!, {
                        name: newStrategy.name.trim(),
                        description: newStrategy.description.trim(),
                        zone: newStrategy.zone,
                        icon: 'star',
                        share_with_parent: newStrategy.shareWithParent,
                      });
                      const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                      setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      setShowAddStrategyModal(false);
                      setNewStrategy({name:'', description:'', zone:'green', icon:'star', shareWithParent:false});
                    } catch (e: any) { Alert.alert('Error', e.message); }
                    finally { setSavingStrategy(false); }
                  }}
                  disabled={savingStrategy}>
                  <Text style={{color:'white', fontSize:16, fontWeight:'600'}}>
                    {savingStrategy ? 'Saving...' : 'Add Strategy'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Home Data Section (if parent has enabled sharing) */}
        {sharingStatus?.is_linked_to_parent && (
          <View style={styles.homeDataSection}>
            <View style={styles.homeDataHeader}>
              <MaterialIcons name="home" size={24} color="#4CAF50" />
              <Text style={styles.sectionTitle}>{t('home_data') || 'Home Data'}</Text>
            </View>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              {sharingStatus.home_sharing_enabled
                ? `✅ Parent sharing on · ${sharingStatus.school_sharing_enabled ? '✅ School sharing on' : '⏸ School sharing off'}`
                : `⏸ Parent sharing off · ${sharingStatus.school_sharing_enabled ? '✅ School sharing on' : '⏸ School sharing off'}`}
            </Text>
            {/* Share / No Share tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <View style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: sharingStatus.home_sharing_enabled && sharingStatus.school_sharing_enabled ? '#E8F5E9' : '#F5F5F5',
                borderWidth: 1.5,
                borderColor: sharingStatus.home_sharing_enabled && sharingStatus.school_sharing_enabled ? '#4CAF50' : '#E0E0E0',
              }}>
                <MaterialIcons name="visibility" size={16} color={sharingStatus.home_sharing_enabled && sharingStatus.school_sharing_enabled ? '#4CAF50' : '#CCC'} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: sharingStatus.home_sharing_enabled && sharingStatus.school_sharing_enabled ? '#4CAF50' : '#CCC', marginTop: 2 }}>
                  Share
                </Text>
                <Text style={{ fontSize: 9, color: '#999', marginTop: 1 }}>Both enabled</Text>
              </View>
              <View style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: !sharingStatus.home_sharing_enabled || !sharingStatus.school_sharing_enabled ? '#FFF3E0' : '#F5F5F5',
                borderWidth: 1.5,
                borderColor: !sharingStatus.home_sharing_enabled || !sharingStatus.school_sharing_enabled ? '#FF9800' : '#E0E0E0',
              }}>
                <MaterialIcons name="visibility-off" size={16} color={!sharingStatus.home_sharing_enabled || !sharingStatus.school_sharing_enabled ? '#FF9800' : '#CCC'} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: !sharingStatus.home_sharing_enabled || !sharingStatus.school_sharing_enabled ? '#FF9800' : '#CCC', marginTop: 2 }}>
                  No Share
                </Text>
                <Text style={{ fontSize: 9, color: '#999', marginTop: 1 }}>One or both off</Text>
              </View>
            </View>
            
            {sharingStatus.home_sharing_enabled && homeData ? (
              <>
                {/* Home Check-ins */}
                {homeData.home_checkins.length > 0 && (
                  <View style={styles.homeCheckinsContainer}>
                    <Text style={styles.homeSubtitle}>{t('home_checkins') || 'Home Check-ins'}</Text>
                    {homeData.home_checkins.slice(0, 5).map((checkin: any, index: number) => (
                      <View key={checkin.id || index} style={styles.homeCheckinItem}>
                        <View style={[styles.homeCheckinZone, { backgroundColor: ZONE_COLORS[checkin.zone as keyof typeof ZONE_COLORS] || '#999' }]}>
                          <Text style={styles.homeCheckinEmoji}>
                            {checkin.zone === 'blue' ? '😢' : checkin.zone === 'green' ? '😊' : checkin.zone === 'yellow' ? '😰' : '😠'}
                          </Text>
                        </View>
                        <View style={styles.homeCheckinDetails}>
                          <Text style={styles.homeCheckinZoneLabel}>{getZoneLabel(checkin.zone, t)}</Text>
                          <Text style={styles.homeCheckinTime}>
                            {new Date(checkin.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        </View>
                        <View style={styles.homeBadge}>
                          <MaterialIcons name="home" size={12} color="#4CAF50" />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Family Strategies */}
                {homeData.family_strategies.length > 0 && (
                  <View style={styles.familyStrategiesContainer}>
                    <Text style={styles.homeSubtitle}>{t('family_strategies') || 'Family Strategies'}</Text>
                    {homeData.family_strategies.map((strategy: any, index: number) => (
                      <View key={strategy.id || index} style={styles.familyStrategyItem}>
                        <MaterialIcons name={(strategy.icon || 'star') as any} size={20} color="#4CAF50" />
                        <View style={styles.familyStrategyInfo}>
                          <Text style={styles.familyStrategyName}>{strategy.strategy_name}</Text>
                          <Text style={styles.familyStrategyDesc}>{strategy.strategy_description}</Text>
                        </View>
                        <View style={[styles.strategyZoneBadge, { backgroundColor: (ZONE_COLORS[strategy.zone as keyof typeof ZONE_COLORS] || '#999') + '30' }]}>
                          <Text style={{ color: ZONE_COLORS[strategy.zone as keyof typeof ZONE_COLORS] || '#999', fontSize: 10 }}>{strategy.zone}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                {homeData.home_checkins.length === 0 && homeData.family_strategies.length === 0 && (
                  <View style={styles.noHomeData}>
                    <MaterialIcons name="info" size={32} color="#CCC" />
                    <Text style={styles.noHomeDataText}>{t('no_home_data_yet') || 'No home data yet'}</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.sharingNotEnabled}>
                <MaterialIcons name="lock" size={32} color="#CCC" />
                <Text style={styles.sharingNotEnabledText}>
                  {t('parent_sharing_disabled') || 'Parent has not enabled home data sharing'}
                </Text>
                <Text style={styles.sharingNotEnabledHint}>
                  {t('parent_sharing_hint') || 'The parent can enable sharing from their dashboard'}
                </Text>
              </View>
            )}
          </View>
        )}
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
          setDisclaimerAccepted(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('share_student_tracking') || "Share Student's Emotion Tracking"}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLinkCodeModal(false);
                  setLinkCode(null);
                  setDisclaimerAccepted(false);
                }}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.linkCodeContent}>
              {/* Already Linked State */}
              {sharingStatus?.is_linked_to_parent ? (
                <View style={styles.linkedStateContainer}>
                  <MaterialIcons name="link" size={64} color="#4CAF50" />
                  <Text style={styles.linkedStateTitle}>{t('student_linked') || 'Student is Linked'}</Text>
                  <Text style={styles.linkedStateDesc}>
                    {t('student_linked_desc') || 'This student is connected to a parent account. The parent can view check-ins from home.'}
                  </Text>
                  
                  <View style={styles.sharingStatusRow}>
                    <MaterialIcons 
                      name={sharingStatus.home_sharing_enabled ? 'visibility' : 'visibility-off'} 
                      size={20} 
                      color={sharingStatus.home_sharing_enabled ? '#4CAF50' : '#999'} 
                    />
                    <Text style={styles.sharingStatusText}>
                      {sharingStatus.home_sharing_enabled 
                        ? (t('home_sharing_on') || 'Home data sharing is ON') 
                        : (t('home_sharing_off') || 'Home data sharing is OFF')
                      }
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.unlinkStudentButton}
                    onPress={() => {
                      Alert.alert(
                        t('unlink_student') || 'Unlink Student',
                        t('confirm_unlink_student') || 'Are you sure you want to unlink this student from the parent? They will need a new code to reconnect.',
                        [
                          { text: t('cancel') || 'Cancel', style: 'cancel' },
                          {
                            text: t('unlink') || 'Unlink',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await teacherApi.unlinkStudent(student.id);
                                Alert.alert(t('success') || 'Success', 'Student has been unlinked from parent. They will need a new code to reconnect.');
                                setShowLinkCodeModal(false);
                                setSharingStatus({ is_linked_to_parent: false, home_sharing_enabled: false, school_sharing_enabled: false, parent_name: null, link_count: 0 });
                                setHomeData(null);
                                setLinkCode(null);
                                setShowLinkCodeModal(false);
                                // Refresh sharing status
                                const newStatus = await teacherHomeDataApi.getSharingStatus(student.id);
                                setSharingStatus(newStatus);
                              } catch (error: any) {
                                Alert.alert(t('error') || 'Error', error.message || 'Failed to unlink');
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <MaterialIcons name="link-off" size={20} color="#F44336" />
                    <Text style={styles.unlinkStudentButtonText}>{t('unlink_student') || 'Unlink Student'}</Text>
                  </TouchableOpacity>
                </View>
              ) : !disclaimerAccepted ? (
                // Disclaimer step
                <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={true}>
                  <Text style={styles.disclaimerTitle}>{t('sharing_disclaimer_title') || 'Consent to Share Access'}</Text>
                  <Text style={styles.disclaimerText}>{t('sharing_disclaimer_text')}</Text>
                  <View style={styles.disclaimerButtons}>
                    <TouchableOpacity
                      style={[styles.generateCodeButton, { backgroundColor: '#999', flex: 1, marginRight: 8 }]}
                      onPress={() => { setShowLinkCodeModal(false); setDisclaimerAccepted(false); }}
                    >
                      <Text style={styles.generateCodeButtonText}>{t('cancel') || 'Cancel'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.generateCodeButton, { flex: 1.5 }]}
                      onPress={() => setDisclaimerAccepted(true)}
                    >
                      <Text style={styles.generateCodeButtonText}>{t('i_agree_and_continue') || 'I Agree & Continue'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : !linkCode ? (
                <>
                  <MaterialIcons name="family-restroom" size={64} color="#4A90D9" />
                  <Text style={styles.linkCodeDescription}>
                    Generate a code for the parent/caregiver. They will enter this code in the Parent section of the app to view {student.name}'s emotion check-ins at home.
                  </Text>
                  <TouchableOpacity
                    style={[styles.generateCodeButton, generatingCode && styles.generateCodeButtonDisabled]}
                    onPress={async () => {
                      setGeneratingCode(true);
                      try {
                        const result = await teacherApi.generateLinkCode(student.id);
                        setLinkCode(result.link_code);
                      } catch (error: any) {
                        console.error('Generate link code error:', error);
                        // Show more helpful error message
                        let errorMessage = 'Failed to generate link code.';
                        if (error.message?.includes('Not authenticated') || error.message?.includes('401')) {
                          errorMessage = 'Your session has expired. Please go back, log out from Settings, and log back in as a Teacher.';
                        } else if (error.message?.includes('teacher') || error.message?.includes('403')) {
                          errorMessage = 'Only teachers can generate parent link codes. Please make sure you selected "Teacher" when you logged in.';
                        } else {
                          errorMessage = error.message || 'Please try again.';
                        }
                        Alert.alert('Error', errorMessage);
                      } finally {
                        setGeneratingCode(false);
                      }
                    }}
                    disabled={generatingCode}
                  >
                    <MaterialIcons name="vpn-key" size={24} color="white" />
                    <Text style={styles.generateCodeButtonText}>
                      {generatingCode ? (t('generating') || 'Generating...') : (t('generate_code') || 'Generate Parent Code')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
                  <Text style={styles.linkCodeLabel}>{t('parent_link_code') || 'Parent Link Code:'}</Text>
                  <Text style={styles.linkCodeValue}>{linkCode}</Text>
                  <Text style={styles.linkCodeNote}>
                    {t('access_expires_30_days') || 'Access expires in 30 days'}. {t('share_code_instructions') || 'Share it with the parent so they can link their account.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.shareCodeButton}
                    onPress={() => {
                      Share.share({
                        message: `Link code for ${student.name} in Class of Happiness app: ${linkCode}\n\nUse this code in the Parent section to connect your account. Access expires in 30 days.`,
                      });
                    }}
                  >
                    <MaterialIcons name="share" size={24} color="white" />
                    <Text style={styles.shareCodeButtonText}>{t('share_code') || 'Share Code'}</Text>
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
  studentName: { fontSize: 22, fontWeight: 'bold', color: '#333', marginTop: 10, textAlign: 'center' },
  studentClassroom: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    flexShrink: 1,
  },
  iconBtnLabel: { fontSize: 9, color: "#5C6BC0", marginTop: 2, fontWeight: "600", textAlign: "center" },
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
  disclaimerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  disclaimerText: {
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
    marginBottom: 16,
  },
  disclaimerButtons: {
    flexDirection: 'row',
    marginTop: 8,
    paddingBottom: 20,
  },
  // Home Data Section Styles
  homeDataSection: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  homeDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sharingEnabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 'auto',
  },
  sharingEnabledText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  sharingDisabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 'auto',
  },
  sharingDisabledText: {
    fontSize: 12,
    color: '#999',
  },
  homeCheckinsContainer: {
    marginBottom: 16,
  },
  homeSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  homeCheckinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  homeCheckinZone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeCheckinEmoji: {
    fontSize: 16,
  },
  homeCheckinDetails: {
    flex: 1,
    marginLeft: 10,
  },
  homeCheckinZoneLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  homeCheckinTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  homeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  familyStrategiesContainer: {
    marginBottom: 8,
  },
  familyStrategyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  familyStrategyInfo: {
    flex: 1,
    marginLeft: 10,
  },
  familyStrategyName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  familyStrategyDesc: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  strategyZoneBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  noHomeData: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noHomeDataText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  linkedBadge: { flexDirection:'row', alignItems:'center', backgroundColor:'#5C6BC0', paddingHorizontal:8, paddingVertical:3, borderRadius:10, gap:4, marginTop:4, alignSelf:'flex-start' },
  linkedBadgeText: { fontSize:11, color:'white', fontWeight:'600' },
  calendarSection: { backgroundColor:'white', borderRadius:16, padding:16, marginBottom:16 },
  calendarGrid: { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  calendarDay: { alignItems:'center', width:38 },
  calendarDayName: { fontSize:9, color:'#888', marginBottom:3 },
  calendarDayCircle: { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  calendarDayNum: { fontSize:11, fontWeight:'700', color:'white' },
  calendarBadges: { flexDirection:'row', gap:2, marginTop:2 },
  calendarBadge: { width:12, height:12, borderRadius:6, alignItems:'center', justifyContent:'center' },
  calendarBadgeText: { fontSize:7, color:'white', fontWeight:'700' },
  calendarLegend: { flexDirection:'row', gap:16, marginTop:10, justifyContent:'center' },



  zoneDistSection: { backgroundColor:'white', borderRadius:16, padding:16, marginBottom:16 },
  sectionHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:12 },
  dataTabRow: { flexDirection:'row', backgroundColor:'#F5F5F5', borderRadius:10, padding:3, marginBottom:12, gap:3 },
  dataTab: { flex:1, paddingVertical:7, borderRadius:8, alignItems:'center' },
  dataTabActive: { backgroundColor:'white' },
  dataTabText: { fontSize:12, color:'#888', fontWeight:'500' },
  dataTabTextActive: { color:'#333', fontWeight:'600' },
  zoneDistBars: { gap:10 },
  zoneDistRow: { flexDirection:'row', alignItems:'center', gap:8 },
  zoneDistDot: { width:12, height:12, borderRadius:6, flexShrink:0 },
  zoneDistLabel: { fontSize:12, color:'#333', width:50 },
  zoneDistBarBg: { flex:1, height:10, backgroundColor:'#F0F0F0', borderRadius:5, overflow:'hidden' },
  zoneDistBar: { height:10, borderRadius:5 },
  zoneDistPct: { fontSize:12, fontWeight:'600', color:'#333', width:35, textAlign:'right' },
  zoneDistCount: { fontSize:10, color:'#888', width:28 },

  stratSourceLabel: { fontSize:12, fontWeight:'600', color:'#888', marginBottom:8, marginTop:8 },
  strategyRow: { flexDirection:'row', alignItems:'center', backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginBottom:6, gap:10 },
  strategyInfo: { flex:1 },

  strategyDesc: { fontSize:11, color:'#888', marginTop:2 },
  shareToggleBtn: { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:8, paddingVertical:5, borderRadius:8, backgroundColor:'#F0F0F0' },
  shareToggleBtnActive: { backgroundColor:'#4CAF50' },
  shareToggleText: { fontSize:10, color:'#888', fontWeight:'500' },
  shareToggleTextActive: { color:'white' },
  zonePill: { paddingHorizontal:7, paddingVertical:3, borderRadius:8 },
  addStratBtn: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#5C6BC0', paddingHorizontal:10, paddingVertical:6, borderRadius:8, marginLeft:'auto' },
  addStratBtnText: { fontSize:12, color:'white', fontWeight:'600' },
  emptyStrategies: { alignItems:'center', paddingVertical:24, gap:8 },
  emptyText: { fontSize:13, color:'#999', textAlign:'center' },




  inputLabel: { fontSize:13, fontWeight:'600', color:'#555', marginBottom:6 },
  textInput: { backgroundColor:'#F5F5F5', borderRadius:10, padding:12, fontSize:15, color:'#333', marginBottom:14 },
  sharingNotEnabled: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  sharingNotEnabledText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  sharingNotEnabledHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  linkedStateContainer: {
    alignItems: 'center',
    padding: 20,
  },
  linkedStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 12,
  },
  linkedStateDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sharingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  sharingStatusText: {
    fontSize: 14,
    color: '#666',
  },
  unlinkStudentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  unlinkStudentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  // Tooltip styles
  tooltipContainer: {
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    top: -45,
    left: '50%',
    transform: [{ translateX: -60 }],
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 100,
    minWidth: 120,
  },
  tooltipRight: {
    left: 'auto',
    right: -10,
    transform: [],
  },
  tooltipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#333',
  },
  tooltipArrowRight: {
    left: 'auto',
    right: 15,
    marginLeft: 0,
  },
});
