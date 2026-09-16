import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Alert } from 'react-native';
import { AnimatedCreatureVisual } from './AnimatedCreatureVisual';
import { EmotionColourLoader } from './EmotionColourLoader';
import { BonusItemCelebration, CelebrationItem } from './BonusItemCelebration';
import { BonusItemCategory } from '../utils/sounds';
import { playButtonFeedback } from '../utils/sounds';
import { rewardsApi, ShopItem } from '../utils/api';
import { useApp } from '../context/AppContext';
import { EvolutionProgressBar, DEFAULT_CREATURE_THRESHOLDS, COMMUNITY_CREATURE_THRESHOLDS } from './EvolutionProgressBar';

// Real feature Aug 22 (item 2 visual polish): the "select from a grid, see one large focused
// view" interaction from the old CreatureCollection modal, adapted to the new unified My
// Creatures screen - a detail modal opened by tapping a card, rather than a permanently-docked
// side panel, so it fits the new collapsible-sections grid layout instead of fighting it.
//
// Real feature Sep 5 (round 3, item 11): moves/outfits/foods/homes are defined per default
// creature in CREATURES (server.py), but each default creature maps 1:1 to exactly one colour
// (FEELING_COLOUR_MAP: blue->aqua_buddy, green->leaf_friend, yellow->spark_pal,
// red->blaze_heart) - so bonus items are, in effect, colour-linked, not creature-linked. A
// submitted/community creature occupies the same colour slot as its default counterpart (only
// one is ever "active" per colour at a time), so it now inherits and displays that colour's
// real bonus items too, via COLOUR_TO_DEFAULT_ID below - not faked or invented, the exact same
// unlock data the colour's default creature would show.
const COLOUR_TO_DEFAULT_ID: Record<string, string> = {
  blue: 'aqua_buddy', green: 'leaf_friend', yellow: 'spark_pal', red: 'blaze_heart',
};

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
  // Real feature Sep 15 (progress bar unification): raw current value for the colour-matched
  // evolve-progress bar - see EvolutionProgressBar. Flows straight through from creatures.tsx's
  // CreatureEntry (same object, passed in as `entry` unchanged), no separate fetch needed here.
  points?: number;
  checkins_30d?: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  entry: CreatureDetailEntry | null;
  colour: string;
  studentId?: string | null;
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): lets a student skip evolving
  // in the reward screen's celebratory moment and do it here instead, whenever they choose (no
  // time limit, no penalty - see rewards.tsx's Skip button). Called after a successful evolve
  // so the caller can refresh its own list (the grid card behind this modal is stale
  // otherwise).
  onEvolved?: () => void;
}

// Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved): a category is "complete"
// (its own small reward, per the Pokemon-inspired design brief) once every item in it is owned.
type ShopCategory = 'moves' | 'outfits' | 'foods' | 'homes';

