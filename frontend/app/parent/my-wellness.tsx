import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity,
  TextInput, Alert, KeyboardAvoidingView, Platform, Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';

const ZONE_CONFIG = [
  { id: 'green',  emoji: '😊', color: '#4CAF50', bg: '#E8F5E9', labelKey: 'wellness_ok' },
  { id: 'blue',   emoji: '😔', color: '#4A90D9', bg: '#EBF3FB', labelKey: 'wellness_low' },
  { id: 'yellow', emoji: '😟', color: '#FFC107', bg: '#FFF8E1', labelKey: 'wellness_stressed' },
  { id: 'red',    emoji: '😣', color: '#F44336', bg: '#FFEBEE', labelKey: 'wellness_overwhelmed' },
];

const STRATEGIES = [
  { emoji: '🌬️', key: 'strat_box_breathing_name', fallback: 'Box Breathing', descKey: 'strat_box_breathing_desc', desc: 'Breathe in 4, hold 4, out 4, hold 4.' },
  { emoji: '🚶', key: 'strat_movement_name', fallback: '5 Minute Walk', descKey: 'strat_movement_desc', desc: 'Step outside for 5 minutes. Fresh air resets everything.' },
  { emoji: '☕', key: 'strat_warm_drink_name', fallback: 'Warm Drink Ritual', descKey: 'strat_warm_drink_desc', desc: 'Make something warm. Slow down for 3 minutes.' },
  { emoji: '✍️', key: 'strat_journal_name', fallback: 'Write It Down', descKey: 'strat_journal_desc', desc: 'Write one sentence about how you feel right now.' },
  { emoji: '💪', key: 'strat_regulate_name', fallback: 'Take a Breath First', descKey: 'strat_regulate_desc', desc: 'One slow breath before responding to anything.' },
  { emoji: '🙏', key: 'strat_gratitude_name', fallback: 'Gratitude Moment', descKey: 'strat_gratitude_desc', desc: 'Name one thing you appreciate right now.' },
];

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const ZONE_COLORS: Record<string, string> = {
  green: '#4CAF50', blue: '#4A90D9', yellow: '#FFC107', red: '#F44336',
};

