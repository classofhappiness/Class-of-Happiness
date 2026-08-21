// My Creatures — real collection screen showing creatures this student has started/finished
// unlocking, via the real GET /creatures/my-unlocks endpoint.
// Real bug fix Aug 21: previously called a nonexistent `/api/creatures/student/${studentId}`
// endpoint and an undefined `authToken`/`onBack` — this screen has never worked, and had zero
// call sites anywhere in the app (fully orphaned). Rewritten against the real endpoint and
// linked from World Creatures ("My Collection" button) so it's actually reachable.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { creaturesApi } from '../../src/utils/api';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};
const EMOTION_EMOJI: Record<string, string> = {
  green: '😊', blue: '😔', yellow: '😬', red: '😤'
};

interface UnlockRow {
  id: string;
  creature_id: string;
  stages_unlocked: number;
  completed_at?: string | null;
  creature_submissions?: {
    id: string;
    creature_name: string;
    emotion_colour: string;
    stage1_url?: string;
    stage2_url?: string;
    stage3_url?: string;
    stage4_url?: string;
  } | null;
}

export default function CreatureCollectionScreen() {
  const [unlocks, setUnlocks] = useState<UnlockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { t, currentStudent } = useApp();
  const studentId = (currentStudent as any)?.student_id || currentStudent?.id;

  useEffect(() => {
    fetchUnlocks();
  }, [studentId]);

  const fetchUnlocks = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await creaturesApi.getMyUnlocks(studentId);
      setUnlocks((data || []).filter((u: UnlockRow) => u.creature_submissions));
    } catch (err) {
      setError('Could not load your creatures. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCreature = ({ item }: { item: UnlockRow }) => {
    const c = item.creature_submissions!;
    const stage = Math.max(1, Math.min(4, item.stages_unlocked || 1));
    const imgUrl = (c as any)[`stage${stage}_url`] || c.stage1_url;
    const fullyEvolved = item.stages_unlocked >= 4;
    return (
      <View style={[styles.card, { borderTopColor: EMOTION_COLORS[c.emotion_colour], borderTopWidth: 3 }]}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={styles.imgWrap} />
        ) : (
          <Text style={styles.emoji}>{EMOTION_EMOJI[c.emotion_colour] || '🐾'}</Text>
        )}
        <Text style={styles.name}>{c.creature_name}</Text>
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map(s => (
            <View key={s} style={[styles.progressDot, { backgroundColor: item.stages_unlocked >= s ? EMOTION_COLORS[c.emotion_colour] : '#E5E5E5' }]} />
          ))}
        </View>
        <Text style={fullyEvolved ? styles.fullyEvolved : styles.inProgress}>
          {fullyEvolved ? (t('unlocked') || 'Fully evolved!') : `Stage ${item.stages_unlocked} / 4`}
        </Text>
      </View>
    );
  };

  const totalFullyEvolved = unlocks.filter(u => u.stages_unlocked >= 4).length;
  const goToWorld = () => router.push('/student/world-creatures');
  const goToSubmit = () => router.push('/student/submit-creature');

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('my_creatures') || 'My Creatures'} showHome />
      <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0 }}>
        <TouchableOpacity style={styles.actionBtnDark} onPress={goToSubmit}>
          <Text style={styles.actionBtnDarkText}>🎨 Submit a Creature</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnGreen} onPress={goToWorld}>
          <Text style={styles.actionBtnGreenText}>🌍 World Creatures</Text>
        </TouchableOpacity>
      </View>

      {!loading && !error && (
        <Text style={styles.countText}>
          {totalFullyEvolved} / {unlocks.length} {t('unlocked') || 'fully evolved'}
        </Text>
      )}

      {loading ? (
        <View style={styles.loader}><EmotionColourLoader visible={loading} /></View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchUnlocks} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('try_again') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={unlocks}
          keyExtractor={item => item.id}
          renderItem={renderCreature}
          numColumns={2}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No creatures started yet — head to World Creatures to begin one! 🌍</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6FF',
  },
  actionBtnDark: { flex: 1, backgroundColor: '#1A1A2E', borderRadius: 50, padding: 12, alignItems: 'center' },
  actionBtnDarkText: { color: '#FFD93D', fontWeight: '900', fontSize: 13 },
  actionBtnGreen: { flex: 1, backgroundColor: '#4CAF73', borderRadius: 50, padding: 12, alignItems: 'center' },
  actionBtnGreenText: { color: 'white', fontWeight: '900', fontSize: 13 },
  countText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#888',
    marginTop: 12,
    marginBottom: 4,
  },
  list: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 40,
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  imgWrap: { width: '100%', aspectRatio: 1, marginBottom: 8, borderRadius: 10, backgroundColor: '#F5F5F5' },
  emoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2D2D44',
    textAlign: 'center',
    marginBottom: 6,
  },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  fullyEvolved: { fontSize: 12, fontWeight: '800', color: '#4CAF73' },
  inProgress: { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  loader: {
    marginTop: 80,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#E05C5C',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: '#FFF',
    fontWeight: '600',
  },
  emptyText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 60,
    padding: 20,
  },
});
