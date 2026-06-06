import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
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
  p_b1:'Side-by-Side Presence',p_b2:'Warm Drink Ritual',p_b3:'Name It to Tame It',p_b4:'Movement Invitation',p_b5:'Comfort & Closeness',
  p_g1:'Gratitude Round',p_g2:'Strength Spotting',p_g3:'Creative Together',p_g4:'Family Dance',p_g5:'Calm Problem Solving',
  p_y1:'Box Breathing Together',p_y2:'Validate Feelings First',p_y3:'Body Check-In',p_y4:'Feelings Journal',p_y5:'Give Space with Love',
  p_r1:'Stay Calm Yourself',p_r2:'Safe Space Together',p_r3:'Cold Water Reset',p_r4:'No Teaching Now',p_r5:'Reconnect with Warmth',
};
const resolveStratName = (id: string) => {
  if (!id) return id;
  if (STRATEGY_NAMES[id]) return STRATEGY_NAMES[id];
  const clean = id.replace(/^(helper_|strategy_)/,'');
  if (STRATEGY_NAMES[clean]) return STRATEGY_NAMES[clean];
  return id.replace(/_/g,' ').replace(/\w/g,(c:string)=>c.toUpperCase());
};
const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_EMOJI: Record<string, string> = {
  blue: '🔵', green: '🟢', yellow: '🟡', red: '🔴',
};
const TYPE_LABELS: Record<string, string> = {
  help_request: 'Help Request',
  zone_alert: 'Check-in Alert',
  parent_message: 'Message from Child',
};

