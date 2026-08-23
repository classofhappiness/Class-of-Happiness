import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform, Alert, TextInput, Modal, Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';

type FeelingZone = 'blue' | 'green' | 'yellow' | 'red';

const ZONE_COLORS: Record<FeelingZone, string> = EMOTION_COLOURS;

const ZONES: Array<{ id: FeelingZone; label: string; emoji: string; color: string }> = [
  { id: 'blue', label: 'Low energy', emoji: '😔', color: EMOTION_COLOURS.blue },
  { id: 'green', label: 'Steady', emoji: '🙂', color: EMOTION_COLOURS.green },
  { id: 'yellow', label: 'Stressed', emoji: '😟', color: EMOTION_COLOURS.yellow },
  { id: 'red', label: 'Overloaded', emoji: '😣', color: EMOTION_COLOURS.red },
];

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TEACHER_STRATEGIES: Record<FeelingZone, Array<{ id: string; name: string; description: string; icon: string }>> = {
  blue: [
    { id: 'blue_1', name: 'Talk to a trusted colleague', description: 'Use a 5-minute peer check-in to reduce isolation.', icon: 'chat' },
    { id: 'blue_2', name: 'Brief outdoor walk', description: 'Step outside the school building for light and movement.', icon: 'directions-walk' },
    { id: 'blue_3', name: 'Safe staff space reset', description: 'Use staff room or quiet corner for a short reset.', icon: 'meeting-room' },
    { id: 'blue_4', name: 'Hydrate and breathe', description: 'Drink water and complete 4 slow breaths.', icon: 'local-drink' },
  ],
  green: [
    { id: 'green_1', name: 'Protect what works', description: 'Keep routines that are helping you stay regulated.', icon: 'check-circle' },
    { id: 'green_2', name: 'Positive micro-moment', description: 'Name one student success from today.', icon: 'thumb-up' },
    { id: 'green_3', name: 'Prep buffer time', description: 'Reserve 10 minutes before/after class transition.', icon: 'schedule' },
    { id: 'green_4', name: 'Boundary reminder', description: 'Use a clear stop-time for work tonight.', icon: 'lock-clock' },
  ],
  yellow: [
    { id: 'yellow_1', name: 'Movement break', description: 'Exercise before, during, or after school to discharge stress.', icon: 'fitness-center' },
    { id: 'yellow_2', name: 'Guided meditation', description: 'Use a short educator-friendly mindfulness resource.', icon: 'self-improvement' },
    { id: 'yellow_3', name: 'Challenge log', description: 'Record triggers/challenges for pattern tracking.', icon: 'description' },
    { id: 'yellow_4', name: 'Deep breathing set', description: 'Box breathing for 2-3 minutes.', icon: 'air' },
    { id: 'yellow_5', name: 'Quick yoga stretch', description: 'Two standing stretches between lessons.', icon: 'accessibility-new' },
  ],
  red: [
    { id: 'red_1', name: 'Ask for immediate cover', description: 'Request brief support from nearby staff if possible.', icon: 'support-agent' },
    { id: 'red_2', name: 'Grounding routine', description: '5-4-3-2-1 sensory grounding to regain control.', icon: 'psychology' },
    { id: 'red_3', name: 'Pause before response', description: 'Delay difficult conversations until regulated.', icon: 'pause-circle-filled' },
    { id: 'red_4', name: 'De-escalation script', description: 'Use your prepared calm script with students.', icon: 'record-voice-over' },
  ],
};

// All strategies flat for lookup
const ALL_STRATEGIES = Object.values(TEACHER_STRATEGIES).flat();

