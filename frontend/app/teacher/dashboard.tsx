import React, { useState, useLayoutEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, RefreshControl, Dimensions, Animated,
} from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
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
  const [tab, setTab] = useState<'checkins'|'students'>('checkins');

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
    registerForPushNotifications().catch(() => {});
  }, [navigation]);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const h = { Authorization: `Bearer ${token}` };
      const [logsData, analyticsData, alertsData] = await Promise.all([
        zoneLogsApi.getAll(undefined, undefined, period).catch(() => []),
        fetch(`${BACKEND_URL}/api/analytics/classroom/all?days=${period}`, { headers: h }).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${BACKEND_URL}/api/notifications/alerts`, { headers: h }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      const logs = Array.isArray(logsData) ? logsData : [];
      setRecentLogs(logs);
      setAnalytics(analyticsData);
      setAlertCount(Array.isArray(alertsData) ? alertsData.filter((a:any) => !a.resolved).length : 0);
      const today = new Date().toISOString().split('T')[0];
      const tl = logs.filter((l:any) => (l.timestamp||'').startsWith(today));
      const snap:any = { blue:0, green:0, yellow:0, red:0, total:tl.length };
      tl.forEach((l:any) => { const z=l.zone||l.feeling_colour||''; if(z in snap) snap[z]++; });
      setTodaySnap(snap);
    } catch {}
  }, [period]);

  useFocusEffect(useCallback(() => { loadData(); refreshStudents(); refreshClassrooms(); }, [loadData]));
  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  const getStudentName = (id:string) => students.find(s=>s.id===id)?.name || 'Student';
  const getStudent = (id:string) => students.find(s=>s.id===id);
  const formatTime = (ts:string) => { try { return new Date(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };

  const filteredLogs = selectedClassroom
    ? recentLogs.filter(l => getStudent(l.student_id)?.classroom_id === selectedClassroom)
    : recentLogs;

  const chartData = [
    { value: analytics?.zone_counts?.blue||0, frontColor: ZONE_COLORS.blue, label:'🔵' },
    { value: analytics?.zone_counts?.green||0, frontColor: ZONE_COLORS.green, label:'🟢' },
    { value: analytics?.zone_counts?.yellow||0, frontColor: ZONE_COLORS.yellow, label:'🟡' },
    { value: analytics?.zone_counts?.red||0, frontColor: ZONE_COLORS.red, label:'🔴' },
  ];

  const periodLabel = (p:Period) => p===1?(t('today')||'Today'):p===7?(t('week')||'Week'):p===14?'Fortnight':'Month';

  const downloadPDF = async () => {
    const token = await AsyncStorage.getItem('session_token');
    // For now navigate to student list for PDF — future: classroom PDF
    router.push('/teacher/students');
  };

  return (
    <SafeAreaView style={st.container}>
      {/* ── Header ── */}
      <View style={st.header}>
        <Text style={st.title}>{t('teacher_dashboard')||'Dashboard'}</Text>
        <View style={st.snapRow}>
          {(['blue','green','yellow','red'] as const).map(z => (
            <View key={z} style={[st.snapPill,{borderColor:ZONE_COLORS[z]+'50',backgroundColor:ZONE_COLORS[z]+'15'}]}>
              <Text style={st.snapEmoji}>{ZONE_EMOJI[z]}</Text>
              <Text style={[st.snapCount,{color:ZONE_COLORS[z]}]}>{todaySnap[z]}</Text>
            </View>
          ))}
          <View style={[st.snapPill,{borderColor:'#5C6BC030',backgroundColor:'#F3F4FF'}]}>
            <MaterialIcons name="today" size={11} color="#5C6BC0"/>
            <Text style={[st.snapCount,{color:'#5C6BC0'}]}>{todaySnap.total}</Text>
          </View>
        </View>
      </View>

      {/* ── Icon Nav ── */}
      <View style={st.iconNav}>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/teacher/alerts')}>
          <View style={st.iconCircle}>
            <MaterialIcons name="notifications" size={20} color="#5C6BC0"/>
            {alertCount > 0 && <View style={st.badge}><Text style={st.badgeTxt}>{alertCount}</Text></View>}
          </View>
          <Text style={st.iconLbl}>Alerts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/teacher/checkin')}>
          <View style={st.iconCircle}><MaterialIcons name="self-improvement" size={20} color="#26A69A"/></View>
          <Text style={st.iconLbl}>My{'\n'}Check-in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/teacher/resources')}>
          <View style={st.iconCircle}><MaterialIcons name="library-books" size={20} color="#5C6BC0"/></View>
          <Text style={st.iconLbl}>Resources</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/teacher/students')}>
          <View style={st.iconCircle}><MaterialIcons name="people" size={20} color="#4CAF50"/></View>
          <Text style={st.iconLbl}>Students</Text>
        </TouchableOpacity>
        <TouchableOpacity style={st.iconBtn} onPress={() => router.push('/teacher/widget')}>
          <View style={st.iconCircle}><MaterialIcons name="widgets" size={20} color="#9C27B0"/></View>
          <Text style={st.iconLbl}>Widget</Text>
        </TouchableOpacity>
      </View>

      {/* ── Period Tabs ── */}
      <View style={st.periodRow}>
        {([1,7,14,30] as Period[]).map(p => (
          <TouchableOpacity key={p} style={[st.periodBtn, period===p && st.periodBtnActive]} onPress={() => setPeriod(p)}>
            <Text style={[st.periodTxt, period===p && st.periodTxtActive]}>{periodLabel(p)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Classroom Filter ── */}
      {classrooms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.chipScroll}>
          <View style={st.chipRow}>
            <TouchableOpacity style={[st.chip,!selectedClassroom&&st.chipActive]} onPress={() => setSelectedClassroom(null)}>
              <Text style={[st.chipTxt,!selectedClassroom&&st.chipTxtActive]}>All</Text>
            </TouchableOpacity>
            {classrooms.map(c => (
              <TouchableOpacity key={c.id} style={[st.chip,selectedClassroom===c.id&&st.chipActive]} onPress={() => setSelectedClassroom(c.id)}>
                <Text style={[st.chipTxt,selectedClassroom===c.id&&st.chipTxtActive]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ── Scrollable Content ── */}
      <ScrollView style={{flex:1}} contentContainerStyle={st.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}/>}
        showsVerticalScrollIndicator={false}>

        {/* Collapsible Check-ins */}
        <TouchableOpacity style={st.sectionHeader} onPress={() => setCheckinsExpanded(e => !e)}>
          <Text style={st.sectionTitle}>📋 {t('recent_check_ins')||'Recent Check-ins'}</Text>
          <MaterialIcons name={checkinsExpanded?'expand-less':'expand-more'} size={22} color="#666"/>
        </TouchableOpacity>

        {checkinsExpanded && (
          filteredLogs.length === 0 ? (
            <View style={st.empty}>
              <Text style={st.emptyTxt}>{t('no_recent_checkins')||'No check-ins yet'}</Text>
            </View>
          ) : (
            filteredLogs.slice(0,12).map(log => {
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
          )
        )}

        {/* Collapsible Graph */}
        <TouchableOpacity style={[st.sectionHeader,{marginTop:8}]} onPress={() => setGraphExpanded(e => !e)}>
          <Text style={st.sectionTitle}>📊 {t('class_mood_graph')||'Emotion Graph'}</Text>
          <MaterialIcons name={graphExpanded?'expand-less':'expand-more'} size={22} color="#666"/>
        </TouchableOpacity>

        {graphExpanded && (
          <View style={st.card}>
            {chartData.reduce((a,d)=>a+d.value,0) > 0 ? (
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
              <Text style={[st.emptyTxt,{textAlign:'center',paddingVertical:20}]}>{t('no_data_yet')||'No data yet'}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8F9FA' },
  header: { paddingHorizontal:20, paddingTop:12, paddingBottom:8 },
  title: { fontSize:20, fontWeight:'800', color:'#1A1A2E', marginBottom:8 },
  snapRow: { flexDirection:'row', gap:6 },
  snapPill: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:10, borderWidth:1 },
  snapEmoji: { fontSize:11 },
  snapCount: { fontSize:14, fontWeight:'800' },
  iconNav: { flexDirection:'row', paddingHorizontal:16, paddingVertical:10, gap:4, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  iconBtn: { flex:1, alignItems:'center', gap:4 },
  iconCircle: { width:40, height:40, borderRadius:20, backgroundColor:'#F5F5FF', alignItems:'center', justifyContent:'center', position:'relative' },
  iconLbl: { fontSize:9, color:'#666', textAlign:'center', fontWeight:'600' },
  badge: { position:'absolute', top:-2, right:-2, width:14, height:14, borderRadius:7, backgroundColor:'#F44336', alignItems:'center', justifyContent:'center' },
  badgeTxt: { fontSize:8, color:'white', fontWeight:'700' },
  periodRow: { flexDirection:'row', marginHorizontal:16, marginVertical:8, backgroundColor:'#EDEDF5', borderRadius:10, padding:3 },
  periodBtn: { flex:1, paddingVertical:7, alignItems:'center', borderRadius:8 },
  periodBtnActive: { backgroundColor:'white', shadowColor:'#000', shadowOpacity:0.06, shadowRadius:3, elevation:2 },
  periodTxt: { fontSize:12, color:'#999', fontWeight:'600' },
  periodTxtActive: { color:'#5C6BC0', fontWeight:'700' },
  chipScroll: { maxHeight:44, marginBottom:4 },
  chipRow: { flexDirection:'row', paddingHorizontal:16, gap:8, alignItems:'center' },
  chip: { paddingHorizontal:12, paddingVertical:6, borderRadius:16, backgroundColor:'white', borderWidth:1, borderColor:'#E0E0E0' },
  chipActive: { backgroundColor:'#5C6BC0', borderColor:'#5C6BC0' },
  chipTxt: { fontSize:12, color:'#666' },
  chipTxtActive: { color:'white', fontWeight:'600' },
  content: { paddingHorizontal:16, paddingBottom:32 },
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
});
