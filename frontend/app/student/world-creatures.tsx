// Real redesign Aug 22: full rebuild per live Expo Go testing findings -
// 1) heading bug fixed (this screen never hid the default stack header, so the raw route
//    name leaked through above the custom one - now uses TranslatedHeader like every other
//    screen, which also gives it the missing COH logo + home button for free).
// 2) 2x2-grid-per-page layout, horizontal paging when a colour has more than 4 creatures,
//    instead of a single vertically-scrolling grid.
// 3) each card auto-cycles through its stage1-4 images as a preview (clearly labelled
//    "Preview" and never touching the real progress dots below it, so a student can't mistake
//    the cycling image for having actually obtained the fully-evolved creature).
// 4) expiry date and country-of-origin (global scope only, 5-contributor privacy threshold)
//    now shown on the card, both newly returned by /creatures/eligible.
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl, Alert, useWindowDimensions, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { creaturesApi } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useZoneMovement } from '../../src/components/AnimatedCreatureVisual';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};
const EMOTION_EMOJI: Record<string, string> = {
  green: '😊', blue: '😔', yellow: '😬', red: '😤'
};

interface ActiveInfo { active_id: string; is_default: boolean; is_fully_evolved: boolean; }

const PAGE_SIZE = 4;
const PREVIEW_INTERVAL_MS = 1400;