const BACKEND_URL_CONST = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function TeacherCheckInScreen() {
  const router = useRouter();
  const { user , t} = useApp();
  const navigation = useNavigation();
  const [selectedZone, setSelectedZone] = useState<FeelingZone | null>(null);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [weekData, setWeekData] = useState<Record<string, { zone: FeelingZone; time: string }[]>>({});
  const [history, setHistory] = useState<any[]>([]);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);
  const [adminStrategies, setAdminStrategies] = useState<any[]>([]);
  const [shareWithWellbeing, setShareWithWellbeing] = useState(false);
  const [customStrategies, setCustomStrategies] = useState<Array<{id: string; name: string; description: string}>>([]);
  const [showAddStrategy, setShowAddStrategy] = useState(false);
  const [newStrategyName, setNewStrategyName] = useState('');
  const [newStrategyDesc, setNewStrategyDesc] = useState('');
  // Real fix Aug 23 (health check): these were declared much further down (originally right
  // before handlePinDigit), but referenced here by the two effects below - pinUnlocked in
  // particular sat inside a useEffect dependency array, which is evaluated eagerly during
  // render (unlike an effect's callback body, which React defers) - a genuine
  // temporal-dead-zone ReferenceError on every mount, confirmed by tsc's TS2448/TS2454. Moved
  // up as one block, same relative order, so hook call order is unaffected.
  const [displayName, setDisplayName] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinStep, setPinStep] = useState<'enter'|'setup'|'confirm'>('enter');
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const PIN_KEY = 'teacher_checkin_pin';
  const [weekExpanded, setWeekExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [pdfExpanded, setPdfExpanded] = useState(false);
  const [secDistrib, setSecDistrib] = useState(false);
  const [secCompare, setSecCompare] = useState(false);
  const [secStrategies, setSecStrategies] = useState(false);
  const [zoneCounts, setZoneCounts] = useState({blue:0,green:0,yellow:0,red:0});
  const [stratCounts, setStratCounts] = useState<Record<string,number>>({});

  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  useEffect(() => {
    if (user?.name) { setDisplayName(user.name); setNameInput(user.name); }
    else if (user?.email) { const n = user.email.split('@')[0].replace(/\./g,' ').replace(/\w/g,(c:string)=>c.toUpperCase()); setDisplayName(n); setNameInput(n); }
    AsyncStorage.getItem(PIN_KEY).then(pin => {
      if (pin) { setPinStep('enter'); }
      else { setPinStep('setup'); }
    });
  }, []);

  useEffect(() => {
    if (pinUnlocked) { loadData(); loadAdminStrategies(); }
  }, [pinUnlocked]);

  const loadAdminStrategies = async () => {
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      // Real fix Aug 18 (A9): this never passed strategy_type, so it pulled back ALL
      // admin_teacher_strategies rows (student + teacher + parent mixed) - a teacher's own
      // check-in could show a strategy written for an 8-year-old student, purely because it
      // happened to share a zone and not collide by name with the hardcoded list.
      const res = await fetch(`${BACKEND_URL}/api/admin/teacher-strategies?strategy_type=teacher`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Merge DB strategies with hardcoded ones
          setAdminStrategies(data);
        }
      }
    } catch (e) { console.log("[silent]", e); }
  };

  const STRATEGY_NAMES_LOCAL: Record<string,string> = {
    blue_1:'Gentle Stretch', blue_2:'Drink Water', blue_3:'Favourite Song', blue_4:'Cosy Spot', blue_5:'Tell Someone', blue_6:'Slow Breathing',
    green_1:'Keep Going!', green_2:'Help a Friend', green_3:'Try Something New', green_4:'Share Your Smile', green_5:'Set a Goal', green_6:'Gratitude',
    yellow_1:'Bubble Breathing', yellow_2:'Body Shake', yellow_3:'Count to 10', yellow_4:'5 Senses', yellow_5:'Squeeze & Release', yellow_6:'Talk About It',
    red_1:'Freeze', red_2:'Big Breaths', red_3:'Count Backwards', red_4:'Safe Space', red_5:'Ask for Help', red_6:'Self Hug',
  };
  // Flatten TEACHER_STRATEGIES (the real, correct list for this screen) into an id->name lookup.
  // These check-ins come from /teacher-checkins — the teacher's OWN wellbeing history — so the
  // strategy IDs here are teacher strategy IDs, NOT student ones. STRATEGY_NAMES_LOCAL uses the
  // exact same id scheme (blue_1, blue_2...) for a completely different, student-facing list,
  // which was the real bug: teacher strategies were being resolved against student names.
  const TEACHER_STRATEGY_LOOKUP: Record<string,string> = {};
  (Object.keys(TEACHER_STRATEGIES) as FeelingZone[]).forEach((zone) => {
    TEACHER_STRATEGIES[zone].forEach((s) => { TEACHER_STRATEGY_LOOKUP[s.id] = s.name; });
  });
  const resolveStratName = (id: string) => {
    if (!id || ['blue','green','yellow','red'].includes(id.toLowerCase())) return null;
    return TEACHER_STRATEGY_LOOKUP[id] || STRATEGY_NAMES_LOCAL[id] || id.replace(/_/g,' ').replace(/\b\w/g,(c:string)=>c.toUpperCase());
  };

  const loadData = async () => {
    if (!user?.user_id) return;
    try {
      // Try DB first
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      let checkins: any[] = [];
      try {
        const res = await fetch(`${BACKEND_URL}/api/teacher-checkins?days=30`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) {
          const dbData = await res.json();
          checkins = Array.isArray(dbData) ? dbData : [];
          // Also update AsyncStorage so dashboard loads fast
          await AsyncStorage.setItem(`teacher_checkins_${user.user_id}`, JSON.stringify(checkins.slice(0, 90)));
        }
      } catch { }

      // Fallback to AsyncStorage if DB empty
      if (checkins.length === 0) {
        const raw = await AsyncStorage.getItem(`teacher_checkins_${user.user_id}`);
        checkins = raw ? JSON.parse(raw) : [];
      }

      setHistory(checkins.slice(0, 10));
      // Compute analytics from all checkins
      const zc: Record<string,number> = {blue:0,green:0,yellow:0,red:0};
      const sc: Record<string,number> = {};
      checkins.forEach((l:any) => {
        const z = l.zone || '';
        if (z in zc) zc[z]++;
        (l.strategies_selected||[]).forEach((s:string) => {
          const name = resolveStratName(s);
          if (name) sc[name] = (sc[name]||0)+1;
        });
      });
      setZoneCounts(zc as any);
      setStratCounts(sc);

      // Build this week's data
      const grouped: Record<string, { zone: FeelingZone; time: string }[]> = {};
      DAYS.forEach(d => { grouped[d] = []; });
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      weekStart.setHours(0, 0, 0, 0);
      checkins.forEach((c: any) => {
        const date = new Date(c.timestamp);
        if (date < weekStart) return;
        const day = DAYS[date.getDay()];
        const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        grouped[day].push({ zone: c.zone, time });
      });
      setWeekData(grouped);
      // Load custom teacher strategies
      const customRaw = await AsyncStorage.getItem(`teacher_custom_strategies_${user.user_id}`);
      if (customRaw) setCustomStrategies(JSON.parse(customRaw));
    } catch (e) { console.log("[silent]", e); }
  };

  const saveCustomStrategy = async () => {
    if (!newStrategyName.trim()) return;
    const newS = { id: `custom_${Date.now()}`, name: newStrategyName.trim(), description: newStrategyDesc.trim() };
    const updated = [...customStrategies, newS];
    setCustomStrategies(updated);
    await AsyncStorage.setItem(`teacher_custom_strategies_${user?.user_id}`, JSON.stringify(updated));
    setNewStrategyName('');
    setNewStrategyDesc('');
    setShowAddStrategy(false);
    Alert.alert('✅ Added', 'Your personal strategy has been saved.');
  };

  const strategiesForZone = useMemo(() => {
    if (!selectedZone) return [];
    const hardcoded = TEACHER_STRATEGIES[selectedZone] || [];
    const fromDB = adminStrategies.filter(s => (s.zone || s.feeling_colour) === selectedZone);
    // Merge - avoid duplicates by name
    const hardcodedNames = new Set(hardcoded.map((s:any) => s.name.toLowerCase()));
    const newFromDB = fromDB.filter(s => s.name && !hardcodedNames.has(s.name.toLowerCase()));
    return [...hardcoded, ...newFromDB.map(s => ({
      id: s.id || String(Math.random()),
      name: s.name || 'Strategy',
      description: s.description || '',
      icon: s.icon || 'star',
    }))];
  }, [selectedZone, adminStrategies]);

  const toggleStrategy = (id: string) => {
    setSelectedStrategies(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const saveCheckIn = async () => {
    if (!selectedZone || !user?.user_id) {
      Alert.alert('Select a colour', 'Please choose an emotion colour before saving.');
      return;
    }
    setSaving(true);
    try {
      const storageKey = `teacher_checkins_${user.user_id}`;
      const existingRaw = await AsyncStorage.getItem(storageKey);
      const existing = existingRaw ? JSON.parse(existingRaw) : [];
      const newEntry = {
        id: `${Date.now()}`,
        timestamp: new Date().toISOString(),
        zone: selectedZone,
        strategies_selected: selectedStrategies,
        notes: notes.trim() || null,
        shared: shareWithWellbeing,
      };
      const updated = [newEntry, ...existing].slice(0, 90);
      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

      // Also save to backend so it appears in dashboard stats
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        await fetch(`${BACKEND_URL}/api/teacher-checkins`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await AsyncStorage.getItem('session_token')}`,
          },
          body: JSON.stringify({
            zone: selectedZone,
            strategies_selected: selectedStrategies,
            notes: notes.trim() || null,
            shared: shareWithWellbeing,
            timestamp: newEntry.timestamp,
          }),
        });
      } catch (e) {
        // Non-critical - local storage already saved
        console.log('Could not sync teacher checkin to server:', e);
      }

      // If teacher chose to share, notify wellbeing support
      if (shareWithWellbeing) {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        try {
          await fetch(`${BACKEND_URL}/api/wellbeing-alert`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              teacher_name: user?.name || 'Teacher',
              message: `Teacher check-in shared: ${selectedZone} zone. ${notes.trim() ? 'Note: ' + notes.trim() : ''} Strategies used: ${selectedStrategies.join(', ') || 'none'}`,
              zone: selectedZone,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (e) { console.log("[silent]", e); }
      }

      await loadData();
      setSelectedZone(null);
      setSelectedStrategies([]);
      setNotes('');
      setShareWithWellbeing(false);
      Alert.alert(t('checkin_saved') || '✅ Saved', shareWithWellbeing ? (t('checkin_saved_shared') || 'Check-in saved and shared with your wellbeing support team.') : (t('checkin_saved_private') || 'Your check-in has been recorded privately.'));
    } catch {
      Alert.alert('Error', 'Could not save check-in right now.');
    } finally {
      setSaving(false);
    }
  };

  const sendWellbeingAlert = async () => {
    if (!alertMessage.trim()) {
      Alert.alert('Add a message', 'Please write a brief message before sending.');
      return;
    }
    setSendingAlert(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      await fetch(`${BACKEND_URL}/api/wellbeing-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teacher_name: user?.name || 'Teacher',
          message: alertMessage.trim(),
          zone: selectedZone,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (e) { console.log("[silent]", e); }
    setShowAlertModal(false);
    setAlertMessage('');
    setSendingAlert(false);
    Alert.alert(t('alert_sent') || '📨 Alert Sent', t('alert_sent_desc') || 'Your wellbeing support team has been notified. Someone will reach out to you soon.', [{ text: t('thank_you') || 'Thank you' }]);
  };

  const getStrategyName = (id: string) => ALL_STRATEGIES.find(s => s.id === id)?.name || id;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const downloadTeacherPDF = async (monthStr: string) => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const lang = await AsyncStorage.getItem('app_language') || 'en';
      const [yr, mo] = monthStr.split('-');
      const url = `${BACKEND_URL_CONST}/api/reports/pdf/teacher-wellbeing/${user?.user_id}/month/${yr}/${parseInt(mo)}?token=${token}&lang=${lang}`;
      const checkRes = await fetch(url);
      if (!checkRes.ok) {
        let detail = '';
        try { detail = (await checkRes.json())?.detail || ''; } catch {}
        if (detail.startsWith('free_tier_limit|')) {
          Alert.alert('Free Plan Limit Reached', detail.split('|')[1] || 'Upgrade for unlimited reports.', [
            { text: 'Not Now', style: 'cancel' },
            { text: 'See Plans', onPress: () => router.push('/subscription') },
          ]);
        } else {
          Alert.alert('Error', 'No data for this month yet');
        }
        return;
      }
      await Linking.openURL(url);
    } catch { Alert.alert('Error', 'No data for this month yet'); }
  };

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
            setPinUnlocked(true);
          } else {
            Alert.alert('PINs do not match');
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
            if (next === stored) { setPinUnlocked(true); }
            else { Alert.alert('Incorrect PIN'); setPinInput(''); }
          });
        }
      }
    }
  };

  const handlePinDelete = () => {
    if (pinStep === 'confirm') setPinConfirm(c => c.slice(0,-1));
    else setPinInput(p => p.slice(0,-1));
  };

  const handleResetPin = () => {
    Alert.alert('Reset PIN', 'Are you sure? You will need to create a new PIN.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem(PIN_KEY);
        setPinInput(''); setPinConfirm(''); setPinStep('setup');
      }},
    ]);
  };

  const saveName = async () => {
    if (!nameInput.trim()) return;
    try {
      const token = await AsyncStorage.getItem('session_token');
      await fetch(`${BACKEND_URL_CONST}/api/user/update-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: nameInput.trim() }),
      });
      setDisplayName(nameInput.trim());
      setEditingName(false);
    } catch {}
  };

  const zoneConfig = selectedZone ? ZONES.find(z => z.id === selectedZone) : null;

  if (!pinUnlocked) {
    const current = pinStep === 'confirm' ? pinConfirm : pinInput;
    return (
      <SafeAreaView style={{flex:1,backgroundColor:'white'}}>
        <TouchableOpacity style={{padding:16}} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{flex:1,alignItems:'center',justifyContent:'center',paddingHorizontal:32}}>
          <Text style={{fontSize:40,marginBottom:8}}>🔒</Text>
          <Text style={{fontSize:20,fontWeight:'700',color:'#333',marginBottom:4}}>Teacher Check-in</Text>
          <Text style={{fontSize:14,color:'#666',marginBottom:24,textAlign:'center'}}>
            {pinStep === 'setup' ? 'Create a private PIN to protect your wellbeing data'
            : pinStep === 'confirm' ? 'Confirm your PIN'
            : 'Enter your PIN'}
          </Text>
          <View style={{flexDirection:'row',gap:12,marginBottom:32}}>
            {[0,1,2,3].map(i => (
              <View key={i} style={{width:14,height:14,borderRadius:7,borderWidth:2,borderColor:'#5C6BC0',backgroundColor:current.length>i?'#5C6BC0':'transparent'}} />
            ))}
          </View>
          <View style={{flexDirection:'row',flexWrap:'wrap',width:240,gap:8,justifyContent:'center'}}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d,i) => (
              <TouchableOpacity key={i}
                style={{width:72,height:56,borderRadius:12,backgroundColor:d?'#F5F5F5':'transparent',alignItems:'center',justifyContent:'center',opacity:d?1:0}}
                onPress={() => d==='⌫' ? handlePinDelete() : d && handlePinDigit(d)}
                disabled={!d}>
                <Text style={{fontSize:22,fontWeight:'600',color:'#333'}}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {pinStep === 'enter' && (
            <TouchableOpacity onPress={handleResetPin} style={{marginTop:24}}>
              <Text style={{color:'#5C6BC0',fontSize:14}}>Forgot PIN?</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('teacher_checkin') || 'Teacher Check-In'}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.replace('/teacher/dashboard')} style={{ padding: 6, marginRight: 4 }}>
          <MaterialIcons name="home" size={22} color="#333" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.alertBtn} onPress={() => setShowAlertModal(true)}>
          <MaterialIcons name="support-agent" size={18} color="white" />
          <Text style={styles.alertBtnText}>{t('support') || 'Support'}</Text>
        </TouchableOpacity>
      </View>

      {/* Name row */}
      <View style={{backgroundColor:'#F8F9FA',paddingHorizontal:16,paddingVertical:8,flexDirection:'row',alignItems:'center',borderBottomWidth:1,borderBottomColor:'#EEEEEE'}}>
        <MaterialIcons name="person" size={16} color="#5C6BC0" style={{marginRight:6}} />
        {editingName ? (
          <>
            <TextInput
              value={nameInput}
              onChangeText={setNameInput}
              style={{flex:1,fontSize:13,color:'#333',borderBottomWidth:1,borderBottomColor:'#5C6BC0',paddingVertical:2}}
              autoFocus
              placeholder="Your display name..."
              placeholderTextColor="#AAA"
            />
            <TouchableOpacity onPress={saveName} style={{marginLeft:8,backgroundColor:'#5C6BC0',borderRadius:6,paddingHorizontal:10,paddingVertical:4}}>
              <Text style={{color:'white',fontSize:12,fontWeight:'600'}}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingName(false)} style={{marginLeft:6}}>
              <MaterialIcons name="close" size={18} color="#999" />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={{flex:1,fontSize:13,color:'#555'}}>{displayName || 'Tap to add your name'}</Text>
            <TouchableOpacity onPress={() => setEditingName(true)}>
              <MaterialIcons name="edit" size={16} color="#5C6BC0" />
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* STEP 1: Colour Selection */}
        <Text style={styles.sectionLabel}>{t('select_emotion') || 'Select your emotion'}</Text>
        <View style={{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:8}}>
          {ZONES.map(zone => (
            <TouchableOpacity
              key={zone.id}
              style={[styles.zoneBtn, { backgroundColor: zone.color }, selectedZone === zone.id && styles.zoneBtnSelected]}
              onPress={() => { setSelectedZone(zone.id); setSelectedStrategies([]); }}
              activeOpacity={0.85}
            >
              <Text style={styles.zoneEmoji}>{zone.emoji}</Text>
              <Text style={styles.zoneBtnLabel}>{zone.id === 'blue' ? (t('blue_label') || zone.label) : zone.id === 'green' ? (t('steady') || zone.label) : zone.id === 'yellow' ? (t('stressed') || zone.label) : (t('red_label') || zone.label)}</Text>
              {selectedZone === zone.id && <MaterialIcons name="check-circle" size={22} color="white" />}
            </TouchableOpacity>
          ))}
        </View>

        {/* STEP 2: Strategies (only after colour selected) */}
        {selectedZone && (
          <>
            <Text style={styles.sectionLabel}>Helpful strategies — tap to select</Text>
            {strategiesForZone.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.strategyCard, selectedStrategies.includes(s.id) && { borderColor: zoneConfig?.color, borderWidth: 2, backgroundColor: zoneConfig?.color + '15' }]}
                onPress={() => toggleStrategy(s.id)}
              >
                <View style={[styles.strategyIcon, { backgroundColor: (zoneConfig?.color || '#5C6BC0') + '25' }]}>
                  <MaterialIcons name={s.icon as any} size={22} color={zoneConfig?.color || '#5C6BC0'} />
                </View>
                <View style={styles.strategyText}>
                  <Text style={styles.strategyName}>{s.name}</Text>
                  <Text style={styles.strategyDesc}>{s.description}</Text>
                </View>
                {selectedStrategies.includes(s.id) && <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color || '#5C6BC0'} />}
              </TouchableOpacity>
            ))}

            {/* Custom personal strategies */}
            {customStrategies.length > 0 && (
              <>
                <Text style={styles.customStratLabel}>{t('my_strategies') || 'My Strategies'}</Text>
                {customStrategies.map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.strategyCard, selectedStrategies.includes(s.id) && { borderColor: zoneConfig?.color, borderWidth: 2, backgroundColor: zoneConfig?.color + '15' }]}
                    onPress={() => toggleStrategy(s.id)}
                  >
                    <View style={[styles.strategyIcon, { backgroundColor: '#E8EAF6' }]}>
                      <MaterialIcons name="star" size={22} color="#5C6BC0" />
                    </View>
                    <View style={styles.strategyText}>
                      <Text style={styles.strategyName}>{s.name}</Text>
                      {s.description ? <Text style={styles.strategyDesc}>{s.description}</Text> : null}
                    </View>
                    {selectedStrategies.includes(s.id) && <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color} />}
                  </TouchableOpacity>
                ))}
              </>
            )}
            <TouchableOpacity style={styles.addStrategyBtn} onPress={() => setShowAddStrategy(!showAddStrategy)}>
              <MaterialIcons name="add-circle-outline" size={20} color="#5C6BC0" />
              <Text style={styles.addStrategyText}>{t('add_custom_strategy') || 'Add Custom Strategy'}</Text>
            </TouchableOpacity>
            {showAddStrategy && (
              <View style={styles.addStrategyForm}>
                <TextInput style={styles.addStrategyInput} placeholder="Strategy name..." value={newStrategyName} onChangeText={setNewStrategyName} placeholderTextColor="#AAA" />
                <TextInput style={styles.addStrategyInput} placeholder="Description (optional)..." value={newStrategyDesc} onChangeText={setNewStrategyDesc} placeholderTextColor="#AAA" />
                <TouchableOpacity style={styles.addStrategySubmit} onPress={saveCustomStrategy}>
                  <Text style={styles.addStrategySubmitText}>{t('add_strategy') || t('add_strategy') || 'Save Strategy'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Notes */}
            <Text style={styles.sectionLabel}>Add a note (optional)</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="e.g. Difficult parent meeting today..."
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              placeholderTextColor="#AAA"
            />

            {/* Share with wellbeing toggle */}
            <TouchableOpacity
              style={styles.shareToggle}
              onPress={() => setShareWithWellbeing(!shareWithWellbeing)}
            >
              <MaterialIcons
                name={shareWithWellbeing ? 'notifications-active' : 'notifications-off'}
                size={20}
                color={shareWithWellbeing ? '#F44336' : '#CCC'}
              />
              <View style={styles.shareToggleText}>
                <Text style={styles.shareToggleTitle}>
                  {shareWithWellbeing ? (t('share_wellbeing') || '📨 Share with wellbeing support') : (t('keep_private') || '🔒 Keep private')}
                </Text>
                <Text style={styles.shareToggleDesc}>
                  {shareWithWellbeing
                    ? 'Your principal/psychologist will be notified of this check-in'
                    : 'Only you can see this check-in'}
                </Text>
              </View>
              <View style={[styles.toggleSwitch, shareWithWellbeing && styles.toggleSwitchOn]}>
                <View style={[styles.toggleKnob, shareWithWellbeing && styles.toggleKnobOn]} />
              </View>
            </TouchableOpacity>

            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: zoneConfig?.color || '#5C6BC0' }]}
              onPress={saveCheckIn}
              disabled={saving}
            >
              <MaterialIcons name="check" size={22} color="white" />
              <Text style={styles.saveText}>{saving ? (t('saving') || 'Saving...') : (t('save_checkin') || 'Save Check-in')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3: Weekly Calendar — collapsible */}
        <View style={styles.weekCard}>
          <TouchableOpacity onPress={() => setWeekExpanded(e => !e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Text style={styles.weekTitle}>{t('this_week') || '📅 This week'}</Text>
            <MaterialIcons name={weekExpanded ? 'expand-less' : 'expand-more'} size={22} color="#999" />
          </TouchableOpacity>
          {weekExpanded && <View style={styles.weekRow}>
            {DAYS.map(day => {
              const entries = weekData[day] || [];
              return (
                <View key={day} style={styles.dayCol}>
                  <Text style={styles.dayLabel}>{day}</Text>
                  {entries.length > 0 ? entries.slice(0, 2).map((e, i) => (
                    <View key={i} style={styles.dayEntry}>
                      <View style={[styles.dayDot, { backgroundColor: ZONE_COLORS[e.zone] }]} />
                      <Text style={styles.dayTime}>{e.time}</Text>
                    </View>
                  )) : <Text style={styles.dayEmpty}>·</Text>}
                </View>
              );
            })}
          </View>}
        </View>

        {/* STEP 4: Check-in History */}
        {history.length > 0 && (
          <View style={styles.weekCard}>
            <TouchableOpacity onPress={() => setHistoryExpanded(e => !e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
              <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                <MaterialIcons name="history" size={17} color="#5C6BC0" />
                <Text style={styles.weekTitle}>{t('your_recent_checkins') || 'Your recent check-ins'}</Text>
              </View>
              <MaterialIcons name={historyExpanded ? 'expand-less' : 'expand-more'} size={22} color="#999" />
            </TouchableOpacity>
            {historyExpanded && history.map((entry, i) => (
              <View key={entry.id || i} style={styles.historyCard}>
                <View style={[styles.historyDot, { backgroundColor: ZONE_COLORS[entry.zone as FeelingZone] || '#CCC' }]}>
                  <Text style={styles.historyEmoji}>
                    {ZONES.find(z => z.id === entry.zone)?.emoji || '🙂'}
                  </Text>
                </View>
                <View style={styles.historyInfo}>
                  <View style={styles.historyRow}>
                    <Text style={[styles.historyZone, { color: ZONE_COLORS[entry.zone as FeelingZone] }]}>
                      {ZONES.find(z => z.id === entry.zone)?.id === 'blue' ? (t('blue_label') || 'Low Energy') : ZONES.find(z => z.id === entry.zone)?.id === 'green' ? (t('steady') || 'Steady') : ZONES.find(z => z.id === entry.zone)?.id === 'yellow' ? (t('stressed') || 'Stressed') : (t('red_label') || entry.zone)}
                    </Text>
                    <Text style={styles.historyTime}>{formatDate(entry.timestamp)}</Text>
                  </View>
                  {entry.strategies_selected?.length > 0 && (
                    <Text style={styles.historyStrategies}>
                      ✅ {entry.strategies_selected.map(getStrategyName).join(', ')}
                    </Text>
                  )}
                  {entry.notes && (
                    <Text style={styles.historyNote}>💬 {entry.notes}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
        {/* EMOTION DISTRIBUTION */}
        <View style={styles.weekCard}>
          <TouchableOpacity onPress={() => setSecDistrib(e => !e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <MaterialIcons name="donut-large" size={17} color="#5C6BC0" />
              <Text style={styles.weekTitle}>Emotion Distribution</Text>
            </View>
            <MaterialIcons name={secDistrib ? 'expand-less' : 'expand-more'} size={22} color="#999" />
          </TouchableOpacity>
          {secDistrib && (
            <View style={{gap:10,marginTop:12}}>
              {(['blue','green','yellow','red'] as const).map(zone => {
                const count = (zoneCounts as any)[zone] || 0;
                const total = Object.values(zoneCounts).reduce((a:any,b:any)=>a+b,0) as number;
                const pct = total > 0 ? Math.round(count/total*100) : 0;
                const colors: Record<string,string> = EMOTION_COLOURS;
                return (
                  <View key={zone} style={{flexDirection:'row',alignItems:'center',gap:8}}>
                    <Text style={{fontSize:16}}>{zone==='blue'?'😔':zone==='green'?'😊':zone==='yellow'?'😟':'😣'}</Text>
                    <View style={{flex:1,height:8,backgroundColor:'#F0F0F0',borderRadius:4}}>
                      <View style={{width:`${pct}%`,height:8,backgroundColor:colors[zone],borderRadius:4}} />
                    </View>
                    <Text style={{fontSize:12,color:'#666',width:28,textAlign:'right'}}>{count}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* MOST USED STRATEGIES */}
        <View style={styles.weekCard}>
          <TouchableOpacity onPress={() => setSecStrategies(e => !e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              <MaterialIcons name="star" size={17} color="#FFC107" />
              <Text style={styles.weekTitle}>Most Used Strategies</Text>
            </View>
            <MaterialIcons name={secStrategies ? 'expand-less' : 'expand-more'} size={22} color="#999" />
          </TouchableOpacity>
          {secStrategies && (() => {
            const sorted = Object.entries(stratCounts).sort(([,a],[,b])=>(b as number)-(a as number)).slice(0,8);
            return sorted.length === 0
              ? <Text style={{color:'#999',fontSize:13,marginTop:8}}>No strategies yet</Text>
              : sorted.map(([name,count]) => (
                <View key={name} style={{flexDirection:'row',alignItems:'center',paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#F0F0F0'}}>
                  <View style={{width:8,height:8,borderRadius:4,backgroundColor:'#5C6BC0',marginRight:8}} />
                  <Text style={{flex:1,fontSize:13,color:'#333'}}>{name}</Text>
                  <View style={{backgroundColor:'#FFF8E1',paddingHorizontal:8,paddingVertical:3,borderRadius:10}}>
                    <Text style={{fontSize:12,fontWeight:'600',color:'#F9A825'}}>{count as number}x</Text>
                  </View>
                </View>
              ));
          })()}
        </View>

        {/* PDF Download Section */}
        <View style={[styles.weekCard, {marginTop:8}]}>
          <TouchableOpacity onPress={() => setPdfExpanded(e => !e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <Text style={styles.weekTitle}>📄 Monthly Wellbeing Reports</Text>
            <MaterialIcons name={pdfExpanded ? 'expand-less' : 'expand-more'} size={22} color="#999" />
          </TouchableOpacity>
          {pdfExpanded && <Text style={{fontSize:11,color:'#888',marginBottom:8,marginTop:4}}>Download your check-in history as a PDF</Text>}
          {pdfExpanded && (() => {
            const months: string[] = [];
            const now = new Date();
            for (let i = 0; i < 6; i++) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
            }
            return months.map(m => {
              const label = new Date(m+'-15').toLocaleDateString(undefined, {month:'long', year:'numeric'});
              return (
                <TouchableOpacity key={m}
                  style={{flexDirection:'row',alignItems:'center',backgroundColor:'#FFF3F3',borderRadius:10,padding:10,gap:8,marginBottom:6,borderWidth:1,borderColor:'#FFCDD2'}}
                  onPress={() => downloadTeacherPDF(m)}>
                  <MaterialIcons name="picture-as-pdf" size={18} color="#E53935" />
                  <Text style={{flex:1,fontSize:12,fontWeight:'600',color:'#333'}}>{label}</Text>
                  <MaterialIcons name="download" size={16} color="#E53935" />
                </TouchableOpacity>
              );
            });
          })()}
        </View>

      </ScrollView>

      {/* Wellbeing Alert Modal */}
      <Modal visible={showAlertModal} transparent animationType="slide" onRequestClose={() => setShowAlertModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="notifications-active" size={24} color="#F44336" />
              <Text style={styles.modalTitle}>{t('request_support') || 'Request Wellbeing Support'}</Text>
              <TouchableOpacity onPress={() => setShowAlertModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Your principal, psychologist, or wellbeing lead will be notified privately and confidentially.
            </Text>
            <Text style={styles.inputLabel}>{t('support_message_placeholder') || t('support_message_placeholder') || 'Your message'}</Text>
            <TextInput
              style={styles.alertInput}
              placeholder="e.g. I'm struggling this week and would appreciate a check-in..."
              value={alertMessage}
              onChangeText={setAlertMessage}
              multiline
              numberOfLines={4}
              placeholderTextColor="#AAA"
              autoFocus
            />
            <TouchableOpacity
              style={[styles.sendAlertBtn, sendingAlert && { opacity: 0.6 }]}
              onPress={sendWellbeingAlert}
              disabled={sendingAlert}
            >
              <MaterialIcons name="send" size={20} color="white" />
              <Text style={styles.sendAlertText}>{sendingAlert ? 'Sending...' : 'Send to Wellbeing Team'}</Text>
            </TouchableOpacity>
            <Text style={styles.modalNote}>
              {t('private_message_note') || '🔒 This message is private. Only your designated wellbeing support staff will see it.'}
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, paddingTop: 20, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#333' },
  alertBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#555', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  alertBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 10, marginTop: 8 },
  zonesStack: { gap: 8, marginBottom: 20 },
  zoneBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, gap: 8, width: '48%' },
  zoneBtnSelected: { borderWidth: 3, borderColor: 'white' },
  zoneEmoji: { fontSize: 26 },
  zoneBtnLabel: { fontSize: 18, fontWeight: 'bold', color: 'white', flex: 1 },
  strategyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  strategyIcon: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  strategyText: { flex: 1 },
  strategyName: { fontSize: 14, fontWeight: '600', color: '#333' },
  strategyDesc: { fontSize: 12, color: '#888', marginTop: 2 },
  notesInput: { backgroundColor: 'white', borderRadius: 12, padding: 14, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#E0E0E0', minHeight: 80, textAlignVertical: 'top', marginBottom: 16 },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, padding: 16, gap: 8, marginBottom: 24 },
  saveText: { color: 'white', fontWeight: '700', fontSize: 17 },
  weekCard: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginTop: 8, marginBottom: 20, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  weekTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', flex: 1, gap: 4 },
  dayLabel: { fontSize: 10, fontWeight: '600', color: '#888' },
  dayEntry: { alignItems: 'center', gap: 2 },
  dayDot: { width: 22, height: 22, borderRadius: 11 },
  dayTime: { fontSize: 8, color: '#AAA' },
  dayEmpty: { fontSize: 18, color: '#DDD', marginTop: 4 },
  historySection: { marginTop: 4 },
  historyCard: { flexDirection: 'row', backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 8, gap: 12, borderWidth: 1, borderColor: '#F0F0F0' },
  historyDot: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  historyEmoji: { fontSize: 22 },
  historyInfo: { flex: 1 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  historyZone: { fontSize: 14, fontWeight: '600' },
  historyTime: { fontSize: 12, color: '#999' },
  historyStrategies: { fontSize: 12, color: '#555', marginTop: 2, lineHeight: 18 },
  historyNote: { fontSize: 12, color: '#777', marginTop: 4, fontStyle: 'italic' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  modalTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalSubtitle: { fontSize: 14, color: '#666', lineHeight: 20, marginBottom: 20, backgroundColor: '#FFF3F3', padding: 12, borderRadius: 10 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#444', marginBottom: 8 },
  alertInput: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 14, fontSize: 15, color: '#333', borderWidth: 1, borderColor: '#E0E0E0', minHeight: 100, textAlignVertical: 'top', marginBottom: 16 },
  sendAlertBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F44336', borderRadius: 12, padding: 16, gap: 8 },
  sendAlertText: { color: 'white', fontWeight: '700', fontSize: 16 },
  modalNote: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  shareToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, gap: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  shareToggleText: { flex: 1 },
  shareToggleTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  shareToggleDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E0E0E0', justifyContent: 'center', padding: 2 },
  toggleSwitchOn: { backgroundColor: '#F44336' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  // duplicate shareToggle removed
  // duplicate shareToggleText removed
  // duplicate shareToggleTitle removed
  // duplicate shareToggleDesc removed
  // duplicate toggleSwitch removed
  // duplicate toggleSwitchOn removed
  // duplicate toggleKnob removed
  // duplicate toggleKnobOn removed
  customStratLabel: { fontSize: 13, fontWeight: '600', color: '#5C6BC0', marginBottom: 8, marginTop: 4 },
  addStrategyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 8 },
  addStrategyText: { fontSize: 14, color: '#5C6BC0', fontWeight: '600' },
  addStrategyForm: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#E8EAF6' },
  addStrategyInput: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, color: '#333' },
  addStrategySubmit: { backgroundColor: '#5C6BC0', borderRadius: 8, padding: 10, alignItems: 'center' },
  addStrategySubmitText: { color: 'white', fontWeight: '600', fontSize: 14 },
});
