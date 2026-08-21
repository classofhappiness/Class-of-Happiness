import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { creaturesApi } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};
const EMOTION_EMOJI: Record<string, string> = {
  green: '😊', blue: '😔', yellow: '😬', red: '😤'
};

export default function GlobalCreaturesScreen() {
  const { t, currentStudent } = useApp();
  const router = useRouter();
  const [creatures, setCreatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [unlockingId, setUnlockingId] = useState<string | null>(null);
  const [scopePref, setScopePref] = useState<string>('any');
  const [hasClassroom, setHasClassroom] = useState(false);
  const [scopeChanging, setScopeChanging] = useState(false);

  const studentId = (currentStudent as any)?.student_id || currentStudent?.id;

  const load = async () => {
    try {
      const data = await creaturesApi.getEligible(studentId);
      setCreatures(data?.creatures || []);
      setScopePref(data?.scope_pref || 'any');
      setHasClassroom(!!data?.has_classroom);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [studentId]);

  // Real feature Aug 21: student scope-preference (classroom/school/global/any) - "classroom"
  // is labelled "My Family" when the student has no classroom (a home-only family member),
  // since visibility_scope only has classroom/school/global values and there's no separate
  // "family" scope - this reuses "classroom" as the closest real match for a home context.
  const SCOPE_OPTIONS = [
    { key: 'any', label: 'Any' },
    { key: 'classroom', label: hasClassroom ? 'My Classroom' : 'My Family' },
    { key: 'school', label: 'My School' },
    { key: 'global', label: 'Global' },
  ];

  const handleScopeChange = async (pref: string) => {
    if (!studentId || pref === scopePref) return;
    setScopeChanging(true);
    setScopePref(pref);
    try {
      await creaturesApi.setScopePref(studentId, pref);
      await load();
    } catch (e) {}
    setScopeChanging(false);
  };

  const filtered = filter === 'all' ? creatures : creatures.filter(c => c.emotion_colour === filter);

  const handleUnlock = async (item: any) => {
    if (!studentId) return;
    setUnlockingId(item.id);
    try {
      const res = await creaturesApi.unlockStage(item.id, studentId);
      if (typeof res?.stages_unlocked === 'number') {
        setCreatures(prev => prev.map(c => c.id === item.id ? { ...c, my_stages_unlocked: res.stages_unlocked } : c));
      }
      if (res?.message) Alert.alert(res.stages_unlocked > (item.my_stages_unlocked || 0) ? (t('unlocked') || 'Unlocked!') : (t('keep_going') || 'Keep going!'), res.message);
    } catch (e) {
      Alert.alert(t('error') || 'Error', 'Could not unlock this creature right now.');
    }
    setUnlockingId(null);
  };

  const renderCreature = ({ item }: { item: any }) => {
    const stage = Math.max(1, item.my_stages_unlocked || 0) as 1 | 2 | 3 | 4;
    const imgUrl = item[`stage${Math.min(stage, 4)}_url`] || item.stage1_url;
    const fullyEvolved = (item.my_stages_unlocked || 0) >= 4;
    return (
      <View style={[styles.card, { borderTopColor: EMOTION_COLORS[item.emotion_colour], borderTopWidth: 3 }]}>
        <Image source={{ uri: imgUrl }} style={styles.creatureImg} />
        <View style={styles.cardBody}>
          <Text style={styles.creatureName}>{item.creature_name}</Text>
          <Text style={styles.emotionTag}>
            {EMOTION_EMOJI[item.emotion_colour]} {item.emotion_colour.charAt(0).toUpperCase() + item.emotion_colour.slice(1)} Emotions
          </Text>
          {item.classroom_name ? <Text style={styles.creatorInfo}>🏫 {item.classroom_name}</Text> : null}
          <View style={styles.progressRow}>
            {[1, 2, 3, 4].map(s => (
              <View key={s} style={[styles.progressDot, { backgroundColor: (item.my_stages_unlocked || 0) >= s ? EMOTION_COLORS[item.emotion_colour] : '#E5E5E5' }]} />
            ))}
          </View>
          {fullyEvolved ? (
            <Text style={styles.fullyEvolved}>🏆 Fully evolved!</Text>
          ) : (
            <TouchableOpacity
              disabled={unlockingId === item.id}
              onPress={() => handleUnlock(item)}
              style={[styles.unlockBtn, { backgroundColor: EMOTION_COLORS[item.emotion_colour] }]}>
              {unlockingId === item.id ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={styles.unlockBtnText}>{(item.my_stages_unlocked || 0) > 0 ? (t('keep_going') || 'Keep Going!') : (t('start') || 'Start')}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/student/creatures')} style={styles.collectionBtn}>
            <Text style={styles.collectionBtnText}>🐾 {t('my_creatures') || 'My Collection'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>🌍 World Creatures</Text>
        <Text style={styles.subtitle}>Creatures you can work toward</Text>
      </View>
      {studentId ? (
        <View style={styles.scopeRow}>
          {SCOPE_OPTIONS.map(o => (
            <TouchableOpacity key={o.key}
              disabled={scopeChanging}
              style={[styles.scopeBtn, scopePref === o.key && styles.scopeBtnActive]}
              onPress={() => handleScopeChange(o.key)}>
              <Text style={[styles.scopeBtnText, scopePref === o.key && styles.scopeBtnTextActive]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      <View style={styles.filterRow}>
        {['all','green','blue','yellow','red'].map(f => (
          <TouchableOpacity key={f}
            style={[styles.filterBtn, filter===f && { backgroundColor: f==='all'?'#1A1A2E':EMOTION_COLORS[f] }]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter===f && { color: f==='yellow'?'#333':'white' }]}>
              {f==='all'?'All':`${EMOTION_EMOJI[f]||''} ${f.charAt(0).toUpperCase()+f.slice(1)}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={{ marginTop: 60, alignItems: 'center' }}><EmotionColourLoader visible size={64} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderCreature}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No creatures available to you yet — be the first to submit one! 🦕</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { backgroundColor: '#1A1A2E', padding: 20, paddingTop: 50 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  backBtn: { padding: 4 },
  collectionBtn: { backgroundColor: 'rgba(255,255,255,.12)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 50 },
  collectionBtnText: { color: '#FFD93D', fontWeight: '800', fontSize: 12 },
  title: { fontSize: 24, fontWeight: '900', color: '#FFD93D' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 4 },
  scopeRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4, backgroundColor: 'white' },
  scopeBtn: { flex: 1, paddingVertical: 6, borderRadius: 50, backgroundColor: '#F0F0F0', alignItems: 'center' },
  scopeBtnActive: { backgroundColor: '#5C6BC0' },
  scopeBtnText: { fontSize: 10, fontWeight: '800', color: '#666' },
  scopeBtnTextActive: { color: 'white' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 50, backgroundColor: '#F0F0F0' },
  filterText: { fontSize: 12, fontWeight: '800', color: '#666' },
  list: { padding: 12, paddingBottom: 40 },
  row: { gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  creatureImg: { width: '100%', aspectRatio: 1, backgroundColor: '#F5F5F5' },
  cardBody: { padding: 10 },
  creatureName: { fontSize: 14, fontWeight: '900', color: '#1A1A2E', marginBottom: 4 },
  emotionTag: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 3 },
  creatorInfo: { fontSize: 10, color: '#9CA3AF', marginBottom: 4 },
  progressRow: { flexDirection: 'row', gap: 4, marginTop: 2, marginBottom: 8 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  fullyEvolved: { fontSize: 11, fontWeight: '800', color: '#4CAF73' },
  unlockBtn: { paddingVertical: 8, borderRadius: 50, alignItems: 'center' },
  unlockBtnText: { color: 'white', fontWeight: '800', fontSize: 12 },
  empty: { textAlign: 'center', color: '#9CA3AF', fontSize: 15, fontWeight: '700', marginTop: 80, padding: 20 },
});
