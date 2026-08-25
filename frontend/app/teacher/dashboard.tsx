import React, { useState, useEffect, useLayoutEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, RefreshControl, Dimensions, Alert,
} from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { registerForPushNotifications } from '../../src/utils/notifications';

const { width } = Dimensions.get('window');

const COLOUR_TIPS_TEACHER: Record<string, {tip: string, action: string}[]> = {
  blue: [
    { tip: 'Quiet energy in the room', action: 'Try a gentle stretch or warm-up activity' },
    { tip: 'Some students need warmth', action: 'Check in one-to-one with quiet students' },
    { tip: 'Low energy is okay', action: 'Offer calm, creative or independent tasks' },
  ],
  green: [
    { tip: 'Class is ready to learn', action: 'Great day to introduce something new' },
    { tip: 'Positive energy today', action: 'Celebrate effort and celebrate readiness' },
    { tip: 'Strong focus available', action: 'Harness this energy for challenge tasks' },
  ],
  yellow: [
    { tip: 'Some students feel wobbly', action: 'Predictable routines help settle the class' },
    { tip: 'Fizzing energy present', action: 'Movement break before focused work' },
    { tip: 'Anxiety may be present', action: 'Lower stimulation, offer quiet corners' },
  ],
  red: [
    { tip: 'Big feelings in the room', action: 'Stay calm — your calm regulates theirs' },
    { tip: 'Students need safety first', action: 'Reconnect before you redirect behaviour' },
    { tip: 'High emotion detected', action: 'Give space, stay close, avoid confrontation' },
  ],
};

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string,string> = EMOTION_COLOURS;

const STRATEGY_NAMES: Record<string, string> = {
  // Parent strategies
  p_b1:'Slow Breathing', p_b2:'Quiet Time', p_b3:'Gentle Walk', p_b4:'Rest Together', p_b5:'Safe Space',
  p_g1:'Celebrate Together', p_g2:'Keep Going', p_g3:'Set a Goal', p_g4:'Gratitude', p_g5:'Help a Friend',
  p_y1:'Box Breathing', p_y2:'Validate First', p_y3:'Body Check-In', p_y4:'Feelings Journal', p_y5:'Give Space',
  p_r1:'Stay Calm', p_r2:'Safe Space Together', p_r3:'Cold Water Reset', p_r4:'Talk It Through', p_r5:'Take a Break',
  // Student strategies
  s_b1:'Slow Breathing', s_b2:'Safe Space', s_b3:'Gentle Stretch', s_b4:'Favourite Song', s_b5:'Talk About It',
  s_g1:'Keep Going', s_g2:'Set a Goal', s_g3:'Help a Friend', s_g4:'Gratitude', s_g5:'5 Senses',
  s_y1:'Bubble Breathing', s_y2:'Count to 10', s_y3:'Walk Away', s_y4:'Squeeze & Release', s_y5:'Tell Someone',
  s_r1:'Walk Away', s_r2:'Cold Water', s_r3:'Safe Space', s_r4:'Tell Someone', s_r5:'Slow Breathing',
  // Raw codes R1-R9, G1-G9, Y1-Y9, B1-B9
  R1:'Tell Someone', R2:'Walk Away', R3:'Safe Space', R4:'Slow Breathing', R5:'Take a Break',
  R6:'Cold Water', R7:'Squeeze & Release', R8:'Talk It Through', R9:'Count to 10',
  G1:'Keep Going', G2:'Set a Goal', G3:'Help a Friend', G4:'Gratitude', G5:'Celebrate',
  G6:'5 Senses', G7:'Favourite Song', G8:'Gentle Stretch', G9:'Creative Time',
  Y1:'Bubble Breathing', Y2:'Count to 10', Y3:'Walk Away', Y4:'Body Check-In', Y5:'Box Breathing',
  Y6:'Feelings Journal', Y7:'Give Space', Y8:'Validate First', Y9:'5 Senses',
  B1:'Slow Breathing', B2:'Safe Space', B3:'Gentle Walk', B4:'Rest Together', B5:'Quiet Time',
  B6:'Favourite Song', B7:'Gentle Stretch', B8:'Talk About It', B9:'Help a Friend',
  // Real, actively-used format confirmed via direct DB check: blue_N/green_N/yellow_N/red_N —
  // this was previously ONLY covered by the now-removed STRATEGY_NAMES_LOCAL, a genuine gap
  // introduced when that dict was deleted (only checked for short-code b1/g1 collisions, missed
  // that THIS longer format wasn't duplicated anywhere else at all).
  blue_1:'Gentle Stretch', blue_2:'Drink Water', blue_3:'Favourite Song', blue_4:'Cosy Spot', blue_5:'Tell Someone', blue_6:'Slow Breathing',
  green_1:'Keep Going!', green_2:'Help a Friend', green_3:'Try Something New', green_4:'Share Your Smile', green_5:'Set a Goal', green_6:'Gratitude',
  yellow_1:'Bubble Breathing', yellow_2:'Body Shake', yellow_3:'Count to 10', yellow_4:'5 Senses', yellow_5:'Squeeze & Release', yellow_6:'Talk About It',
  red_1:'Freeze', red_2:'Big Breaths', red_3:'Count Backwards', red_4:'Safe Space', red_5:'Ask for Help', red_6:'Self Hug',
  // Named strategies
  bubble_breathing:'Bubble Breathing', slow_breathing:'Slow Breathing', count_to_10:'Count to 10',
  walk_away:'Walk Away', safe_space:'Safe Space', talk_about_it:'Talk About It',
  tell_someone:'Tell Someone', gentle_stretch:'Gentle Stretch', favourite_song:'Favourite Song',
  gratitude:'Gratitude', help_friend:'Help a Friend', keep_going:'Keep Going',
  set_goal:'Set a Goal', five_senses:'5 Senses', squeeze_release:'Squeeze & Release',
};
const resolveStrategy = (id: string, t?: (key: string) => string): string => {
  if (!id) return '';
  if (['blue','green','yellow','red','Blue','Green','Yellow','Red'].includes(id.trim())) return '';
  // Real translation checked first - matches the same strat_blue_1..strat_red_6 keys added to
  // all 6 language files, and to the backend /strategies endpoint for the live check-in screen.
  if (t) { const translated = t('strat_' + id); if (translated) return translated; }
  if (STRATEGY_NAMES[id]) return STRATEGY_NAMES[id];
  const clean = id.trim().toLowerCase().replace(/^(helper_|strategy_)/, '');
  if (STRATEGY_NAMES[clean]) return STRATEGY_NAMES[clean];
  const stripped = id.replace(/^[rgybRGYB]\d+$/, '').replace(/^[pbs]_[rgby]\d+_?/, '').replace(/_/g, ' ').trim();
  if (!stripped || ['blue','green','yellow','red'].includes(stripped.toLowerCase())) return '';
  return stripped.replace(/\b\w/g, (c:string) => c.toUpperCase());
};

