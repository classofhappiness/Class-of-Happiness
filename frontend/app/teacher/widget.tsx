import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { studentsApi, classroomsApi, zoneLogsApi } from '../../src/utils/api';

const { width } = Dimensions.get('window');

interface ClassroomSummary {
  id: string;
  name: string;
  studentCount: number;
  emotionCounts: { blue: number; green: number; yellow: number; red: number };
  lastUpdate: string;
}

const ZONE_CONFIG: Record<string, { color: string; emoji: string; labelKey: string }> = {
  blue: { color: '#4A90D9', emoji: '😢', labelKey: 'blue_desc_short' },
  green: { color: '#4CAF50', emoji: '😊', labelKey: 'green_desc_short' },
  yellow: { color: '#FFC107', emoji: '😰', labelKey: 'yellow_desc_short' },
  red: { color: '#F44336', emoji: '😠', labelKey: 'red_desc_short' },
};

export default function TeacherWidgetScreen() {
  const router = useRouter();
  const { user, t } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [classrooms, setClassrooms] = useState<ClassroomSummary[]>([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [todayCheckIns, setTodayCheckIns] = useState(0);
  const [overallCounts, setOverallCounts] = useState({ blue: 0, green: 0, yellow: 0, red: 0 });
  
  // Helper to get translated zone label
  const getZoneLabel = (zone: string) => {
    const config = ZONE_CONFIG[zone];
    if (!config) return zone;
    return t(config.labelKey) || config.labelKey;
  };

  useEffect(() => {
    fetchWidgetData();
  }, []);

  const fetchWidgetData = async () => {
    try {
      // Get all students
      const students = await studentsApi.getAll();
      setTotalStudents(students.length);
      
      // Get classrooms
      const classroomList = await classroomsApi.getAll();
      
      // Calculate emotion counts from today's check-ins
      const counts = { blue: 0, green: 0, yellow: 0, red: 0 };
      let checkInCount = 0;
      const todayKey = new Date().toISOString().split('T')[0];

      try {
        const logs = await zoneLogsApi.getAll(undefined, undefined, 1);
        logs.forEach((log: any) => {
          if (!log?.timestamp?.startsWith(todayKey)) return;
          if (log.zone in counts) {
            counts[log.zone as keyof typeof counts] += 1;
            checkInCount += 1;
          }
        });
      } catch (error) {
        console.error('Error loading mood counts:', error);
      }

      // Classroom summaries with rough proportional split (UI preview purpose)
      const totalCount = Math.max(1, checkInCount);
      const classroomSummaries: ClassroomSummary[] = classroomList.map((classroom: any) => {
        const classroomStudentCount = students.filter((s: any) => s.classroom_id === classroom.id).length;
        const weightedCounts = {
          blue: Math.round((counts.blue / totalCount) * classroomStudentCount),
          green: Math.round((counts.green / totalCount) * classroomStudentCount),
          yellow: Math.round((counts.yellow / totalCount) * classroomStudentCount),
          red: Math.round((counts.red / totalCount) * classroomStudentCount),
        };
        return {
          id: classroom.id,
          name: classroom.name,
          studentCount: classroomStudentCount,
          emotionCounts: weightedCounts,
          lastUpdate: new Date().toISOString(),
        };
      });

      setOverallCounts(counts);
      setTodayCheckIns(checkInCount);
      setClassrooms(classroomSummaries);
    } catch (error) {
      console.error('Error fetching widget data:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchWidgetData();
    setRefreshing(false);
  };

  const handleAddToHomeScreen = () => {
    Alert.alert(
      t('add_widget_title') || 'Add Widget to Home Screen',
      Platform.OS === 'ios' 
        ? t('add_widget_ios') || 'To add this widget:\n\n1. Long press on your home screen\n2. Tap the + button (top left)\n3. Search for "Class of Happiness"\n4. Choose a widget size\n5. Tap "Add Widget"'
        : t('add_widget_android') || 'To add this widget:\n\n1. Long press on your home screen\n2. Tap "Widgets"\n3. Find "Class of Happiness"\n4. Long press and drag to home screen',
      [{ text: t('got_it') || 'Got it!' }]
    );
  };

  const getDominantEmotion = () => {
    const max = Math.max(overallCounts.blue, overallCounts.green, overallCounts.yellow, overallCounts.red);
    if (max === 0) return 'green';
    if (overallCounts.red === max) return 'red';
    if (overallCounts.yellow === max) return 'yellow';
    if (overallCounts.blue === max) return 'blue';
    return 'green';
  };

  const dominantEmotion = getDominantEmotion();
  const total = overallCounts.blue + overallCounts.green + overallCounts.yellow + overallCounts.red;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('classroom_widget') || 'Classroom Widget'}</Text>
        <TouchableOpacity onPress={handleAddToHomeScreen} style={styles.infoButton}>
          <MaterialIcons name="add-to-home-screen" size={24} color="#FFC107" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Widget Preview Section */}
        <Text style={styles.sectionTitle}>{t('widget_preview') || 'Widget Preview'}</Text>
        <Text style={styles.sectionSubtitle}>{t('widget_preview_desc_teacher') || 'Quick classroom emotional status at a glance'}</Text>

        {/* Small Widget Preview */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>{t('small_widget') || 'Small Widget'}</Text>
          <View style={[styles.smallWidget, { backgroundColor: ZONE_CONFIG[dominantEmotion].color + '20', borderColor: ZONE_CONFIG[dominantEmotion].color }]}>
            <Text style={styles.smallWidgetEmoji}>{ZONE_CONFIG[dominantEmotion].emoji}</Text>
            <Text style={styles.smallWidgetTitle}>{t('classroom') || 'Classroom'}</Text>
            <Text style={[styles.smallWidgetStatus, { color: ZONE_CONFIG[dominantEmotion].color }]}>
              {totalStudents} {t('students') || 'Students'}
            </Text>
          </View>
        </View>

        {/* Medium Widget Preview - Emotion Bar */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>{t('medium_widget') || 'Medium Widget'}</Text>
          <View style={styles.mediumWidget}>
            <View style={styles.mediumWidgetHeader}>
              <Text style={styles.mediumWidgetTitle}>🏫 Classroom Emotions</Text>
              <Text style={styles.mediumWidgetTime}>{todayCheckIns} check-ins</Text>
            </View>
            
            {/* Emotion Bar Chart */}
            <View style={styles.emotionBarContainer}>
              {total > 0 ? (
                <View style={styles.emotionBar}>
                  <View style={[styles.emotionSegment, { flex: overallCounts.blue || 0.1, backgroundColor: ZONE_CONFIG.blue.color }]} />
                  <View style={[styles.emotionSegment, { flex: overallCounts.green || 0.1, backgroundColor: ZONE_CONFIG.green.color }]} />
                  <View style={[styles.emotionSegment, { flex: overallCounts.yellow || 0.1, backgroundColor: ZONE_CONFIG.yellow.color }]} />
                  <View style={[styles.emotionSegment, { flex: overallCounts.red || 0.1, backgroundColor: ZONE_CONFIG.red.color }]} />
                </View>
              ) : (
                <View style={styles.emotionBar}>
                  <View style={[styles.emotionSegment, { flex: 1, backgroundColor: '#E0E0E0' }]} />
                </View>
              )}
            </View>
            
            {/* Legend */}
            <View style={styles.emotionLegend}>
              {Object.entries(ZONE_CONFIG).map(([key, config]) => (
                <View key={key} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: config.color }]} />
                  <Text style={styles.legendCount}>{overallCounts[key as keyof typeof overallCounts]}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Large Widget Preview */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>Large Widget</Text>
          <View style={styles.largeWidget}>
            <View style={styles.largeWidgetHeader}>
              <Text style={styles.largeWidgetTitle}>🏫 Classroom Emotional Status</Text>
            </View>
            
            {/* Stats Grid */}
            <View style={styles.statsGrid}>
              <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
                <Text style={styles.statEmoji}>{ZONE_CONFIG.blue.emoji}</Text>
                <Text style={styles.statCount}>{overallCounts.blue}</Text>
                <Text style={styles.statLabel}>Sad/Tired</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
                <Text style={styles.statEmoji}>{ZONE_CONFIG.green.emoji}</Text>
                <Text style={styles.statCount}>{overallCounts.green}</Text>
                <Text style={styles.statLabel}>Calm/Happy</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}>
                <Text style={styles.statEmoji}>{ZONE_CONFIG.yellow.emoji}</Text>
                <Text style={styles.statCount}>{overallCounts.yellow}</Text>
                <Text style={styles.statLabel}>Anxious</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: '#FFEBEE' }]}>
                <Text style={styles.statEmoji}>{ZONE_CONFIG.red.emoji}</Text>
                <Text style={styles.statCount}>{overallCounts.red}</Text>
                <Text style={styles.statLabel}>Angry</Text>
              </View>
            </View>
            
            <View style={styles.largeWidgetFooter}>
              <MaterialIcons name="school" size={16} color="#888" />
              <Text style={styles.largeWidgetFooterText}>{totalStudents} students total</Text>
            </View>
          </View>
        </View>

        {/* How to Add Section */}
        <View style={styles.instructionsCard}>
          <MaterialIcons name="widgets" size={32} color="#FFC107" />
          <Text style={styles.instructionsTitle}>Add Widget to Home Screen</Text>
          <Text style={styles.instructionsText}>
            Get instant updates on your classroom emotional status right from your home screen.
          </Text>
          <TouchableOpacity style={styles.instructionsButton} onPress={handleAddToHomeScreen}>
            <MaterialIcons name="help-outline" size={18} color="white" />
            <Text style={styles.instructionsButtonText}>Show Instructions</Text>
          </TouchableOpacity>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={styles.quickAction}
            onPress={() => router.push('/teacher/dashboard')}
          >
            <MaterialIcons name="dashboard" size={24} color="#FFC107" />
            <Text style={styles.quickActionText}>Open Dashboard</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#333', marginLeft: 12 },
  infoButton: { padding: 4 },
  scrollContent: { padding: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 4 },
  sectionSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  widgetPreviewContainer: { marginBottom: 24 },
  widgetSize: { fontSize: 12, fontWeight: '600', color: '#888', marginBottom: 8, textTransform: 'uppercase' },
  
  // Small Widget
  smallWidget: {
    width: 150,
    height: 150,
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    alignSelf: 'center',
  },
  smallWidgetEmoji: { fontSize: 48, marginBottom: 8 },
  smallWidgetTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  smallWidgetStatus: { fontSize: 12, fontWeight: '500', marginTop: 4 },
  
  // Medium Widget
  mediumWidget: {
    width: width - 32,
    borderRadius: 24,
    backgroundColor: 'white',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mediumWidgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  mediumWidgetTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  mediumWidgetTime: { fontSize: 12, color: '#888' },
  emotionBarContainer: { marginBottom: 12 },
  emotionBar: { flexDirection: 'row', height: 32, borderRadius: 16, overflow: 'hidden' },
  emotionSegment: { height: '100%' },
  emotionLegend: { flexDirection: 'row', justifyContent: 'space-around' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendCount: { fontSize: 14, fontWeight: '600', color: '#333' },
  
  // Large Widget
  largeWidget: {
    width: width - 32,
    borderRadius: 24,
    backgroundColor: 'white',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  largeWidgetHeader: { marginBottom: 16 },
  largeWidgetTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: { width: '48%', padding: 12, borderRadius: 12, alignItems: 'center' },
  statEmoji: { fontSize: 28 },
  statCount: { fontSize: 24, fontWeight: '700', color: '#333', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },
  largeWidgetFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 6 },
  largeWidgetFooterText: { fontSize: 13, color: '#888' },
  
  // Instructions
  instructionsCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  instructionsTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 8 },
  instructionsText: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
  instructionsButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFC107', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginTop: 16, gap: 6 },
  instructionsButtonText: { color: '#333', fontWeight: '600', fontSize: 14 },
  
  // Quick Actions
  quickActions: { marginTop: 20 },
  quickAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, gap: 8 },
  quickActionText: { fontSize: 15, fontWeight: '600', color: '#FFC107' },
});
