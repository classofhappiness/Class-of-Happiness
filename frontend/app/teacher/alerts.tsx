import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';

const ZONE_COLOR: Record<string,string> = EMOTION_COLOURS;
const ZONE_LABEL: Record<string,string> = { blue:'Blue Emotions', green:'Green Emotions', yellow:'Yellow Emotions', red:'Red Emotions' };
const STRAT: Record<string,string> = {
  b1:'Gentle Stretch',b2:'Drink Water',b3:'Favourite Song',b4:'Cosy Spot',b5:'Tell Someone',b6:'Slow Breathing',
  g1:'Keep Going!',g2:'Help a Friend',g3:'Try Something New',g4:'Share Your Smile',g5:'Set a Goal',g6:'Gratitude',
  y1:'Bubble Breathing',y2:'Body Shake',y3:'Count to 10',y4:'5 Senses',y5:'Squeeze & Release',y6:'Talk About It',
  r1:'Freeze',r2:'Big Breaths',r3:'Count Backwards',r4:'Safe Space',r5:'Ask for Help',r6:'Self Hug',
  blue_1:'Gentle Stretch',blue_2:'Drink Water',blue_3:'Favourite Song',blue_4:'Cosy Spot',blue_5:'Tell Someone',blue_6:'Slow Breathing',
  green_1:'Keep Going!',green_2:'Help a Friend',green_3:'Try Something New',green_4:'Share Your Smile',green_5:'Set a Goal',green_6:'Gratitude',
  yellow_1:'Bubble Breathing',yellow_2:'Body Shake',yellow_3:'Count to 10',yellow_4:'5 Senses',yellow_5:'Squeeze & Release',yellow_6:'Talk About It',
  red_1:'Freeze',red_2:'Big Breaths',red_3:'Count Backwards',red_4:'Safe Space',red_5:'Ask for Help',red_6:'Self Hug',
};
const resolveName = (id: string) => {
  if (!id) return '';
  if (STRAT[id]) return STRAT[id];
  const c = id.replace(/^(helper_|strategy_)/,'');
  return STRAT[c] || id.replace(/_/g,' ').replace(/\b\w/g,(x:string)=>x.toUpperCase());
};

const Pill = ({ label, active, onPress, color='#5C6BC0' }: { label:string, active:boolean, onPress:()=>void, color?:string }) => (
  <TouchableOpacity onPress={onPress} style={{
    paddingHorizontal:12, paddingVertical:6, borderRadius:16, marginRight:8,
    backgroundColor: active ? color : '#EEEEEE',
    borderWidth:1, borderColor: active ? color : '#DDD'
  }}>
    <Text style={{ fontSize:12, fontWeight:'600', color: active ? 'white' : '#555' }}>{label}</Text>
  </TouchableOpacity>
);

