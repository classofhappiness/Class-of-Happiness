import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { useApp } from '../../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_EMOJI: Record<string,string> = { blue:'😢', green:'😊', yellow:'😰', red:'😠' };

export default function FamilyMemberStatsScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const { t, language } = useApp();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<any[]>([]);
  const [downloadingMonth, setDownloadingMonth] = useState<string|null>(null);

  // Collapsible sections
  const [secDist, setSecDist] = useState(false);
  const [secStrategies, setSecStrategies] = useState(false);
  const [secRecent, setSecRecent] = useState(false);
  const [secCalendar, setSecCalendar] = useState(false);
  const [secPDF, setSecPDF] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/family/zone-logs?family_member_id=${id}&limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoading(false);
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const downloadPDF = async (monthStr: string) => {
    setDownloadingMonth(monthStr);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const lang = await AsyncStorage.getItem('app_language') || language || 'en';
      const [year, month] = monthStr.split('-');
      const url = `${BACKEND_URL}/api/reports/pdf/family/${id}/month/${year}/${parseInt(month)}?token=${token}&lang=${lang}`;
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
      else Alert.alert('Error', 'No check-ins found for this month');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not download PDF');
    }
    setDownloadingMonth(null);
  };

  // Aggregate data
  const zoneCounts = { blue:0, green:0, yellow:0, red:0 } as Record<string,number>;
  const strategyCounts: Record<string,number> = {};
  const monthsSet = new Set<string>();

  logs.forEach(log => {
    const z = log.zone || log.feeling_colour || '';
    if (z in zoneCounts) zoneCounts[z]++;
    (log.helpers_selected || log.strategies_selected || []).forEach((s: string) => {
      if (s) strategyCounts[s] = (strategyCounts[s]||0)+1;
    });
    try {
      const d = new Date(log.timestamp);
      monthsSet.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
    } catch {}
  });

  const total = logs.length;
  const topStrategies = Object.entries(strategyCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const months = Array.from(monthsSet).sort().reverse();

  const SectionHeader = ({ label, open, onPress }: any) => (
    <TouchableOpacity onPress={onPress} style={st.sectionHeader}>
      <Text style={st.sectionTitle}>{label}</Text>
      <MaterialIcons name={open?'expand-less':'expand-more'} size={20} color="#666" />
    </TouchableOpacity>
  );

  if (loading) return (
    <SafeAreaView style={st.container}>
      <ActivityIndicator size="large" color="#4CAF50" style={{ marginTop: 40 }} />
    </SafeAreaView>
  );

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <MaterialIcons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerName}>{decodeURIComponent(name || '')}</Text>
          <Text style={st.headerSub}>🏠 Home Check-ins · {total} total</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

        {total === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 40 }}>🏠</Text>
            <Text style={st.emptyText}>No home check-ins yet</Text>
            <Text style={st.emptyHint}>Check-in from the family dashboard to start tracking</Text>
          </View>
        ) : (
          <>
            {/* Emotion Distribution */}
            <View style={st.card}>
              <SectionHeader label={t('emotion_distribution') || 'Emotion Distribution'} open={secDist} onPress={() => setSecDist(v => !v)} />
              {secDist && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {(['green','yellow','blue','red'] as const).map(z => {
                    const pct = total > 0 ? Math.round((zoneCounts[z]/total)*100) : 0;
                    return (
                      <View key={z} style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                        <Text style={{ width: 20 }}>{ZONE_EMOJI[z]}</Text>
                        <View style={{ flex: 1, height: 10, backgroundColor: '#F0F0F0', borderRadius: 5, overflow:'hidden' }}>
                          <View style={{ width:`${pct}%` as any, height: 10, backgroundColor: ZONE_COLORS[z], borderRadius: 5 }} />
                        </View>
                        <Text style={{ fontSize: 11, color:'#666', width: 36 }}>{pct}% ({zoneCounts[z]})</Text>
                      </View>
                    );
                  })}
                  <Text style={{ fontSize: 11, color:'#888', marginTop: 4 }}>🏠 Home only · School not linked</Text>
                </View>
              )}
            </View>

            {/* Most Used Strategies */}
            <View style={st.card}>
              <SectionHeader label={t('most_used_strategies') || 'Most Used Strategies'} open={secStrategies} onPress={() => setSecStrategies(v => !v)} />
              {secStrategies && (
                <View style={{ gap: 6, marginTop: 8 }}>
                  {topStrategies.length === 0
                    ? <Text style={st.emptyText}>No strategies recorded yet</Text>
                    : topStrategies.map(([strat, count]) => (
                      <View key={strat} style={{ flexDirection:'row', alignItems:'center', gap: 8 }}>
                        <MaterialIcons name="lightbulb" size={16} color="#FF9800" />
                        <Text style={{ flex: 1, fontSize: 13, color:'#333' }}>{strat.replace(/_/g,' ')}</Text>
                        <Text style={{ fontSize: 12, color:'#888' }}>{count}×</Text>
                      </View>
                    ))
                  }
                </View>
              )}
            </View>

            {/* Recent Check-ins */}
            <View style={st.card}>
              <SectionHeader label={t('recent_checkins') || 'Recent Check-ins'} open={secRecent} onPress={() => setSecRecent(v => !v)} />
              {secRecent && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  {logs.slice(0,10).map((log, i) => (
                    <View key={i} style={{ flexDirection:'row', alignItems:'center', gap: 10 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: ZONE_COLORS[log.zone||log.feeling_colour]||'#CCC', alignItems:'center', justifyContent:'center' }}>
                        <Text style={{ fontSize: 16 }}>{ZONE_EMOJI[log.zone||log.feeling_colour] || '😶'}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 12, fontWeight:'600', color:'#333' }}>
                          {new Date(log.timestamp).toLocaleDateString(undefined, { weekday:'short', month:'short', day:'numeric' })}
                        </Text>
                        <Text style={{ fontSize: 11, color:'#888' }}>
                          {new Date(log.timestamp).toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })}
                          {(log.helpers_selected||log.strategies_selected||[]).length > 0 &&
                            ` · ${(log.helpers_selected||log.strategies_selected).slice(0,2).join(', ')}`}
                        </Text>
                      </View>
                      <View style={{ backgroundColor:'#E8F5E9', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 10, color:'#4CAF50' }}>🏠</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* PDF Download */}
            <View style={st.card}>
              <SectionHeader label={t('download_monthly_reports') || 'Download Monthly Reports'} open={secPDF} onPress={() => setSecPDF(v => !v)} />
              {secPDF && (
                <View style={{ gap: 8, marginTop: 8 }}>
                  <Text style={{ fontSize: 12, color:'#888', marginBottom: 4 }}>
                    {t('select_month_pdf') || 'Select a month to download a PDF report'}
                  </Text>
                  {months.length === 0
                    ? <Text style={st.emptyText}>No check-ins yet</Text>
                    : months.map(m => {
                        const label = new Date(m + '-15').toLocaleDateString(undefined, { month:'long', year:'numeric' });
                        return (
                          <TouchableOpacity key={m}
                            style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#FFF3F3', borderRadius:10, padding:12, gap:10, borderWidth:1, borderColor:'#FFCDD2' }}
                            onPress={() => downloadPDF(m)}
                            disabled={downloadingMonth === m}>
                            <MaterialIcons name="picture-as-pdf" size={20} color="#E53935" />
                            <Text style={{ flex:1, fontSize:13, fontWeight:'600', color:'#333' }}>{label}</Text>
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
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection:'row', alignItems:'center', padding:16, backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  headerName: { fontSize:18, fontWeight:'700', color:'#333' },
  headerSub: { fontSize:12, color:'#888', marginTop:2 },
  card: { backgroundColor:'white', borderRadius:14, padding:14, marginBottom:12, elevation:1, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:3, shadowOffset:{width:0,height:1} },
  sectionHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  sectionTitle: { fontSize:14, fontWeight:'700', color:'#333' },
  emptyBox: { alignItems:'center', padding:40, gap:12 },
  emptyText: { fontSize:14, color:'#999', textAlign:'center' },
  emptyHint: { fontSize:12, color:'#BBB', textAlign:'center' },
});
