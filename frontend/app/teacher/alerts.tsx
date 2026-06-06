import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';

const ZONE_COLOR: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_EMOJI: Record<string,string> = { blue:'🔵', green:'🟢', yellow:'🟡', red:'🔴' };
const STRAT: Record<string,string> = {
  b1:'Gentle Stretch',b2:'Warm Drink',b3:'Favourite Song',b4:'Cosy Spot',b5:'Tell Someone',b6:'Slow Breathing',
  g1:'Keep Going!',g2:'Help a Friend',g3:'Try Something New',g4:'Share Your Smile',g5:'Set a Goal',g6:'Gratitude',
  y1:'Bubble Breathing',y2:'Body Shake',y3:'Count to 10',y4:'5 Senses',y5:'Squeeze & Release',y6:'Talk About It',
  r1:'Freeze',r2:'Big Breaths',r3:'Count Backwards',r4:'Safe Space',r5:'Ask for Help',r6:'Self Hug',
  blue_1:'Gentle Stretch',blue_2:'Warm Drink',blue_3:'Favourite Song',blue_4:'Cosy Spot',blue_5:'Tell Someone',blue_6:'Slow Breathing',
  green_1:'Keep Going!',green_2:'Help a Friend',green_3:'Try Something New',green_4:'Share Your Smile',green_5:'Set a Goal',green_6:'Gratitude',
  yellow_1:'Bubble Breathing',yellow_2:'Body Shake',yellow_3:'Count to 10',yellow_4:'5 Senses',yellow_5:'Squeeze & Release',yellow_6:'Talk About It',
  red_1:'Freeze',red_2:'Big Breaths',red_3:'Count Backwards',red_4:'Safe Space',red_5:'Ask for Help',red_6:'Self Hug',
};
const resolveName = (id: string) => {
  if (!id) return '';
  if (STRAT[id]) return STRAT[id];
  const c = id.replace(/^(helper_|strategy_)/,'');
  return STRAT[c] || id.replace(/_/g,' ').replace(/\b\w/g,x=>x.toUpperCase());
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
  const [type, setType] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});
  const [showResolved, setShowResolved] = useState(false);

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
    Alert.alert('Resolve?', 'Mark this as addressed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => {
        await resolveAlert(id, token);
        setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
      }},
    ]);
  };

  const inPeriod = (a: any) => {
    const diff = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
    if (period === 'today') return diff < 1;
    if (period === '7') return diff <= 7;
    if (period === '14') return diff <= 14;
    return diff <= 30;
  };

  // Build classroom list from alerts + teacher classrooms
  const classroomNames = Array.from(new Set([
    ...(classrooms||[]).map((c:any) => c.name),
    ...alerts.map(a => a.classroom_name).filter(Boolean),
  ]));

  const filtered = alerts.filter(a => {
    if (a.resolved) return false;
    if (!inPeriod(a)) return false;
    if (type && a.alert_type !== type) return false;
    if (classroom !== 'all') {
      const byName = a.classroom_name === classroom;
      const cl = (classrooms||[]).find((c:any) => c.name === classroom);
      const byStudent = cl ? (students||[]).some((s:any) => s.id === a.student_id && s.classroom_id === cl.id) : false;
      if (!byName && !byStudent) return false;
    }
    return true;
  });

  const resolved = alerts.filter(a => a.resolved && inPeriod(a));

  const grouped: Record<string,any[]> = {};
  filtered.forEach(a => {
    const k = a.student_name || 'Unknown';
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(a);
  });

  const Pill = ({ label, active, onPress }: any) => (
    <TouchableOpacity onPress={onPress}
      style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:16, marginRight:6,
        backgroundColor: active ? '#5C6BC0' : '#F0F0F0' }}>
      <Text style={{ fontSize:12, fontWeight:'600', color: active ? 'white' : '#666' }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#F8F9FA' }}>
      <TranslatedHeader title={t('alerts') || 'Student Alerts'} />

      {/* Period tabs */}
      <View style={{ flexDirection:'row', backgroundColor:'white', paddingHorizontal:12, paddingVertical:6,
        gap:6, borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        {(['today','7','14','30'] as const).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={{ flex:1, paddingVertical:6,
            borderRadius:8, alignItems:'center', backgroundColor: period===p ? '#5C6BC0' : '#F5F5F5' }}>
            <Text style={{ fontSize:12, fontWeight:'600', color: period===p ? 'white' : '#888' }}>
              {p==='today'?'Today':p==='7'?'Week':p==='14'?'Fortnight':'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Classroom filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0', flexGrow:0 }}
        contentContainerStyle={{ paddingHorizontal:12, paddingVertical:8, flexDirection:'row', alignItems:'center' }}>
        <Pill label="🏫 All" active={classroom==='all'} onPress={() => setClassroom('all')} />
        {classroomNames.map(n => (
          <Pill key={n} label={`📍 ${n}`} active={classroom===n} onPress={() => setClassroom(n)} />
        ))}
      </ScrollView>

      {/* Type filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0', flexGrow:0 }}
        contentContainerStyle={{ paddingHorizontal:12, paddingVertical:8, flexDirection:'row', alignItems:'center' }}>
        <Pill label="All" active={type===null} onPress={() => setType(null)} />
        <Pill label="🖐 Help Request" active={type==='help_request'} onPress={() => setType('help_request')} />
        <Pill label="📍 Check-in" active={type==='zone_alert'} onPress={() => setType('zone_alert')} />
        <Pill label="💬 Message" active={type==='parent_message'} onPress={() => setType('parent_message')} />
      </ScrollView>

      {/* Count bar */}
      <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
        paddingHorizontal:16, paddingVertical:8, backgroundColor:'white',
        borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        <Text style={{ fontSize:13, color:'#666', fontWeight:'600' }}>{filtered.length} pending</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding:14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <Text style={{ textAlign:'center', color:'#999', marginTop:20 }}>Loading...</Text>}
        {!loading && filtered.length === 0 && (
          <View style={{ alignItems:'center', marginTop:40 }}>
            <Text style={{ fontSize:40 }}>✅</Text>
            <Text style={{ color:'#999', fontSize:14, marginTop:8 }}>No pending alerts</Text>
          </View>
        )}

        {Object.entries(grouped).map(([name, items]) => (
          <View key={name} style={{ backgroundColor:'white', borderRadius:12, marginBottom:10,
            shadowColor:'#000', shadowOpacity:0.05, shadowRadius:4, elevation:2, overflow:'hidden' }}>
            <TouchableOpacity onPress={() => setExpanded(p => ({...p, [name]: !p[name]}))}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                padding:12, backgroundColor:'#F8F9FA', borderBottomWidth: expanded[name] ? 1 : 0,
                borderBottomColor:'#F0F0F0' }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <Text style={{ fontSize:14, fontWeight:'700', color:'#333' }}>
                  {ZONE_EMOJI[items[0]?.zone] || '💙'} {name}
                </Text>
                {items[0]?.classroom_name && (
                  <Text style={{ fontSize:11, color:'#888' }}>📍 {items[0].classroom_name}</Text>
                )}
              </View>
              <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                <View style={{ backgroundColor:'#5C6BC0', borderRadius:10, paddingHorizontal:6, paddingVertical:2 }}>
                  <Text style={{ fontSize:11, color:'white', fontWeight:'700' }}>{items.length}</Text>
                </View>
                <MaterialIcons name={expanded[name] ? 'expand-less' : 'expand-more'} size={20} color="#999" />
              </View>
            </TouchableOpacity>

            {expanded[name] && items.map((alert:any) => (
              <View key={alert.id} style={{ padding:12, borderBottomWidth:1, borderBottomColor:'#F8F8F8',
                borderLeftWidth:3, borderLeftColor: ZONE_COLOR[alert.zone] || '#CCC' }}>
                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize:12, color:'#888', marginBottom:4 }}>
                      {alert.alert_type === 'help_request' ? '🖐 Help Request' :
                       alert.alert_type === 'zone_alert' ? '📍 Check-in Alert' : '💬 Message'}
                    </Text>
                    {alert.strategy_name && (
                      <Text style={{ fontSize:13, color:'#333', fontWeight:'500', marginBottom:4 }}>
                        🎯 {resolveName(alert.strategy_name)}
                      </Text>
                    )}
                    {alert.message && (
                      <View style={{ backgroundColor:'#EEF2FF', borderRadius:8, padding:8, marginBottom:4 }}>
                        <Text style={{ fontSize:13, color:'#1a1a1a', fontWeight:'600' }}>{alert.message}</Text>
                      </View>
                    )}
                    <Text style={{ fontSize:11, color:'#999' }}>
                      {new Date(alert.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                      {' · '}{new Date(alert.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => handleResolve(alert.id)}
                    style={{ marginLeft:8, padding:4 }}>
                    <MaterialIcons name="check-circle-outline" size={22} color="#4CAF50" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        ))}

        {resolved.length > 0 && (
          <>
            <TouchableOpacity onPress={() => setShowResolved(v => !v)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                paddingVertical:10, paddingHorizontal:4 }}>
              <Text style={{ fontSize:13, color:'#999', fontWeight:'600' }}>Resolved ({resolved.length})</Text>
              <MaterialIcons name={showResolved ? 'expand-less' : 'expand-more'} size:20 color="#CCC" />
            </TouchableOpacity>
            {showResolved && resolved.slice(0,10).map((a:any) => (
              <View key={a.id} style={{ flexDirection:'row', alignItems:'center', padding:10,
                backgroundColor:'white', borderRadius:8, marginBottom:6, opacity:0.6 }}>
                <View style={{ width:8, height:8, borderRadius:4, backgroundColor:ZONE_COLOR[a.zone]||'#CCC', marginRight:10 }} />
                <Text style={{ flex:1, fontSize:13, color:'#666' }}>{a.student_name} · {a.alert_type}</Text>
                <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