export const CreatureDetailModal: React.FC<Props> = ({ visible, onClose, entry, colour, studentId, onEvolved }) => {
  const { t } = useApp();
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): "evolve later, from My
  // Creatures" only means something if evolving is actually possible here too - this is the
  // other half of rewards.tsx's Skip button, not a separate feature. current_points/
  // next_stage_points come from GET /rewards/{id}/collection's all_creatures (already fetched
  // by loadShop below) - community creatures never reach this (they auto-evolve on check-in,
  // no explicit Evolve step at all, see server.py's add_points community branch).
  const [creatureRecord, setCreatureRecord] = useState<{ current_points: number; next_stage_points: number | null } | null>(null);
  const [localStage, setLocalStage] = useState(entry?.current_stage ?? 0);
  const [isEvolving, setIsEvolving] = useState(false);
  // Real feature Sep 15 (B1, points economy v2, "Class of Happiness Shop"): shopEnabled comes
  // from the backend (school + family toggle, both default ON - see
  // _is_shop_enabled_for_student). When off, items still show owned/locked exactly as before
  // (auto-granted at each stage) but with no buy button, balance, or Shop branding at all.
  const [shopEnabled, setShopEnabled] = useState(true);
  const [spendableBalance, setSpendableBalance] = useState(0);
  const [categoryComplete, setCategoryComplete] = useState<Record<ShopCategory, boolean>>({ moves: false, outfits: false, foods: false, homes: false });
  const [shopItems, setShopItems] = useState<Record<ShopCategory, ShopItem[]> | null>(null);
  const [loadingBonus, setLoadingBonus] = useState(false);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  // Real feature Aug 23: tap-to-replay for an already-owned item - no persistence (Jono's
  // explicit simplified scope), just a fun replay of the same celebration animation+sound,
  // one item at a time, with a border highlight on the tapped card while it plays.
  const [replayItem, setReplayItem] = useState<CelebrationItem | null>(null);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): the "evolve later, from My
  // Creatures" half of the Skip button - newly-available items are announced the same way the
  // reward screen does it (a Shop invitation, not an auto-grant), just reusing this modal's
  // already-imported BonusItemCelebration instead of a second implementation.
  const [newlyAvailableItems, setNewlyAvailableItems] = useState<CelebrationItem[]>([]);
  const [showNewItemsCelebration, setShowNewItemsCelebration] = useState(false);
  // Real feature Sep 15 ("Class of Happiness Shop"): the balance counter animates its own
  // number when it changes - a small, satisfying tick, deliberately NOT a fast/stimulating
  // flourish (Jono's explicit design note: warm, not slot-machine-like).
  const balanceAnim = useRef(new Animated.Value(1)).current;

  const lookupId = entry && (entry.type === 'default' ? entry.id : COLOUR_TO_DEFAULT_ID[colour]);

  const loadShop = () => {
    if (!visible || !entry || !studentId) { setShopItems(null); return; }
    setLoadingBonus(true);
    rewardsApi.getCollection(studentId)
      .then(data => {
        const creature: any = (data.all_creatures || []).find((c: any) => c.id === lookupId);
        setShopEnabled(data.shop_enabled !== false);
        if (entry?.type === 'default') {
          setCreatureRecord({
            current_points: creature?.current_points ?? 0,
            next_stage_points: creature?.next_stage_points ?? null,
          });
        } else {
          setCreatureRecord(null);
        }
        setSpendableBalance(creature?.spendable_balance || 0);
        setCategoryComplete(creature?.category_complete || { moves: false, outfits: false, foods: false, homes: false });
        if (creature?.shop) {
          setShopItems(creature.shop);
        } else {
          // Defensive fallback (older cached response shape, or shop computation missing) -
          // derive the same owned/available view from the plain arrays, matching the old
          // pre-Shop behaviour so this never renders broken.
          const owned = {
            moves: data.unlocked_moves || [], outfits: data.unlocked_outfits || [],
            foods: data.unlocked_foods || [], homes: data.unlocked_homes || [],
          };
          const derive = (items: any[], cat: ShopCategory): ShopItem[] => (items || []).map(i => ({
            ...i, price: 0, owned: owned[cat].includes(i.id), available: false,
          }));
          setShopItems({
            moves: derive(creature?.moves, 'moves'), outfits: derive(creature?.outfits, 'outfits'),
            foods: derive(creature?.foods, 'foods'), homes: derive(creature?.homes, 'homes'),
          });
        }
      })
      .catch(() => setShopItems(null))
      .finally(() => setLoadingBonus(false));
  };

  useEffect(() => { loadShop(); }, [visible, entry?.id, entry?.type, studentId, colour]);
  useEffect(() => { setLocalStage(entry?.current_stage ?? 0); }, [entry?.id, visible]);

  const handleEvolve = async () => {
    if (!studentId || !entry || isEvolving) return;
    setIsEvolving(true);
    playButtonFeedback();
    try {
      const result = await rewardsApi.evolve(studentId, entry.id);
      setLocalStage(result.current_stage);
      loadShop();
      onEvolved?.();
      if (result.newly_available_items && result.newly_available_items.length > 0) {
        setTimeout(() => {
          setNewlyAvailableItems(result.newly_available_items as any);
          setShowNewItemsCelebration(true);
        }, 400);
      }
    } catch (e: any) {
      Alert.alert(t('error') || 'Error', t('evolve_failed') || 'Could not evolve right now. Please try again.');
    } finally {
      setIsEvolving(false);
    }
  };

  const handleBuy = async (item: ShopItem, category: ShopCategory) => {
    if (!studentId || !lookupId || buyingId) return;
    setBuyingId(item.id);
    try {
      const result = await rewardsApi.buyItem(studentId, lookupId, category, item.id);
      playButtonFeedback();
      setSpendableBalance(result.spendable_balance);
      Animated.sequence([
        Animated.timing(balanceAnim, { toValue: 1.08, duration: 220, useNativeDriver: true }),
        Animated.timing(balanceAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
      setShopItems(prev => prev ? {
        ...prev,
        [category]: prev[category].map(i => i.id === item.id ? { ...i, owned: true, available: false } : i),
      } : prev);
    } catch (e: any) {
      Alert.alert(t('shop_cant_buy_title') || "Can't buy that yet", e?.message || (t('shop_cant_buy_desc') || 'Something went wrong. Please try again.'));
    } finally {
      setBuyingId(null);
    }
  };

  if (!entry) return null;
  const color = ZONE_COLORS[colour] || '#4A90D9';
  const stageCount = entry.type === 'default' ? (entry.stage_emojis?.length || 4) : 4;

  // Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved): three real states per
  // item now instead of two - owned (✓, tap to replay), available (real Buy button, fixed
  // knowable price - never hidden or random, per the Pokemon-inspired design brief), and
  // locked (padlock, same as before). When the Shop is off, "available" never applies - an
  // item is just owned or locked, exactly like the pre-Shop behaviour.
  const renderItemGrid = (items: ShopItem[] | undefined, label: string, emoji: string, category: ShopCategory) => {
    if (!items || !items.length) return null;
    const complete = categoryComplete[category];
    return (
      <View style={s.categoryBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Text style={s.categoryLabel}>{emoji} {label}</Text>
          {complete && (
            <View style={[s.completeBadge, { backgroundColor: color }]}>
              <Text style={s.completeBadgeText}>{t('shop_collection_complete') || 'Full set!'}</Text>
            </View>
          )}
        </View>
        <View style={s.itemsRow}>
          {items.slice(0, 3).map((item) => {
            const isReplaying = replayingId === item.id;
            const canBuy = shopEnabled && item.available;
            const isBuying = buyingId === item.id;
            const CardWrapper = item.owned ? TouchableOpacity : View;
            return (
              <CardWrapper
                key={item.id}
                style={[s.itemCard, !item.owned && s.itemLocked, isReplaying && { borderColor: color, borderWidth: 2.5 }]}
                {...(item.owned ? {
                  onPress: () => {
                    setReplayingId(item.id);
                    setReplayItem({ id: item.id, name: item.name, emoji: item.emoji, category: category as BonusItemCategory });
                    setTimeout(() => setReplayingId(null), 2200);
                  },
                } : {})}
              >
                <Text style={[s.itemEmoji, !item.owned && { opacity: 0.35 }]}>{item.emoji}</Text>
                {!item.owned && !canBuy && <Text style={s.lockOverlay}>🔒</Text>}
                <Text style={[s.itemName, !item.owned && s.itemNameLocked]} numberOfLines={2}>{item.name}</Text>
                {item.owned ? (
                  <View style={[s.unlockedTag, { backgroundColor: color }]}>
                    <Text style={s.unlockedTagText}>✓</Text>
                  </View>
                ) : canBuy ? (
                  <TouchableOpacity
                    style={[s.buyBtn, { borderColor: color }, spendableBalance < item.price && s.buyBtnDisabled]}
                    onPress={() => handleBuy(item, category)}
                    disabled={isBuying}
                  >
                    <Text style={[s.buyBtnText, { color: spendableBalance >= item.price ? color : '#AAA' }]}>
                      {isBuying ? (t('shop_buying') || '...') : `${t('shop_buy_btn') || 'Choose'} · ⭐${item.price}`}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  // Real fix Aug 23 (kept in the locked/shop-off state): shows how many points
                  // away this item is, using the same fixed price shown once it's buyable.
                  <Text style={s.unlockHint}>⭐ {item.price || (item.unlocks_at_stage === 1 ? 25 : item.unlocks_at_stage === 2 ? 60 : item.unlocks_at_stage === 3 ? 120 : 0)} {t('points') || 'pts'}</Text>
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
                const reached = idx <= localStage;
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
              {localStage >= stageCount - 1
                ? `🏆 ${t('fully_evolved') || 'Fully evolved!'}`
                : `${t('stage') || 'Stage'} ${localStage} / ${entry.max_stage}`}
            </Text>

            {/* Real feature Sep 15 (progress bar unification): same EvolutionProgressBar as
                the reward screen and My Creatures - one implementation, not a third copy of
                this math. Returns null once fully evolved (localStage sits at the last
                threshold index), matching the "Fully evolved!" text above it. */}
            <EvolutionProgressBar
              zone={colour}
              current={entry.type === 'default' ? (entry.points || 0) : (entry.checkins_30d || 0)}
              stageIndex={localStage}
              thresholds={entry.type === 'default' ? DEFAULT_CREATURE_THRESHOLDS : COMMUNITY_CREATURE_THRESHOLDS}
              style={{ marginBottom: 4 }}
            />

            {/* Real feature Sep 15 (B1, points economy v2, Jono-approved): the other half of
                rewards.tsx's Skip button - a student who skipped evolving in the celebratory
                moment can come here whenever they choose and finish it, no time limit, no
                penalty. Community creatures never reach this (they auto-evolve on check-in -
                see server.py's add_points community branch - so creatureRecord is always null
                for them). Always free, same as the reward screen. */}
            {entry.type === 'default' && creatureRecord && creatureRecord.next_stage_points != null &&
              creatureRecord.current_points >= creatureRecord.next_stage_points && (
              <TouchableOpacity
                style={[s.evolveBtn, { backgroundColor: color }]}
                onPress={handleEvolve}
                disabled={isEvolving}
                activeOpacity={0.85}
              >
                <Text style={s.evolveBtnText}>
                  {isEvolving ? (t('evolving') || 'Evolving...') : `✨ ${t('evolve_btn') || 'Evolve!'}`}
                </Text>
              </TouchableOpacity>
            )}

            {!!COLOUR_TO_DEFAULT_ID[colour] && (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginTop: 18, marginBottom: 2 }}>
                  {/* Real feature Sep 15 (B1, Jono-approved naming): "Class of Happiness" stays
                      untranslated everywhere (brand name); only "Shop" is translated per
                      language - see shop_title's per-language values. */}
                  <Text style={s.sectionTitle}>
                    {shopEnabled ? (t('shop_title') || '🛍️ Class of Happiness Shop') : `🎁 ${t('bonus_items') || 'Bonus Items'}`}
                  </Text>
                  {shopEnabled && (
                    <Animated.View style={[s.balancePill, { transform: [{ scale: balanceAnim }] }]}>
                      <Text style={s.balancePillText}>⭐ {spendableBalance}</Text>
                    </Animated.View>
                  )}
                </View>
                {loadingBonus ? (
                  <View style={{ marginVertical: 20 }}><EmotionColourLoader visible size={40} /></View>
                ) : shopItems ? (
                  <>
                    {renderItemGrid(shopItems.moves, t('moves') || 'Moves', '🎬', 'moves')}
                    {renderItemGrid(shopItems.outfits, t('outfits') || 'Outfits', '👗', 'outfits')}
                    {renderItemGrid(shopItems.foods, t('foods') || 'Food', '🍎', 'foods')}
                    {renderItemGrid(shopItems.homes, t('homes') || 'Homes', '🏠', 'homes')}
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
    <BonusItemCelebration
      visible={showNewItemsCelebration}
      items={newlyAvailableItems}
      colour={colour}
      onClose={() => setShowNewItemsCelebration(false)}
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
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): "evolve later, from My
  // Creatures" - same warm, non-stimulating weight as the reward screen's evolveButton.
  evolveBtn: { width: '100%', borderRadius: 16, paddingVertical: 12, alignItems: 'center', marginTop: 4, marginBottom: 8 },
  evolveBtnText: { color: 'white', fontSize: 15, fontWeight: '800' },
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
  // Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved):
  completeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  completeBadgeText: { fontSize: 9, fontWeight: '800', color: 'white' },
  buyBtn: { marginTop: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5, backgroundColor: 'white' },
  buyBtnDisabled: { opacity: 0.4 },
  buyBtnText: { fontSize: 10, fontWeight: '800' },
  balancePill: { backgroundColor: '#FFF8E1', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: '#FFD54F' },
  balancePillText: { fontSize: 13, fontWeight: '900', color: '#B8860B' },
});