const ZONE_EMOJI: Record<string,string> = { blue:'🔵', green:'🟢', yellow:'🟡', red:'🔴' };
type Period = 1|7|14|30;

export default function TeacherDashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  const { user, students, classrooms, presetAvatars, refreshStudents, refreshClassrooms, t, hasActiveSubscription } = useApp();

  // CRITICAL security fix Aug 26 (item 3): role-gating - confirmed live that ANY
  // authenticated account could open either dashboard regardless of its real role, zero
  // enforcement anywhere. Per Jono's explicit intended design: a parent-only account is
  // locked out of the Teacher dashboard entirely; teacher/school_admin/superadmin can still
  // reach it (many real teachers are also parents and may want both views; school_admin and
  // superadmin already have broader access elsewhere in this app).
  useEffect(() => {
    if (user && user.role === 'parent') {
      router.replace('/parent/dashboard');
    }
  }, [user?.role]);

  const [pendingCreatures, setPendingCreatures] = useState<any[]>([]);
  useEffect(() => {
    const token = user?.session_token || user?.authToken || '';
    if (!token) return;
    fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL || ''}/api/creatures/pending`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(d => setPendingCreatures(Array.isArray(d) ? d : [])).catch(() => {});
  }, [user]);
  const [period, setPeriod] = useState<Period>(7);
  const [strategyNames, setStrategyNames] = useState<Record<string,string>>({});

  const [recentLogs, setRecentLogs] = useState<ZoneLog[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [classCodeLoading, setClassCodeLoading] = useState<string|null>(null);
  const [todaySnap, setTodaySnap] = useState({ blue:0, green:0, yellow:0, red:0, total:0 });
  const [barData, setBarData] = useState<{value:number,label:string,frontColor:string}[]>([]);
  const [selectedClassroom, setSelectedClassroom] = useState<string|null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [checkinsExpanded, setCheckinsExpanded] = useState(false);
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [localClassrooms, setLocalClassrooms] = useState<any[]>([]);

  useEffect(() => {
    const fetchStrategyNames = async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const token = await AsyncStorage.getItem('session_token');
        const nameMap: Record<string,string> = {};
        await Promise.all(['blue','green','yellow','red'].map(async (zone) => {
          const res = await fetch(`${BACKEND_URL}/api/strategies?zone=${zone}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) { const d = await res.json(); d.forEach((s:any) => { if(s.id&&s.name) nameMap[s.id]=s.name; }); }
        }));
        setStrategyNames(nameMap);
      } catch {}
    };
    fetchStrategyNames();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    registerForPushNotifications().catch(() => {});
  }, [navigation]);

  // STRATEGY_NAMES_LOCAL removed — was redundant with and conflicted with the comprehensive STRATEGY_NAMES above (e.g. B1='Slow Breathing' vs local b1='Gentle Stretch', same conceptual code, different wrong-in-context values). resolveStrategy() + strategyNames (custom, fetched) now cover everything.
    const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const h = { Authorization: `Bearer ${token}` };
      // Fetch logs for selected period
      const logsData = await zoneLogsApi.getAll(undefined, selectedClassroom || undefined, period).catch(() => []);
      const logs = Array.isArray(logsData) ? logsData : [];
      setRecentLogs(logs);

      // Fetch analytics
      const analyticsUrl = selectedClassroom
        ? `${BACKEND_URL}/api/analytics/classroom/${selectedClassroom}?days=${period}`
        : `${BACKEND_URL}/api/analytics/classroom/all?days=${period}`;
      let analyticsRaw: any = null;
      try {
        const aRes = await fetch(analyticsUrl, { headers: h });
        if (aRes.ok) {
          analyticsRaw = await aRes.json();
        } else {
          // analytics fetch failed silently
        }
      } catch(e) {
      }
      // Normalise field names — backend returns feeling_counts or zone_counts
      const analyticsData = analyticsRaw ? {
        ...analyticsRaw,
        zone_counts: analyticsRaw.zone_counts || analyticsRaw.feeling_counts || { blue:0, green:0, yellow:0, red:0 }
      } : { zone_counts: { blue:0, green:0, yellow:0, red:0 } };
      setAnalytics(analyticsData);

      // Fetch classrooms directly as fallback
      try {
        const crRes = await fetch(`${BACKEND_URL}/api/classrooms`, { headers: h });
        if (crRes.ok) { const crData = await crRes.json(); if (Array.isArray(crData) && crData.length > 0) setLocalClassrooms(crData); }
      } catch {}

      // Alert count
      const alertsRes = await fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers: h }).catch(() => null);
      const alertsData = alertsRes?.ok ? await alertsRes.json() : [];
      setAlertCount(Array.isArray(alertsData) ? alertsData.filter((a:any) => !a.resolved).length : 0);

      // Period snapshot — use analytics zone_counts if available, else count from logs
      const periodZones = analyticsData?.zone_counts || analyticsData?.feeling_counts || null;
      if (periodZones) {
        const total = Object.values(periodZones).reduce((a:any,b:any) => a+b, 0) as number;
        setTodaySnap({ blue: periodZones.blue||0, green: periodZones.green||0, yellow: periodZones.yellow||0, red: periodZones.red||0, total });
        // Build barData for BarChart
        const ZONE_ORDER = ['blue','green','yellow','red'] as const;
        const ZONE_LABELS: Record<string,string> = { blue:'😊', green:'😌', yellow:'😟', red:'😡' };
        const ZONE_COLORS_MAP: Record<string,string> = EMOTION_COLOURS;
        setBarData(ZONE_ORDER.map(z => ({
          value: periodZones[z] || 0,
          label: ZONE_LABELS[z],
          frontColor: ZONE_COLORS_MAP[z],
          topLabelComponent: () => null,
        })));
      } else {
        const snap:any = { blue:0, green:0, yellow:0, red:0, total:logs.length };
        logs.forEach((l:any) => { const z=l.zone||l.feeling_colour||''; if(z in snap) snap[z]++; });
        setTodaySnap(snap);
        // Build barData from raw logs
        const ZONE_ORDER2 = ['blue','green','yellow','red'] as const;
        const ZONE_LABELS2: Record<string,string> = { blue:'😊', green:'😌', yellow:'😟', red:'😡' };
        const ZONE_COLORS_MAP2: Record<string,string> = EMOTION_COLOURS;
        setBarData(ZONE_ORDER2.map(z => ({
          value: snap[z] || 0,
          label: ZONE_LABELS2[z],
          frontColor: ZONE_COLORS_MAP2[z],
        })));
      }
    } catch(e) { console.error('loadData error:', e); }
  }, [period, selectedClassroom]);

  const refreshAlertCount = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const h = { Authorization: `Bearer ${token}` };
      const alertsRes = await fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers: h }).catch(() => null);
      const alertsData = alertsRes?.ok ? await alertsRes.json() : [];
      setAlertCount(Array.isArray(alertsData) ? alertsData.filter((a:any) => !a.resolved).length : 0);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => {
    loadData(); refreshStudents(); refreshClassrooms();
    const interval = setInterval(() => { refreshAlertCount(); }, 30000);
    const handleShowClassCode = async (classroomId: string, classroomName: string) => {
    setClassCodeLoading(classroomId);
    try {
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BURL}/api/classrooms/${classroomId}/join-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          `${classroomName}`,
          `Share this code with your students:

${data.join_code}

Students enter this when creating their profile to join your class automatically.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not get class code. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get class code.');
    } finally {
      setClassCodeLoading(null);
    }
  };

  return () => clearInterval(interval);
  }, [loadData, refreshAlertCount]));

  // Reload when period or classroom filter changes (debounced)
  useEffect(() => {
    const timer = setTimeout(() => { loadData(); }, 150);
    const handleShowClassCode = async (classroomId: string, classroomName: string) => {
    setClassCodeLoading(classroomId);
    try {
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BURL}/api/classrooms/${classroomId}/join-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          `${classroomName}`,
          `Share this code with your students:

${data.join_code}

Students enter this when creating their profile to join your class automatically.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not get class code. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get class code.');
    } finally {
      setClassCodeLoading(null);
    }
  };

  return () => clearTimeout(timer);
  }, [period, selectedClassroom]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // resolveStrategyLocal removed — was defined but never actually called anywhere, dead code that also used the now-removed STRATEGY_NAMES_LOCAL.
  const getStudentName = (id:string) => students.find(s=>s.id===id)?.name || t('student') || 'Student';
  const getStudent = (id:string) => students.find(s=>s.id===id);
  const formatTime = (ts:string) => { try { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
  const periodLabel = (p:Period) => p===1?(t('today')||t('today') || 'Today'):p===7?(t('week')||t('this_week') || 'Week'):p===14?t('days_14') || 'Fortnight':t('month') || 'Month';

  const zc = analytics?.zone_counts || { blue:0, green:0, yellow:0, red:0 };
  const chartData = [
    { value: Number(zc.blue||0), frontColor: ZONE_COLORS.blue, label:'😊', labelTextStyle:{fontSize:16} },
    { value: Number(zc.green||0), frontColor: ZONE_COLORS.green, label:'😌', labelTextStyle:{fontSize:16} },
    { value: Number(zc.yellow||0), frontColor: ZONE_COLORS.yellow, label:'😟', labelTextStyle:{fontSize:16} },
    { value: Number(zc.red||0), frontColor: ZONE_COLORS.red, label:'😡', labelTextStyle:{fontSize:16} },
  ];
  const hasChartData = barData.some(d => d.value > 0);
  // Debug: log analytics to help diagnose empty graph
  // console.log('Analytics:', JSON.stringify(analytics));
  // console.log('Chart data:', chartData);

  const NAV_BUTTONS = [
    { label: t('students')||'Students', icon: 'people', color: '#4CAF50', route: '/teacher/students', count: students.length },
    { label: t('classrooms')||'Classrooms', icon: 'school', color: '#5C6BC0', route: '/teacher/classrooms', count: classrooms.length },
    { label: 'My\nCheck-In', icon: 'self-improvement', color: '#26A69A', route: '/teacher/checkin', count: null },

    { label: t('resources')||'Resources', icon: 'library-books', color: '#5C6BC0', route: '/teacher/resources', count: null },
    { label: t('alerts')||'Alerts', icon: 'notifications', color: '#F44336', route: '/teacher/alerts', count: alertCount > 0 ? alertCount : null },
    { label: t('creatures_manage')||'Creatures', icon: 'pets', color: '#9C27B0', route: '/teacher/creature-code', count: null },
  ];

  const handleShowClassCode = async (classroomId: string, classroomName: string) => {
    setClassCodeLoading(classroomId);
    try {
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BURL}/api/classrooms/${classroomId}/join-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          `${classroomName}`,
          `Share this code with your students:

${data.join_code}

Students enter this when creating their profile to join your class automatically.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not get class code. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get class code.');
    } finally {
      setClassCodeLoading(null);
    }
  };

  // See the role-gate useEffect above - this is the actual early-return point, placed after
  // every hook in the component per React's rules of hooks (an early return any earlier would
  // skip hooks declared below it on some renders and not others).
  if (user && user.role === 'parent') return null;

  return (
    <SafeAreaView style={st.container}>
      <TranslatedHeader title={t('teacher_dashboard')||'Teacher Dashboard'} backTo="/" />

      {/* Nav buttons — top, large icons */}
      <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingVertical:10, width:'100%'}}>
        {NAV_BUTTONS.map((btn) => (
          <TouchableOpacity key={btn.route} style={{alignItems:'center', gap:4, flex:1}} onPress={() => router.push(btn.route as any)}>
            <View style={{width:52, height:52, borderRadius:16, backgroundColor: btn.color + '15', alignItems:'center', justifyContent:'center', position:'relative'}}>
              <MaterialIcons name={btn.icon as any} size={28} color={btn.color}/>
              {btn.count != null && btn.count > 0 && (
                <View style={[st.badge, {backgroundColor: btn.icon === 'notifications' ? '#F44336' : btn.color}]}>
                  <Text style={st.badgeTxt}>{btn.count}</Text>
                </View>
              )}
            </View>
            <Text style={{fontSize:9, fontWeight:'600', color:'#555', textAlign:'center'}}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Period tabs */}
      <View style={{backgroundColor:'#F5F5F8', marginHorizontal:0, paddingTop:4, paddingBottom:4}}>
        <View style={st.periodRow}>
          {([1,7,14,30] as Period[]).map(p => (
            <TouchableOpacity key={p} style={[st.periodBtn, period===p && st.periodBtnActive]}
              onPress={() => setPeriod(p)}>
              <Text style={[st.periodTxt, period===p && st.periodTxtActive]}>{periodLabel(p)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {(classrooms && classrooms.length > 0) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{flexDirection:'row', paddingHorizontal:12, gap:6, alignItems:'center', paddingTop:4, paddingBottom:2}}>
              <TouchableOpacity style={[st.chip,!selectedClassroom&&st.chipActive]} onPress={() => setSelectedClassroom(null)}>
                <Text style={[st.chipTxt,!selectedClassroom&&st.chipTxtActive]}>{t('all')||'All'}</Text>
              </TouchableOpacity>
              {(localClassrooms.length > 0 ? localClassrooms : classrooms).map((c:any) => (
                <View key={c.id} style={{flexDirection:'row', alignItems:'center', gap:2}}>
                  <TouchableOpacity style={[st.chip, selectedClassroom===c.id&&st.chipActive]}
                    onPress={() => setSelectedClassroom(c.id)}>
                    <Text style={[st.chipTxt, selectedClassroom===c.id&&st.chipTxtActive]}>{c.name}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleShowClassCode(c.id, c.name)}
                    disabled={classCodeLoading === c.id}
                    style={{width:26, height:26, borderRadius:13, backgroundColor:'#F0F4FF',
                      justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#C5CAE9'}}>
                    <MaterialIcons
                      name={classCodeLoading===c.id ? 'hourglass-empty' : 'vpn-key'}
                      size={13} color="#5C6BC0" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
      {/* Main scroll */}
      <ScrollView style={{flex:1}} contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
        showsVerticalScrollIndicator={false}>

        {/* Alert banner */}
        {alertCount > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/teacher/alerts')}
            style={{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#FFF3F3',
              borderLeftWidth:4, borderLeftColor:'#F44336', marginBottom:8,
              borderRadius:8, padding:10 }}>
            <MaterialIcons name="notifications-active" size={18} color="#F44336" />
            <Text style={{ flex:1, fontSize:13, fontWeight:'600', color:'#C62828' }}>
              {alertCount} {alertCount === 1 ? 'student needs' : 'students need'} support today
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="#F44336" />
          </TouchableOpacity>
        )}

        {/* Daily Colour Tip */}
        {analytics?.zone_counts && !tipDismissed && (() => {
          const zc = (analytics as any).zone_counts as any;
          const dominant = ['red','yellow','blue','green'].find(col => zc[col] > 0) || 'green';
          const tips = (COLOUR_TIPS_TEACHER as any)[dominant] || COLOUR_TIPS_TEACHER.green;
          const tip = tips[new Date().getDate() % tips.length];
          const clrs: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
          const bgs: Record<string,string> = { blue:'#EBF5FB', green:'#EAFAF1', yellow:'#FEFDE7', red:'#FDEDEC' };
          const handleShowClassCode = async (classroomId: string, classroomName: string) => {
    setClassCodeLoading(classroomId);
    try {
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BURL}/api/classrooms/${classroomId}/join-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          `${classroomName}`,
          `Share this code with your students:

${data.join_code}

Students enter this when creating their profile to join your class automatically.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not get class code. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get class code.');
    } finally {
      setClassCodeLoading(null);
    }
  };

  return (
            <View style={{ marginHorizontal:16, marginBottom:10, padding:12, borderRadius:12,
              backgroundColor: bgs[dominant], borderLeftWidth:4, borderLeftColor: clrs[dominant],
              flexDirection:'row', alignItems:'flex-start' }}>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:13, fontWeight:'700', color:'#333', marginBottom:3 }}>{tip.tip}</Text>
                <Text style={{ fontSize:12, color:'#555', lineHeight:17 }}>{tip.action}</Text>
              </View>
              <TouchableOpacity onPress={() => setTipDismissed(true)} style={{ padding:4, marginLeft:8 }}>
                <MaterialIcons name="close" size={16} color="#AAA" />
              </TouchableOpacity>
            </View>
          );
        })()}


      {/* Trial code banner — shows when no active subscription */}
      {!hasActiveSubscription && (
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#FFF8E1',
            marginHorizontal:16, marginBottom:10, padding:12, borderRadius:12, gap:10,
            borderWidth:1, borderColor:'#FFE082' }}>
          <Text style={{ fontSize:20 }}>🎁</Text>
          <View style={{ flex:1 }}>
            <Text style={{ fontSize:13, fontWeight:'700', color:'#333' }}>Start your free trial</Text>
            <Text style={{ fontSize:11, color:'#666' }}>Go to Settings → enter code HAPPYCLASS2026 for 30 days free</Text>
          </View>
          <MaterialIcons name="chevron-right" size={20} color="#FFC107" />
        </TouchableOpacity>
      )}
        {/* Emotion summary pills */}
        <Text style={{fontSize:13, fontWeight:'700', color:'#333', marginBottom:6, marginTop:4}}>
          {t('class_mood_snapshot') || "Today's Class Mood"}
        </Text>
        <View style={{flexDirection:'row', gap:6, marginBottom:8}}>
          {(['blue','green','yellow','red'] as const).map(z => (
            <View key={z} style={[st.snapPill,{borderColor:ZONE_COLORS[z]+'50',backgroundColor:ZONE_COLORS[z]+'12',flex:1}]}>
              <Text style={st.snapEmoji}>{ZONE_EMOJI[z]}</Text>
              <Text style={[st.snapCount,{color:ZONE_COLORS[z]}]}>{todaySnap[z]}</Text>
            </View>
          ))}
          <View style={[st.snapPill,{borderColor:'#5C6BC020',backgroundColor:'#F3F4FF',flex:1}]}>
            <MaterialIcons name="today" size={11} color="#5C6BC0"/>
            <Text style={[st.snapCount,{color:'#5C6BC0'}]}>{todaySnap.total}</Text>
          </View>
        </View>

        {/* Collapsible check-ins */}
        <TouchableOpacity style={st.sectionHeader} onPress={() => setCheckinsExpanded(e=>!e)}>
          <Text style={st.sectionTitle}>📋 {t('recent_check_ins')||'Recent Check-ins'}</Text>
          <MaterialIcons name={checkinsExpanded?'expand-less':'expand-more'} size={22} color="#666"/>
        </TouchableOpacity>

        {checkinsExpanded && (recentLogs.length === 0 ? (
          <View style={st.empty}><Text style={st.emptyTxt}>{t('no_recent_checkins')||'No check-ins yet'}</Text></View>
        ) : (
          recentLogs.slice(0,12).map(log => {
            const student = getStudent(log.student_id);
            const zone = (log as any).zone||(log as any).feeling_colour||'';
            const handleShowClassCode = async (classroomId: string, classroomName: string) => {
    setClassCodeLoading(classroomId);
    try {
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BURL}/api/classrooms/${classroomId}/join-code`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        Alert.alert(
          `${classroomName}`,
          `Share this code with your students:

${data.join_code}

Students enter this when creating their profile to join your class automatically.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'Could not get class code. Please try again.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get class code.');
    } finally {
      setClassCodeLoading(null);
    }
  };

  return (
              <TouchableOpacity key={log.id} style={st.logCard}
                onPress={() => router.push({pathname:'/teacher/student-detail',params:{studentId:log.student_id}})}>
                <Avatar type={student?.avatar_type||'preset'} preset={student?.avatar_preset}
                  custom={student?.avatar_custom} size={38} presetAvatars={presetAvatars}/>
                <View style={{flex:1,marginLeft:10}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                    <Text style={st.logName}>{getStudentName(log.student_id)}</Text>
                    {(log as any).location==='home' && <View style={st.homeBadge}><Text style={st.homeBadgeTxt}>🏠 HOME</Text></View>}
                  </View>
                  {(() => { const s = getStudent(log.student_id); const allCl = localClassrooms.length > 0 ? localClassrooms : classrooms; const cl = s?.classroom_id ? allCl.find((c:any)=>c.id===s.classroom_id) : null; return cl ? <Text style={{fontSize:9,color:'#AAA'}}>{cl.name}</Text> : null; })()}
                  {(log as any).strategies_selected?.length > 0 && (
                    <Text style={st.logStrats} numberOfLines={1}>
                      {(log as any).strategies_selected.slice(0,2).map((s:string)=>strategyNames[s]||resolveStrategy(s, t)).join(', ')}
                      {(log as any).strategies_selected.length>2?` +${(log as any).strategies_selected.length-2}`:''}
                    </Text>
                  )}
                </View>
                <View style={{alignItems:'flex-end',gap:3}}>
                  <View style={[st.zonePill,{backgroundColor:ZONE_COLORS[zone]||'#999'}]} />
                  <Text style={st.logTime}>{formatTime((log as any).timestamp)}</Text>
                  <Text style={{fontSize:9,color:'#BBB'}}>{new Date((log as any).timestamp).toLocaleDateString([],{day:'numeric',month:'short'})}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        ))}

        {/* Collapsible graph */}
        <TouchableOpacity style={[st.sectionHeader,{marginTop:8}]} onPress={() => setGraphExpanded(e=>!e)}>
          <Text style={st.sectionTitle}>📊 {t('class_mood_graph')||'Emotion Graph'}</Text>
          <MaterialIcons name={graphExpanded?'expand-less':'expand-more'} size={22} color="#666"/>
        </TouchableOpacity>

        {graphExpanded && (
          <View style={{paddingHorizontal:16,paddingTop:4,paddingBottom:2}}>
            <Text style={{fontSize:12,color:'#5C6BC0',fontWeight:'600',textAlign:'center'}}>
              {selectedClassroom ? `📍 ${(localClassrooms.length > 0 ? localClassrooms : classrooms).find((c:any)=>c.id===selectedClassroom)?.name||'Classroom'}` : `🏫 ${t('all')||'All Classrooms'}`}
            </Text>
          </View>
        )}
        {graphExpanded && (
          <View style={[st.card, {alignItems:'center', paddingVertical:16}]}>
            {hasChartData ? (
              <>
                <PieChart
                  data={[
                    {value: Number(zc.blue||0), color: ZONE_COLORS.blue, text: zc.blue>0?String(zc.blue):''},
                    {value: Number(zc.green||0), color: ZONE_COLORS.green, text: zc.green>0?String(zc.green):''},
                    {value: Number(zc.yellow||0), color: ZONE_COLORS.yellow, text: zc.yellow>0?String(zc.yellow):''},
                    {value: Number(zc.red||0), color: ZONE_COLORS.red, text: zc.red>0?String(zc.red):''},
                  ].filter(d=>d.value>0)}
                  radius={80}
                  textSize={14}
                  textColor="white"
                  fontWeight="bold"
                />
                <View style={{flexDirection:'row', gap:12, marginTop:16, flexWrap:'wrap', justifyContent:'center'}}>
                  {(['blue','green','yellow','red'] as const).filter(z=>zc[z]>0).map(z=>(
                    <View key={z} style={{flexDirection:'row', alignItems:'center', gap:4}}>
                      <View style={{width:10,height:10,borderRadius:5,backgroundColor:ZONE_COLORS[z]}}/>
                      <Text style={{fontSize:11,color:'#555'}}>{ZONE_EMOJI[z]} {zc[z]}</Text>
                    </View>
                  ))}
                </View>
                <View style={{display:'none'}}>
                <BarChart
                  data={barData}
                  barWidth={50}
                  spacing={24}
                  roundedTop
                  roundedBottom
                  xAxisThickness={1}
                  xAxisColor={'#E0E0E0'}
                  yAxisThickness={0}
                  yAxisTextStyle={{color:'#999',fontSize:10}}
                  noOfSections={4}
                  maxValue={Math.max(...barData.map(d=>d.value),1)+2}
                  isAnimated
                  barBorderRadius={8}
                  width={width-80}
                  xAxisLabelTextStyle={{fontSize:16,color:'#666',width:55,textAlign:'center'}}
                  showValuesAsTopLabel
                  topLabelTextStyle={{color:'#333',fontSize:11,fontWeight:'700'}}
                />
                {/* Legend */}
                <View style={{flexDirection:'row',justifyContent:'center',gap:16,marginTop:12,flexWrap:'wrap'}}>
                  {(['blue','green','yellow','red'] as const).map(z => (
                    <View key={z} style={{flexDirection:'row',alignItems:'center',gap:4}}>
                      <View style={{width:10,height:10,borderRadius:5,backgroundColor:ZONE_COLORS[z]}}/>
                      <Text style={{fontSize:12,color:'#555',fontWeight:'600'}}>{analytics?.zone_counts?.[z]||analytics?.feeling_counts?.[z]||0}</Text>
                    </View>
                  ))}
                </View>
                <Text style={{fontSize:11,color:'#999',textAlign:'center',marginTop:6}}>
                  {t('check_ins')||'Check-ins'}: {todaySnap.total} · {periodLabel(period)}
                </Text>
                </View>
              </>
            ) : (
              <View style={{alignItems:'center',paddingVertical:32,gap:8}}>
                <MaterialIcons name="bar-chart" size={48} color="#E0E0E0"/>
                <Text style={[st.emptyTxt,{textAlign:'center'}]}>{t('no_data_yet')||'No data for this period'}</Text>
                <Text style={{fontSize:11,color:'#CCC',textAlign:'center'}}>Check-ins will appear here once students check in</Text>
              </View>
            )}
          </View>
        )}

        {/* Widget button removed for now — no real native OS widget exists yet, only an
            in-app preview screen (app/teacher/widget.tsx, kept intact for a future real
            implementation). Showing "Widget" implied a real home-screen widget, which was
            misleading. Jono's explicit decision: remove the entry point, revisit when a real
            native widget is actually built. */}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8F9FA' },
  snapRow: { flexDirection:'row', paddingHorizontal:16, paddingVertical:4, gap:6 },
  snapPill: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:10, borderWidth:1 },
  snapEmoji: { fontSize:11 },
  snapCount: { fontSize:14, fontWeight:'800' },
  iconNav: { flexDirection:'row', paddingHorizontal:12, paddingVertical:8, gap:2, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  iconBtn: { flex:1, alignItems:'center', gap:3 },
  iconCircle: { width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', position:'relative' },
  iconLbl: { fontSize:9, color:'#555', textAlign:'center', fontWeight:'600', lineHeight:11 },
  badge: { position:'absolute', top:-2, right:-2, width:14, height:14, borderRadius:7, alignItems:'center', justifyContent:'center' },
  badgeTxt: { fontSize:8, color:'white', fontWeight:'700' },
  periodRow: { flexDirection:'row', marginHorizontal:16, marginTop:2, marginBottom:0, backgroundColor:'#EDEDF5', borderRadius:10, padding:3 },
  periodBtn: { flex:1, paddingVertical:7, alignItems:'center', borderRadius:8 },
  periodBtnActive: { backgroundColor:'white', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:3, elevation:2 },
  periodTxt: { fontSize:12, color:'#999', fontWeight:'600' },
  periodTxtActive: { color:'#5C6BC0', fontWeight:'700' },
  chipScroll: { marginBottom:0, marginTop:0 },
  chipRow: { flexDirection:'row', paddingHorizontal:12, gap:6, alignItems:'center', paddingVertical:2 },
  chip: { paddingHorizontal:12, paddingVertical:5, borderRadius:16, backgroundColor:'white', borderWidth:1, borderColor:'#E0E0E0' },
  chipActive: { backgroundColor:'#5C6BC0', borderColor:'#5C6BC0' },
  chipTxt: { fontSize:12, color:'#666' },
  chipTxtActive: { color:'white', fontWeight:'600' },
  content: { paddingHorizontal:16, paddingBottom:24, paddingTop:4 },
  sectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:6 },
  sectionTitle: { fontSize:15, fontWeight:'700', color:'#333' },
  logCard: { flexDirection:'row', alignItems:'center', backgroundColor:'white', borderRadius:12, padding:10, marginBottom:6, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:3, elevation:1 },
  logName: { fontSize:14, fontWeight:'600', color:'#1A1A2E' },
  logStrats: { fontSize:10, color:'#555', marginTop:1, fontWeight:'400' },
  logTime: { fontSize:10, color:'#BBB' },
  zonePill: { width:14, height:14, borderRadius:7 },
  homeBadge: { backgroundColor:'#E8F5E9', paddingHorizontal:4, paddingVertical:1, borderRadius:5 },
  homeBadgeTxt: { fontSize:8, color:'#4CAF50', fontWeight:'700' },
  card: { backgroundColor:'white', borderRadius:14, padding:14, marginBottom:10 },
  empty: { paddingVertical:20, alignItems:'center' },
  emptyTxt: { fontSize:13, color:'#CCC' },
  widgetBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:12, marginTop:8, backgroundColor:'white', borderRadius:12, borderWidth:1, borderColor:'#E8D5F5' },
  widgetTxt: { fontSize:13, color:'#9C27B0', fontWeight:'600' },
});
