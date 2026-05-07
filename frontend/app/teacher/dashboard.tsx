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
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { registerForPushNotifications } from '../../src/utils/notifications';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_EMOJI: Record<string,string> = { blue:'🔵', green:'🟢', yellow:'🟡', red:'🔴' };
type Period = 1|7|14|30;

export default function TeacherDashboardScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  const { user, students, classrooms, presetAvatars, refreshStudents, refreshClassrooms, t } = useApp();
  const [period, setPeriod] = useState<Period>(7);
  const [recentLogs, setRecentLogs] = useState<ZoneLog[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [todaySnap, setTodaySnap] = useState({ blue:0, green:0, yellow:0, red:0, total:0 });
  const [selectedClassroom, setSelectedClassroom] = useState<string|null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [checkinsExpanded, setCheckinsExpanded] = useState(true);
  const [graphExpanded, setGraphExpanded] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    registerForPushNotifications().catch(() => {});
  }, [navigation]);

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
      const analyticsRaw = await fetch(analyticsUrl, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null);
      // Normalise field names — backend returns feeling_counts or zone_counts
      const analyticsData = analyticsRaw ? {
        ...analyticsRaw,
        zone_counts: analyticsRaw.zone_counts || analyticsRaw.feeling_counts || { blue:0, green:0, yellow:0, red:0 }
      } : null;
      setAnalytics(analyticsData);

      // Alert count
      const alertsData = await fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []);
      setAlertCount(Array.isArray(alertsData) ? alertsData.filter((a:any) => !a.resolved).length : 0);

      // Today snapshot from logs
      const today = new Date().toISOString().split('T')[0];
      const tl = logs.filter((l:any) => (l.timestamp||'').startsWith(today));
      const snap:any = { blue:0, green:0, yellow:0, red:0, total:tl.length };
      tl.forEach((l:any) => { const z=l.zone||l.feeling_colour||''; if(z in snap) snap[z]++; });
      setTodaySnap(snap);
    } catch(e) { console.error('loadData error:', e); }
  }, [period, selectedClassroom]);

  useFocusEffect(useCallback(() => {
    loadData(); refreshStudents(); refreshClassrooms();
  }, [loadData]));

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const getStudentName = (id:string) => students.find(s=>s.id===id)?.name || 'Student';
  const getStudent = (id:string) => students.find(s=>s.id===id);
  const formatTime = (ts:string) => { try { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
  const periodLabel = (p:Period) => p===1?(t('today')||'Today'):p===7?(t('week')||'Week'):p===14?'Fortnight':'Month';

  const chartData = analytics ? [
    { value: Number(analytics.zone_counts?.blue||0), frontColor: ZONE_COLORS.blue, label:'🔵' },
    { value: Number(analytics.zone_counts?.green||0), frontColor: ZONE_COLORS.green, label:'🟢' },
    { value: Number(analytics.zone_counts?.yellow||0), frontColor: ZONE_COLORS.yellow, label:'🟡' },
    { value: Number(analytics.zone_counts?.red||0), frontColor: ZONE_COLORS.red, label:'🔴' },
  ] : [];
  const hasChartData = chartData.some(d => d.value > 0);

  const NAV_BUTTONS = [
    { label: t('students')||'Students', icon: 'people', color: '#4CAF50', route: '/teacher/students', count: students.length },
    { label: t('classrooms')||'Classrooms', icon: 'school', color: '#5C6BC0', route: '/teacher/classrooms', count: classrooms.length },
    { label: 'My\nCheck-In', icon: 'self-improvement', color: '#26A69A', route: '/teacher/checkin', count: null },
    { label: t('resources')||'Resources', icon: 'library-books', color: '#5C6BC0', route: '/teacher/resources', count: null },
    { label: t('alerts')||'Alerts', icon: 'notifications', color: '#F44336', route: '/teacher/alerts', count: alertCount > 0 ? alertCount : null },
  ];

  return (
    <SafeAreaView style={st.container}>
      <TranslatedHeader title={t('teacher_dashboard')||'Teacher Dashboard'} backTo="/" />

      {/* Emotion pills */}
      <View style={st.snapRow}>
        {(['blue','green','yellow','red'] as const).map(z => (
          <View key={z} style={[st.snapPill,{borderColor:ZONE_COLORS[z]+'50',backgroundColor:ZONE_COLORS[z]+'12'}]}>
            <Text style={st.snapEmoji}>{ZONE_EMOJI[z]}</Text>
            <Text style={[st.snapCount,{color:ZONE_COLORS[z]}]}>{todaySnap[z]}</Text>
          </View>
        ))}
        <View style={[st.snapPill,{borderColor:'#5C6BC020',backgroundColor:'#F3F4FF'}]}>
          <MaterialIcons name="today" size={11} color="#5C6BC0"/>
          <Text style={[st.snapCount,{color:'#5C6BC0'}]}>{todaySnap.total}</Text>
        </View>
      </View>

      {/* Nav buttons */}
      <View style={st.iconNav}>
        {NAV_BUTTONS.map((btn) => (
          <TouchableOpacity key={btn.route} style={st.iconBtn} onPress={() => router.push(btn.route as any)}>
            <View style={[st.iconCircle, {backgroundColor: btn.color + '15'}]}>
              <MaterialIcons name={btn.icon as any} size={20} color={btn.color}/>
              {btn.count != null && btn.count > 0 && (
                <View style={[st.badge, {backgroundColor: btn.icon === 'notifications' ? '#F44336' : btn.color}]}>
                  <Text style={st.badgeTxt}>{btn.count}</Text>
                </View>
              )}
            </View>
            <Text style={st.iconLbl}>{btn.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Period tabs */}
      <View style={st.periodRow}>
        {([1,7,14,30] as Period[]).map(p => (
          <TouchableOpacity key={p} style={[st.periodBtn, period===p && st.periodBtnActive]}
            onPress={() => setPeriod(p)}>
            <Text style={[st.periodTxt, period===p && st.periodTxtActive]}>{periodLabel(p)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Classroom filter chips */}
      {classrooms.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipScroll}>
          <View style={st.chipRow}>
            <TouchableOpacity style={[st.chip,!selectedClassroom&&st.chipActive]} onPress={() => setSelectedClassroom(null)}>
              <Text style={[st.chipTxt,!selectedClassroom&&st.chipTxtActive]}>{t('all')||'All'}</Text>
            </TouchableOpacity>
            {classrooms.map(c => (
              <TouchableOpacity key={c.id} style={[st.chip,selectedClassroom===c.id&&st.chipActive]}
                onPress={() => setSelectedClassroom(c.id)}>
                <Text style={[st.chipTxt,selectedClassroom===c.id&&st.chipTxtActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Main scroll */}
      <ScrollView style={{flex:1}} contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
        showsVerticalScrollIndicator={false}>

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
            return (
              <TouchableOpacity key={log.id} style={st.logCard}
                onPress={() => router.push({pathname:'/teacher/student-detail',params:{studentId:log.student_id}})}>
                <Avatar type={student?.avatar_type||'preset'} preset={student?.avatar_preset}
                  custom={student?.avatar_custom} size={38} presetAvatars={presetAvatars}/>
                <View style={{flex:1,marginLeft:10}}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                    <Text style={st.logName}>{getStudentName(log.student_id)}</Text>
                    {(log as any).logged_by==='parent' && <View style={st.homeBadge}><Text style={st.homeBadgeTxt}>HOME</Text></View>}
                  </View>
                  {(log as any).strategies_selected?.length > 0 && (
                    <Text style={st.logStrats} numberOfLines={1}>
                      {(log as any).strategies_selected.slice(0,2).join(', ')}
                      {(log as any).strategies_selected.length>2?` +${(log as any).strategies_selected.length-2}`:''}
                    </Text>
                  )}
                </View>
                <View style={{alignItems:'flex-end',gap:3}}>
                  <View style={[st.zonePill,{backgroundColor:ZONE_COLORS[zone]||'#999'}]}>
                    <Text style={st.zonePillTxt}>{ZONE_EMOJI[zone]||'💙'}</Text>
                  </View>
                  <Text style={st.logTime}>{formatTime((log as any).timestamp)}</Text>
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
          <View style={st.card}>
            {hasChartData ? (
              <>
                <BarChart data={chartData} barWidth={44} spacing={20} roundedTop
                  xAxisThickness={0} yAxisThickness={0}
                  yAxisTextStyle={{color:'#999',fontSize:10}} noOfSections={3}
                  maxValue={Math.max(...chartData.map(d=>d.value),1)+1}
                  isAnimated barBorderRadius={6} width={width-72}
                  xAxisLabelTextStyle={{fontSize:16,color:'#666',width:50,textAlign:'center'}}/>
                <View style={{flexDirection:'row',justifyContent:'center',gap:14,marginTop:10,flexWrap:'wrap'}}>
                  {(['blue','green','yellow','red'] as const).map(z => (
                    <View key={z} style={{flexDirection:'row',alignItems:'center',gap:4}}>
                      <View style={{width:8,height:8,borderRadius:4,backgroundColor:ZONE_COLORS[z]}}/>
                      <Text style={{fontSize:11,color:'#666'}}>{analytics?.zone_counts?.[z]||0}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={[st.emptyTxt,{textAlign:'center',paddingVertical:20}]}>{t('no_data_yet')||'No data for this period'}</Text>
            )}
          </View>
        )}

        {/* Widget button at bottom */}
        <TouchableOpacity style={st.widgetBtn} onPress={() => router.push('/teacher/widget')}>
          <MaterialIcons name="widgets" size={16} color="#9C27B0"/>
          <Text style={st.widgetTxt}>Classroom Widget</Text>
          <MaterialIcons name="chevron-right" size={16} color="#9C27B0"/>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8F9FA' },
  snapRow: { flexDirection:'row', paddingHorizontal:16, paddingVertical:8, gap:6 },
  snapPill: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:10, borderWidth:1 },
  snapEmoji: { fontSize:11 },
  snapCount: { fontSize:14, fontWeight:'800' },
  iconNav: { flexDirection:'row', paddingHorizontal:12, paddingVertical:8, gap:2, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  iconBtn: { flex:1, alignItems:'center', gap:3 },
  iconCircle: { width:40, height:40, borderRadius:20, alignItems:'center', justifyContent:'center', position:'relative' },
  iconLbl: { fontSize:9, color:'#555', textAlign:'center', fontWeight:'600', lineHeight:11 },
  badge: { position:'absolute', top:-2, right:-2, width:14, height:14, borderRadius:7, alignItems:'center', justifyContent:'center' },
  badgeTxt: { fontSize:8, color:'white', fontWeight:'700' },
  periodRow: { flexDirection:'row', marginHorizontal:16, marginTop:8, marginBottom:4, backgroundColor:'#EDEDF5', borderRadius:10, padding:3 },
  periodBtn: { flex:1, paddingVertical:7, alignItems:'center', borderRadius:8 },
  periodBtnActive: { backgroundColor:'white', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:3, elevation:2 },
  periodTxt: { fontSize:12, color:'#999', fontWeight:'600' },
  periodTxtActive: { color:'#5C6BC0', fontWeight:'700' },
  chipScroll: { maxHeight:40, marginBottom:2 },
  chipRow: { flexDirection:'row', paddingHorizontal:16, gap:8, alignItems:'center' },
  chip: { paddingHorizontal:12, paddingVertical:5, borderRadius:16, backgroundColor:'white', borderWidth:1, borderColor:'#E0E0E0' },
  chipActive: { backgroundColor:'#5C6BC0', borderColor:'#5C6BC0' },
  chipTxt: { fontSize:12, color:'#666' },
  chipTxtActive: { color:'white', fontWeight:'600' },
  content: { paddingHorizontal:16, paddingBottom:24 },
  sectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10 },
  sectionTitle: { fontSize:15, fontWeight:'700', color:'#333' },
  logCard: { flexDirection:'row', alignItems:'center', backgroundColor:'white', borderRadius:12, padding:10, marginBottom:6, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:3, elevation:1 },
  logName: { fontSize:14, fontWeight:'600', color:'#1A1A2E' },
  logStrats: { fontSize:10, color:'#999', marginTop:1 },
  logTime: { fontSize:10, color:'#BBB' },
  zonePill: { width:26, height:26, borderRadius:13, alignItems:'center', justifyContent:'center' },
  zonePillTxt: { fontSize:13 },
  homeBadge: { backgroundColor:'#E8F5E9', paddingHorizontal:4, paddingVertical:1, borderRadius:5 },
  homeBadgeTxt: { fontSize:8, color:'#4CAF50', fontWeight:'700' },
  card: { backgroundColor:'white', borderRadius:14, padding:14, marginBottom:10 },
  empty: { paddingVertical:20, alignItems:'center' },
  emptyTxt: { fontSize:13, color:'#CCC' },
  widgetBtn: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:12, marginTop:8, backgroundColor:'white', borderRadius:12, borderWidth:1, borderColor:'#E8D5F5' },
  widgetTxt: { fontSize:13, color:'#9C27B0', fontWeight:'600' },
});
