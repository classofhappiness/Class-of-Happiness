import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, ActivityIndicator } from 'react-native';
import { AnimatedCreatureVisual } from './AnimatedCreatureVisual';
import { BonusItemCelebration, CelebrationItem } from './BonusItemCelebration';
import { BonusItemCategory } from '../utils/sounds';
import { rewardsApi } from '../utils/api';
import { useApp } from '../context/AppContext';

// Real feature Aug 22 (item 2 visual polish): the "select from a grid, see one large focused
// view" interaction from the old CreatureCollection modal, adapted to the new unified My
// Creatures screen - a detail modal opened by tapping a card, rather than a permanently-docked
// side panel, so it fits the new collapsible-sections grid layout instead of fighting it.
// Bonus Items only applies to default creatures (moves/outfits/foods/homes are properties of
// the 4 hardcoded default creatures, CREATURES catalog in server.py) - community creatures are
// 4 photos, not an emoji+accessory system, so there is genuinely nothing to show there. Shown
// honestly: the tab/section simply doesn't render for a community creature, not faked.

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF73', yellow: '#FFC107', red: '#E05252',
};

export interface CreatureDetailEntry {
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
}

interface Props {
  visible: boolean;
  onClose: () => void;
  entry: CreatureDetailEntry | null;
  colour: string;
  studentId?: string | null;
}

