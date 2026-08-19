import React, { useState, useEffect, useCallback , useWindowDimensions} from 'react';
import { View, Image, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

// Fallback for old-format strategy codes
const STRATEGY_NAMES_LOCAL: Record<string,string> = {
  // Student strategies blue_N format
  blue_1:'Gentle Stretch',blue_2:'Warm Drink',blue_3:'Favourite Song',blue_4:'Cosy Spot',blue_5:'Tell Someone',blue_6:'Slow Breathing',
  green_1:'Keep Going!',green_2:'Help a Friend',green_3:'Try Something New',green_4:'Share Your Smile',green_5:'Set a Goal',green_6:'Gratitude',
  yellow_1:'Bubble Breathing',yellow_2:'Body Shake',yellow_3:'Count to 10',yellow_4:'5 Senses',yellow_5:'Squeeze & Release',yellow_6:'Talk About It',
  red_1:'Freeze',red_2:'Big Breaths',red_3:'Count Backwards',red_4:'Safe Space',red_5:'Ask for Help',red_6:'Self Hug',
  // Short codes b1-b6 etc
  b1:'Gentle Stretch',b2:'Warm Drink',b3:'Favourite Song',b4:'Cosy Spot',b5:'Tell Someone',b6:'Slow Breathing',
  g1:'Keep Going!',g2:'Help a Friend',g3:'Try Something New',g4:'Share Your Smile',g5:'Set a Goal',g6:'Gratitude',
  y1:'Bubble Breathing',y2:'Body Shake',y3:'Count to 10',y4:'5 Senses',y5:'Squeeze & Release',y6:'Talk About It',
  r1:'Freeze',r2:'Big Breaths',r3:'Count Backwards',r4:'Safe Space',r5:'Ask for Help',r6:'Self Hug',
  // Parent strategies p_b/g/y/r format
  p_b1:'Side-by-Side Presence',p_b2:'Warm Drink Ritual',p_b3:'Name It to Tame It',p_b4:'Movement Invitation',p_b5:'Comfort & Closeness',
  p_g1:'Gratitude Round',p_g2:'Strength Spotting',p_g3:'Creative Together',p_g4:'Family Dance',p_g5:'Calm Problem Solving',
  p_y1:'Box Breathing Together',p_y2:'Validate Feelings First',p_y3:'Body Check-In',p_y4:'Feelings Journal',p_y5:'Give Space with Love',
  p_r1:'Stay Calm Yourself',p_r2:'Safe Space Together',p_r3:'Cold Water Reset',p_r4:'No Teaching Now',p_r5:'Reconnect with Warmth',
  // Named strategies
  bubble_breathing:'Bubble Breathing',slow_breathing:'Slow Breathing',count_to_10:'Count to 10',
  walk_away:'Walk Away',safe_space:'Safe Space',talk_about_it:'Talk About It',
  tell_someone:'Tell Someone',gentle_stretch:'Gentle Stretch',gratitude:'Gratitude',
  help_friend:'Help a Friend',keep_going:'Keep Going',set_goal:'Set a Goal',
  ask_for_help:'Ask for Help',self_hug:'Self Hug',big_breaths:'Big Breaths',
  cosy_spot:'Cosy Spot',warm_drink:'Warm Drink',favourite_song:'Favourite Song',
};
const ZONE_KEYS_SET = new Set(['blue','green','yellow','red','Blue','Green','Yellow','Red']);
const resolveStratName = (id: string, nameMap: Record<string,string>): string => {
  if (!id || ZONE_KEYS_SET.has(id)) return '';
  if (nameMap[id]) return nameMap[id];
  if (STRATEGY_NAMES_LOCAL[id]) return STRATEGY_NAMES_LOCAL[id];
  // Try stripping prefix
  const clean = id.replace(/^(helper_|strategy_|strat_)/,'');
  if (STRATEGY_NAMES_LOCAL[clean]) return STRATEGY_NAMES_LOCAL[clean];
  if (nameMap[clean]) return nameMap[clean];
  // Format raw codes like R6, G5 etc
  if (/^[rgybRGYB]\d+$/.test(id)) return '';
  return id.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase());
};
import { useApp } from '../../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../../src/constants/emotionColours';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string,string> = EMOTION_COLOURS;
const ZONE_EMOJI: Record<string,string> = { blue:'😢', green:'😊', yellow:'😰', red:'😠' };
const ZONES = ['green','yellow','blue','red'] as const;

