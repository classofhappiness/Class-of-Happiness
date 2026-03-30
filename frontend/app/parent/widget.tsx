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
import { familyMembersApi, zoneLogsApi } from '../../src/utils/api';

const { width } = Dimensions.get('window');

interface EmotionSummary {
  memberId: string;
  memberName: string;
  lastEmotion: string | null;
  lastCheckIn: string | null;
  emotionColor: string;
  emotionEmoji: string;
}

const ZONE_CONFIG: Record<string, { color: string; emoji: string; labelKey: string }> = {
  blue: { color: '#4A90D9', emoji: '😢', labelKey: 'blue_desc_short' },
  green: { color: '#4CAF50', emoji: '😊', labelKey: 'green_desc_short' },
  yellow: { color: '#FFC107', emoji: '😰', labelKey: 'yellow_desc_short' },
  red: { color: '#F44336', emoji: '😠', labelKey: 'red_desc_short' },
};

export default function ParentWidgetScreen() {
  const router = useRouter();
  const { user, t } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [familySummary, setFamilySummary] = useState<EmotionSummary[]>([]);
  const [overallMood, setOverallMood] = useState<string>('green');
  
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
      const members = await familyMembersApi.getAll();
      
      // Get recent check-ins for each member
      const summaries: EmotionSummary[] = await Promise.all(
        members.map(async (member: any) => {
          try {
            // Get recent zone logs for this family member
            const logs = await zoneLogsApi.getRecent(member.id, 1);
            const lastLog = logs[0];
            
            return {
              memberId: member.id,
              memberName: member.name,
              lastEmotion: lastLog?.zone || null,
              lastCheckIn: lastLog?.created_at || null,
              emotionColor: lastLog ? ZONE_CONFIG[lastLog.zone]?.color || '#999' : '#999',
              emotionEmoji: lastLog ? ZONE_CONFIG[lastLog.zone]?.emoji || '❓' : '❓',
            };
          } catch {
            return {
              memberId: member.id,
              memberName: member.name,
              lastEmotion: null,
              lastCheckIn: null,
              emotionColor: '#999',
              emotionEmoji: '❓',
            };
          }
        })
      );
      
      setFamilySummary(summaries);
      
      // Calculate overall mood
      const validEmotions = summaries.filter(s => s.lastEmotion).map(s => s.lastEmotion);
      if (validEmotions.length > 0) {
        // Priority: red > yellow > blue > green
        if (validEmotions.includes('red')) setOverallMood('red');
        else if (validEmotions.includes('yellow')) setOverallMood('yellow');
        else if (validEmotions.includes('blue')) setOverallMood('blue');
        else setOverallMood('green');
      }
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

  const formatLastCheckIn = (dateStr: string | null) => {
    if (!dateStr) return t('no_checkin_yet') || 'No check-in yet';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return t('just_now') || 'Just now';
    if (diffMins < 60) return `${diffMins}${t('minutes_ago') || 'm ago'}`;
    if (diffHours < 24) return `${diffHours}${t('hours_ago') || 'h ago'}`;
    return `${diffDays}${t('days_ago') || 'd ago'}`;
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('family_widget') || 'Family Widget'}</Text>
        <TouchableOpacity onPress={handleAddToHomeScreen} style={styles.infoButton}>
          <MaterialIcons name="add-to-home-screen" size={24} color="#5C6BC0" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Widget Preview Section */}
        <Text style={styles.sectionTitle}>{t('widget_preview') || 'Widget Preview'}</Text>
        <Text style={styles.sectionSubtitle}>{t('widget_preview_desc') || 'This is how your home screen widget will look'}</Text>

        {/* Small Widget Preview */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>{t('small_widget') || 'Small Widget'}</Text>
          <View style={[styles.smallWidget, { backgroundColor: ZONE_CONFIG[overallMood].color + '20', borderColor: ZONE_CONFIG[overallMood].color }]}>
            <Text style={styles.smallWidgetEmoji}>{ZONE_CONFIG[overallMood].emoji}</Text>
            <Text style={styles.smallWidgetTitle}>{t('family') || 'Family'}</Text>
            <Text style={[styles.smallWidgetStatus, { color: ZONE_CONFIG[overallMood].color }]}>
              {getZoneLabel(overallMood)}
            </Text>
          </View>
        </View>

        {/* Medium Widget Preview */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>{t('medium_widget') || 'Medium Widget'}</Text>
          <View style={styles.mediumWidget}>
            <View style={styles.mediumWidgetHeader}>
              <Text style={styles.mediumWidgetTitle}>🏠 {t('family_emotions') || 'Family Emotions'}</Text>
              <Text style={styles.mediumWidgetTime}>{t('updated_just_now') || 'Updated just now'}</Text>
            </View>
            <View style={styles.mediumWidgetContent}>
              {familySummary.slice(0, 4).map((member, index) => (
                <View key={member.memberId} style={styles.memberPill}>
                  <Text style={styles.memberPillEmoji}>{member.emotionEmoji}</Text>
                  <Text style={styles.memberPillName} numberOfLines={1}>{member.memberName}</Text>
                </View>
              ))}
              {familySummary.length > 4 && (
                <View style={styles.memberPill}>
                  <Text style={styles.memberPillName}>+{familySummary.length - 4}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Large Widget Preview */}
        <View style={styles.widgetPreviewContainer}>
          <Text style={styles.widgetSize}>{t('large_widget') || 'Large Widget'}</Text>
          <View style={styles.largeWidget}>
            <View style={styles.largeWidgetHeader}>
              <Text style={styles.largeWidgetTitle}>🏠 {t('family_emotional_status') || 'Family Emotional Status'}</Text>
            </View>
            <View style={styles.largeWidgetGrid}>
              {familySummary.map((member) => (
                <View 
                  key={member.memberId} 
                  style={[styles.largeWidgetMember, { borderLeftColor: member.emotionColor }]}
                >
                  <Text style={styles.largeWidgetMemberEmoji}>{member.emotionEmoji}</Text>
                  <View style={styles.largeWidgetMemberInfo}>
                    <Text style={styles.largeWidgetMemberName}>{member.memberName}</Text>
                    <Text style={styles.largeWidgetMemberTime}>{formatLastCheckIn(member.lastCheckIn)}</Text>
                  </View>
                </View>
              ))}
              {familySummary.length === 0 && (
                <Text style={styles.noDataText}>No family members yet</Text>
              )}
            </View>
          </View>
        </View>

        {/* How to Add Section */}
        <View style={styles.instructionsCard}>
          <MaterialIcons name="widgets" size={32} color="#5C6BC0" />
          <Text style={styles.instructionsTitle}>Add Widget to Home Screen</Text>
          <Text style={styles.instructionsText}>
            {Platform.OS === 'ios' 
              ? 'Long press on your home screen, tap +, search for "Class of Happiness" and select a widget size.'
              : 'Long press on your home screen, tap Widgets, find "Class of Happiness" and drag to home screen.'}
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
            onPress={() => router.push('/parent/dashboard')}
          >
            <MaterialIcons name="dashboard" size={24} color="#5C6BC0" />
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
    height: 150,
    borderRadius: 24,
    backgroundColor: 'white',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  mediumWidgetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  mediumWidgetTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  mediumWidgetTime: { fontSize: 11, color: '#888' },
  mediumWidgetContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  memberPillEmoji: { fontSize: 20 },
  memberPillName: { fontSize: 13, fontWeight: '500', color: '#333', maxWidth: 80 },
  
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
  largeWidgetHeader: { marginBottom: 12 },
  largeWidgetTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  largeWidgetGrid: { gap: 8 },
  largeWidgetMember: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', padding: 12, borderRadius: 12, borderLeftWidth: 4 },
  largeWidgetMemberEmoji: { fontSize: 28, marginRight: 12 },
  largeWidgetMemberInfo: { flex: 1 },
  largeWidgetMemberName: { fontSize: 15, fontWeight: '600', color: '#333' },
  largeWidgetMemberTime: { fontSize: 12, color: '#888', marginTop: 2 },
  noDataText: { fontSize: 14, color: '#999', textAlign: 'center', paddingVertical: 20 },
  
  // Instructions
  instructionsCard: {
    backgroundColor: '#E8EAF6',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
  },
  instructionsTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 8 },
  instructionsText: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
  instructionsButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C6BC0', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, marginTop: 16, gap: 6 },
  instructionsButtonText: { color: 'white', fontWeight: '600', fontSize: 14 },
  
  // Quick Actions
  quickActions: { marginTop: 20 },
  quickAction: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white', padding: 16, borderRadius: 12, gap: 8 },
  quickActionText: { fontSize: 15, fontWeight: '600', color: '#5C6BC0' },
});
