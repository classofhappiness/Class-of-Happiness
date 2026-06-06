import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';

const STRATEGY_NAMES: Record<string,string> = {
  b1:'Gentle Stretch',b2:'Warm Drink',b3:'Favourite Song',b4:'Cosy Spot',b5:'Tell Someone',b6:'Slow Breathing',
  g1:'Keep Going!',g2:'Help a Friend',g3:'Try Something New',g4:'Share Your Smile',g5:'Set a Goal',g6:'Gratitude',
  y1:'Bubble Breathing',y2:'Body Shake',y3:'Count to 10',y4:'5 Senses',y5:'Squeeze & Release',y6:'Talk About It',
  r1:'Freeze',r2:'Big Breaths',r3:'Count Backwards',r4:'Safe Space',r5:'Ask for Help',r6:'Self Hug',
  blue_1:'Gentle Stretch',blue_2:'Warm Drink',blue_3:'Favourite Song',blue_4:'Cosy Spot',blue_5:'Tell Someone',blue_6:'Slow Breathing',
  green_1:'Keep Going!',green_2:'Help a Friend',green_3:'Try Something New',green_4:'Share Your Smile',green_5:'Set a Goal',green_6:'Gratitude',
  yellow_1:'Bubble Breathing',yellow_2:'Body Shake',yellow_3:'Count to 10',yellow_4:'5 Senses',yellow_5:'Squeeze & Release',yellow_6:'Talk About It',
  red_1:'Freeze',red_2:'Big Breaths',red_3:'Count Backwards',red_4:'Safe Space',red_5:'Ask for Help',red_6:'Self Hug',
};
const resolveStratName = (id: string) => {
  if (!id) return id;
  if (STRATEGY_NAMES[id]) return STRATEGY_NAMES[id];
  const clean = id.replace(/^(helper_|strategy_)/,'');
  if (STRATEGY_NAMES[clean]) return STRATEGY_NAMES[clean];
  return id.replace(/_/g,' ').replace(/\w/g,(c:string)=>c.toUpperCase());
};
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_EMOJI: Record<string,string> = { blue:'🔵', green:'🟢', yellow:'🟡', red:'🔴' };

type Period = 'today' | '7' | '14' | '30';