export default function MyWellnessScreen() {
  const router = useRouter();
  const { t, user } = useApp();
  const userId = user?.user_id || 'default';

  const [pinSetup, setPinSetup] = useState(false);
  const [pinUnlocked, setPinUnlocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinStep, setPinStep] = useState<'enter' | 'setup' | 'confirm'>('enter');

  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [weekData, setWeekData] = useState<Array<{ zone: string | null; day: string }>>([]);
  const [streak, setStreak] = useState(0);
  const [expandedStrategy, setExpandedStrategy] = useState<number | null>(null);

  const PIN_KEY = `wellness_pin_${userId}`;
  const DATA_KEY = `wellness_data_${userId}`;

  useEffect(() => {
    checkPin();
  }, []);

  const checkPin = async () => {
    const pin = await AsyncStorage.getItem(PIN_KEY);
    if (pin) {
      setPinSetup(true);
      setPinStep('enter');
    } else {
      setPinSetup(false);
      setPinStep('setup');
    }
  };

  const handlePinInput = (digit: string) => {
    if (pinStep === 'setup') {
      const next = pinInput + digit;
      if (next.length <= 4) {
        setPinInput(next);
        if (next.length === 4) setPinStep('confirm');
      }
    } else if (pinStep === 'confirm') {
      const next = pinConfirm + digit;
      if (next.length <= 4) {
        setPinConfirm(next);
        if (next.length === 4) {
          if (next === pinInput) {
            AsyncStorage.setItem(PIN_KEY, pinInput);
            setPinUnlocked(true);
            loadData();
          } else {
            Alert.alert(t('wellness_pin_mismatch') || 'PINs do not match');
            setPinInput('');
            setPinConfirm('');
            setPinStep('setup');
          }
        }
      }
    } else {
      // Entering existing PIN
      const next = pinInput + digit;
      if (next.length <= 4) {
        setPinInput(next);
        if (next.length === 4) {
          AsyncStorage.getItem(PIN_KEY).then(stored => {
            if (next === stored) {
              setPinUnlocked(true);
              loadData();
            } else {
              Alert.alert(t('wellness_pin_wrong') || 'Incorrect PIN');
              setPinInput('');
            }
          });
        }
      }
    }
  };

  const handlePinDelete = () => {
    if (pinStep === 'confirm') {
      setPinConfirm(pinConfirm.slice(0, -1));
    } else {
      setPinInput(pinInput.slice(0, -1));
    }
  };

  const loadData = async () => {
    const raw = await AsyncStorage.getItem(DATA_KEY);
    const entries: Array<{ zone: string; note: string; date: string }> = raw ? JSON.parse(raw) : [];

    // Build week data
    const today = new Date();
    const week = [];
    let currentStreak = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const entry = entries.find(e => e.date === dateKey);
      week.push({ zone: entry?.zone || null, day: DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1] });
    }
    setWeekData(week);

    // Calculate streak
    for (let i = 0; i < entries.length; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      if (entries.find(e => e.date === key)) currentStreak++;
      else break;
    }
    setStreak(currentStreak);
  };

  const handleCheckin = async () => {
    if (!selectedZone) return;
    setSaving(true);
    const raw = await AsyncStorage.getItem(DATA_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    const today = new Date().toISOString().split('T')[0];
    // Remove today's entry if exists
    const filtered = entries.filter((e: any) => e.date !== today);
    filtered.unshift({ zone: selectedZone, note: note.trim(), date: today });
    // Keep last 90 days
    await AsyncStorage.setItem(DATA_KEY, JSON.stringify(filtered.slice(0, 90)));
    setSaving(false);
    setSelectedZone(null);
    setNote('');
    Alert.alert(t('wellness_saved') || 'Saved 💙');
    loadData();
  };

  // PIN Screen
  if (!pinUnlocked) {
    const currentPin = pinStep === 'confirm' ? pinConfirm : pinInput;
    const pinLabel = pinStep === 'setup'
      ? (t('wellness_pin_setup') || 'Create your private PIN')
      : pinStep === 'confirm'
      ? (t('wellness_pin_confirm') || 'Confirm PIN')
      : (t('wellness_pin_enter') || 'Enter your PIN');

    return (
      <SafeAreaView style={styles.pinContainer}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>

        <View style={styles.pinContent}>
          <Text style={styles.pinLock}>🔒</Text>
          <Text style={styles.pinTitle}>{t('my_wellness') || 'My Wellness'}</Text>
          <Text style={styles.pinLabel}>{pinLabel}</Text>
          {pinStep === 'setup' && (
            <Text style={styles.pinDesc}>{t('wellness_pin_desc') || 'Only you can see this.'}</Text>
          )}

          {/* PIN dots */}
          <View style={styles.pinDots}>
            {[0, 1, 2, 3].map(i => (
              <View key={i} style={[styles.pinDot, currentPin.length > i && styles.pinDotFilled]} />
            ))}
          </View>

          {/* Numpad */}
          <View style={styles.numpad}>
            {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((d, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.numKey, d === '' && { opacity: 0 }]}
                onPress={() => d === '⌫' ? handlePinDelete() : d && handlePinInput(d)}
                disabled={d === ''}
              >
                <Text style={styles.numKeyText}>{d}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Main wellness screen
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('my_wellness') || 'My Wellness'} 🔒</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* Streak */}
          {streak > 0 && (
            <View style={styles.streakBanner}>
              <Text style={styles.streakText}>🔥 {streak} {t('wellness_streak') || 'day streak'}</Text>
            </View>
          )}

          {/* Check-in */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('wellness_checkin_title') || 'How are you feeling?'}</Text>
            <View style={styles.zoneGrid}>
              {ZONE_CONFIG.map(zone => (
                <TouchableOpacity
                  key={zone.id}
                  style={[styles.zoneBtn, { backgroundColor: zone.bg, borderColor: zone.color },
                    selectedZone === zone.id && { borderWidth: 3, backgroundColor: zone.color }
                  ]}
                  onPress={() => setSelectedZone(zone.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.zoneEmoji}>{zone.emoji}</Text>
                  <Text style={[styles.zoneLabel, selectedZone === zone.id && { color: 'white' }]}>
                    {t(zone.labelKey) || zone.labelKey}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedZone && (
              <>
                <TextInput
                  style={styles.noteInput}
                  placeholder={t('wellness_checkin_note_ph') || "What's on your mind today?"}
                  placeholderTextColor="#AAA"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  numberOfLines={3}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleCheckin}
                  disabled={saving}
                >
                  <MaterialIcons name="check" size={20} color="white" />
                  <Text style={styles.saveBtnText}>{saving ? '...' : (t('save') || 'Save')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Weekly graph */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('wellness_history') || 'My Week'}</Text>
            <View style={styles.weekRow}>
              {weekData.map((d, i) => (
                <View key={i} style={styles.dayCol}>
                  <View style={[styles.dayDot, {
                    backgroundColor: d.zone ? ZONE_COLORS[d.zone] : '#E0E0E0'
                  }]}>
                    {d.zone && (
                      <Text style={{ fontSize: 12 }}>
                        {ZONE_CONFIG.find(z => z.id === d.zone)?.emoji}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.dayLabel}>{d.day}</Text>
                </View>
              ))}
            </View>
            {weekData.every(d => !d.zone) && (
              <Text style={styles.noData}>{t('wellness_no_data') || 'No check-ins yet this week'}</Text>
            )}
          </View>

          {/* Strategies */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('wellness_strategies') || 'Quick Support'}</Text>
            {STRATEGIES.map((s, i) => (
              <TouchableOpacity
                key={i}
                style={styles.stratItem}
                onPress={() => setExpandedStrategy(expandedStrategy === i ? null : i)}
                activeOpacity={0.8}
              >
                <View style={styles.stratRow}>
                  <Text style={styles.stratEmoji}>{s.emoji}</Text>
                  <Text style={styles.stratName}>{t(s.key) || s.fallback}</Text>
                  <MaterialIcons
                    name={expandedStrategy === i ? 'expand-less' : 'expand-more'}
                    size={20} color="#999"
                  />
                </View>
                {expandedStrategy === i && (
                  <Text style={styles.stratDesc}>{t(s.descKey) || s.desc}</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', backgroundColor: 'white' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  scroll: { padding: 16, gap: 16 },
  streakBanner: { backgroundColor: '#FFF3E0', borderRadius: 12, padding: 12, alignItems: 'center' },
  streakText: { fontSize: 16, fontWeight: '700', color: '#E65100' },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 14 },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  zoneBtn: { width: '47%', padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 2 },
  zoneEmoji: { fontSize: 28, marginBottom: 4 },
  zoneLabel: { fontSize: 13, fontWeight: '600', color: '#444', textAlign: 'center' },
  noteInput: { marginTop: 14, backgroundColor: '#F5F5F5', borderRadius: 12, padding: 12, fontSize: 14, color: '#333', minHeight: 70, textAlignVertical: 'top' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, marginTop: 12, gap: 8 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: 'white' },
  weekRow: { flexDirection: 'row', justifyContent: 'space-between' },
  dayCol: { alignItems: 'center', gap: 6 },
  dayDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayLabel: { fontSize: 11, color: '#888' },
  noData: { textAlign: 'center', color: '#AAA', fontSize: 13, marginTop: 8 },
  stratItem: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0', paddingVertical: 12 },
  stratRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stratEmoji: { fontSize: 20, width: 30 },
  stratName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#333' },
  stratDesc: { marginTop: 8, fontSize: 13, color: '#666', lineHeight: 20, paddingLeft: 40 },
  backBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 8 },
  pinContainer: { flex: 1, backgroundColor: '#F8F9FA' },
  pinContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  pinLock: { fontSize: 48, marginBottom: 8 },
  pinTitle: { fontSize: 24, fontWeight: '800', color: '#333', marginBottom: 4 },
  pinLabel: { fontSize: 16, color: '#555', marginBottom: 6, textAlign: 'center' },
  pinDesc: { fontSize: 13, color: '#999', textAlign: 'center', marginBottom: 24, paddingHorizontal: 20 },
  pinDots: { flexDirection: 'row', gap: 16, marginBottom: 40, marginTop: 16 },
  pinDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#5C6BC0', backgroundColor: 'transparent' },
  pinDotFilled: { backgroundColor: '#5C6BC0' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 12 },
  numKey: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  numKeyText: { fontSize: 22, fontWeight: '600', color: '#333' },
});
