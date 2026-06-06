import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';

const ZONE_COLOR: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
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
  return STRAT[c] || id.replace(/_/g,' ').replace(/\b\w/g,(x:string)=>x.toUpperCase());
};
const zoneEmoji = (z: string) => z==='blue'?'\U0001F535':z==='green'?'\U0001F7E2':z==='yellow'?'\U0001F7E1':z==='red'?'\U0001F534':'\U0001F4D9';

const Pill = ({ label, active, onPress }: { label:string, active:boolean, onPress:()=>void }) => (
  <TouchableOpacity onPress={onPress} style={{
    paddingHorizontal:14, paddingVertical:7, borderRadius:20, marginRight:8,
    backgroundColor: active ? '#4CAF50' : '#E8E8E8',
    borderWidth:1, borderColor: active ? '#4CAF50' : '#DDD'
  }}>
    <Text style={{ fontSize:13, fontWeight:'600', color: active ? 'white' : '#555' }}>{label}</Text>
  </TouchableOpacity>
);

const Tab = ({ label, active, onPress }: { label:string, active:boolean, onPress:()=>void }) => (
  <TouchableOpacity onPress={onPress} style={{ flex:1, paddingVertical:8,
    borderRadius:8, alignItems:'center', backgroundColor: active ? '#4CAF50' : '#F5F5F5' }}>
    <Text style={{ fontSize:12, fontWeight:'700', color: active ? 'white' : '#888' }}>{label}</Text>
  </TouchableOpacity>
);

