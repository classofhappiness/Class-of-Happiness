// My Creatures — the real, unified, permanent collection: every creature (default per-colour
// AND community) a student has ever started or fully evolved, via GET /students/{id}/my-creatures.
// Real redesign Aug 21: replaces three previously-separate "My Creatures" surfaces (a
// defaults-only modal on the reward screen, this screen's earlier community-only version, and
// nothing that showed both together) with one Pokedex-style view. A creature leaving "active"
// status is never removed - it just stays here as permanent history. 4 colour sections,
// collapsed by default (matches the app's existing collapsed-by-default pattern), tap to
// expand. A real total-collected count up top, and a direct shortcut to browse/start a new
// creature by scope (Family/School/Global) without having to check in first.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { creaturesApi } from '../../src/utils/api';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { AnimatedCreatureVisual } from '../../src/components/AnimatedCreatureVisual';
import { CreatureDetailModal, CreatureDetailEntry } from '../../src/components/CreatureDetailModal';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};
const EMOTION_EMOJI: Record<string, string> = {
  green: '😊', blue: '😔', yellow: '😬', red: '😤'
};
const COLOUR_ORDER = ['blue', 'green', 'yellow', 'red'];
const COLOUR_LABEL: Record<string, string> = {
  blue: 'Blue', green: 'Green', yellow: 'Yellow', red: 'Red',
};

interface CreatureEntry {
  type: 'default' | 'community';
  id: string;
  name: string;
  emoji?: string | null;
  stage_image?: string | null;
  stage_emojis?: string[];
  stage_urls?: (string | null)[];
  current_stage: number;
  max_stage: number;
  is_complete: boolean;
  is_active: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  was_featured?: boolean;
  featured_until?: string | null;
}

export default function CreatureCollectionScreen() {
  const [colours, setColours] = useState<Record<string, CreatureEntry[]>>({});
  const [totalCollected, setTotalCollected] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailEntry, setDetailEntry] = useState<CreatureDetailEntry | null>(null);
  const [detailColour, setDetailColour] = useState<string>('blue');
  const router = useRouter();
  const { t, currentStudent } = useApp();
  const studentId = (currentStudent as any)?.student_id || currentStudent?.id;

  useEffect(() => {
    fetchMyCreatures();
  }, [studentId]);

  const fetchMyCreatures = async () => {
    if (!studentId) { setLoading(false); return; }
    try {
      setLoading(true);
      setError(null);
      const data = await creaturesApi.getMyCreatures(studentId);
      setColours(data?.colours || {});
      setTotalCollected(data?.total_collected || 0);
    } catch (err) {
      setError('Could not load your creatures. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const toggleColour = (colour: string) => {
    setExpanded(prev => ({ ...prev, [colour]: !prev[colour] }));
  };

  const renderEntry = (item: CreatureEntry, colour: string) => {
    const expired = item.was_featured && item.featured_until && new Date(item.featured_until) < new Date();
    const imgUrl = item.type === 'community' ? item.stage_image : null;
    return (
      <TouchableOpacity
        key={`${item.type}-${item.id}`}
        style={[styles.card, { borderColor: EMOTION_COLORS[colour], borderWidth: item.is_active ? 2 : 1 }]}
        onPress={() => { setDetailColour(colour); setDetailEntry(item); }}
      >
        <View style={styles.imgWrap}>
          <AnimatedCreatureVisual
            zone={colour}
            size={64}
            unlocked={item.current_stage > 0 || item.is_complete}
            emoji={item.type === 'default' ? item.emoji : undefined}
            imageUrl={imgUrl || undefined}
          />
        </View>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.is_active ? <Text style={styles.activeBadge}>{t('active_badge') || '★ Active'}</Text> : null}
        {item.was_featured ? (
          <Text style={styles.limitedBadge}>{expired ? (t('limited_edition_expired') || '⭐ Limited Edition (expired)') : (t('limited_edition') || '⭐ Limited Edition')}</Text>
        ) : null}
        <View style={styles.progressRow}>
          {Array.from({ length: item.max_stage }, (_, i) => i + 1).map(s => (
            <View key={s} style={[styles.progressDot, { backgroundColor: item.current_stage >= s ? EMOTION_COLORS[colour] : '#E5E5E5' }]} />
          ))}
        </View>
        <Text style={item.is_complete ? styles.fullyEvolved : styles.inProgress}>
          {item.is_complete ? (t('fully_evolved') || '🏆 Fully evolved!') : `${t('stage') || 'Stage'} ${item.current_stage} / ${item.max_stage}`}
        </Text>
      </TouchableOpacity>
    );
  };

  const goToWorld = () => router.push('/student/world-creatures');
  const goToSubmit = () => router.push('/student/submit-creature');

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('my_creatures') || 'My Creatures'} showHome />

      {!loading && !error && (
        <Text style={styles.countText}>🏆 {totalCollected} {t('creatures_collected') || 'creatures collected'}</Text>
      )}

      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 4 }}>
        <TouchableOpacity style={styles.actionBtnDark} onPress={goToSubmit}>
          <Text style={styles.actionBtnDarkText}>🎨 {t('submit_creature') || 'Submit a Creature'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnGreen} onPress={goToWorld}>
          <Text style={styles.actionBtnGreenText}>{t('find_new_creature') || '🔍 Find a New Creature'}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loader}><EmotionColourLoader visible={loading} /></View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchMyCreatures} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('try_again') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {COLOUR_ORDER.map(colour => {
            const entries = colours[colour] || [];
            const collectedInColour = entries.filter(e => e.is_complete).length;
            const isOpen = !!expanded[colour];
            return (
              <View key={colour} style={styles.section}>
                <TouchableOpacity
                  style={[styles.sectionHeader, { borderLeftColor: EMOTION_COLORS[colour] }]}
                  onPress={() => toggleColour(colour)}
                >
                  <Text style={styles.sectionTitle}>
                    {EMOTION_EMOJI[colour]} {COLOUR_LABEL[colour]} · {collectedInColour}/{entries.length}
                  </Text>
                  <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={26} color="#666" />
                </TouchableOpacity>
                {isOpen && (
                  <View style={styles.sectionBody}>
                    {entries.map(e => renderEntry(e, colour))}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
      <CreatureDetailModal
        visible={!!detailEntry}
        onClose={() => setDetailEntry(null)}
        entry={detailEntry}
        colour={detailColour}
        studentId={studentId}
      />
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
    fontSize: 16,
    fontWeight: '800',
    color: '#333',
    marginTop: 12,
    marginBottom: 8,
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 12,
    backgroundColor: 'white',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderLeftWidth: 4,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#1A1A2E' },
  sectionBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 10,
  },
  card: {
    width: '47%',
    backgroundColor: '#FAFAFA',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  imgWrap: { width: '100%', aspectRatio: 1, marginBottom: 8, borderRadius: 10, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  emoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2D2D44',
    textAlign: 'center',
    marginBottom: 4,
  },
  activeBadge: { fontSize: 10, fontWeight: '800', color: '#5C6BC0', marginBottom: 4 },
  progressRow: { flexDirection: 'row', gap: 4, marginBottom: 6 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },
  fullyEvolved: { fontSize: 11, fontWeight: '800', color: '#4CAF73', textAlign: 'center' },
  limitedBadge: { fontSize: 10, fontWeight: '800', color: '#B8860B', marginBottom: 4 },
  inProgress: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
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
});