export default function AlertsScreen() {
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t, classrooms, students } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState<Period>('30');
  const [selectedClassroom, setSelectedClassroom] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [selectedType, setSelectedType] = useState<string|null>(null);

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    const data = await getAlerts(tok);
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { load(); }, []);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleResolve = async (alert_id: string) => {
    Alert.alert('Mark as Resolved', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', style: 'destructive', onPress: async () => {
        await resolveAlert(alert_id, token);
        setAlerts(prev => prev.map(a => a.id === alert_id ? { ...a, resolved: true } : a));
      }},
    ]);
  };

  const handleBulkResolve = async () => {
    if (selected.size === 0) return;
    Alert.alert(`Resolve ${selected.size} alerts?`, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: `Resolve All (${selected.size})`, style: 'destructive', onPress: async () => {
        for (const id of selected) {
          await resolveAlert(id, token);
        }
        setAlerts(prev => prev.map(a => selected.has(a.id) ? { ...a, resolved: true } : a));
        setSelected(new Set());
        setSelectMode(false);
      }},
    ]);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // Filter by period
  const filterByPeriod = (a: any) => {
    const created = new Date(a.created_at).getTime();
    const now = Date.now();
    const diff = (now - created) / (1000 * 60 * 60 * 24);
    if (period === 'today') return diff < 1;
    if (period === '7') return diff <= 7;
    if (period === '14') return diff <= 14;
    return diff <= 30;
  };

  // Get unique classrooms — from alerts AND from teacher's own classrooms
  const alertClassroomNames = Array.from(new Set(alerts.map(a => a.classroom_name).filter(Boolean)));
  const teacherClassroomNames = (classrooms || []).map(c => c.name);
  const allClassroomNames = Array.from(new Set([...alertClassroomNames, ...teacherClassroomNames]));
  const alertClassrooms = ['all', ...allClassroomNames];

  const filtered = alerts.filter(a => {
    if (a.resolved) return false;
    if (!filterByPeriod(a)) return false;
    if (selectedType && a.alert_type !== selectedType) return false;
    if (selectedClassroom !== 'all') {
      const matchByName = a.classroom_name === selectedClassroom;
      const cl = (classrooms||[]).find(c => c.name === selectedClassroom);
      const matchByStudent = cl ? (students||[]).some(s => s.id === a.student_id && s.classroom_id === cl.id) : false;
      if (!matchByName && !matchByStudent) return false;
    }
    return true;
  });

  const resolvedFiltered = alerts.filter(a =>
    a.resolved &&
    filterByPeriod(a) &&
    (selectedClassroom === 'all' || a.classroom_name === selectedClassroom)
  );

  // Group by student for easier management
  const grouped: Record<string, any[]> = {};
  filtered.forEach(a => {
    const key = a.student_name || 'Unknown';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  return (
    <SafeAreaView style={st.container}>
      <TranslatedHeader title={t('alerts') || 'Student Alerts'} />

      {/* Period tabs */}
      <View style={st.tabs}>
        {(['today','7','14','30'] as Period[]).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)}
            style={[st.tab, period===p && st.tabActive]}>
            <Text style={[st.tabTxt, period===p && st.tabTxtActive]}>
              {p==='today'?(t('today')||'Today'):p==='7'?(t('week')||'Week'):p==='14'?(t('fortnight')||'Fortnight'):(t('month')||'Month')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Classroom filter */}
      {alertClassrooms.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[{minHeight:44}, st.classroomRow]}>
          {alertClassrooms.map(cl => (
            <TouchableOpacity key={cl} onPress={() => setSelectedClassroom(cl)}
              style={[st.classroomBtn, selectedClassroom===cl && st.classroomBtnActive]}>
              <Text style={[st.classroomTxt, selectedClassroom===cl && st.classroomTxtActive]}>
                {cl === 'all' ? '🏫 All' : `📍 ${cl}`}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Type filter pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0', minHeight:46 }}
        contentContainerStyle={{ flexDirection:'row', gap:6, paddingHorizontal:12, paddingVertical:8, alignItems:'center' }}>
        {[{id:null,label:'All'},{id:'help_request',label:'Help Request'},{id:'zone_alert',label:'Check-in Alert'},{id:'parent_message',label:'Message'}].map(typ=>(
          <TouchableOpacity key={typ.id||'all'}
            style={{ paddingHorizontal:10, paddingVertical:3, borderRadius:12,
              backgroundColor: selectedType===typ.id?'#5C6BC0':'#F0F0F0',
              borderWidth:1, borderColor: selectedType===typ.id?'#5C6BC0':'#E0E0E0' }}
            onPress={()=>setSelectedType(typ.id)}>
            <Text style={{ fontSize:11, fontWeight:'600', color: selectedType===typ.id?'white':'#666' }}>{typ.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bulk action bar */}
      <View style={st.actionBar}>
        <Text style={st.countTxt}>{filtered.length} pending</Text>
        <View style={{ flexDirection:'row', gap:8 }}>
          {selectMode && (
            <TouchableOpacity style={[st.bulkBtn, {backgroundColor:'#FF9800'}]}
              onPress={() => setSelected(new Set(filtered.map((a:any)=>a.id)))}>
              <MaterialIcons name="select-all" size={16} color="white" />
              <Text style={st.bulkBtnTxt}>All ({filtered.length})</Text>
            </TouchableOpacity>
          )}
          {selectMode && selected.size > 0 && (
            <TouchableOpacity style={st.bulkBtn} onPress={handleBulkResolve}>
              <MaterialIcons name="check" size={16} color="white" />
              <Text style={st.bulkBtnTxt}>Resolve {selected.size}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[st.bulkBtn, { backgroundColor: selectMode ? '#F44336' : '#5C6BC0' }]}
            onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}>
            <MaterialIcons name={selectMode ? 'close' : 'checklist'} size={16} color="white" />
            <Text style={st.bulkBtnTxt}>{selectMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading ? <Text style={st.empty}>Loading...</Text>
          : filtered.length === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={st.empty}>{t('no_alerts') || 'No alerts'}</Text>
          </View>
        ) : null}

        {/* Grouped by student */}
        {Object.entries(grouped).map(([studentName, studentAlerts]) => (
          <View key={studentName} style={st.studentGroup}>
            <View style={st.studentHeader}>
              <Text style={st.studentName}>
                {ZONE_EMOJI[studentAlerts[0]?.zone] || '💙'} {studentName}
              </Text>
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                {studentAlerts[0]?.classroom_name && (
                  <Text style={st.classroomTag}>📍 {studentAlerts[0].classroom_name}</Text>
                )}
                <Text style={st.countBadge}>{studentAlerts.length}</Text>
              </View>
            </View>
            {studentAlerts.map(alert => (
              <TouchableOpacity key={alert.id}
                style={[st.alertRow, selectMode && selected.has(alert.id) && st.alertRowSelected]}
                onPress={() => selectMode ? toggleSelect(alert.id) : null}
                onLongPress={() => { setSelectMode(true); toggleSelect(alert.id); }}
                activeOpacity={selectMode ? 0.7 : 1}>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8, flex:1 }}>
                  {selectMode && (
                    <MaterialIcons
                      name={selected.has(alert.id) ? 'check-box' : 'check-box-outline-blank'}
                      size={20} color={selected.has(alert.id) ? '#4CAF50' : '#CCC'} />
                  )}
                  <View style={[st.zoneDot, { backgroundColor: ZONE_COLORS[alert.zone] || '#CCC' }]} />
                  <View style={{ flex:1 }}>
                    {alert.strategy_name && <Text style={st.strategyTxt}>🎯 {resolveStratName(alert.strategy_name)}</Text>}
                    {alert.message && <Text style={[st.messageTxt, {color:'#1a1a1a', fontWeight:'600'}]}>💬 {alert.message}</Text>}
                    <Text style={st.timeTxt}>
                      {new Date(alert.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      {' · '}{new Date(alert.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                {!selectMode && (
                  <TouchableOpacity style={st.resolveBtn} onPress={() => handleResolve(alert.id)}>
                    <MaterialIcons name="check-box-outline-blank" size={20} color="#4CAF50" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ))}

        {/* Resolved section */}
        {resolvedFiltered.length > 0 && (
          <>
            <TouchableOpacity onPress={() => setShowResolved(e => !e)}
              style={st.resolvedHeader}>
              <Text style={st.sectionLabel}>Resolved ({resolvedFiltered.length})</Text>
              <MaterialIcons name={showResolved ? 'expand-less' : 'expand-more'} size={22} color="#999" />
            </TouchableOpacity>
            {showResolved && resolvedFiltered.slice(0,10).map(alert => (
              <View key={alert.id} style={[st.alertRow, { opacity:0.5 }]}>
                <View style={[st.zoneDot, { backgroundColor: ZONE_COLORS[alert.zone] || '#CCC' }]} />
                <View style={{ flex:1 }}>
                  <Text style={st.studentName}>{alert.student_name}</Text>
                  {alert.strategy_name && <Text style={st.strategyTxt}>🎯 {alert.strategy_name}</Text>}
                  <Text style={st.timeTxt}>{new Date(alert.created_at).toLocaleDateString()}</Text>
                </View>
                <MaterialIcons name="check-box" size={20} color="#4CAF50" />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8F9FA' },
  tabs: { flexDirection:'row', backgroundColor:'white', paddingHorizontal:12, paddingVertical:4, gap:6, borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  tab: { flex:1, paddingVertical:3, borderRadius:6, alignItems:'center', backgroundColor:'#F5F5F5' },
  tabActive: { backgroundColor:'#5C6BC0' },
  tabTxt: { fontSize:11, fontWeight:'600', color:'#888' },
  tabTxtActive: { color:'white' },
  classroomRow: { backgroundColor:'white', paddingHorizontal:12, paddingVertical:4, borderBottomWidth:1, borderBottomColor:'#F0F0F0', minHeight:46 },
  classroomBtn: { paddingHorizontal:8, paddingVertical:3, borderRadius:8, marginRight:5, backgroundColor:'#F5F5F5', height:26, justifyContent:'center' },
  classroomBtnActive: { backgroundColor:'#E8EAF6' },
  classroomTxt: { fontSize:11, color:'#888' },
  classroomTxtActive: { color:'#5C6BC0', fontWeight:'600' },
  actionBar: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:16, paddingVertical:8, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  countTxt: { fontSize:13, color:'#666', fontWeight:'600' },
  bulkBtn: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#5C6BC0', paddingHorizontal:12, paddingVertical:6, borderRadius:8 },
  bulkBtnTxt: { fontSize:12, color:'white', fontWeight:'600' },
  studentGroup: { backgroundColor:'white', borderRadius:12, marginBottom:12, overflow:'hidden', shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2 },
  studentHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', padding:12, backgroundColor:'#F8F9FA', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  studentName: { fontSize:14, fontWeight:'700', color:'#333' },
  classroomTag: { fontSize:11, color:'#888' },
  countBadge: { fontSize:11, fontWeight:'700', color:'white', backgroundColor:'#5C6BC0', paddingHorizontal:6, paddingVertical:2, borderRadius:10 },
  alertRow: { flexDirection:'row', alignItems:'center', padding:12, borderBottomWidth:1, borderBottomColor:'#F8F8F8', gap:8 },
  alertRowSelected: { backgroundColor:'#E8F5E9' },
  zoneDot: { width:10, height:10, borderRadius:5, flexShrink:0 },
  strategyTxt: { fontSize:13, color:'#333', fontWeight:'500' },
  messageTxt: { fontSize:13, color:'#333', fontWeight:'500', backgroundColor:'#F0F4FF', padding:6, borderRadius:6, marginVertical:2 },
  timeTxt: { fontSize:11, color:'#999', marginTop:2 },
  resolveBtn: { padding:4 },
  resolvedHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingVertical:10, paddingHorizontal:4, marginTop:8 },
  sectionLabel: { fontSize:12, color:'#999', fontWeight:'600', textTransform:'uppercase' },
  emptyBox: { alignItems:'center', paddingTop:60, gap:12 },
  empty: { fontSize:15, color:'#999', textAlign:'center', marginTop:8 },
});