export default function FamilyMemberStatsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { t, language } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [downloadingMonth, setDownloadingMonth] = useState<string|null>(null);
  const [strategyNames, setStrategyNames] = useState<Record<string,string>>({});

  const [secEmoDistrib,     setSecEmoDistrib]     = useState(false);
  const [secMostUsed,       setSecMostUsed]       = useState(false);
  const [secRecentCheckins, setSecRecentCheckins] = useState(false);
  const [secCalendar,       setSecCalendar]       = useState(false);
  const [secStrategies,     setSecStrategies]     = useState(false);
  const [secPdfReport,      setSecPdfReport]      = useState(false);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      // Fetch from both sources: family_zone_logs (unlinked) and feeling_logs via student_id (linked child)
      const [res1, res2] = await Promise.allSettled([
        fetch(`${BACKEND_URL}/api/family/zone-logs/${id}?days=365`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${BACKEND_URL}/api/family/members/${id}/checkins?days=365`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
      ]);
      const logs1 = res1.status === 'fulfilled' && res1.value.ok ? await res1.value.json() : [];
      const logs2 = res2.status === 'fulfilled' && res2.value.ok ? await res2.value.json() : [];
      // Normalise feeling_logs shape to match family_zone_logs shape
      const normalised2 = (Array.isArray(logs2) ? logs2 : []).map((l: any) => ({
        ...l,
        zone: l.zone || l.feeling_colour,
        strategies_selected: l.strategies_selected || l.helpers_selected || [],
      }));
      const combined = [...(Array.isArray(logs1) ? logs1 : []), ...normalised2];
      // Deduplicate by id
      const seen = new Set();
      const deduped = combined.filter(l => { if (seen.has(l.id)) return false; seen.add(l.id); return true; });
      setLogs(deduped);
    } catch {}
    // Fetch strategy names for ID lookup - check all zones
    try {
      const token2 = await AsyncStorage.getItem('session_token');
      const nameMap: Record<string,string> = {};
      // Fetch helpers for all zones
      await Promise.all(['blue','green','yellow','red'].map(async (zone) => {
        const sRes = await fetch(`${BACKEND_URL}/api/strategies?zone=${zone}`, {
          headers: { Authorization: `Bearer ${token2}` }
        });
        if (sRes.ok) {
          const strats = await sRes.json();
          strats.forEach((s: any) => { if (s.id && s.name) nameMap[s.id] = s.name; });
        }
      }));
      // Also fetch without zone filter
      const sRes2 = await fetch(`${BACKEND_URL}/api/strategies`, {
        headers: { Authorization: `Bearer ${token2}` }
      });
      if (sRes2.ok) {
        const strats2 = await sRes2.json();
        strats2.forEach((s: any) => { if (s.id && s.name) nameMap[s.id] = s.name; });
      }
      setStrategyNames(nameMap);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const downloadPDF = async (monthStr: string) => {
    setDownloadingMonth(monthStr);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const lang = await AsyncStorage.getItem('app_language') || language || 'en';
      const [year, month] = monthStr.split('-');
      // Fetch PDF with auth header and open as blob
      const res = await fetch(`${BACKEND_URL}/api/reports/pdf/family/${id}/month/${year}/${parseInt(month)}?lang=${lang}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const url = `${BACKEND_URL}/api/reports/pdf/family/${id}/month/${year}/${parseInt(month)}?token=${token}&lang=${lang}`;
        await Linking.openURL(url);
      } else {
        const errText = await res.text().catch(()=>'');
        Alert.alert('No Data', `No check-ins found for this month (${res.status})`);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not download PDF');
    }
    setDownloadingMonth(null);
  };

  // Aggregate
  const zoneCounts: Record<string,number> = { blue:0, green:0, yellow:0, red:0 };
  const strategyCounts: Record<string,number> = {};
  const monthsSet = new Set<string>();
  const calendarMap: Record<string, string[]> = {};

  logs.forEach(log => {
    const z = log.zone || log.feeling_colour || '';
    if (z in zoneCounts) zoneCounts[z]++;
    const ZONE_KEYS = new Set(['green','yellow','blue','red']);
    (log.helpers_selected || log.strategies_selected || []).forEach((s: string) => {
      // Skip zone colour strings - only count real strategy IDs/names
      if (s && !ZONE_KEYS.has(s.toLowerCase())) strategyCounts[s] = (strategyCounts[s]||0)+1;
    });
    try {
      const d = new Date(log.timestamp);
      const mk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      monthsSet.add(mk);
      if (!calendarMap[dk]) calendarMap[dk] = [];
      if (!calendarMap[dk].includes(z)) calendarMap[dk].push(z);

    } catch {}
  });

  const total = logs.length;
  const topStrategies = Object.entries(strategyCounts)
    .filter(([s]) => !ZONE_KEYS_SET.has(s) && s.length > 1)
    .sort((a,b)=>b[1]-a[1]).slice(0,6);
  const months = Array.from(monthsSet).sort().reverse();

  const SectionHeader = ({ label, open, onPress, icon }: any) => (
    <TouchableOpacity onPress={onPress} style={s.secHeader} activeOpacity={0.7}>
      <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
        {icon && <MaterialIcons name={icon} size={18} color="#5C6BC0" />}
        <Text style={s.secTitle}>{label}</Text>
      </View>
      <MaterialIcons name={open?'expand-less':'expand-more'} size={20} color="#999" />
    </TouchableOpacity>
  );

  if (loading) return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Image source={require('../../../assets/images/logo_coh.png')} style={s.headerLogo} resizeMode="contain" />
          <Text style={s.headerTitle}>{decodeURIComponent(name||'')} — {t('stats')||'Statistics'}</Text>
        </View>
        <View style={{width:40}} />
      </View>
      <ActivityIndicator size="large" color="#4CAF50" style={{marginTop:60}} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.headerBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Image source={require('../../../assets/images/logo_coh.png')} style={s.headerLogo} resizeMode="contain" />
          <Text style={s.headerTitle}>{decodeURIComponent(name||'')} — {t('stats')||'Statistics'}</Text>
        </View>
        <View style={{width:40}} />
      </View>

      <ScrollView
        contentContainerStyle={{padding:16, paddingBottom:40}}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" />}>

        {/* Summary line */}
        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, marginBottom:12}}>
          <Text style={{fontSize:13, color:'#888', textAlign:'center'}}>
            {total > 0
              ? `${total} ${t('wellbeing_total')||'total check-ins'} · ${t('last_checkin')||'Last'}: ${(() => { const last = logs.sort((a:any,b:any)=>new Date(b.timestamp).getTime()-new Date(a.timestamp).getTime())[0]; if(!last) return '—'; const d = new Date(last.timestamp); const diff = Math.floor((Date.now()-d.getTime())/(1000*60*60*24)); return diff === 0 ? (t('just_now')||'Today') : diff === 1 ? (t('yesterday')||'Yesterday') : `${diff} ${t('days_ago')||'days ago'}`; })()}`
              : t('no_checkin_yet')||'No check-ins yet — tap the card to start!'
            }
          </Text>
        </View>

        {/* Emotion Distribution */}
          <View style={s.card}>
            <SectionHeader label={t('emotion_distribution')||'Emotion Distribution'} open={secEmoDistrib} onPress={()=>setSecEmoDistrib(v=>!v)} icon="donut-large" />
            {secEmoDistrib && (
              <View style={{gap:10, marginTop:12}}>
                {ZONES.map(z => {
                  const pct = total > 0 ? Math.round((zoneCounts[z]/total)*100) : 0;
                  return (
                    <View key={z} style={{flexDirection:'row', alignItems:'center', gap:8}}>
                      <Text style={{width:24, fontSize:16}}>{ZONE_EMOJI[z]}</Text>
                      <View style={{flex:1, height:12, backgroundColor:'#F0F0F0', borderRadius:6, overflow:'hidden'}}>
                        <View style={{width:`${pct}%` as any, height:12, backgroundColor:ZONE_COLORS[z], borderRadius:6}} />
                      </View>
                      <Text style={{fontSize:12, color:'#666', width:52, textAlign:'right'}}>{pct}% ({zoneCounts[z]})</Text>
                    </View>
                  );
                })}
                <Text style={{fontSize:11, color:'#999', marginTop:4}}>🏠 Home · School: not linked</Text>
              </View>
            )}
          </View>

          {/* Most Used Strategies */}
          <View style={s.card}>
            <SectionHeader label={t('most_used_strategies')||'Most Used Strategies'} open={secMostUsed} onPress={()=>setSecMostUsed(v=>!v)} icon="lightbulb" />
            {secMostUsed && (
              <View style={{gap:8, marginTop:12}}>
                {topStrategies.length === 0
                  ? <Text style={s.emptyText}>{t('no_data_period')||t('no_data_period') || 'No strategies recorded yet'}</Text>
                  : topStrategies.map(([strat, count]) => (
                    <View key={strat} style={{flexDirection:'row', alignItems:'center', gap:10, paddingVertical:4, borderBottomWidth:1, borderBottomColor:'#F5F5F5'}}>
                      <MaterialIcons name="lightbulb" size={16} color="#FF9800" />
                      <Text style={{flex:1, fontSize:13, color:'#333'}}>{(resolveStratName(strat, strategyNames))}</Text>
                      <View style={{backgroundColor:'#FFF8E1', borderRadius:8, paddingHorizontal:8, paddingVertical:3}}>
                        <Text style={{fontSize:12, color:'#FF9800', fontWeight:'600'}}>{count}×</Text>
                      </View>
                    </View>
                  ))
                }
              </View>
            )}
          </View>

          {/* Recent Check-ins */}
          <View style={s.card}>
            <SectionHeader label={t('recent_checkins')||'Recent Check-ins'} open={secRecentCheckins} onPress={()=>setSecRecentCheckins(v=>!v)} icon="history" />
            {secRecentCheckins && (
              <View style={{gap:10, marginTop:12}}>
                {logs.slice(0,15).map((log, i) => {
                  const z = log.zone || log.feeling_colour || '';
                  const strats = (log.helpers_selected || log.strategies_selected || []);
                  return (
                    <View key={i} style={{flexDirection:'row', alignItems:'flex-start', gap:10}}>
                      <View style={{width:36, height:36, borderRadius:18, backgroundColor:ZONE_COLORS[z]||'#CCC', alignItems:'center', justifyContent:'center'}}>
                        <Text style={{fontSize:18}}>{ZONE_EMOJI[z]||'😶'}</Text>
                      </View>
                      <View style={{flex:1}}>
                        <Text style={{fontSize:13, fontWeight:'600', color:'#333'}}>
                          {new Date(log.timestamp).toLocaleDateString(undefined, {weekday:'short', month:'short', day:'numeric'})}
                          {' · '}{new Date(log.timestamp).toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit', hour12:true})}
                        </Text>
                        {strats.length > 0 && (
                          <Text style={{fontSize:11, color:'#5C6BC0', marginTop:2}}>
                            💡 {strats.slice(0,3).map((s:string)=>resolveStratName(s,strategyNames)).filter(Boolean).join(', ')}
                          </Text>
                        )}
                        {log.comment && <Text style={{fontSize:11, color:'#888', marginTop:2, fontStyle:'italic'}}>"{log.comment}"</Text>}
                      </View>
                      <View style={{backgroundColor:'#E8F5E9', borderRadius:8, paddingHorizontal:6, paddingVertical:3}}>
                        <Text style={{fontSize:10, color:'#4CAF50'}}>🏠</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* Check-in Calendar */}
          <View style={s.card}>
            <SectionHeader label={t('checkin_calendar')||'Check-in Calendar'} open={secCalendar} onPress={()=>setSecCalendar(v=>!v)} icon="calendar-today" />
            {secCalendar && (
              <View style={{marginTop:12}}>
                {months.slice(0,3).map(m => {
                  const [yr, mo] = m.split('-').map(Number);
                  const daysInMonth = new Date(yr, mo, 0).getDate();
                  const firstDay = new Date(yr, mo-1, 1).getDay();
                  const monthLabel = new Date(yr, mo-1, 15).toLocaleDateString(undefined, {month:'long', year:'numeric'});
                  return (
                    <View key={m} style={{marginBottom:16}}>
                      <Text style={{fontSize:13, fontWeight:'700', color:'#333', marginBottom:8}}>{monthLabel}</Text>
                      <View style={{flexDirection:'row', flexWrap:'wrap', gap:3}}>
                        {Array.from({length: firstDay}).map((_,i) => (
                          <View key={`e${i}`} style={{width:32, height:32}} />
                        ))}
                        {Array.from({length: daysInMonth}).map((_,i) => {
                          const day = i+1;
                          const dk = `${yr}-${String(mo).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                          const zones = calendarMap[dk] || [];
                          const topZone = zones[0];
                          return (
                            <View key={day} style={{width:32, height:32, borderRadius:6, backgroundColor: topZone ? ZONE_COLORS[topZone] : '#F5F5F5', alignItems:'center', justifyContent:'center'}}>
                              <Text style={{fontSize:10, fontWeight:'600', color: topZone ? 'white' : '#CCC'}}>{day}</Text>
                              {zones.length > 1 && <Text style={{fontSize:7, color:'rgba(255,255,255,0.9)', position:'absolute', bottom:1}}>{zones.length}×</Text>}
                            </View>
                          );
                        })}
                      </View>
                      <View style={{flexDirection:'row', gap:8, marginTop:6}}>
                        {ZONES.map(z => zoneCounts[z] > 0 && (
                          <View key={z} style={{flexDirection:'row', alignItems:'center', gap:3}}>
                            <View style={{width:8, height:8, borderRadius:4, backgroundColor:ZONE_COLORS[z]}} />
                            <Text style={{fontSize:9, color:'#888'}}>🏠</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* PDF Download */}
          <View style={s.card}>
            <SectionHeader label={t('download_monthly_reports')||'Download Monthly Reports'} open={secPdfReport} onPress={()=>setSecPdfReport(v=>!v)} icon="picture-as-pdf" />
            {secPdfReport && (
              <View style={{gap:8, marginTop:12}}>
                <Text style={{fontSize:12, color:'#888', marginBottom:4}}>
                  {t('select_month_pdf')||'Select a month to download a PDF report'}
                </Text>
                {months.length === 0
                  ? <Text style={s.emptyText}>{t('no_checkin_yet')||t('no_checkin_yet') || 'No check-ins yet'}</Text>
                  : months.map(m => {
                      const label = new Date(m+'-15').toLocaleDateString(undefined, {month:'long', year:'numeric'});
                      return (
                        <TouchableOpacity key={m}
                          style={{flexDirection:'row', alignItems:'center', backgroundColor:'#FFF3F3', borderRadius:10, padding:12, gap:10, borderWidth:1, borderColor:'#FFCDD2'}}
                          onPress={() => downloadPDF(m)}
                          disabled={downloadingMonth === m}>
                          <MaterialIcons name="picture-as-pdf" size={20} color="#E53935" />
                          <Text style={{flex:1, fontSize:13, fontWeight:'600', color:'#333'}}>{label}</Text>
                          {downloadingMonth === m
                            ? <ActivityIndicator size="small" color="#E53935" />
                            : <MaterialIcons name="download" size={18} color="#E53935" />}
                        </TouchableOpacity>
                      );
                    })
                }
              </View>
            )}
          </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F8F9FA' },
  header: { flexDirection:'row', alignItems:'center', padding:16, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0', gap:8 },
  headerName: { fontSize:18, fontWeight:'700', color:'#333' },
  headerSub: { fontSize:12, color:'#888', marginTop:2 },
  headerBtn: { padding:8, width:40 },
  headerCenter: { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  headerLogo: { width:28, height:28 },
  headerTitle: { fontSize:16, fontWeight:'700', color:'#333' },
  card: { backgroundColor:'white', borderRadius:14, padding:14, marginBottom:12, elevation:1, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:3, shadowOffset:{width:0,height:1} },
  secHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  secTitle: { fontSize:14, fontWeight:'700', color:'#333' },
  emptyBox: { alignItems:'center', padding:40, gap:12 },
  emptyText: { fontSize:14, color:'#999', textAlign:'center' },
  emptyHint: { fontSize:12, color:'#BBB', textAlign:'center', lineHeight:18 },
});
