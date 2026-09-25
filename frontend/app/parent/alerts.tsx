import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
// Item 6 (Sep 25): rebuilt to mirror teacher/alerts.tsx's layout exactly (NEW/PAST tabs ->
// per-child tabs -> duration pills), reusing its real AlertCard component rather than a
// second copy - see src/components/AlertCard.tsx. The old layout (flat list + a collapsed
// "Resolved" section at the bottom, filtered only by a bare useEffect that never re-ran on
// refocus) is gone; this now shares the exact same tab/period filtering pipeline teacher
// Alerts already uses, so whatever the previous "time pills don't filter" symptom traced to,
// it can't reoccur here - it's the same, already-correct code path, not a patched copy.
import { AlertCard } from '../../src/components/AlertCard';

export default function ParentAlertsScreen() {
  const { t } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState<'today'|'7'|'14'|'30'>('30');
  const [childFilter, setChildFilter] = useState('all');
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});
  const [tab, setTab] = useState<'new'|'past'>('new');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    const data = await getAlerts(tok);
    // Real fix Sep 11 (item 2, parent-leak audit): defense in depth - the backend already
    // excludes alert_type "support_request" from every parent-reachable read, but this
    // screen used to render alert.message completely unconditionally with no frontend-level
    // backstop of its own. Support requests are never parent-facing by design (informing
    // parents is a human safeguarding-communication decision, never an app push) - this
    // filter stays even if the backend exclusion is ever accidentally weakened.
    const safe = (Array.isArray(data) ? data : []).filter((a: any) => a.alert_type !== 'support_request');
    setAlerts(safe);
    setLoading(false);
  }, []);

  // Item 6 fix (Sep 25): was a plain useEffect(load, [load]) that only ever ran once on
  // mount - navigating away and back to this tab never re-fetched, so a newly-arrived alert
  // (or one resolved from another device) could sit stale indefinitely. useFocusEffect
  // matches teacher/alerts.tsx's own re-fetch-on-focus behaviour.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const handleResolve = (id: string) => {
    Alert.alert(t('mark_resolved_title') || 'Mark Resolved?', t('has_been_addressed') || 'Has this been addressed?', [
      { text: t('cancel') || 'Cancel', style: 'cancel' },
      { text: t('resolve') || 'Resolve', onPress: async () => {
        await resolveAlert(id, token);
        setAlerts(prev => prev.map(a => a.id === id ? {...a, resolved:true} : a));
      }},
    ]);
  };

  const handleBulkResolve = () => {
    if (selected.size === 0) return;
    Alert.alert(`${t('resolve') || 'Resolve'} ${selected.size} ${t('alerts_lowercase') || 'alerts'}?`, t('mark_all_addressed') || 'Mark all as addressed.', [
      { text: t('cancel') || 'Cancel', style: 'cancel' },
      { text: t('resolve_all') || 'Resolve All', onPress: async () => {
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

  const childNames = Array.from(new Set(alerts.map((a:any) => a.student_name).filter(Boolean))) as string[];

  const matchesChildAndPeriod = (a: any) => {
    if (!inPeriod(a)) return false;
    if (childFilter !== 'all' && a.student_name !== childFilter) return false;
    return true;
  };

  // Same NEW/PAST split as teacher/alerts.tsx (Marisa build-26, S12): the period/child
  // filters above the tabs apply to whichever one is selected.
  const newCount = alerts.filter((a:any) => !a.resolved && matchesChildAndPeriod(a)).length;
  const filtered = alerts.filter((a:any) => (tab === 'new' ? !a.resolved : a.resolved) && matchesChildAndPeriod(a));

  const sortedFiltered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const grouped: Record<string,any[]> = {};
  sortedFiltered.forEach((a:any) => {
    const k = a.student_name || (t('child') || 'Child');
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(a);
  });
  const toggleExpand = (name: string) => setExpanded(p => ({...p, [name]: !p[name]}));

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:'#F8F9FA' }} edges={['left','right','bottom']}>
      <TranslatedHeader title={t('alerts') || 'Family Alerts'} />

      <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#E0E0E0' }}>
        <View style={{ flexDirection:'row' }}>
          <TouchableOpacity onPress={() => setTab('new')} style={{ flex:1, alignItems:'center', paddingVertical:14,
            borderBottomWidth:3, borderBottomColor: tab==='new' ? '#4CAF50' : 'transparent' }}>
            <Text style={{ fontSize:14, fontWeight:'800', color: tab==='new' ? '#4CAF50' : '#999' }}>
              {t('new') || 'NEW'}{newCount > 0 ? ` (${newCount})` : ''}
            </Text>
          </TouchableOpacity>
          <View style={{ width:1, backgroundColor:'#E0E0E0' }} />
          <TouchableOpacity onPress={() => setTab('past')} style={{ flex:1, alignItems:'center', paddingVertical:14,
            borderBottomWidth:3, borderBottomColor: tab==='past' ? '#4CAF50' : 'transparent' }}>
            <Text style={{ fontSize:14, fontWeight:'800', color: tab==='past' ? '#4CAF50' : '#999' }}>
              {t('past') || 'PAST'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Children as icons - tap one to filter either tab to just that child. Same pattern
            as teacher/alerts.tsx's classroom-icon row, only shown when there's more than one
            child to disambiguate (matches the old layout's own >1 gate). */}
        {childNames.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal:12, paddingTop:10, paddingBottom:2, gap:14 }}>
            <TouchableOpacity onPress={() => setChildFilter('all')} style={{ alignItems:'center', width:52 }}>
              <View style={{ width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center',
                backgroundColor: childFilter==='all' ? '#4CAF50' : '#EEEEEE' }}>
                <MaterialIcons name="apps" size={20} color={childFilter==='all' ? 'white' : '#888'} />
              </View>
              <Text numberOfLines={1} style={{ fontSize:10, fontWeight:'700', marginTop:4,
                color: childFilter==='all' ? '#4CAF50' : '#888' }}>{t('all') || 'All'}</Text>
            </TouchableOpacity>
            {childNames.map(n => (
              <TouchableOpacity key={n} onPress={() => setChildFilter(n)} style={{ alignItems:'center', width:52 }}>
                <View style={{ width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center',
                  backgroundColor: childFilter===n ? '#4CAF50' : '#EEEEEE' }}>
                  <Text style={{ fontSize:16, fontWeight:'800', color: childFilter===n ? 'white' : '#888' }}>
                    {n.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text numberOfLines={1} style={{ fontSize:10, fontWeight:'700', marginTop:4,
                  color: childFilter===n ? '#4CAF50' : '#888' }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Time filter - third tier, same order as teacher Alerts (tabs, then child, then time). */}
        <View style={{ flexDirection:'row', paddingHorizontal:10, paddingTop:8, paddingBottom:8, gap:8 }}>
          {(['today','7','14','30'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={{ flex:1, paddingVertical:6,
              borderRadius:8, alignItems:'center', backgroundColor: period===p ? '#4CAF50' : '#F0F0F0' }}>
              <Text style={{ fontSize:11, fontWeight:'700', color: period===p ? 'white' : '#888' }}>
                {p==='today'?(t('today')||'Today'):p==='7'?(t('week')||'Week'):p==='14'?(t('fortnight')||'Fortnight'):(t('month')||'Month')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'new' && (
          <View style={{ flexDirection:'row', justifyContent:'flex-end', alignItems:'center', paddingHorizontal:14, paddingBottom:8, gap:8 }}>
            {selectMode && selected.size > 0 && (
              <TouchableOpacity onPress={handleBulkResolve}
                style={{ backgroundColor:'#4CAF50', paddingHorizontal:12, paddingVertical:5, borderRadius:8, flexDirection:'row', alignItems:'center', gap:4 }}>
                <MaterialIcons name="check" size={14} color="white" />
                <Text style={{ fontSize:12, color:'white', fontWeight:'700' }}>{t('resolve') || 'Resolve'} {selected.size}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
              style={{ backgroundColor: selectMode ? '#F44336' : '#EEE', paddingHorizontal:12, paddingVertical:5, borderRadius:8 }}>
              <Text style={{ fontSize:12, color: selectMode ? 'white' : '#666', fontWeight:'700' }}>{selectMode ? (t('cancel') || 'Cancel') : (t('select') || 'Select')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      <ScrollView contentContainerStyle={{ padding:14 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4CAF50" colors={['#4CAF50']} />}>
        {loading && <View style={{ alignItems:'center', marginTop:30 }}><EmotionColourLoader visible size={48} /></View>}
        {!loading && filtered.length === 0 && (
          <View style={{ alignItems:'center', marginTop:50 }}>
            <Text style={{ fontSize:40 }}>{tab === 'new' ? '✅' : '📭'}</Text>
            <Text style={{ color:'#999', fontSize:14, marginTop:8 }}>
              {tab === 'new' ? (t('no_alerts') || 'No pending alerts') : (t('no_past_alerts') || 'No past alerts in this range')}
            </Text>
          </View>
        )}
        {Object.entries(grouped).map(([name, items]) => (
          <View key={name} style={{ backgroundColor:'white', borderRadius:14, marginBottom:10,
            shadowColor:'#000', shadowOpacity:0.07, shadowRadius:6, elevation:3, overflow:'hidden' }}>
            <TouchableOpacity onPress={() => toggleExpand(name)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center',
                paddingHorizontal:14, paddingVertical:12, backgroundColor:'#F8F9FA' }}>
              <Text style={{ fontSize:15, fontWeight:'700', color:'#333' }}>{name}</Text>
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
                selectMode={tab === 'new' && selectMode}
                onLongPress={() => { if (tab === 'new') { setSelectMode(true); toggleSelect(alert.id); } }}
                onPress={() => tab === 'new' && selectMode && toggleSelect(alert.id)}
              />
            ))}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