export default function ParentAlertsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t } = useApp();

  const [alerts,        setAlerts]        = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [token,         setToken]         = useState('');
  const [selectedChild, setSelectedChild] = useState<string | null>(null);
  const [selectedType,  setSelectedType]  = useState<string | null>(null);
  const [selectMode,    setSelectMode]    = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [showResolved,  setShowResolved]  = useState(false);
  const [period, setPeriod] = useState<'today'|'7'|'14'|'30'>('30');

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    const data = await getAlerts(tok);
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleResolve = async (alert_id: string) => {
    Alert.alert('Mark as Resolved', 'Has this been addressed?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolved', onPress: async () => {
        await resolveAlert(alert_id, token);
        setAlerts(prev => prev.map(a => a.id === alert_id ? { ...a, resolved: true } : a));
        // Re-fetch alerts so badge count updates on return to dashboard
        await load();
      }},
    ]);
  };

  const handleBulkResolve = () => {
    if (selectedIds.size === 0) return;
    Alert.alert(
      `Resolve ${selectedIds.size} alert${selectedIds.size > 1 ? 's' : ''}?`,
      'Mark all selected as addressed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Resolve All', onPress: async () => {
          await Promise.all([...selectedIds].map(id => resolveAlert(id, token).catch(() => {})));
          setAlerts(prev => prev.map(a => selectedIds.has(a.id) ? { ...a, resolved: true } : a));
          setSelectedIds(new Set());
          setSelectMode(false);
          // Re-fetch so badge count updates on return to dashboard
          await load();
        }},
      ]
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const filterByPeriod = (a: any) => {
    const diff = (Date.now() - new Date(a.created_at).getTime()) / 86400000;
    if (period === 'today') { const t2 = new Date(); t2.setHours(0,0,0,0); return new Date(a.created_at) >= t2; }
    if (period === '7') return diff <= 7;
    if (period === '14') return diff <= 14;
    return diff <= 30;
  };

  const childNames = [...new Set(alerts.map((a: any) => a.student_name).filter(Boolean))] as string[];

  const unresolved = alerts.filter((a: any) => {
    if (a.resolved) return false;
    if (!filterByPeriod(a)) return false;
    if (selectedChild && a.student_name !== selectedChild) return false;
    if (selectedType  && a.alert_type  !== selectedType)  return false;
    return true;
  });
  const resolved = alerts.filter((a: any) => {
    if (!a.resolved) return false;
    if (!filterByPeriod(a)) return false;
    if (selectedChild && a.student_name !== selectedChild) return false;
    return true;
  });

  return (
    <SafeAreaView style={st.container}>
      <TranslatedHeader title={t('alerts') || t('alerts') || 'Alerts'} />

      {/* Period tabs — matching teacher flow */}
      <View style={{ flexDirection:'row', backgroundColor:'white', paddingHorizontal:12, paddingVertical:4, gap:6, borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
        {(['today','7','14','30'] as const).map(p => (
          <TouchableOpacity key={p} onPress={() => setPeriod(p)}
            style={{ flex:1, paddingVertical:5, borderRadius:6, alignItems:'center', backgroundColor: period===p?'#4CAF50':'#F5F5F5' }}>
            <Text style={{ fontSize:11, fontWeight:'600', color: period===p?'white':'#888' }}>
              {p==='today'?'Today':p==='7'?'Week':p==='14'?'Fortnight':'Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={st.filterBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingVertical: 8 }}>
          <TouchableOpacity
            style={[st.pill, !selectedChild && !selectedType && st.pillActive]}
            onPress={() => { setSelectedChild(null); setSelectedType(null); }}>
            <Text style={[st.pillText, !selectedChild && !selectedType && st.pillTextActive]}>All</Text>
          </TouchableOpacity>
          {childNames.map((name: string) => (
            <TouchableOpacity key={name}
              style={[st.pill, selectedChild === name && st.pillActive]}
              onPress={() => setSelectedChild(selectedChild === name ? null : name)}>
              <Text style={[st.pillText, selectedChild === name && st.pillTextActive]}>{name}</Text>
            </TouchableOpacity>
          ))}
          <View style={st.pillDivider} />
          {Object.entries(TYPE_LABELS).map(([key, label]) => (
            <TouchableOpacity key={key}
              style={[st.pill, selectedType === key && st.pillTypeActive]}
              onPress={() => setSelectedType(selectedType === key ? null : key)}>
              <Text style={[st.pillText, selectedType === key && st.pillTextActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {unresolved.length > 0 && (
        <View style={st.bulkBar}>
          <TouchableOpacity style={st.bulkToggle}
            onPress={() => { setSelectMode(e => !e); setSelectedIds(new Set()); }}>
            <MaterialIcons name={selectMode ? 'close' : 'checklist'} size={16} color="#5C6BC0" />
            <Text style={st.bulkToggleTxt}>{selectMode ? 'Cancel' : 'Select'}</Text>
          </TouchableOpacity>
          {selectMode && <>
            <TouchableOpacity style={st.selectAllBtn}
              onPress={() => setSelectedIds(new Set(unresolved.map((a: any) => a.id)))}>
              <Text style={st.selectAllTxt}>All ({unresolved.length})</Text>
            </TouchableOpacity>
            {selectedIds.size > 0 && (
              <TouchableOpacity style={st.bulkResolveBtn} onPress={handleBulkResolve}>
                <MaterialIcons name="check-circle" size={14} color="#fff" />
                <Text style={st.bulkResolveTxt}>Resolve {selectedIds.size}</Text>
              </TouchableOpacity>
            )}
          </>}
          <Text style={{ marginLeft: 'auto' as any, fontSize: 11, color: '#999' }}>
            {unresolved.length} pending
          </Text>
        </View>
      )}

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? <Text style={st.empty}>Loading...</Text>
          : unresolved.length === 0 ? (
            <View style={st.emptyBox}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={st.empty}>{t('no_alerts') || t('no_alerts') || 'No pending alerts'}</Text>
            </View>
          ) : null}

        {unresolved.map((alert: any) => {
          const isSelected = selectedIds.has(alert.id);
          return (
            <TouchableOpacity key={alert.id} activeOpacity={selectMode ? 0.7 : 1}
              onPress={() => selectMode && toggleSelect(alert.id)}
              style={[st.card, { borderLeftColor: ZONE_COLORS[alert.zone] || '#5C6BC0' },
                isSelected && st.cardSelected]}>
              <View style={st.cardTop}>
                {selectMode && (
                  <MaterialIcons
                    name={isSelected ? 'check-box' : 'check-box-outline-blank'}
                    size={20} color={isSelected ? '#4CAF50' : '#CCC'}
                    style={{ marginRight: 8, flexShrink: 0 }} />
                )}
                <Text style={st.zone} numberOfLines={1}>
                  {ZONE_EMOJI[alert.zone] || '📙'} {alert.student_name || 'Child'}
                </Text>
                <Text style={st.type}>{TYPE_LABELS[alert.alert_type] || alert.alert_type}</Text>
              </View>
              {alert.strategy_name && (
                <Text style={st.strategy}>🎯 {resolveStratName(alert.strategy_name)}</Text>
              )}
              {alert.message && (
                <View style={{backgroundColor:'#EEF2FF', borderRadius:8, padding:10, marginVertical:4, borderLeftWidth:3, borderLeftColor:'#5C6BC0'}}>
                  <Text style={{fontSize:11, color:'#5C6BC0', fontWeight:'700', marginBottom:2}}>💬 Message</Text>
                  <Text style={{fontSize:14, color:'#333', fontWeight:'500'}}>{alert.message}</Text>
                </View>
              )}
              <View style={st.cardBottom}>
                <Text style={st.time}>{new Date(alert.created_at).toLocaleString()}</Text>
                {!selectMode && (
                  <TouchableOpacity style={st.resolveBtn} onPress={() => handleResolve(alert.id)}>
                    <MaterialIcons name="check" size={13} color="#4CAF50" />
                    <Text style={st.resolveTxt}>{t('resolved') || 'Resolve'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          );
        })}

        {resolved.length > 0 && (
          <>
            <TouchableOpacity style={st.resolvedHeader} onPress={() => setShowResolved(e => !e)}>
              <Text style={st.sectionLabel}>Resolved ({resolved.length})</Text>
              <MaterialIcons name={showResolved ? 'expand-less' : 'expand-more'} size={20} color="#999" />
            </TouchableOpacity>
            {showResolved && resolved.slice(0, 10).map((alert: any) => (
              <View key={alert.id} style={[st.card, st.cardResolved]}>
                <View style={st.cardTop}>
                  <Text style={[st.zone, { color: '#999' }]}>{ZONE_EMOJI[alert.zone] || '📙'} {alert.student_name}</Text>
                  <Text style={st.type}>{TYPE_LABELS[alert.alert_type] || alert.alert_type}</Text>
                </View>
                {alert.message && <Text style={[st.message, { color: '#AAA' }]}>"{alert.message}"</Text>}
                <Text style={st.time}>{new Date(alert.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F8F9FA' },
  filterBar:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  pill:           { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' },
  pillActive:     { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  pillTypeActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  pillText:       { fontSize: 12, fontWeight: '600', color: '#666' },
  pillTextActive: { color: '#fff' },
  pillDivider:    { width: 1, backgroundColor: '#E0E0E0', marginVertical: 4 },
  bulkBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  bulkToggle:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EDE7F6' },
  bulkToggleTxt:  { fontSize: 12, fontWeight: '600', color: '#5C6BC0' },
  selectAllBtn:   { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F5F5F5' },
  selectAllTxt:   { fontSize: 12, color: '#333', fontWeight: '500' },
  bulkResolveBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, backgroundColor: '#4CAF50' },
  bulkResolveTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  card:           { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardSelected:   { backgroundColor: '#F1F8E9', borderLeftColor: '#4CAF50' },
  cardResolved:   { opacity: 0.5, borderLeftColor: '#CCC' },
  cardTop:        { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  zone:           { flex: 1, fontSize: 15, fontWeight: '700', color: '#333', marginRight: 8 },
  type:           { fontSize: 11, color: '#5C6BC0', fontWeight: '600', backgroundColor: '#E8EAF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, flexShrink: 0 },
  strategy:       { fontSize: 13, color: '#555', marginBottom: 4 },
  message:        { fontSize: 13, color: '#333', fontStyle: 'italic', marginBottom: 6 },
  cardBottom:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  time:           { fontSize: 11, color: '#999' },
  resolveBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  resolveTxt:     { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  resolvedHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, marginTop: 8 },
  sectionLabel:   { fontSize: 12, color: '#999', fontWeight: '600', textTransform: 'uppercase' },
  emptyBox:       { alignItems: 'center', paddingTop: 60, gap: 12 },
  empty:          { fontSize: 15, color: '#999', textAlign: 'center', marginTop: 8 },
});