export default function ParentAlertsScreen() {
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState<'today'|'7'|'14'|'30'>('30');
  const [childFilter, setChildFilter] = useState<string|null>(null);
  const [alertType, setAlertType] = useState<string|null>(null);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    const data = await getAlerts(tok);
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleResolve = (id: string) => {
    Alert.alert('Mark Resolved?', 'Has this been addressed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', onPress: async () => {
        await resolveAlert(id, token);
        setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
        await load();
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

  const childNames = Array.from(new Set(alerts.map((a:any) => a.student_name).filter(Boolean))) as string[];
  const filtered = alerts.filter((a:any) => {
    if (a.resolved) return false;
    if (!inPeriod(a)) return false;
    if (alertType && a.alert_type !== alertType) return false;
    if (childFilter && a.student_name !== childFilter) return false;
    return true;
  });
  const resolvedAlerts = alerts.filter((a:any) => a.resolved && inPeriod(a));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#F8F9FA' }}>
      <TranslatedHeader title={t('alerts') || 'Family Alerts'} />

      <View style={{ flexDirection:'row', backgroundColor:'white', padding:10, gap:8,
        borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        <Tab label="Today" active={period==='today'} onPress={() => setPeriod('today')} />
        <Tab label="Week" active={period==='7'} onPress={() => setPeriod('7')} />
        <Tab label="Fortnight" active={period==='14'} onPress={() => setPeriod('14')} />
        <Tab label="Month" active={period==='30'} onPress={() => setPeriod('30')} />
      </View>

      {childNames.length > 1 && (
        <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal:12, paddingVertical:10, flexDirection:'row' }}>
            <Pill label="All" active={childFilter===null} onPress={() => setChildFilter(null)} />
            {childNames.map(n => <Pill key={n} label={n} active={childFilter===n} onPress={() => setChildFilter(childFilter===n?null:n)} />)}
          </ScrollView>
        </View>
      )}

      <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, paddingVertical:10, flexDirection:'row' }}>
          <Pill label="All" active={alertType===null} onPress={() => setAlertType(null)} />
          <Pill label="Help Request" active={alertType==='help_request'} onPress={() => setAlertType('help_request')} />
          <Pill label="Check-in" active={alertType==='zone_alert'} onPress={() => setAlertType('zone_alert')} />
          <Pill label="Message" active={alertType==='parent_message'} onPress={() => setAlertType('parent_message')} />
        </ScrollView>
      </View>

      <View style={{ paddingHorizontal:16, paddingVertical:8, backgroundColor:'white',
        borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        <Text style={{ fontSize:13, color:'#666', fontWeight:'600' }}>{filtered.length} pending</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding:14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>

        {loading && <Text style={{ textAlign:'center', color:'#999', marginTop:30 }}>Loading...</Text>}
        {!loading && filtered.length === 0 && (
          <View style={{ alignItems:'center', marginTop:50 }}>
            <Text style={{ fontSize:40 }}>{'\u2705'}</Text>
            <Text style={{ color:'#999', fontSize:14, marginTop:8 }}>{t('no_alerts') || 'No pending alerts'}</Text>
          </View>
        )}

        {filtered.map((alert:any) => (
          <View key={alert.id} style={{ backgroundColor:'white', borderRadius:14, marginBottom:12,
            shadowColor:'#000', shadowOpacity:0.07, shadowRadius:6, elevation:3,
            borderLeftWidth:5, borderLeftColor: ZONE_COLOR[alert.zone] || '#5C6BC0' }}>
            <View style={{ padding:14 }}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:16, fontWeight:'700', color:'#222', marginBottom:4 }}>
                    {zoneEmoji(alert.zone)} {alert.student_name || 'Child'}
                  </Text>
                  <View style={{ alignSelf:'flex-start', backgroundColor:
                    alert.alert_type==='help_request'?'#FFF3E0':
                    alert.alert_type==='parent_message'?'#EEF2FF':'#E8F5E9',
                    borderRadius:10, paddingHorizontal:10, paddingVertical:4 }}>
                    <Text style={{ fontSize:12, fontWeight:'700',
                      color: alert.alert_type==='help_request'?'#E65100':
                      alert.alert_type==='parent_message'?'#5C6BC0':'#2E7D32' }}>
                      {alert.alert_type === 'help_request' ? 'Help Request' :
                       alert.alert_type === 'zone_alert' ? 'Check-in Alert' : 'Message from Child'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={() => handleResolve(alert.id)}
                  style={{ padding:8, marginLeft:8 }}>
                  <MaterialIcons name="check-circle-outline" size={28} color="#4CAF50" />
                </TouchableOpacity>
              </View>

              {alert.strategy_name ? (
                <Text style={{ fontSize:14, color:'#555', marginBottom:8 }}>
                  {'\U0001F3AF'} {resolveName(alert.strategy_name)}
                </Text>
              ) : null}

              {alert.message ? (
                <View style={{ backgroundColor:'#EEF2FF', borderRadius:10, padding:12, marginBottom:8,
                  borderLeftWidth:4, borderLeftColor:'#5C6BC0' }}>
                  <Text style={{ fontSize:12, color:'#5C6BC0', fontWeight:'700', marginBottom:4 }}>
                    {'\U0001F4AC'} Message
                  </Text>
                  <Text style={{ fontSize:15, color:'#111', fontWeight:'600', lineHeight:22 }}>
                    {alert.message}
                  </Text>
                </View>
              ) : null}

              <Text style={{ fontSize:12, color:'#BBB' }}>
                {new Date(alert.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}
                {' · '}{new Date(alert.created_at).toLocaleDateString()}
              </Text>
            </View>
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
            {showResolved && resolvedAlerts.slice(0,10).map((a:any) => (
              <View key={a.id} style={{ flexDirection:'row', alignItems:'center', padding:12,
                backgroundColor:'white', borderRadius:10, marginBottom:8, opacity:0.6 }}>
                <View style={{ width:10, height:10, borderRadius:5, marginRight:12,
                  backgroundColor: ZONE_COLOR[a.zone] || '#CCC' }} />
                <Text style={{ flex:1, fontSize:14, color:'#666' }}>
                  {a.student_name} · {a.alert_type === 'help_request' ? 'Help Request' :
                  a.alert_type === 'zone_alert' ? 'Check-in' : 'Message'}
                </Text>
                <MaterialIcons name="check-circle" size={18} color="#4CAF50" />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
