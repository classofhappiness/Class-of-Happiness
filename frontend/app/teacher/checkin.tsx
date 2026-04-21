import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, Alert, TextInput, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

type FeelingZone = 'blue' | 'green' | 'yellow' | 'red';

const ZONE_COLORS: Record<FeelingZone, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};

const ZONES: Array<{ id: FeelingZone; label: string; emoji: string; color: string }> = [
  { id: 'blue', label: 'Low energy', emoji: '😔', color: '#4A90D9' },
  { id: 'green', label: 'Steady', emoji: '🙂', color: '#4CAF50' },
  { id: 'yellow', label: 'Stressed', emoji: '😟', color: '#FFC107' },
  { id: 'red', label: 'Overloaded', emoji: '😣', color: '#F44336' },
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

export default function TeacherCheckInScreen() {
  const router = useRouter();
  const { user } = useApp();
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
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

  useEffect(() => { loadData(); loadAdminStrategies(); }, []);

  const loadAdminStrategies = async () => {
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/admin/teacher-strategies`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Merge DB strategies with hardcoded ones
          setAdminStrategies(data);
        }
      }
    } catch {}
  };

  const loadData = async () => {
    if (!user?.user_id) return;
    try {
      const raw = await AsyncStorage.getItem(`teacher_checkins_${user.user_id}`);
      const checkins = raw ? JSON.parse(raw) : [];
      setHistory(checkins.slice(0, 10));

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
    } catch {}
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
    const newFromDB = fromDB.filter(s => !hardcodedNames.has(s.name.toLowerCase()));
    return [...hardcoded, ...newFromDB.map(s => ({...s, id: s.id, icon: s.icon || 'star'}))];
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
        } catch {}
      }

      await loadData();
      setSelectedZone(null);
      setSelectedStrategies([]);
      setNotes('');
      setShareWithWellbeing(false);
      Alert.alert('✅ Saved', shareWithWellbeing ? 'Check-in saved and shared with your wellbeing support team.' : 'Your check-in has been recorded privately.');
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
    } catch {}
    setShowAlertModal(false);
    setAlertMessage('');
    setSendingAlert(false);
    Alert.alert('📨 Alert Sent', 'Your wellbeing support team has been notified. Someone will reach out to you soon.', [{ text: 'Thank you' }]);
  };

  const getStrategyName = (id: string) => ALL_STRATEGIES.find(s => s.id === id)?.name || id;

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  };

  const zoneConfig = selectedZone ? ZONES.find(z => z.id === selectedZone) : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teacher Check-In</Text>
        <TouchableOpacity style={styles.alertBtn} onPress={() => setShowAlertModal(true)}>
          <MaterialIcons name="notifications-active" size={18} color="white" />
          <Text style={styles.alertBtnText}>Support</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* STEP 1: Colour Selection */}
        <Text style={styles.sectionLabel}>Select your emotion colour</Text>
        <View style={styles.zonesStack}>
          {ZONES.map(zone => (
            <TouchableOpacity
              key={zone.id}
              style={[styles.zoneBtn, { backgroundColor: zone.color }, selectedZone === zone.id && styles.zoneBtnSelected]}
              onPress={() => { setSelectedZone(zone.id); setSelectedStrategies([]); }}
              activeOpacity={0.85}
            >
              <Text style={styles.zoneEmoji}>{zone.emoji}</Text>
              <Text style={styles.zoneBtnLabel}>{zone.label}</Text>
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
                <View style={[styles.strategyIcon, { backgroundColor: zoneConfig?.color + '25' }]}>
                  <MaterialIcons name={s.icon as any} size={22} color={zoneConfig?.color} />
                </View>
                <View style={styles.strategyText}>
                  <Text style={styles.strategyName}>{s.name}</Text>
                  <Text style={styles.strategyDesc}>{s.description}</Text>
                </View>
                {selectedStrategies.includes(s.id) && <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color} />}
              </TouchableOpacity>
            ))}

            {/* Custom personal strategies */}
            {customStrategies.length > 0 && (
              <>
                <Text style={styles.customStratLabel}>Your personal strategies</Text>
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
              <Text style={styles.addStrategyText}>Add your own strategy</Text>
            </TouchableOpacity>
            {showAddStrategy && (
              <View style={styles.addStrategyForm}>
                <TextInput style={styles.addStrategyInput} placeholder="Strategy name..." value={newStrategyName} onChangeText={setNewStrategyName} placeholderTextColor="#AAA" />
                <TextInput style={styles.addStrategyInput} placeholder="Description (optional)..." value={newStrategyDesc} onChangeText={setNewStrategyDesc} placeholderTextColor="#AAA" />
                <TouchableOpacity style={styles.addStrategySubmit} onPress={saveCustomStrategy}>
                  <Text style={styles.addStrategySubmitText}>Save Strategy</Text>
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
                  {shareWithWellbeing ? '📨 Share with wellbeing support' : '🔒 Keep private (default)'}
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

            {/* Save button */}            {/* Save button */}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: zoneConfig?.color }]}
              onPress={saveCheckIn}
              disabled={saving}
            >
              <MaterialIcons name="check" size={22} color="white" />
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Check-in'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* STEP 3: Weekly Calendar — always visible at bottom */}
        <View style={styles.weekCard}>
          <Text style={styles.weekTitle}>📅 This week</Text>
          <View style={styles.weekRow}>
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
          </View>
        </View>

        {/* STEP 4: Check-in History */}
        {history.length > 0 && (
          <View style={styles.historySection}>
            <Text style={styles.sectionLabel}>Your recent check-ins</Text>
            {history.map((entry, i) => (
              <View key={entry.id || i} style={styles.historyCard}>
                <View style={[styles.historyDot, { backgroundColor: ZONE_COLORS[entry.zone as FeelingZone] || '#CCC' }]}>
                  <Text style={styles.historyEmoji}>
                    {ZONES.find(z => z.id === entry.zone)?.emoji || '🙂'}
                  </Text>
                </View>
                <View style={styles.historyInfo}>
                  <View style={styles.historyRow}>
                    <Text style={[styles.historyZone, { color: ZONE_COLORS[entry.zone as FeelingZone] }]}>
                      {ZONES.find(z => z.id === entry.zone)?.label || entry.zone}
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
      </ScrollView>

      {/* Wellbeing Alert Modal */}
      <Modal visible={showAlertModal} transparent animationType="slide" onRequestClose={() => setShowAlertModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <MaterialIcons name="notifications-active" size={24} color="#F44336" />
              <Text style={styles.modalTitle}>Request Wellbeing Support</Text>
              <TouchableOpacity onPress={() => setShowAlertModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Your principal, psychologist, or wellbeing lead will be notified privately and confidentially.
            </Text>
            <Text style={styles.inputLabel}>Your message</Text>
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
              🔒 This message is private. Only your designated wellbeing support staff will see it.
            </Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  backBtn: { padding: 8, marginRight: 8 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#333' },
  alertBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F44336', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 6 },
  alertBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  scroll: { padding: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#444', marginBottom: 10, marginTop: 8 },
  zonesStack: { gap: 8, marginBottom: 20 },
  zoneBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18, borderRadius: 14, gap: 12 },
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
  weekTitle: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 12 },
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
  shareToggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12, gap: 12, borderWidth: 1, borderColor: '#E0E0E0' },
  shareToggleText: { flex: 1 },
  shareToggleTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  shareToggleDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  toggleSwitch: { width: 44, height: 24, borderRadius: 12, backgroundColor: '#E0E0E0', justifyContent: 'center', padding: 2 },
  toggleSwitchOn: { backgroundColor: '#F44336' },
  toggleKnob: { width: 20, height: 20, borderRadius: 10, backgroundColor: 'white' },
  toggleKnobOn: { alignSelf: 'flex-end' },
  customStratLabel: { fontSize: 13, fontWeight: '600', color: '#5C6BC0', marginBottom: 8, marginTop: 4 },
  addStrategyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, marginBottom: 8 },
  addStrategyText: { fontSize: 14, color: '#5C6BC0', fontWeight: '600' },
  addStrategyForm: { backgroundColor: 'white', borderRadius: 12, padding: 12, marginBottom: 12, gap: 8, borderWidth: 1, borderColor: '#E8EAF6' },
  addStrategyInput: { backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 14, color: '#333' },
  addStrategySubmit: { backgroundColor: '#5C6BC0', borderRadius: 8, padding: 10, alignItems: 'center' },
  addStrategySubmitText: { color: 'white', fontWeight: '600', fontSize: 14 },
});