export const CreatureDetailModal: React.FC<Props> = ({ visible, onClose, entry, colour, studentId }) => {
  const { t } = useApp();
  const [bonusItems, setBonusItems] = useState<{ moves: any[]; outfits: any[]; foods: any[]; homes: any[]; unlockedMoves: string[]; unlockedOutfits: string[]; unlockedFoods: string[]; unlockedHomes: string[] } | null>(null);
  const [loadingBonus, setLoadingBonus] = useState(false);
  // Real feature Aug 23: tap-to-replay for an already-unlocked item - no persistence (Jono's
  // explicit simplified scope), just a fun replay of the same celebration animation+sound,
  // one item at a time, with a border highlight on the tapped card while it plays.
  const [replayItem, setReplayItem] = useState<CelebrationItem | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !entry || entry.type !== 'default' || !studentId) { setBonusItems(null); return; }
    setLoadingBonus(true);
    rewardsApi.getCollection(studentId)
      .then(data => {
        const creature = (data.all_creatures || []).find((c: any) => c.id === entry.id);
        setBonusItems({
          moves: creature?.moves || [],
          outfits: creature?.outfits || [],
          foods: creature?.foods || [],
          homes: creature?.homes || [],
          unlockedMoves: data.unlocked_moves || [],
          unlockedOutfits: data.unlocked_outfits || [],
          unlockedFoods: data.unlocked_foods || [],
          unlockedHomes: data.unlocked_homes || [],
        });
      })
      .catch(() => setBonusItems(null))
      .finally(() => setLoadingBonus(false));
  }, [visible, entry?.id, entry?.type, studentId]);

  if (!entry) return null;
  const color = ZONE_COLORS[colour] || '#4A90D9';
  const stageCount = entry.type === 'default' ? (entry.stage_emojis?.length || 4) : 4;

  const renderItemGrid = (items: any[], unlockedIds: string[], label: string, emoji: string, category: BonusItemCategory) => {
    if (!items.length) return null;
    return (
      <View style={s.categoryBlock}>
        <Text style={s.categoryLabel}>{emoji} {label}</Text>
        <View style={s.itemsRow}>
          {items.slice(0, 3).map((item: any) => {
            const isUnlocked = unlockedIds.includes(item.id);
            const isReplaying = replayingId === item.id;
            const CardWrapper = isUnlocked ? TouchableOpacity : View;
            return (
              <CardWrapper
                key={item.id}
                style={[s.itemCard, !isUnlocked && s.itemLocked, isReplaying && { borderColor: color, borderWidth: 2.5 }]}
                {...(isUnlocked ? {
                  onPress: () => {
                    setReplayingId(item.id);
                    setReplayItem({ id: item.id, name: item.name, emoji: item.emoji, category });
                    setTimeout(() => setReplayingId(null), 2200);
                  },
                } : {})}
              >
                <Text style={[s.itemEmoji, !isUnlocked && { opacity: 0.25 }]}>{item.emoji}</Text>
                {!isUnlocked && <Text style={s.lockOverlay}>🔒</Text>}
                <Text style={[s.itemName, !isUnlocked && s.itemNameLocked]} numberOfLines={2}>{item.name}</Text>
                {isUnlocked ? (
                  <View style={[s.unlockedTag, { backgroundColor: color }]}>
                    <Text style={s.unlockedTagText}>✓</Text>
                  </View>
                ) : (
                  // Real fix Aug 23: the old modal showed how many points away each locked
                  // item was (CreatureCollection.tsx's renderItemGrid) - lost when this was
                  // rebuilt, restored here using the same unlocks_at_stage -> points mapping.
                  <Text style={s.unlockHint}>
                    {item.unlocks_at_stage === 1 ? '⭐ 25 pts' :
                     item.unlocks_at_stage === 2 ? '⭐ 60 pts' :
                     item.unlocks_at_stage === 3 ? '⭐ 120 pts' : '🔒'}
                  </Text>
                )}
              </CardWrapper>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.container}>
          <View style={[s.header, { backgroundColor: color + '25' }]}>
            <Text style={s.title} numberOfLines={1}>{entry.name}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.scrollPad} showsVerticalScrollIndicator={false}>
            <View style={[s.visualBox, { backgroundColor: color + '20' }]}>
              <AnimatedCreatureVisual
                zone={colour}
                size={110}
                unlocked
                emoji={entry.type === 'default' ? entry.emoji : undefined}
                imageUrl={entry.type === 'community' ? (entry.stage_image || undefined) : undefined}
              />
            </View>
            {entry.is_active && <Text style={[s.activeBadge, { color }]}>{t('active_badge') || '★ Active'}</Text>}

            <Text style={s.sectionTitle}>{t('creature_collection') || 'Evolution'}</Text>
            <View style={s.evoRow}>
              {Array.from({ length: stageCount }, (_, idx) => {
                const reached = idx <= entry.current_stage;
                const label = entry.type === 'default' ? entry.stage_emojis?.[idx] : null;
                const url = entry.type === 'community' ? entry.stage_urls?.[idx] : null;
                return (
                  <View key={idx} style={[s.evoStage, reached && { backgroundColor: color + '30' }]}>
                    {entry.type === 'default' ? (
                      <Text style={{ fontSize: 22, opacity: reached ? 1 : 0.3 }}>{label || '🥚'}</Text>
                    ) : url ? (
                      <AnimatedCreatureVisual zone={colour} size={32} unlocked={reached} imageUrl={url} />
                    ) : null}
                    <Text style={s.evoName}>{t('stage') || 'Stage'} {idx}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={s.progressLine}>
              {entry.is_complete
                ? `🏆 ${t('fully_evolved') || 'Fully evolved!'}`
                : `${t('stage') || 'Stage'} ${entry.current_stage} / ${entry.max_stage}`}
            </Text>

            {entry.type === 'default' && (
              <>
                <Text style={[s.sectionTitle, { marginTop: 18 }]}>🎁 {t('bonus_items') || 'Bonus Items'}</Text>
                {loadingBonus ? (
                  <ActivityIndicator color={color} style={{ marginVertical: 20 }} />
                ) : bonusItems ? (
                  <>
                    {renderItemGrid(bonusItems.moves, bonusItems.unlockedMoves, t('moves') || 'Moves', '🎬', 'moves')}
                    {renderItemGrid(bonusItems.outfits, bonusItems.unlockedOutfits, t('outfits') || 'Outfits', '👗', 'outfits')}
                    {renderItemGrid(bonusItems.foods, bonusItems.unlockedFoods, t('foods') || 'Foods', '🍎', 'foods')}
                    {renderItemGrid(bonusItems.homes, bonusItems.unlockedHomes, t('homes') || 'Homes', '🏠', 'homes')}
                  </>
                ) : (
                  <Text style={s.hintTxt}>{t('grow_creature_hint') || 'Use helpers and share your feelings to unlock bonus items!'}</Text>
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
    <BonusItemCelebration
      visible={!!replayItem}
      items={replayItem ? [replayItem] : []}
      colour={colour}
      onClose={() => setReplayItem(null)}
      autoAdvanceMs={2200}
    />
    </>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end', alignItems: 'center' },
  container: { backgroundColor: '#F8F9FA', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '90%', minHeight: '60%', width: '100%', maxWidth: 480 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  title: { fontSize: 19, fontWeight: '900', color: '#1A1A2E', flex: 1 },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.12)', justifyContent: 'center', alignItems: 'center' },
  closeTxt: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  scrollPad: { padding: 18, paddingBottom: 40, alignItems: 'center' },
  visualBox: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  activeBadge: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  sectionTitle: { alignSelf: 'flex-start', fontSize: 15, fontWeight: '900', color: '#1A1A2E', marginBottom: 10 },
  evoRow: { flexDirection: 'row', gap: 8, width: '100%' },
  evoStage: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: '#F0F0F0' },
  evoName: { fontSize: 9, color: '#666', marginTop: 4 },
  progressLine: { fontSize: 13, fontWeight: '800', color: '#4CAF73', marginTop: 12, marginBottom: 4 },
  hintTxt: { fontSize: 13, color: '#888', fontStyle: 'italic', alignSelf: 'flex-start' },
  categoryBlock: { width: '100%', marginBottom: 14 },
  categoryLabel: { fontSize: 13, fontWeight: '800', color: '#444', marginBottom: 8 },
  itemsRow: { flexDirection: 'row', gap: 10 },
  itemCard: { flex: 1, backgroundColor: 'white', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#E8E8E8', position: 'relative', minHeight: 80 },
  itemLocked: { backgroundColor: '#F5F5F5', borderColor: '#DDD' },
  itemEmoji: { fontSize: 26, marginBottom: 4 },
  lockOverlay: { position: 'absolute', top: 6, right: 6, fontSize: 12 },
  itemName: { fontSize: 9, fontWeight: '600', color: '#333', textAlign: 'center' },
  itemNameLocked: { color: '#BBB' },
  unlockedTag: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  unlockedTagText: { fontSize: 9, color: 'white', fontWeight: 'bold' },
  unlockHint: { fontSize: 9, color: '#AAA', textAlign: 'center', marginTop: 2 },
});
