import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform, Share, Linking, Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useNavigation } from '@react-navigation/native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_EMOJI: Record<string, string> = {
  blue: '😔', green: '😊', yellow: '😟', red: '😣',
};

type Entry = {
  id: string;
  zone: string;
  timestamp: string;
  comment?: string;
  journal?: string;
};

type RangeKey = '7' | '14' | '30';

export default function MyWellbeingScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t } = useApp();
  const { memberId, memberName, skipPin } = useLocalSearchParams<{ memberId: string; memberName: string; skipPin?: string }>();
  const isSkipPin = skipPin === 'true';

  const PIN_KEY = `wellbeing_pin_${memberId}`;
  const HINT_KEY = `wellbeing_hint_${memberId}`;
  const JOURNAL_KEY = `wellbeing_journal_${memberId}`;

  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinExists, setPinExists] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinHint, setPinHint] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'setup' | 'confirm'>('enter');
  const [showHint, setShowHint] = useState(false);
  const [storedHint, setStoredHint] = useState('');

  const [entries, setEntries] = useState<Entry[]>([]);
  const [range, setRange] = useState<RangeKey>('7');
  const [journals, setJournals] = useState<Record<string, string>>({});
  const [editingJournal, setEditingJournal] = useState<string | null>(null);
  const [journalText, setJournalText] = useState('');
  const [loading, setLoading] = useState(false);
  const [secDaily,      setSecDaily]      = useState(false);
  const [secDistrib,    setSecDistrib]    = useState(false);
  const [secCompare,    setSecCompare]    = useState(false);
  const [secStrategies, setSecStrategies] = useState(false);
  const [secTimeline,   setSecTimeline]   = useState(false);
  const [secCalendar,   setSecCalendar]   = useState(false);
  const [secPdf,        setSecPdf]        = useState(false);
  const [downloading,   setDownloading]   = useState(false);
  const { width } = Dimensions.get('window');

  useEffect(() => {
    if (isSkipPin) {
      setPinUnlocked(true);
      loadData();
      return;
    }
    AsyncStorage.getItem(PIN_KEY).then(pin => {
      if (pin) { setPinExists(true); setPinStep('enter'); }
      else { setPinExists(false); setPinStep('setup'); }
    });
    AsyncStorage.getItem(HINT_KEY).then(h => h && setStoredHint(h));
  }, []);

  const handlePinDigit = (d: string) => {
    if (pinStep === 'setup') {
      const next = pinInput + d;
      if (next.length <= 4) {
        setPinInput(next);
        if (next.length === 4) setPinStep('confirm');
      }
    } else if (pinStep === 'confirm') {
      const next = pinConfirm + d;
      if (next.length <= 4) {
        setPinConfirm(next);
        if (next.length === 4) {
          if (next === pinInput) {
            AsyncStorage.setItem(PIN_KEY, pinInput);
            if (pinHint.trim()) AsyncStorage.setItem(HINT_KEY, pinHint.trim());
            setPinUnlocked(true);
            loadData();
          } else {
            Alert.alert(t('wellbeing_pin_mismatch') || 'PINs do not match');
            setPinInput(''); setPinConfirm(''); setPinStep('setup');
          }
        }
      }
    } else {
      const next = pinInput + d;
      if (next.length <= 4) {
        setPinInput(next);
        if (next.length === 4) {
          AsyncStorage.getItem(PIN_KEY).then(stored => {
            if (next === stored) { setPinUnlocked(true); loadData(); }
            else {
            Alert.alert(
              t('wellbeing_pin_wrong') || 'Incorrect PIN',
              t('wellbeing_pin_forgot_msg') || 'Try again or reset your PIN',
              [
                { text: t('cancel') || 'Cancel', style: 'cancel', onPress: () => setPinInput('') },
                { text: t('wellbeing_pin_reset') || 'Reset PIN', style: 'destructive', onPress: async () => {
                  await AsyncStorage.removeItem(PIN_KEY);
                  await AsyncStorage.removeItem(HINT_KEY);
                  setPinExists(false); setPinStep('setup');
                  setPinInput(''); setPinConfirm('');
                }}
              ]
            );
          }
          });
        }
      }
    }
  };

  const handleDelete = () => {
    if (pinStep === 'confirm') setPinConfirm(c => c.slice(0, -1));
    else setPinInput(p => p.slice(0, -1));
  };

  const handleResetPin = () => {
    Alert.alert(
      t('wellbeing_pin_reset') || 'Reset PIN',
      storedHint ? `${t('wellbeing_pin_hint_show') || 'Your hint:'} ${storedHint}` : '',
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        { text: t('wellbeing_pin_reset') || 'Reset', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem(PIN_KEY);
          await AsyncStorage.removeItem(HINT_KEY);
          setPinExists(false); setPinInput(''); setPinConfirm(''); setPinHint('');
          setPinStep('setup'); setStoredHint('');
        }},
      ]
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const days = parseInt(range);
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - days);
      const res = await fetch(
        `${BACKEND_URL}/api/family/members/${memberId}/checkins?start=${start.toISOString()}&end=${end.toISOString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setEntries(Array.isArray(data) ? data : []);
      }
      const jRaw = await AsyncStorage.getItem(JOURNAL_KEY);
      setJournals(jRaw ? JSON.parse(jRaw) : {});
    } catch (e) {
      // silent fail
    }
    setLoading(false);
  }, [memberId, range]);

  useEffect(() => {
    if (pinUnlocked) loadData();
  }, [pinUnlocked, range]);

  const saveJournal = async (entryId: string) => {
    const updated = { ...journals, [entryId]: journalText };
    setJournals(updated);
    await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(updated));
    setEditingJournal(null);
    setJournalText('');
  };

  // Distribution counts
  const counts = { blue: 0, green: 0, yellow: 0, red: 0 };
  entries.forEach(e => { if (e.zone in counts) counts[e.zone as keyof typeof counts]++; });
  const total = entries.length;
  const maxCount = Math.max(...Object.values(counts), 1);

  // PIN Screen
  if (!pinUnlocked) {
    const current = pinStep === 'confirm' ? pinConfirm : pinInput;
    return (
      <SafeAreaView style={st.pin}>
        <TouchableOpacity style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <KeyboardAvoidingView style={st.pinBody} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <Text style={st.pinIcon}>🔒</Text>
          <Text style={st.pinName}>{memberName}</Text>
          <Text style={st.pinTitle}>{t('my_wellbeing') || 'My Wellbeing'}</Text>
          <Text style={st.pinSub}>
            {pinStep === 'setup' ? (t('wellbeing_pin_setup') || 'Create your private PIN')
            : pinStep === 'confirm' ? (t('wellbeing_pin_confirm') || 'Confirm PIN')
            : (t('wellbeing_pin_enter') || 'Enter your PIN')}
          </Text>
          {pinStep === 'setup' && (
            <Text style={st.pinDesc}>{t('wellbeing_pin_desc') || 'Only you can see this.'}</Text>
          )}

          <View style={st.dots}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[st.dot, current.length > i && st.dotFilled]} />
            ))}
          </View>

          {pinStep === 'setup' && (
            <TextInput
              style={st.hintInput}
              placeholder={t('wellbeing_pin_hint_label') || 'PIN hint (optional)'}
              placeholderTextColor="#AAA"
              value={pinHint}
              onChangeText={setPinHint}
            />
          )}

          <View style={st.numpad}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[st.key, !d && { opacity: 0 }]}
                onPress={() => d === '⌫' ? handleDelete() : d && handlePinDigit(d)}
                disabled={!d}
              >
                <Text style={st.keyTxt}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {pinStep === 'enter' && (
            <TouchableOpacity onPress={handleResetPin} style={{ marginTop: 20 }}>
              <Text style={{ color: '#5C6BC0', fontSize: 14 }}>{t('wellbeing_pin_forgot') || 'Forgot PIN?'}</Text>
            </TouchableOpacity>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  const downloadReport = async (monthStr: string) => {
    setDownloading(true);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const [yearStr, monthNum] = monthStr.split('-');
      const fullUrl = `${BACKEND_URL}/api/reports/pdf/parent/${memberId}/month/${yearStr}/${parseInt(monthNum)}?token=${token}`;
      const canOpen = await Linking.canOpenURL(fullUrl);
      if (canOpen) { await Linking.openURL(fullUrl); }
      else { Alert.alert('Error', 'Cannot open PDF'); }
    } catch (error: any) {
      Alert.alert('Download Error', error.message || 'Could not download report');
    } finally { setDownloading(false); }
  };

  const handleExport = async () => {
    if (entries.length === 0) {
      Alert.alert('No Data', 'No wellbeing entries to export yet.');
      return;
    }
    const zoneEmoji: Record<string,string> = { blue:'😔', green:'😊', yellow:'😟', red:'😣' };
    const zoneLabel: Record<string,string> = { blue:'Blue', green:'Green', yellow:'Yellow', red:'Red' };
    const zoneCounts: Record<string,number> = { blue:0, green:0, yellow:0, red:0 };
    entries.forEach(e => { if (e.zone in zoneCounts) zoneCounts[e.zone]++; });
    const total = entries.length;
    const bar = (z: string) => '█'.repeat(Math.round((zoneCounts[z]/Math.max(total,1))*10));
    const pct = (z: string) => Math.round(zoneCounts[z]/Math.max(total,1)*100);
    const lines = [
      '╔══════════════════════════════════════╗',
      '║     CLASS OF HAPPINESS               ║',
      '║     Wellbeing Report                 ║',
      '╚══════════════════════════════════════╝',
      '',
      `👤 ${memberName}`,
      `📅 Period: Last ${range} days`,
      `🗓  Exported: ${new Date().toLocaleDateString()}`,
      `📊 Total check-ins: ${total}`,
      '',
      '─── Emotion Summary ───────────────────',
      `😔 Blue:   ${bar('blue')} ${zoneCounts.blue} (${pct('blue')}%)`,
      `😊 Green:  ${bar('green')} ${zoneCounts.green} (${pct('green')}%)`,
      `😟 Yellow: ${bar('yellow')} ${zoneCounts.yellow} (${pct('yellow')}%)`,
      `😣 Red:    ${bar('red')} ${zoneCounts.red} (${pct('red')}%)`,
      '',
      '─── Check-in Log ──────────────────────',
      ...entries.slice(0,50).map(e => {
        const d = new Date(e.timestamp).toLocaleDateString();
        const time = new Date(e.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
        const note = e.comment ? `
    💬 "${e.comment}"` : '';
        const journal = journals[e.id] ? `
    📝 ${journals[e.id]}` : '';
        const strats = (e as any).strategies_selected?.length ? `
    🎯 ${((e as any).strategies_selected).slice(0,3).join(', ')}` : '';
        return `${zoneEmoji[e.zone]||'•'} ${d} ${time} — ${zoneLabel[e.zone]||e.zone}${note}${strats}${journal}`;
      }),
      '',
      '─────────────────────────────────────',
      '  Class of Happiness',
      '  This report is private and confidential.',
    ];
    try {
      await Share.share({ title: `Wellbeing Report — ${memberName}`, message: lines.join('\n') });
    } catch(e) { console.log('Export error:', e); }
  };

  return (
    <SafeAreaView style={[st.container, { paddingTop: 8 }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>🔒 {memberName} — {t('my_wellbeing') || 'My Wellbeing'}</Text>
        <TouchableOpacity onPress={() => { setPinUnlocked(false); setPinInput(''); }}>
          <MaterialIcons name="lock" size={22} color="#AAA" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps='handled'>

        {/* Range selector + export */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={[st.rangeRow, { flex: 1, marginBottom: 0 }]}>
            {(['7','14','30'] as RangeKey[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[st.rangeBtn, range === r && st.rangeBtnActive]}
                onPress={() => setRange(r)}
              >
                <Text style={[st.rangeTxt, range === r && st.rangeTxtActive]}>
                  {t(`wellbeing_${r}days`) || `${r} Days`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            onPress={handleExport}
            style={{ marginLeft: 10, padding: 8, backgroundColor: '#F0F4FF', borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
          >
            <MaterialIcons name="ios-share" size={20} color="#5C6BC0" />
          </TouchableOpacity>
        </View>

        {/* DAILY VIEW */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecDaily(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="calendar-today" size={17} color="#5C6BC0" /><Text style={st.sectionTitle}>Daily View</Text></View>
            <MaterialIcons name={secDaily ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secDaily && <View style={{marginTop:12}}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
              {Array.from({ length: parseInt(range) }).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (parseInt(range) - 1 - i));
                const dateKey = d.toISOString().split('T')[0];
                const dayEntries = entries.filter(e => e.timestamp.startsWith(dateKey));
                const dominant = dayEntries.length > 0
                  ? Object.entries(
                      dayEntries.reduce((acc, e) => { acc[e.zone] = (acc[e.zone]||0)+1; return acc; }, {} as Record<string,number>)
                    ).sort((a,b) => b[1]-a[1])[0][0]
                  : null;
                const dayLabel = d.getDate().toString();
                const monthLabel = d.toLocaleDateString(undefined, { month: 'short' });
                return (
                  <View key={i} style={{ alignItems: 'center', gap: 4, minWidth: parseInt(range) <= 7 ? 40 : 28 }}>
                    <View style={{
                      width: parseInt(range) <= 7 ? 36 : 24,
                      height: parseInt(range) <= 7 ? 36 : 24,
                      borderRadius: 18,
                      backgroundColor: dominant ? ZONE_COLORS[dominant] : '#E0E0E0',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {dominant ? (
                        <Text style={{ fontSize: parseInt(range) <= 7 ? 16 : 11 }}>{ZONE_EMOJI[dominant]}</Text>
                      ) : (
                        <Text style={{ fontSize: 10, color: '#999' }}>·</Text>
                      )}
                    </View>
                    {dayEntries.length > 0 && (
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: ZONE_COLORS[dominant!] }} />
                    )}
                    <Text style={{ fontSize: 9, color: '#888' }}>{dayLabel}</Text>
                    {(i === 0 || d.getDate() === 1) && (
                      <Text style={{ fontSize: 8, color: '#AAA' }}>{monthLabel}</Text>
                    )}
                  </View>
                );
              })}
            </View>
          </ScrollView>
          </View>}
        </View>

        {/* Stats summary */}
        <View style={st.statsRow}>
          <View style={st.statBox}>
            <Text style={st.statNum}>{total}</Text>
            <Text style={st.statLabel}>{t('wellbeing_total') || 'total check-ins'}</Text>
          </View>
          <View style={st.statBox}>
            <Text style={st.statNum}>{total > 0 ? Math.round(total / parseInt(range) * 7) : 0}</Text>
            <Text style={st.statLabel}>{t('per_week_avg') || 'per week avg'}</Text>
          </View>
        </View>

        {/* EMOTION DISTRIBUTION */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecDistrib(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="donut-large" size={17} color="#5C6BC0" /><Text style={st.sectionTitle}>Emotion Distribution</Text></View>
            <MaterialIcons name={secDistrib ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secDistrib && (total === 0 ? (
            <Text style={st.noData}>No check-ins yet</Text>
          ) : (
            <View style={{gap:10,marginTop:12}}>
              {(Object.keys(counts) as (keyof typeof counts)[]).map(zone => (
                <View key={zone} style={st.distRow}>
                  <Text style={st.distEmoji}>{ZONE_EMOJI[zone]}</Text>
                  <View style={st.distBarBg}>
                    <View style={[st.distBar, { width:`${(counts[zone]/maxCount)*100}%` as any, backgroundColor:ZONE_COLORS[zone] }]} />
                  </View>
                  <Text style={st.distCount}>{counts[zone]}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>

        {/* EMOTION COMPARISON */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecCompare(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="bar-chart" size={17} color="#5C6BC0" /><Text style={st.sectionTitle}>Emotion Comparison</Text></View>
            <MaterialIcons name={secCompare ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secCompare && (total > 0 ? (
            <View style={{alignItems:'center',marginTop:12}}>
              <BarChart
                data={(['blue','green','yellow','red'] as const).map(z => ({
                  value: counts[z]||0, frontColor: ZONE_COLORS[z],
                  label: z.charAt(0).toUpperCase()+z.slice(1),
                }))}
                barWidth={42} spacing={18} roundedTop roundedBottom
                xAxisThickness={0} yAxisThickness={0}
                yAxisTextStyle={{color:'#666',fontSize:11}}
                noOfSections={4} maxValue={Math.max(1,maxCount)+1}
                isAnimated barBorderRadius={6} width={width-100}
              />
            </View>
          ) : <Text style={[st.noData,{marginTop:10}]}>No data for this period</Text>)}
        </View>

        {/* MOST USED STRATEGIES */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecStrategies(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="star" size={17} color="#FFC107" /><Text style={st.sectionTitle}>Most Used Strategies</Text></View>
            <MaterialIcons name={secStrategies ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secStrategies && (() => {
            const stratCounts: Record<string,number> = {};
            entries.forEach(e => { ((e as any).strategies_selected||[]).forEach((s:string) => { stratCounts[s]=(stratCounts[s]||0)+1; }); });
            const sorted = Object.entries(stratCounts).sort(([,a],[,b])=>(b as number)-(a as number));
            return sorted.length === 0
              ? <Text style={[st.noData,{marginTop:8}]}>No strategies used yet</Text>
              : sorted.map(([id,count]) => {
                  const zc = id.startsWith('blue')?'#4A90D9':id.startsWith('green')?'#4CAF50':id.startsWith('yellow')?'#FFC107':id.startsWith('red')?'#F44336':'#999';
                  const name = id.replace(/_/g,' ').replace(/\w/g,c=>c.toUpperCase());
                  return (
                    <View key={id} style={{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F0F0F0'}}>
                      <View style={{width:10,height:10,borderRadius:5,backgroundColor:zc,marginRight:8}} />
                      <Text style={{flex:1,fontSize:13,color:'#333'}}>{name}</Text>
                      <View style={{backgroundColor:'#FFF8E1',paddingHorizontal:8,paddingVertical:3,borderRadius:10}}>
                        <Text style={{fontSize:12,fontWeight:'600',color:'#F9A825'}}>{count as number}x</Text>
                      </View>
                    </View>
                  );
                });
          })()}
        </View>

        {/* RECENT CHECK-INS / TIMELINE */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecTimeline(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="history" size={17} color="#5C6BC0" /><Text style={st.sectionTitle}>Recent Check-ins</Text></View>
            <MaterialIcons name={secTimeline ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secTimeline && (entries.length === 0 ? (
            <Text style={st.noData}>No check-ins yet</Text>
          ) : (
            entries.slice(0, 20).map(entry => {
              const d = new Date(entry.timestamp);
              const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
              const j = journals[entry.id] || '';
              return (
                <View key={entry.id} style={st.entryRow}>
                  <View style={[st.entryDot, { backgroundColor: ZONE_COLORS[entry.zone] || '#CCC' }]}>
                    <Text style={{ fontSize: 14 }}>{ZONE_EMOJI[entry.zone] || '😊'}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={st.entryDate}>{dateStr}</Text>
                      <Text style={st.entryTime}>{timeStr}</Text>
                    </View>
                    {entry.comment ? (
                      <Text style={st.entryComment}>{entry.comment}</Text>
                    ) : null}
                    {/* Journal */}
                    {editingJournal === entry.id ? (
                      <View style={{ marginTop: 8 }}>
                        <TextInput
                          style={st.journalInput}
                          value={journalText}
                          onChangeText={setJournalText}
                          placeholder={t('wellbeing_journal_ph') || 'Add a note...'}
                          placeholderTextColor="#AAA"
                          multiline
                          autoFocus
                        />
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                          <TouchableOpacity onPress={() => saveJournal(entry.id)} style={st.journalSave}>
                            <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>{t('save') || 'Save'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => setEditingJournal(null)} style={st.journalCancel}>
                            <Text style={{ color: '#666', fontSize: 13 }}>{t('cancel') || 'Cancel'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => { setEditingJournal(entry.id); setJournalText(j); }} style={{ marginTop: 4 }}>
                        <Text style={st.journalLink}>
                          {j ? `📝 ${j.slice(0, 60)}${j.length > 60 ? '…' : ''}` : `+ ${t('wellbeing_journal') || 'Add journal note'}`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          ))}
        </View>

        {/* CHECK-IN CALENDAR */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecCalendar(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="event" size={17} color="#5C6BC0" /><Text style={st.sectionTitle}>Check-in Calendar</Text></View>
            <MaterialIcons name={secCalendar ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secCalendar && (() => {
            const grouped: Record<string,any[]> = {};
            entries.forEach(e => { const d=(e.timestamp||'').split('T')[0]; if(d){if(!grouped[d])grouped[d]=[];grouped[d].push(e);} });
            const dates = Object.keys(grouped).sort().slice(-14);
            if (!dates.length) return <Text style={[st.noData,{marginTop:8}]}>No check-in data yet</Text>;
            return (
              <View style={{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:8}}>
                {dates.map(date => {
                  const dayLogs = grouped[date];
                  const d = new Date(date);
                  const dayName = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
                  const dayNum = d.getDate();
                  const zcnts: Record<string,number> = {};
                  dayLogs.forEach((l:any)=>{const z=l.zone;if(z)zcnts[z]=(zcnts[z]||0)+1;});
                  const dom = Object.entries(zcnts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'green';
                  return (
                    <View key={date} style={{alignItems:'center',width:38}}>
                      <Text style={{fontSize:9,color:'#888',marginBottom:3}}>{dayName}</Text>
                      <View style={{width:28,height:28,borderRadius:14,backgroundColor:ZONE_COLORS[dom]||'#4CAF50',alignItems:'center',justifyContent:'center'}}>
                        <Text style={{fontSize:11,fontWeight:'700',color:'white'}}>{dayNum}</Text>
                      </View>
                      <Text style={{fontSize:8,color:'#888',marginTop:2}}>{dayLogs.length}x</Text>
                    </View>
                  );
                })}
              </View>
            );
          })()}
        </View>

        {/* DOWNLOAD PDF */}
        <View style={st.section}>
          <TouchableOpacity onPress={() => setSecPdf(e => !e)} style={st.sectionHeader}>
            <View style={st.sectionHeaderLeft}><MaterialIcons name="picture-as-pdf" size={17} color="#E53935" /><Text style={st.sectionTitle}>Download Monthly Report</Text></View>
            <MaterialIcons name={secPdf ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secPdf && (() => {
            const months: string[] = [];
            const now = new Date();
            for (let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);}
            return (
              <View style={{gap:8,marginTop:12}}>
                {months.map(m => {
                  const [y,mo] = m.split('-');
                  const label = new Date(parseInt(y),parseInt(mo)-1,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
                  return (
                    <TouchableOpacity key={m}
                      style={{flexDirection:'row',alignItems:'center',backgroundColor:'#FFF3F3',borderRadius:10,padding:12,gap:10,borderWidth:1,borderColor:'#FFCDD2'}}
                      onPress={() => downloadReport(m)} disabled={downloading}>
                      <MaterialIcons name="picture-as-pdf" size={20} color="#E53935" />
                      <Text style={{flex:1,fontSize:13,fontWeight:'600',color:'#333'}}>{label}</Text>
                      <MaterialIcons name="download" size={18} color="#E53935" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  section: { backgroundColor: 'white', borderRadius: 12, marginBottom: 8, padding: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', backgroundColor: 'white' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#333', flex: 1, textAlign: 'center' },
  scroll: { padding: 16, gap: 14 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeBtn: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: 'white', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0' },
  rangeBtnActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  rangeTxt: { fontSize: 14, fontWeight: '600', color: '#666' },
  rangeTxtActive: { color: 'white' },
  statsRow: { flexDirection: 'row', gap: 12 },
  statBox: { flex: 1, backgroundColor: 'white', borderRadius: 14, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  statNum: { fontSize: 28, fontWeight: '800', color: '#5C6BC0' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 14 },
  noData: { textAlign: 'center', color: '#AAA', fontSize: 13, paddingVertical: 20 },
  distRows: { gap: 10 },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  distEmoji: { fontSize: 20, width: 28 },
  distBarBg: { flex: 1, height: 10, backgroundColor: '#F0F0F0', borderRadius: 5, overflow: 'hidden' },
  distBar: { height: 10, borderRadius: 5 },
  distCount: { fontSize: 13, fontWeight: '700', color: '#333', width: 24, textAlign: 'right' },
  entryRow: { flexDirection: 'row', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  entryDot: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  entryDate: { fontSize: 13, fontWeight: '600', color: '#333' },
  entryTime: { fontSize: 12, color: '#AAA' },
  entryComment: { fontSize: 12, color: '#666', marginTop: 3, fontStyle: 'italic' },
  journalLink: { fontSize: 12, color: '#5C6BC0', marginTop: 4 },
  journalInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 10, fontSize: 13, color: '#333', minHeight: 60, textAlignVertical: 'top' },
  journalSave: { backgroundColor: '#5C6BC0', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  journalCancel: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  // PIN styles
  pin: { flex: 1, backgroundColor: '#F8F9FA' },
  pinBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  backBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 8 },
  pinIcon: { fontSize: 48, marginBottom: 8 },
  pinName: { fontSize: 16, color: '#888', marginBottom: 2 },
  pinTitle: { fontSize: 24, fontWeight: '800', color: '#333', marginBottom: 4 },
  pinSub: { fontSize: 15, color: '#555', marginBottom: 4, textAlign: 'center' },
  pinDesc: { fontSize: 12, color: '#AAA', textAlign: 'center', marginBottom: 8, paddingHorizontal: 20 },
  dots: { flexDirection: 'row', gap: 16, marginVertical: 24 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#5C6BC0' },
  dotFilled: { backgroundColor: '#5C6BC0' },
  hintInput: { backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#333', width: '100%', marginBottom: 16, borderWidth: 1, borderColor: '#E0E0E0' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12 },
  key: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  keyTxt: { fontSize: 22, fontWeight: '600', color: '#333' },
});