function formatExpiry(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// One grid card - owns its own auto-cycling stage preview so each card animates
// independently without affecting the real, separate progress-dot row.
function CreatureCard({
  item, isActive, canStart, starting, onStart, cardWidth,
}: {
  item: any; isActive: boolean; canStart: boolean; starting: boolean; onStart: () => void; cardWidth: number;
}) {
  const { t } = useApp();
  const [previewStage, setPreviewStage] = useState(1);
  const fullyEvolved = (item.my_stages_unlocked || 0) >= 4;
  // Real feature Aug 22 (item 2): restored the old CreatureCollection modal's real per-zone
  // movement variety (sway/hop/shiver/bounce, CreatureCollection.tsx:40-72) - the first pass
  // at this screen only had one generic bounce for every colour, which wasn't the actual old
  // behaviour, just a placeholder approximation of it.
  const { transform: bounceTransform } = useZoneMovement(item.emotion_colour);

  useEffect(() => {
    // Preview only cycles for creatures not yet fully evolved by this student - a fully
    // evolved one just shows its real final stage, nothing to "preview" toward anymore.
    if (fullyEvolved) return;
    const id = setInterval(() => {
      setPreviewStage(prev => (prev % 4) + 1);
    }, PREVIEW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fullyEvolved]);

  const displayStage = fullyEvolved ? 4 : previewStage;
  const imgUrl = item[`stage${displayStage}_url`] || item.stage1_url;
  const expiry = formatExpiry(item.featured_until);

  return (
    <View style={[styles.card, { width: cardWidth, borderTopColor: EMOTION_COLORS[item.emotion_colour], borderTopWidth: 3 }]}>
      <Animated.View style={[styles.imgWrap, { transform: bounceTransform }]}>
        <Image source={{ uri: imgUrl }} style={styles.creatureImg} />
        {!fullyEvolved && (
          <View style={styles.previewBadge}>
            <Text style={styles.previewBadgeText}>👀 {t('preview') || 'Preview'}</Text>
          </View>
        )}
      </Animated.View>
      <View style={styles.cardBody}>
        <Text style={styles.creatureName} numberOfLines={1}>{item.creature_name}</Text>
        <View style={styles.metaRow}>
          {item.classroom_name ? <Text style={styles.metaTag} numberOfLines={1}>🏫 {item.classroom_name}</Text> : null}
          {item.country ? <Text style={styles.metaTag} numberOfLines={1}>🌍 {item.country}</Text> : null}
        </View>
        {expiry ? <Text style={styles.expiryTag}>⏳ {(t('available_until') || 'Available until')} {expiry}</Text> : null}
        <View style={styles.progressRow}>
          {[1, 2, 3, 4].map(s => (
            <View key={s} style={[styles.progressDot, { backgroundColor: (item.my_stages_unlocked || 0) >= s ? EMOTION_COLORS[item.emotion_colour] : '#E5E5E5' }]} />
          ))}
        </View>
        {fullyEvolved ? (
          <Text style={styles.fullyEvolved} numberOfLines={1}>🏆 {t('fully_evolved') || 'Fully evolved!'}</Text>
        ) : isActive ? (
          <Text style={styles.activeHint} numberOfLines={1}>{t('active_checkin_hint') || '★ Active — check in to grow!'}</Text>
        ) : canStart ? (
          <TouchableOpacity
            disabled={starting}
            onPress={onStart}
            style={[styles.unlockBtn, { backgroundColor: EMOTION_COLORS[item.emotion_colour] }]}>
            {starting ? <ActivityIndicator size="small" color="white" /> : (
              <Text style={styles.unlockBtnText}>{t('set_as_active') || 'Set as Active'}</Text>
            )}
          </TouchableOpacity>
        ) : (
          <Text style={styles.lockedHint} numberOfLines={2}>{(t('finish_creature_first') || 'Finish your {colour} creature first').replace('{colour}', item.emotion_colour)}</Text>
        )}
      </View>
    </View>
  );
}

export default function GlobalCreaturesScreen() {
  const { t, currentStudent } = useApp();
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const [creatures, setCreatures] = useState<any[]>([]);
  const [active, setActive] = useState<Record<string, ActiveInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [startingId, setStartingId] = useState<string | null>(null);
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
      if (studentId) {
        try {
          const activeData = await creaturesApi.getActiveCreatures(studentId);
          setActive(activeData || {});
        } catch (e) {}
      }
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, [studentId]);

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

  const pages: any[][] = [];
  for (let i = 0; i < filtered.length; i += PAGE_SIZE) {
    pages.push(filtered.slice(i, i + PAGE_SIZE));
  }

  const handleSetActive = async (item: any) => {
    if (!studentId) return;
    setStartingId(item.id);
    try {
      const res = await creaturesApi.startCreature(item.id, studentId);
      Alert.alert(t('unlocked') || 'Started!', res?.message || `${item.creature_name} is now your active creature!`);
      await load();
    } catch (e: any) {
      Alert.alert(t('error') || 'Error', e?.message || 'Could not set this creature as active right now.');
    }
    setStartingId(null);
  };

  const gridWidth = screenWidth - 24; // matches horizontal page padding below
  const cardWidth = (gridWidth - 12) / 2; // 2 columns, 12px gap

  const renderPage = ({ item: page }: { item: any[] }) => (
    <View style={{ width: screenWidth, paddingHorizontal: 12 }}>
      <View style={styles.grid}>
        {page.map(item => {
          const colourActive = active[item.emotion_colour];
          return (
            <CreatureCard
              key={item.id}
              item={item}
              isActive={colourActive?.active_id === item.id}
              canStart={!!colourActive?.is_fully_evolved}
              starting={startingId === item.id}
              onStart={() => handleSetActive(item)}
              cardWidth={cardWidth}
            />
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('world_creatures') || 'World Creatures'} showHome />
      <Text style={styles.subtitle}>{t('find_next_creature_subtitle') || 'Find your next creature to work toward'}</Text>
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
        {['all', 'green', 'blue', 'yellow', 'red'].map(f => (
          <TouchableOpacity key={f}
            style={[styles.filterBtn, filter === f && { backgroundColor: f === 'all' ? '#1A1A2E' : EMOTION_COLORS[f] }]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter === f && { color: f === 'yellow' ? '#333' : 'white' }]}>
              {f === 'all' ? 'All' : `${EMOTION_EMOJI[f] || ''} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={{ marginTop: 60, alignItems: 'center' }}><EmotionColourLoader visible size={64} /></View>
      ) : pages.length === 0 ? (
        <Text style={styles.empty}>No creatures available to you yet — be the first to submit one! 🦕</Text>
      ) : (
        <>
          <FlatList
            data={pages}
            keyExtractor={(_, idx) => `page-${idx}`}
            renderItem={renderPage}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            contentContainerStyle={{ paddingTop: 12 }}
          />
          {pages.length > 1 && (
            <Text style={styles.pageHint}>👉 {(t('more_creatures_swipe') || 'Swipe for more ({count} pages)').replace('{count}', String(pages.length))}</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  subtitle: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 4 },
  scopeRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  scopeBtn: { flex: 1, paddingVertical: 6, borderRadius: 50, backgroundColor: '#F0F0F0', alignItems: 'center' },
  scopeBtnActive: { backgroundColor: '#5C6BC0' },
  scopeBtnText: { fontSize: 10, fontWeight: '800', color: '#666' },
  scopeBtnTextActive: { color: 'white' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 50, backgroundColor: '#F0F0F0' },
  filterText: { fontSize: 12, fontWeight: '800', color: '#666' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  card: { backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  imgWrap: { width: '100%', aspectRatio: 1.1, backgroundColor: '#F5F5F5' },
  creatureImg: { width: '100%', height: '100%' },
  previewBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: 'rgba(0,0,0,.55)', borderRadius: 50, paddingHorizontal: 8, paddingVertical: 3 },
  previewBadgeText: { color: 'white', fontSize: 9, fontWeight: '800' },
  cardBody: { padding: 8 },
  creatureName: { fontSize: 12, fontWeight: '900', color: '#1A1A2E', marginBottom: 3 },
  metaRow: { marginBottom: 2 },
  metaTag: { fontSize: 9, color: '#9CA3AF', fontWeight: '700' },
  expiryTag: { fontSize: 9, color: '#B8860B', fontWeight: '800', marginBottom: 3 },
  progressRow: { flexDirection: 'row', gap: 3, marginTop: 2, marginBottom: 5 },
  progressDot: { width: 6, height: 6, borderRadius: 3 },
  fullyEvolved: { fontSize: 10, fontWeight: '800', color: '#4CAF73' },
  activeHint: { fontSize: 9, fontWeight: '800', color: '#5C6BC0' },
  lockedHint: { fontSize: 8, fontWeight: '700', color: '#AAA', fontStyle: 'italic' },
  unlockBtn: { paddingVertical: 6, borderRadius: 50, alignItems: 'center' },
  unlockBtnText: { color: 'white', fontWeight: '800', fontSize: 10 },
  empty: { textAlign: 'center', color: '#9CA3AF', fontSize: 15, fontWeight: '700', marginTop: 80, padding: 20 },
  pageHint: { textAlign: 'center', color: '#9CA3AF', fontSize: 11, fontWeight: '700', paddingVertical: 8 },
});