const AlertCard = ({ alert, onResolve, selected, selectMode, onLongPress, onPress }: any) => {
  const zc = ZONE_COLOR[alert.zone] || '#5C6BC0';
  const typeLabel = alert.alert_type === 'help_request' ? 'Help Request' :
                   alert.alert_type === 'zone_alert' ? 'Check-in Alert' : 'Message';
  const typeBg = alert.alert_type === 'help_request' ? '#FFF3E0' :
                 alert.alert_type === 'parent_message' ? '#EEF2FF' : '#E8F5E9';
  const typeColor = alert.alert_type === 'help_request' ? '#E65100' :
                   alert.alert_type === 'parent_message' ? '#5C6BC0' : '#2E7D32';
  return (
    <TouchableOpacity onPress={onPress} onLongPress={onLongPress} activeOpacity={0.85}
      style={{ backgroundColor: selected ? '#E8F5E9' : 'white', borderRadius:14, marginBottom:10,
        shadowColor:'#000', shadowOpacity:0.07, shadowRadius:6, elevation:3,
        borderLeftWidth:5, borderLeftColor: zc }}>
      <View style={{ padding:14 }}>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
          <View style={{ flex:1 }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6, flexWrap:'wrap' }}>
              {selectMode && <MaterialIcons name={selected?'check-box':'check-box-outline-blank'} size={20} color={selected?'#4CAF50':'#CCC'} />}
              <View style={{ width:12, height:12, borderRadius:6, backgroundColor:zc }} />
              <Text style={{ fontSize:15, fontWeight:'700', color:'#222' }}>
                {alert.student_name || 'Child'}
              </Text>
              <View style={{ backgroundColor:typeBg, borderRadius:10, paddingHorizontal:8, paddingVertical:3 }}>
                <Text style={{ fontSize:11, fontWeight:'700', color:typeColor }}>{typeLabel}</Text>
              </View>
            </View>
            <Text style={{ fontSize:12, color:'#999', marginBottom:6 }}>
              {ZONE_LABEL[alert.zone] || alert.zone} · {new Date(alert.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} {new Date(alert.created_at).toLocaleDateString()}
            </Text>
            {alert.strategy_name ? (
              <Text style={{ fontSize:13, color:'#555', marginBottom:6 }}>
                🎯 {resolveName(alert.strategy_name)}
              </Text>
            ) : null}
            {alert.message ? (
              <View style={{ backgroundColor:'#EEF2FF', borderRadius:10, padding:10, marginBottom:4,
                borderLeftWidth:4, borderLeftColor:'#5C6BC0' }}>
                <Text style={{ fontSize:11, color:'#5C6BC0', fontWeight:'700', marginBottom:3 }}>💬 Message</Text>
                <Text style={{ fontSize:14, color:'#111', fontWeight:'600', lineHeight:20 }}>{alert.message}</Text>
              </View>
            ) : null}
          </View>
          {!selectMode && (
            <TouchableOpacity onPress={onResolve} style={{ padding:6, marginLeft:8 }}>
              <MaterialIcons name="check-circle-outline" size={26} color="#4CAF50" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

export default function TeacherAlertsScreen() {
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t, classrooms, students } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState<'today'|'7'|'14'|'30'>('30');
  const [classroom, setClassroom] = useState('all');
  const [alertType, setAlertType] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<Record<string,boolean>>({}); 
  const [showResolved, setShowResolved] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    const data = await getAlerts(tok);
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleResolve = (id: string) => {
    Alert.alert('Mark Resolved?', 'Has this been addressed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => {
        await resolveAlert(id, token);
        setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
      }},
    ]);
  };

  const handleBulkResolve = () => {
    if (selected.size === 0) return;
    Alert.alert(`Resolve ${selected.size} alerts?`, 'Mark all as addressed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve All', onPress: async () => {
        await Promise.all([...selected].map(id => resolveAlert(id, token)));
        setAlerts(prev => prev.map(a => selected.has(a.id) ? {...a, resolved:true} : a));
        setSelected(new Set()); setSelectMode(false);
      }},
    ]);
  };

  const toggleSelect = (id: string) => setSelected(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const inPeriod = (a: any) => {
    const diff = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
    if (period === 'today') return diff < 1;
    if (period === '7') return diff <= 7;
    if (period === '14') return diff <= 14;
    return diff <= 30;
  };

  const classroomNames = Array.from(new Set([
    ...(classrooms||[]).map((c:any) => c.name),
    ...alerts.map((a:any) => a.classroom_name).filter(Boolean),
  ])) as string[];

  const filtered = alerts.filter((a:any) => {
    if (a.resolved) return false;
    if (!inPeriod(a)) return false;
    if (alertType && a.alert_type !== alertType) return false;
    if (classroom !== 'all') {
      const byName = a.classroom_name === classroom;
      const cl = (classrooms||[]).find((c:any) => c.name === classroom);
      const byStudent = cl ? (students||[]).some((s:any) => s.id === a.student_id && s.classroom_id === cl.id) : false;
      if (!byName && !byStudent) return false;
    }
    return true;
  });

  const resolvedAlerts = alerts.filter((a:any) => a.resolved && inPeriod(a));
  const grouped: Record<string,any[]> = {};
  filtered.forEach((a:any) => {
    const k = a.student_name || 'Unknown';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(a);
  });
  const toggleExpand = (name: string) => setExpanded(p => ({...p, [name]: !p[name]}));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#F8F9FA' }}>
      <TranslatedHeader title={t('alerts') || 'Student Alerts'} />

      <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#E0E0E0' }}>
        <View style={{ flexDirection:'row', padding:10, gap:8 }}>
          {(['today','7','14','30'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={{ flex:1, paddingVertical:7,
              borderRadius:8, alignItems:'center', backgroundColor: period===p ? '#5C6BC0' : '#F0F0F0' }}>
              <Text style={{ fontSize:12, fontWeight:'700', color: period===p ? 'white' : '#888' }}>
                {p==='today'?'Today':p==='7'?'Week':p==='14'?'Fortnight':'Month'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, paddingBottom:8, flexDirection:'row' }}>
          <Pill label="All Classes" active={classroom==='all'} onPress={() => setClassroom('all')} />
          {classroomNames.map(n => <Pill key={n} label={n} active={classroom===n} onPress={() => setClassroom(n)} />)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, paddingBottom:8, flexDirection:'row' }}>
          <Pill label="All" active={alertType===null} onPress={() => setAlertType(null)} />
          <Pill label="Help Request" active={alertType==='help_request'} onPress={() => setAlertType('help_request')} color="#E65100" />
          <Pill label="Check-in" active={alertType==='zone_alert'} onPress={() => setAlertType('zone_alert')} color="#2E7D32" />
          <Pill label="Message" active={alertType==='parent_message'} onPress={() => setAlertType('parent_message')} color="#5C6BC0" />
        </ScrollView>
        <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', paddingHorizontal:14, paddingBottom:8 }}>
          <Text style={{ fontSize:12, color:'#999', fontWeight:'600' }}>{filtered.length} pending</Text>
          <View style={{ flexDirection:'row', gap:8 }}>
            {selectMode && selected.size > 0 && (
              <TouchableOpacity onPress={handleBulkResolve}
                style={{ backgroundColor:'#4CAF50', paddingHorizontal:12, paddingVertical:5, borderRadius:8, flexDirection:'row', alignItems:'center', gap:4 }}>
                <MaterialIcons name="check" size={14} color="white" />
                <Text style={{ fontSize:12, color:'white', fontWeight:'700' }}>Resolve {selected.size}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
              style={{ backgroundColor: selectMode ? '#F44336' : '#EEE', paddingHorizontal:12, paddingVertical:5, borderRadius:8 }}>
              <Text style={{ fontSize:12, color: selectMode ? 'white' : '#666', fontWeight:'700' }}>{selectMode ? 'Cancel' : 'Select'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding:14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {loading && <View style={{ alignItems:'center', marginTop:30 }}><EmotionColourLoader visible size={48} /></View>}
        {!loading && filtered.length === 0 && (
          <View style={{ alignItems:'center', marginTop:50 }}>
            <Text style={{ fontSize:40 }}>✅</Text>
            <Text style={{ color:'#999', fontSize:14, marginTop:8 }}>{t('no_alerts') || 'No pending alerts'}</Text>
          </View>
        )}
        {Object.entries(grouped).map(([name, items]) => (
          <View key={name} style={{ backgroundColor:'white', borderRadius:14, marginBottom:10,
            shadowColor:'#000', shadowOpacity:0.07, shadowRadius:6, elevation:3, overflow:'hidden' }}>
            <TouchableOpacity onPress={() => toggleExpand(name)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                paddingHorizontal:14, paddingVertical:12, backgroundColor:'#F8F9FA' }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>{name}</Text>
                {items[0]?.classroom_name ? (
                  <Text style={{ fontSize:11, color:'#999' }}>{items[0].classroom_name}</Text>
                ) : null}
              </View>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <View style={{ backgroundColor:'#888', borderRadius:10, paddingHorizontal:7, paddingVertical:2 }}>
                  <Text style={{ fontSize:11, color:'white', fontWeight:'700' }}>{items.length}</Text>
                </View>
                <MaterialIcons name={expanded[name] ? 'expand-less' : 'expand-more'} size={20} color="#999" />
              </View>
            </TouchableOpacity>
            {expanded[name] && items.map((alert:any) => (
              <AlertCard key={alert.id} alert={alert}
                onResolve={() => handleResolve(alert.id)}
                selected={selected.has(alert.id)}
                selectMode={selectMode}
                onLongPress={() => { setSelectMode(true); toggleSelect(alert.id); }}
                onPress={() => selectMode && toggleSelect(alert.id)}
              />
            ))}
          </View>
        ))}

        {resolvedAlerts.length > 0 && (
          <View style={{ marginTop:8 }}>
            <TouchableOpacity onPress={() => setShowResolved(v => !v)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                paddingVertical:12, paddingHorizontal:4 }}>
              <Text style={{ fontSize:14, color:'#999', fontWeight:'600' }}>Resolved ({resolvedAlerts.length})</Text>
              <MaterialIcons name={showResolved ? 'expand-less' : 'expand-more'} size={22} color="#CCC" />
            </TouchableOpacity>
            {showResolved ? resolvedAlerts.slice(0,10).map((a:any) => (
              <View key={a.id} style={{ flexDirection:'row', alignItems:'center', padding:12,
                backgroundColor:'white', borderRadius:10, marginBottom:8, opacity:0.6,
                borderLeftWidth:4, borderLeftColor: ZONE_COLOR[a.zone]||'#CCC' }}>
                <View style={{ width:10, height:10, borderRadius:5, marginRight:10,
                  backgroundColor: ZONE_COLOR[a.zone] || '#CCC' }} />
                <Text style={{ flex:1, fontSize:13, color:'#666' }}>
                  {a.student_name} · {a.alert_type === 'help_request' ? 'Help Request' :
                  a.alert_type === 'zone_alert' ? 'Check-in' : 'Message'}
                </Text>
                <MaterialIcons name="check-circle" size={18} color="#4CAF50" />
              </View>
            )) : null}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
