import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
// Item 6 (Sep 25): AlertCard (plus its zone colour/label and strategy-name fallback dicts)
// moved to a shared component so parent/alerts.tsx can reuse the exact same implementation
// instead of a second copy-pasted one - no behaviour change here, same code, new location.
import { AlertCard } from '../../src/components/AlertCard';

export default function TeacherAlertsScreen() {
  const { t, classrooms, students } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');
  const [period, setPeriod] = useState<'today'|'7'|'14'|'30'>('30');
  const [classroom, setClassroom] = useState('all');
  const [alertType, setAlertType] = useState<string|null>(null);
  const [expanded, setExpanded] = useState<Record<string,boolean>>({});
  // Real fix Sep 15 (Marisa build-26, S12): NEW vs PAST is now the primary top-level split
  // (her sketch: "NEW | PAST" tabs with a vertical divider), replacing the old design where
  // unresolved alerts were the only thing shown and resolved ones hid behind a small,
  // easy-to-miss "Resolved" toggle at the very bottom of the list.
  const [tab, setTab] = useState<'new'|'past'>('new');
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

  const classroomNames = Array.from(new Set([
    ...(classrooms||[]).map((c:any) => c.name),
    ...alerts.map((a:any) => a.classroom_name).filter(Boolean),
  ])) as string[];

  const matchesClassroomAndType = (a: any) => {
    if (!inPeriod(a)) return false;
    if (alertType && a.alert_type !== alertType) return false;
    if (classroom !== 'all') {
      const byName = a.classroom_name === classroom;
      const cl = (classrooms||[]).find((c:any) => c.name === classroom);
      const byStudent = cl ? (students||[]).some((s:any) => s.id === a.student_id && s.classroom_id === cl.id) : false;
      if (!byName && !byStudent) return false;
    }
    return true;
  };

  // Real fix Sep 15 (Marisa build-26, S12): tab replaces the old hardcoded `!a.resolved`
  // filter - the same period/classroom/type filters above the tabs apply to whichever one
  // is selected (matches her sketch: time filter sits under the tabs, not per-tab).
  const newCount = alerts.filter((a:any) => !a.resolved && matchesClassroomAndType(a)).length;
  const filtered = alerts.filter((a:any) => (tab === 'new' ? !a.resolved : a.resolved) && matchesClassroomAndType(a));

  // Real fix Sep 15 (Marisa build-26, S12): "new alerts always visible on top, never buried
  // by a frequent requester" - alerts were grouped by student in whatever order the API
  // happened to return them, so a fresh alert from a rarely-alerting student could render
  // BELOW a large, older group from a frequent one. Sorting by most-recent activity first
  // (before grouping) means Object.entries below naturally lists each student's group in
  // the order their most recent alert arrived, not insertion order.
  const sortedFiltered = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const grouped: Record<string,any[]> = {};
  sortedFiltered.forEach((a:any) => {
    const k = a.student_name || (t('unknown') || 'Unknown');
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(a);
  });
  const toggleExpand = (name: string) => setExpanded(p => ({...p, [name]: !p[name]}));

  // Charts/graphs deliberately NOT built here (Jono's call, Marisa build-26 review, S12) -
  // logged for the Phase 3 analytics work instead. This section stays simple/list-based.

  return (
    // Real fix Sep 15 (Marisa build-26, S12): this screen's SafeAreaView (from
    // react-native-safe-area-context, default edges) was stacking its own top inset with
    // TranslatedHeader's own manual insets.top calculation below - the same double-count bug
    // found and fixed on teacher/dashboard.tsx (S10), producing the "top border too large"
    // complaint here too. TranslatedHeader is the single source of truth for top inset.
    <SafeAreaView style={{ flex:1, backgroundColor:'#F8F9FA' }} edges={['left','right','bottom']}>
      <TranslatedHeader title={t('alerts') || 'Student Alerts'} />

      {/* Real restructure Sep 15 (Marisa build-26, S12, her sketch): NEW | PAST as the primary
          two-tab split (vertical divider between them) replaces the old flat list where
          resolved alerts hid behind a small "Resolved" toggle at the bottom. Class icons and
          the time filter moved below the tabs, collapsing what used to be three separate pill
          rows plus a "34 pending" + Select row into this one hierarchy. */}
      <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#E0E0E0' }}>
        <View style={{ flexDirection:'row' }}>
          <TouchableOpacity onPress={() => setTab('new')} style={{ flex:1, alignItems:'center', paddingVertical:14,
            borderBottomWidth:3, borderBottomColor: tab==='new' ? '#5C6BC0' : 'transparent' }}>
            <Text style={{ fontSize:14, fontWeight:'800', color: tab==='new' ? '#5C6BC0' : '#999' }}>
              {t('new') || 'NEW'}{newCount > 0 ? ` (${newCount})` : ''}
            </Text>
          </TouchableOpacity>
          <View style={{ width:1, backgroundColor:'#E0E0E0' }} />
          <TouchableOpacity onPress={() => setTab('past')} style={{ flex:1, alignItems:'center', paddingVertical:14,
            borderBottomWidth:3, borderBottomColor: tab==='past' ? '#5C6BC0' : 'transparent' }}>
            <Text style={{ fontSize:14, fontWeight:'800', color: tab==='past' ? '#5C6BC0' : '#999' }}>
              {t('past') || 'PAST'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Classes as icons - tap one to filter either tab to just that class. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal:12, paddingTop:10, paddingBottom:2, gap:14 }}>
          <TouchableOpacity onPress={() => setClassroom('all')} style={{ alignItems:'center', width:52 }}>
            <View style={{ width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center',
              backgroundColor: classroom==='all' ? '#5C6BC0' : '#EEEEEE' }}>
              <MaterialIcons name="apps" size={20} color={classroom==='all' ? 'white' : '#888'} />
            </View>
            <Text numberOfLines={1} style={{ fontSize:10, fontWeight:'700', marginTop:4,
              color: classroom==='all' ? '#5C6BC0' : '#888' }}>{t('all_classes') || 'All'}</Text>
          </TouchableOpacity>
          {classroomNames.map(n => (
            <TouchableOpacity key={n} onPress={() => setClassroom(n)} style={{ alignItems:'center', width:52 }}>
              <View style={{ width:42, height:42, borderRadius:21, alignItems:'center', justifyContent:'center',
                backgroundColor: classroom===n ? '#5C6BC0' : '#EEEEEE' }}>
                <Text style={{ fontSize:16, fontWeight:'800', color: classroom===n ? 'white' : '#888' }}>
                  {n.charAt(0).toUpperCase()}
                </Text>
              </View>
              <Text numberOfLines={1} style={{ fontSize:10, fontWeight:'700', marginTop:4,
                color: classroom===n ? '#5C6BC0' : '#888' }}>{n}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Time filter - third tier, per Marisa's sketch order (tabs, then class, then time). */}
        <View style={{ flexDirection:'row', paddingHorizontal:10, paddingTop:8, paddingBottom:8, gap:8 }}>
          {(['today','7','14','30'] as const).map(p => (
            <TouchableOpacity key={p} onPress={() => setPeriod(p)} style={{ flex:1, paddingVertical:6,
              borderRadius:8, alignItems:'center', backgroundColor: period===p ? '#5C6BC0' : '#F0F0F0' }}>
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C6BC0" colors={['#5C6BC0']} />}>
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
