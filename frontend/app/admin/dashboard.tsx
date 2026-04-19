import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONES = ['blue', 'green', 'yellow', 'red'];

async function apiCall(endpoint: string, token: string | null, options: any = {}) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, {
    headers,
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { user, t } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'strategies' | 'settings'>('overview');
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('session_token').then(t => setAuthToken(t));
  }, []);
  const [loading, setLoading] = useState(false);

  // Stats
  const [stats, setStats] = useState<any>(null);

  // Wellbeing alerts
  const [alerts, setAlerts] = useState<any[]>([]);

  // Teacher strategies
  const [teacherStrategies, setTeacherStrategies] = useState<any[]>([]);
  const [newStratName, setNewStratName] = useState('');
  const [newStratDesc, setNewStratDesc] = useState('');
  const [newStratZone, setNewStratZone] = useState('blue');
  const [newStratIcon, setNewStratIcon] = useState('star');

  // Settings
  const [wellbeingEmail, setWellbeingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const data = await apiCall('/admin/stats', authToken);
        setStats(data);
      } else if (activeTab === 'alerts') {
        const data = await apiCall('/admin/wellbeing-alerts', authToken);
        setAlerts(data);
      } else if (activeTab === 'strategies') {
        const data = await apiCall('/admin/teacher-strategies', authToken);
        setTeacherStrategies(data);
      } else if (activeTab === 'settings') {
        const data = await apiCall('/admin/settings', authToken);
        setWellbeingEmail(data.wellbeing_email || '');
      }
    } catch (e) {
      console.error('Admin load error:', e);
    } finally {
      setLoading(false);
    }
  };

  const saveWellbeingEmail = async () => {
    if (!wellbeingEmail.trim()) return;
    setSavingEmail(true);
    try {
      await apiCall('/admin/settings', {
        method: 'POST',
        body: JSON.stringify({ key: 'wellbeing_email', value: wellbeingEmail.trim() }),
      });
      Alert.alert('✅ Saved', `Wellbeing alerts will be sent to ${wellbeingEmail}`);
    } catch {
      Alert.alert('Error', 'Could not save email.');
    } finally {
      setSavingEmail(false);
    }
  };

  const addTeacherStrategy = async () => {
    if (!newStratName.trim()) {
      Alert.alert('Name required', 'Please enter a strategy name.');
      return;
    }
    try {
      await apiCall('/admin/teacher-strategies', {
        method: 'POST',
        body: JSON.stringify({ name: newStratName.trim(), description: newStratDesc.trim(), zone: newStratZone, icon: newStratIcon }),
      });
      setNewStratName('');
      setNewStratDesc('');
      Alert.alert('✅ Added', 'Strategy added for all teachers.');
      loadData();
    } catch {
      Alert.alert('Error', 'Could not add strategy.');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        {user && <Text style={styles.headerSub}>{user.name || user.email}</Text>}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {[
          { id: 'overview', icon: 'bar-chart', label: 'Overview' },
          { id: 'alerts', icon: 'notifications-active', label: 'Alerts' },
          { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
          { id: 'settings', icon: 'settings', label: 'Settings' },
        ].map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <MaterialIcons name={tab.icon as any} size={20} color={activeTab === tab.id ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#5C6BC0" style={{ marginTop: 40 }} />}

        {/* OVERVIEW */}
        {!loading && activeTab === 'overview' && (
          <View>
            <Text style={styles.sectionTitle}>School Overview</Text>
            {stats ? (
              <View style={styles.statsGrid}>
                {[
                  { label: 'Total Students', value: stats.total_students || 0, icon: 'child-care', color: '#4CAF50' },
                  { label: 'Total Teachers', value: stats.total_teachers || 0, icon: 'school', color: '#FFC107' },
                  { label: 'Check-ins Today', value: stats.checkins_today || 0, icon: 'favorite', color: '#4A90D9' },
                  { label: 'Active Users', value: stats.active_users || 0, icon: 'people', color: '#9C27B0' },
                ].map((s, i) => (
                  <View key={i} style={[styles.statCard, { borderTopColor: s.color }]}>
                    <MaterialIcons name={s.icon as any} size={28} color={s.color} />
                    <Text style={styles.statValue}>{s.value}</Text>
                    <Text style={styles.statLabel}>{s.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>No stats available</Text>
            )}
          </View>
        )}

        {/* WELLBEING ALERTS */}
        {!loading && activeTab === 'alerts' && (
          <View>
            <Text style={styles.sectionTitle}>Teacher Wellbeing Alerts</Text>
            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={16} color="#5C6BC0" />
              <Text style={styles.infoText}>
                These are private support requests from teachers. Handle with care and confidentiality.
              </Text>
            </View>
            {alerts.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                <Text style={styles.emptyText}>No alerts — all teachers are doing well! 🌟</Text>
              </View>
            ) : alerts.map((alert, i) => (
              <View key={alert.id || i} style={[styles.alertCard, alert.status === 'resolved' && styles.alertResolved]}>
                <View style={styles.alertHeader}>
                  <View style={[styles.alertDot, { backgroundColor: ZONE_COLORS[alert.zone] || '#999' }]} />
                  <Text style={styles.alertName}>{alert.teacher_name}</Text>
                  <Text style={styles.alertTime}>{formatDate(alert.created_at)}</Text>
                </View>
                <Text style={styles.alertMessage}>{alert.message}</Text>
                <View style={[styles.alertBadge, { backgroundColor: alert.status === 'resolved' ? '#E8F5E9' : '#FFF3E0' }]}>
                  <Text style={[styles.alertBadgeText, { color: alert.status === 'resolved' ? '#4CAF50' : '#FF9800' }]}>
                    {alert.status === 'resolved' ? '✅ Resolved' : '⏳ Pending'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* TEACHER STRATEGIES */}
        {!loading && activeTab === 'strategies' && (
          <View>
            <Text style={styles.sectionTitle}>Teacher Check-In Strategies</Text>
            <Text style={styles.sectionSubtitle}>
              These strategies appear for ALL teachers during their emotional check-in. Teachers cannot remove these.
            </Text>

            {/* Add new strategy */}
            <View style={styles.addStratBox}>
              <Text style={styles.addStratTitle}>Add Strategy for Teachers</Text>

              {/* Zone selector */}
              <Text style={styles.inputLabel}>Emotion Colour</Text>
              <View style={styles.zoneRow}>
                {ZONES.map(z => (
                  <TouchableOpacity
                    key={z}
                    style={[styles.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: newStratZone === z ? 1 : 0.4 }]}
                    onPress={() => setNewStratZone(z)}
                  >
                    <Text style={styles.zoneChipText}>{z}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Strategy Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Morning mindfulness routine"
                value={newStratName}
                onChangeText={setNewStratName}
                placeholderTextColor="#AAA"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Take 5 minutes before class for breathing"
                value={newStratDesc}
                onChangeText={setNewStratDesc}
                placeholderTextColor="#AAA"
              />

              <TouchableOpacity style={styles.addBtn} onPress={addTeacherStrategy}>
                <MaterialIcons name="add" size={20} color="white" />
                <Text style={styles.addBtnText}>Add Strategy</Text>
              </TouchableOpacity>
            </View>

            {/* Existing strategies */}
            <Text style={styles.sectionTitle}>Current Strategies</Text>
            {teacherStrategies.map((s, i) => (
              <View key={s.id || i} style={styles.stratCard}>
                <View style={[styles.stratDot, { backgroundColor: ZONE_COLORS[s.zone] || '#999' }]} />
                <View style={styles.stratInfo}>
                  <Text style={styles.stratName}>{s.name}</Text>
                  <Text style={styles.stratDesc}>{s.description}</Text>
                </View>
                <View style={[styles.zonePill, { backgroundColor: ZONE_COLORS[s.zone] + '30' }]}>
                  <Text style={[styles.zonePillText, { color: ZONE_COLORS[s.zone] }]}>{s.zone}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* SETTINGS */}
        {!loading && activeTab === 'settings' && (
          <View>
            <Text style={styles.sectionTitle}>Admin Settings</Text>

            <View style={styles.settingCard}>
              <MaterialIcons name="email" size={24} color="#5C6BC0" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Wellbeing Alert Email</Text>
                <Text style={styles.settingDesc}>
                  When a teacher taps "Support", this email address will be notified.
                  Use your principal or school psychologist's email.
                </Text>
                <TextInput
                  style={styles.emailInput}
                  placeholder="principal@school.edu"
                  value={wellbeingEmail}
                  onChangeText={setWellbeingEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#AAA"
                />
                <TouchableOpacity
                  style={[styles.saveBtn, savingEmail && { opacity: 0.6 }]}
                  onPress={saveWellbeingEmail}
                  disabled={savingEmail}
                >
                  <Text style={styles.saveBtnText}>{savingEmail ? 'Saving...' : 'Save Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.settingCard}>
              <MaterialIcons name="info-outline" size={24} color="#888" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>App Version</Text>
                <Text style={styles.settingDesc}>Class of Happiness v2.0 — April 2026</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { backgroundColor: '#5C6BC0', padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#5C6BC0' },
  tabLabel: { fontSize: 10, color: '#999', fontWeight: '500' },
  tabLabelActive: { color: '#5C6BC0', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginBottom: 8, marginTop: 8 },
  sectionSubtitle: { fontSize: 13, color: '#666', marginBottom: 16, lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { width: '47%', backgroundColor: 'white', borderRadius: 14, padding: 16, alignItems: 'center', borderTopWidth: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  statValue: { fontSize: 32, fontWeight: 'bold', color: '#333', marginTop: 8 },
  statLabel: { fontSize: 12, color: '#888', marginTop: 4, textAlign: 'center' },
  infoBox: { flexDirection: 'row', backgroundColor: '#E8EAF6', borderRadius: 10, padding: 12, gap: 8, marginBottom: 16, alignItems: 'flex-start' },
  infoText: { fontSize: 13, color: '#5C6BC0', flex: 1, lineHeight: 18 },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: '#999', textAlign: 'center', marginTop: 12 },
  alertCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FF9800' },
  alertResolved: { borderLeftColor: '#4CAF50', opacity: 0.8 },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  alertDot: { width: 12, height: 12, borderRadius: 6 },
  alertName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#333' },
  alertTime: { fontSize: 12, color: '#999' },
  alertMessage: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 8 },
  alertBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  alertBadgeText: { fontSize: 12, fontWeight: '600' },
  addStratBox: { backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  addStratTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
  inputLabel: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, color: '#333', marginBottom: 12 },
  zoneRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  zoneChip: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  zoneChipText: { color: 'white', fontWeight: '600', fontSize: 12, textTransform: 'capitalize' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, gap: 8 },
  addBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
  stratCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12 },
  stratDot: { width: 16, height: 16, borderRadius: 8 },
  stratInfo: { flex: 1 },
  stratName: { fontSize: 14, fontWeight: '600', color: '#333' },
  stratDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  zonePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  zonePillText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  settingCard: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 12, gap: 12, alignItems: 'flex-start' },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  settingDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 12 },
  emailInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, color: '#333', marginBottom: 10 },
  saveBtn: { backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 15 },
});
