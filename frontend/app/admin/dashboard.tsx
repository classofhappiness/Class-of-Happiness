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
const ZONE_LABELS: Record<string, string> = {
  blue: 'Low Energy', green: 'Steady', yellow: 'Stressed', red: 'Overloaded',
};

async function apiCall(endpoint: string, token: string | null, options: any = {}) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, { headers, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// ─── SUPER ADMIN DASHBOARD ───────────────────────────────────────────────────
function SuperAdminDashboard({ authToken, user }: { authToken: string | null; user: any }) {
  const [activeTab, setActiveTab] = useState<'analytics' | 'strategies' | 'settings'>('analytics');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [teacherStrategies, setTeacherStrategies] = useState<any[]>([]);
  const [studentStrategies, setStudentStrategies] = useState<any[]>([]);
  const [newStratName, setNewStratName] = useState('');
  const [newStratDesc, setNewStratDesc] = useState('');
  const [newStratZone, setNewStratZone] = useState('blue');
  const [newStratType, setNewStratType] = useState<'teacher' | 'student'>('teacher');
  const [appVersion] = useState('2.0 — April 2026');

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'analytics') {
        try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch { setStats(null); }
      } else if (activeTab === 'strategies') {
        try { const d = await apiCall('/admin/teacher-strategies', authToken); setTeacherStrategies(d); } catch { setTeacherStrategies([]); }
        try { const d = await apiCall('/strategies/all', authToken); setStudentStrategies(d); } catch { setStudentStrategies([]); }
      }
    } finally { setLoading(false); }
  };

  const addStrategy = async () => {
    if (!newStratName.trim()) { Alert.alert('Name required'); return; }
    try {
      const endpoint = newStratType === 'teacher' ? '/admin/teacher-strategies' : '/strategies';
      await apiCall(endpoint, authToken, {
        method: 'POST',
        body: JSON.stringify({ name: newStratName.trim(), description: newStratDesc.trim(), zone: newStratZone, icon: 'star' }),
      });
      setNewStratName(''); setNewStratDesc('');
      Alert.alert('✅ Added', `Strategy added for all ${newStratType}s.`);
      loadData();
    } catch { Alert.alert('Error', 'Could not add strategy.'); }
  };

  const tabs = [
    { id: 'analytics', icon: 'bar-chart', label: 'Analytics' },
    { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
    { id: 'settings', icon: 'settings', label: 'App Info' },
  ];

  return (
    <>
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && styles.tabActive]} onPress={() => setActiveTab(tab.id as any)}>
            <MaterialIcons name={tab.icon as any} size={20} color={activeTab === tab.id ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {loading && <ActivityIndicator size="large" color="#5C6BC0" style={{ marginTop: 40 }} />}

        {/* ANALYTICS */}
        {!loading && activeTab === 'analytics' && (
          <View>
            <Text style={styles.sectionTitle}>Global App Analytics</Text>
            <Text style={styles.sectionSubtitle}>Aggregated data only — no individual names or comments shown.</Text>
            <View style={styles.statsGrid}>
              {[
                { label: 'Total Students', value: stats?.total_students ?? '—', icon: 'child-care', color: '#4CAF50' },
                { label: 'Total Teachers', value: stats?.total_teachers ?? '—', icon: 'school', color: '#FFC107' },
                { label: 'Check-ins Today', value: stats?.checkins_today ?? '—', icon: 'favorite', color: '#4A90D9' },
                { label: 'Schools Active', value: stats?.total_schools ?? '—', icon: 'account-balance', color: '#9C27B0' },
              ].map((s, i) => (
                <View key={i} style={[styles.statCard, { borderTopColor: s.color }]}>
                  <MaterialIcons name={s.icon as any} size={28} color={s.color} />
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Emotion Colour Trends</Text>
            <Text style={styles.sectionSubtitle}>Which colours are most commonly checked in across all schools this week.</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(zone => {
                const count = stats?.zone_counts?.[zone] ?? 0;
                const total = stats ? Object.values(stats.zone_counts || {}).reduce((a: any, b: any) => a + b, 0) : 1;
                const pct = total > 0 ? Math.round((count as number / (total as number)) * 100) : 0;
                return (
                  <View key={zone} style={styles.colourRow}>
                    <View style={[styles.colourDot, { backgroundColor: ZONE_COLORS[zone] }]} />
                    <Text style={styles.colourLabel}>{ZONE_LABELS[zone]}</Text>
                    <View style={styles.colourBarBg}>
                      <View style={[styles.colourBar, { width: `${pct}%` as any, backgroundColor: ZONE_COLORS[zone] }]} />
                    </View>
                    <Text style={styles.colourPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Teacher Wellbeing</Text>
            <View style={styles.infoBox}>
              <MaterialIcons name="info" size={16} color="#5C6BC0" />
              <Text style={styles.infoText}>
                Support requests this month: {stats?.support_requests ?? '—'} {'\n'}
                Most used teacher strategy: {stats?.top_teacher_strategy ?? '—'} {'\n'}
                Privacy protected — no individual comments visible here.
              </Text>
            </View>
          </View>
        )}

        {/* STRATEGIES */}
        {!loading && activeTab === 'strategies' && (
          <View>
            <Text style={styles.sectionTitle}>Global Strategies</Text>
            <Text style={styles.sectionSubtitle}>Strategies you add here appear for ALL app users across every school.</Text>

            {/* Type selector */}
            <View style={styles.typeRow}>
              {(['teacher', 'student'] as const).map(t => (
                <TouchableOpacity key={t} style={[styles.typeChip, newStratType === t && styles.typeChipActive]} onPress={() => setNewStratType(t)}>
                  <Text style={[styles.typeChipText, newStratType === t && styles.typeChipTextActive]}>
                    {t === 'teacher' ? '👩‍🏫 Teacher' : '🧒 Student'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.addStratBox}>
              <Text style={styles.addStratTitle}>Add {newStratType === 'teacher' ? 'Teacher' : 'Student'} Strategy</Text>
              <View style={styles.zoneRow}>
                {ZONES.map(z => (
                  <TouchableOpacity key={z} style={[styles.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: newStratZone === z ? 1 : 0.35 }]} onPress={() => setNewStratZone(z)}>
                    <Text style={styles.zoneChipText}>{z[0].toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Strategy name..." value={newStratName} onChangeText={setNewStratName} placeholderTextColor="#AAA" />
              <TextInput style={styles.input} placeholder="Description (optional)..." value={newStratDesc} onChangeText={setNewStratDesc} placeholderTextColor="#AAA" />
              <TouchableOpacity style={styles.addBtn} onPress={addStrategy}>
                <MaterialIcons name="add" size={20} color="white" />
                <Text style={styles.addBtnText}>Add Strategy</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionTitle}>Teacher Strategies ({teacherStrategies.length})</Text>
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

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Student Strategies ({studentStrategies.length})</Text>
            {studentStrategies.slice(0, 10).map((s, i) => (
              <View key={s.id || i} style={styles.stratCard}>
                <View style={[styles.stratDot, { backgroundColor: ZONE_COLORS[s.zone] || '#999' }]} />
                <View style={styles.stratInfo}>
                  <Text style={styles.stratName}>{s.name}</Text>
                  <Text style={styles.stratDesc}>{s.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* APP INFO */}
        {!loading && activeTab === 'settings' && (
          <View>
            <Text style={styles.sectionTitle}>App Information</Text>
            {[
              { icon: 'info', title: 'Version', desc: `Class of Happiness v${appVersion}` },
              { icon: 'people', title: 'Total Registered Users', desc: `${stats?.total_users ?? '—'} users globally` },
              { icon: 'school', title: 'Active Schools', desc: `${stats?.total_schools ?? '—'} schools` },
              { icon: 'attach-money', title: 'Pricing Model', desc: 'Free → Family €3.99/mo → School €399-1499/yr' },
            ].map((item, i) => (
              <View key={i} style={styles.settingCard}>
                <MaterialIcons name={item.icon as any} size={24} color="#5C6BC0" />
                <View style={styles.settingInfo}>
                  <Text style={styles.settingTitle}>{item.title}</Text>
                  <Text style={styles.settingDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ─── SCHOOL ADMIN DASHBOARD ───────────────────────────────────────────────────
function SchoolAdminDashboard({ authToken, user }: { authToken: string | null; user: any }) {
  const [activeTab, setActiveTab] = useState<'overview' | 'alerts' | 'strategies' | 'settings'>('overview');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [teacherStrategies, setTeacherStrategies] = useState<any[]>([]);
  const [newStratName, setNewStratName] = useState('');
  const [newStratDesc, setNewStratDesc] = useState('');
  const [newStratZone, setNewStratZone] = useState('blue');
  const [wellbeingEmail, setWellbeingEmail] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);

  useEffect(() => { loadData(); }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch { setStats(null); }
        try { const d = await apiCall('/students', authToken); setStudents(d); } catch {}
        try { const d = await apiCall('/classrooms', authToken); setTeachers(d); } catch {}
      } else if (activeTab === 'alerts') {
        try { const d = await apiCall('/admin/wellbeing-alerts', authToken); setAlerts(d); } catch { setAlerts([]); }
      } else if (activeTab === 'strategies') {
        try { const d = await apiCall('/admin/teacher-strategies', authToken); setTeacherStrategies(d); } catch { setTeacherStrategies([]); }
      } else if (activeTab === 'settings') {
        try { const d = await apiCall('/admin/settings', authToken); setWellbeingEmail(d.wellbeing_email || ''); } catch {}
      }
    } finally { setLoading(false); }
  };

  const saveWellbeingEmail = async () => {
    if (!wellbeingEmail.trim()) return;
    setSavingEmail(true);
    try {
      await apiCall('/admin/settings', authToken, { method: 'POST', body: JSON.stringify({ key: 'wellbeing_email', value: wellbeingEmail.trim() }) });
      Alert.alert('✅ Saved', `Alerts will go to ${wellbeingEmail}`);
    } catch { Alert.alert('Error', 'Could not save.'); }
    finally { setSavingEmail(false); }
  };

  const addStrategy = async () => {
    if (!newStratName.trim()) { Alert.alert('Name required'); return; }
    try {
      await apiCall('/admin/teacher-strategies', authToken, { method: 'POST', body: JSON.stringify({ name: newStratName.trim(), description: newStratDesc.trim(), zone: newStratZone, icon: 'star' }) });
      setNewStratName(''); setNewStratDesc('');
      Alert.alert('✅ Added', 'Strategy added for your school teachers.');
      loadData();
    } catch { Alert.alert('Error', 'Could not add strategy.'); }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const tabs = [
    { id: 'overview', icon: 'bar-chart', label: 'Overview' },
    { id: 'alerts', icon: 'notifications-active', label: 'Alerts' },
    { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <>
      <View style={styles.tabBar}>
        {tabs.map(tab => (
          <TouchableOpacity key={tab.id} style={[styles.tab, activeTab === tab.id && styles.tabActive]} onPress={() => setActiveTab(tab.id as any)}>
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
            <View style={styles.statsGrid}>
              {[
                { label: 'Students', value: stats?.total_students ?? students.length, icon: 'child-care', color: '#4CAF50' },
                { label: 'Teachers', value: stats?.total_teachers ?? teachers.length, icon: 'school', color: '#FFC107' },
                { label: 'Check-ins Today', value: stats?.checkins_today ?? '—', icon: 'favorite', color: '#4A90D9' },
                { label: 'Active Users', value: stats?.active_users ?? '—', icon: 'people', color: '#9C27B0' },
              ].map((s, i) => (
                <TouchableOpacity key={i} style={[styles.statCard, { borderTopColor: s.color }]} onPress={() => {}}>
                  <MaterialIcons name={s.icon as any} size={28} color={s.color} />
                  <Text style={styles.statValue}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionTitle}>Emotion Colour Trends</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(zone => {
                const count = stats?.zone_counts?.[zone] ?? 0;
                const total = stats ? Object.values(stats.zone_counts || {}).reduce((a: any, b: any) => a + b, 0) : 1;
                const pct = total > 0 ? Math.round((count as number / (total as number)) * 100) : 0;
                return (
                  <View key={zone} style={styles.colourRow}>
                    <View style={[styles.colourDot, { backgroundColor: ZONE_COLORS[zone] }]} />
                    <Text style={styles.colourLabel}>{ZONE_LABELS[zone]}</Text>
                    <View style={styles.colourBarBg}>
                      <View style={[styles.colourBar, { width: `${pct}%` as any, backgroundColor: ZONE_COLORS[zone] }]} />
                    </View>
                    <Text style={styles.colourPct}>{pct}%</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Students ({students.length})</Text>
            {students.slice(0, 20).map((s, i) => (
              <View key={s.id || i} style={styles.personCard}>
                <View style={[styles.avatar, { backgroundColor: '#4CAF50' }]}>
                  <Text style={styles.avatarText}>{s.name?.[0] || '?'}</Text>
                </View>
                <View style={styles.personInfo}>
                  <Text style={styles.personName}>{s.name}</Text>
                  <Text style={styles.personSub}>Classroom: {s.classroom_id || '—'}</Text>
                </View>
                <View style={[styles.zonePill, { backgroundColor: ZONE_COLORS[s.last_zone] + '30' || '#F5F5F5' }]}>
                  <Text style={[styles.zonePillText, { color: ZONE_COLORS[s.last_zone] || '#999' }]}>{s.last_zone || '—'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ALERTS */}
        {!loading && activeTab === 'alerts' && (
          <View>
            <Text style={styles.sectionTitle}>Teacher Wellbeing Alerts</Text>
            <View style={styles.infoBox}>
              <MaterialIcons name="lock" size={16} color="#5C6BC0" />
              <Text style={styles.infoText}>Private support requests from your teachers. Handle with care and confidentiality.</Text>
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

        {/* STRATEGIES */}
        {!loading && activeTab === 'strategies' && (
          <View>
            <Text style={styles.sectionTitle}>School Teacher Strategies</Text>
            <Text style={styles.sectionSubtitle}>Add strategies for YOUR school's teachers. Teachers cannot remove these.</Text>
            <View style={styles.addStratBox}>
              <Text style={styles.addStratTitle}>Add Strategy</Text>
              <View style={styles.zoneRow}>
                {ZONES.map(z => (
                  <TouchableOpacity key={z} style={[styles.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: newStratZone === z ? 1 : 0.35 }]} onPress={() => setNewStratZone(z)}>
                    <Text style={styles.zoneChipText}>{z[0].toUpperCase()}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Strategy name..." value={newStratName} onChangeText={setNewStratName} placeholderTextColor="#AAA" />
              <TextInput style={styles.input} placeholder="Description..." value={newStratDesc} onChangeText={setNewStratDesc} placeholderTextColor="#AAA" />
              <TouchableOpacity style={styles.addBtn} onPress={addStrategy}>
                <MaterialIcons name="add" size={20} color="white" />
                <Text style={styles.addBtnText}>Add Strategy</Text>
              </TouchableOpacity>
            </View>
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
            <Text style={styles.sectionTitle}>School Settings</Text>
            <View style={styles.settingCard}>
              <MaterialIcons name="email" size={24} color="#5C6BC0" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>Wellbeing Alert Email</Text>
                <Text style={styles.settingDesc}>When a teacher taps "Support", this email is notified. Use your principal or school psychologist's email.</Text>
                <TextInput style={styles.emailInput} placeholder="principal@school.edu" value={wellbeingEmail} onChangeText={setWellbeingEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA" />
                <TouchableOpacity style={[styles.saveBtn, savingEmail && { opacity: 0.6 }]} onPress={saveWellbeingEmail} disabled={savingEmail}>
                  <Text style={styles.saveBtnText}>{savingEmail ? 'Saving...' : 'Save Email'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.settingCard}>
              <MaterialIcons name="school" size={24} color="#888" />
              <View style={styles.settingInfo}>
                <Text style={styles.settingTitle}>School Name</Text>
                <Text style={styles.settingDesc}>{user?.school_name || 'Not set — contact support to update'}</Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminDashboardScreen() {
  const { user } = useApp();
  const [authToken, setAuthToken] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.getItem('session_token').then(t => setAuthToken(t));
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  const isSchoolAdmin = user?.role === 'school_admin' || user?.role === 'admin';

  const headerColor = isSuperAdmin ? '#3949AB' : '#5C6BC0';
  const headerLabel = isSuperAdmin ? '👑 Super Admin — All Schools' : '🏫 School Admin — ' + (user?.school_name || 'My School');

  return (
    <SafeAreaView style={styles.container}>
      <View style={[styles.header, { backgroundColor: headerColor }]}>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <Text style={styles.headerSub}>{user?.name || user?.email}</Text>
        <Text style={styles.headerRole}>{headerLabel}</Text>
      </View>
      {isSuperAdmin && <SuperAdminDashboard authToken={authToken} user={user} />}
      {isSchoolAdmin && !isSuperAdmin && <SchoolAdminDashboard authToken={authToken} user={user} />}
      {!isSuperAdmin && !isSchoolAdmin && (
        <View style={styles.noAccess}>
          <MaterialIcons name="lock" size={48} color="#CCC" />
          <Text style={styles.noAccessText}>No admin access. Go to Settings to enter your admin code.</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { padding: 20, paddingBottom: 16 },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: 'white' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  headerRole: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#E0E0E0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#5C6BC0' },
  tabLabel: { fontSize: 10, color: '#999', fontWeight: '500' },
  tabLabelActive: { color: '#5C6BC0', fontWeight: '700' },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 6, marginTop: 12 },
  sectionSubtitle: { fontSize: 12, color: '#888', marginBottom: 14, lineHeight: 18 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  statCard: { width: '47%', backgroundColor: 'white', borderRadius: 14, padding: 14, alignItems: 'center', borderTopWidth: 4, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  statValue: { fontSize: 30, fontWeight: 'bold', color: '#333', marginTop: 6 },
  statLabel: { fontSize: 11, color: '#888', marginTop: 3, textAlign: 'center' },
  colourTrends: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 16, gap: 10 },
  colourRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colourDot: { width: 14, height: 14, borderRadius: 7 },
  colourLabel: { fontSize: 12, color: '#555', width: 80 },
  colourBarBg: { flex: 1, height: 10, backgroundColor: '#F0F0F0', borderRadius: 5, overflow: 'hidden' },
  colourBar: { height: 10, borderRadius: 5 },
  colourPct: { fontSize: 11, color: '#888', width: 35, textAlign: 'right' },
  personCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 10, marginBottom: 6, gap: 10 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  personInfo: { flex: 1 },
  personName: { fontSize: 14, fontWeight: '600', color: '#333' },
  personSub: { fontSize: 12, color: '#888' },
  infoBox: { flexDirection: 'row', backgroundColor: '#E8EAF6', borderRadius: 10, padding: 12, gap: 8, marginBottom: 16, alignItems: 'flex-start' },
  infoText: { fontSize: 13, color: '#5C6BC0', flex: 1, lineHeight: 20 },
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
  addStratBox: { backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  addStratTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 12 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 14, color: '#333', marginBottom: 10 },
  zoneRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  zoneChip: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  zoneChipText: { color: 'white', fontWeight: 'bold', fontSize: 13 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, gap: 8 },
  addBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  stratCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, gap: 10 },
  stratDot: { width: 14, height: 14, borderRadius: 7 },
  stratInfo: { flex: 1 },
  stratName: { fontSize: 14, fontWeight: '600', color: '#333' },
  stratDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  zonePill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  zonePillText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  typeChip: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F0F0F0', alignItems: 'center' },
  typeChipActive: { backgroundColor: '#E8EAF6', borderWidth: 2, borderColor: '#5C6BC0' },
  typeChipText: { fontSize: 14, color: '#888', fontWeight: '500' },
  typeChipTextActive: { color: '#5C6BC0', fontWeight: '700' },
  settingCard: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 12, gap: 12, alignItems: 'flex-start' },
  settingInfo: { flex: 1 },
  settingTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  settingDesc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 10 },
  emailInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 14, color: '#333', marginBottom: 10 },
  saveBtn: { backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, alignItems: 'center' },
  saveBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  noAccess: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  noAccessText: { fontSize: 15, color: '#999', textAlign: 'center', marginTop: 16, lineHeight: 22 },
});

