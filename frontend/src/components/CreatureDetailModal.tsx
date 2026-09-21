import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Image, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Alert } from 'react-native';
import { AnimatedCreatureVisual } from './AnimatedCreatureVisual';
import { EmotionColourLoader } from './EmotionColourLoader';
import { BonusItemCelebration, CelebrationItem } from './BonusItemCelebration';
import { BonusItemCategory } from '../utils/sounds';
import { playButtonFeedback } from '../utils/sounds';
import { rewardsApi, analyticsApi, ShopItem } from '../utils/api';
import { useApp } from '../context/AppContext';
import { pickLocalized } from '../utils/localizedText';
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

// Real feature Sep 21: picks the community creature's description in the app's current
// language, falling back to English - the DB has genuinely no description at all for 'en'
// itself (that's just the plain `description` column), so 'en' and "column missing/empty"
// both fall through to the same base field, not a special case.
function localizedDescription(entry: CreatureDetailEntry | null, language: string): string | undefined {
  return pickLocalized(entry, 'description', language);
}

// Real fix Sep 19 (Jono correction to the Sep 19 stage-navigation build): a future/unreached
// stage previewing in full colour made a child feel they already had something they hadn't
// earned - the opposite of the "genuine encouragement, not gaming" principle from B1. Default
// creatures render via unicode colour emoji (stage_emojis), which RN cannot tint/recolour via
// any style prop (colour emoji glyphs ignore `color`/tintColor entirely - an OS font-rendering
// limitation, not a library gap) - so a real silhouette needs separate pre-generated assets,
// not a runtime filter. These 16 (4 creatures x 4 stages) were rasterised from the exact same
// Apple Color Emoji glyphs server.py's CREATURES.emoji_stages already uses, then every non-
// transparent pixel was flattened to solid black, preserving the real alpha shape - a true,
// recognisable silhouette of that exact stage, not a generic placeholder.
const SILHOUETTE_ASSETS: Record<string, any> = {
  aqua_buddy_0: require('../../assets/images/creature-silhouettes/aqua_buddy_stage0_silhouette.png'),
  aqua_buddy_1: require('../../assets/images/creature-silhouettes/aqua_buddy_stage1_silhouette.png'),
  aqua_buddy_2: require('../../assets/images/creature-silhouettes/aqua_buddy_stage2_silhouette.png'),
  aqua_buddy_3: require('../../assets/images/creature-silhouettes/aqua_buddy_stage3_silhouette.png'),
  leaf_friend_0: require('../../assets/images/creature-silhouettes/leaf_friend_stage0_silhouette.png'),
  leaf_friend_1: require('../../assets/images/creature-silhouettes/leaf_friend_stage1_silhouette.png'),
  leaf_friend_2: require('../../assets/images/creature-silhouettes/leaf_friend_stage2_silhouette.png'),
  leaf_friend_3: require('../../assets/images/creature-silhouettes/leaf_friend_stage3_silhouette.png'),
  spark_pal_0: require('../../assets/images/creature-silhouettes/spark_pal_stage0_silhouette.png'),
  spark_pal_1: require('../../assets/images/creature-silhouettes/spark_pal_stage1_silhouette.png'),
  spark_pal_2: require('../../assets/images/creature-silhouettes/spark_pal_stage2_silhouette.png'),
  spark_pal_3: require('../../assets/images/creature-silhouettes/spark_pal_stage3_silhouette.png'),
  blaze_heart_0: require('../../assets/images/creature-silhouettes/blaze_heart_stage0_silhouette.png'),
  blaze_heart_1: require('../../assets/images/creature-silhouettes/blaze_heart_stage1_silhouette.png'),
  blaze_heart_2: require('../../assets/images/creature-silhouettes/blaze_heart_stage2_silhouette.png'),
  blaze_heart_3: require('../../assets/images/creature-silhouettes/blaze_heart_stage3_silhouette.png'),
};

export interface CreatureDetailEntry {
  type: 'default' | 'community';
  id: string;
  name: string;
  emoji?: string | null;
  stage_image?: string | null;
  stage_emojis?: string[];
  stage_urls?: (string | null)[];
  // Real feature Sep 21: community creatures only (creature_submissions has no per-language
  // columns for default creatures' own `stages[].description`, a separate, pre-existing,
  // unrelated gap - out of scope here). All 10 variants sent through flat, same
  // send-everything-let-the-client-pick pattern GET /students/{id}/my-creatures already uses
  // for stage_urls - see localizedDescription() below.
  description?: string | null;
  description_ar?: string | null;
  description_de?: string | null;
  description_es?: string | null;
  description_fr?: string | null;
  description_hi?: string | null;
  description_it?: string | null;
  description_pt?: string | null;
  description_ru?: string | null;
  description_zh?: string | null;
  current_stage: number;
  max_stage: number;
  is_complete: boolean;
  is_active: boolean;
  // Real feature Sep 15 (progress bar unification): raw current value for the colour-matched
  // evolve-progress bar - see EvolutionProgressBar. Flows straight through from creatures.tsx's
  // CreatureEntry (same object, passed in as `entry` unchanged), no separate fetch needed here.
  points?: number;
  checkins_30d?: number;
  // Real fix Sep 15 (B1 core-loop bug): a community creature's real evolve-eligibility signal,
  // computed server-side (GET /students/{id}/my-creatures) the same way default creatures'
  // eligibility comes from /collection's next_stage_points - previously entirely absent, which
  // is exactly why community creatures never showed an Evolve button here (see
  // _progress_community_creature's docstring in server.py for the full history).
  eligible_stage?: number;
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
  const { t, language } = useApp();
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): "evolve later, from My
  // Creatures" only means something if evolving is actually possible here too - this is the
  // other half of rewards.tsx's Skip button, not a separate feature. current_points/
  // next_stage_points come from GET /rewards/{id}/collection's all_creatures (already fetched
  // by loadShop below) - community creatures never reach this (they auto-evolve on check-in,
  // no explicit Evolve step at all, see server.py's add_points community branch).
  const [creatureRecord, setCreatureRecord] = useState<{ current_points: number; next_stage_points: number | null } | null>(null);
  const [localStage, setLocalStage] = useState(entry?.current_stage ?? 0);
  // Real feature Sep 19 (live device report, Jono's explicit approval): bidirectional stage
  // navigation. null means "showing the real current stage" (localStage, unchanged
  // behaviour); a real index means the child tapped a specific stage box to preview it - past
  // stages they've actually reached, or future ones not yet reached (still previewable, just
  // visually locked - see the evoStage render below). Deliberately separate from localStage:
  // the progress bar, Evolve button, and "Stage X / Y" text all keep reflecting REAL progress
  // regardless of what's being previewed, so a child can browse their creature's history/
  // future without the UI ever implying they've evolved further than they actually have.
  const [previewStage, setPreviewStage] = useState<number | null>(null);
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
  // Real feature Sep 20 (engagement analytics, view-counts only - explicit scope decision,
  // no duration tracking): fire-and-forget, deliberately not awaited/caught by the caller -
  // a failed log must never affect this modal opening.
  useEffect(() => {
    if (visible && entry && studentId && lookupId) {
      analyticsApi.logEvent('creature_view', studentId, lookupId).catch(() => {});
    }
  }, [visible, entry?.id, studentId, lookupId]);
  // Real fix Sep 16 (live-test bug: "Fully Evolved" text with stale pre-evolution art): also
  // resyncs whenever entry.current_stage itself changes, not just when the modal opens/closes
  // on a different id - creatures.tsx now swaps in a freshly-fetched entry after an evolve
  // (see handleEvolved), and without current_stage in this dependency array, localStage would
  // never pick up that fresh value while the SAME creature's modal stays open.
  useEffect(() => { setLocalStage(entry?.current_stage ?? 0); setPreviewStage(null); }, [entry?.id, entry?.current_stage, visible]);

  const handleEvolve = async () => {
    if (!studentId || !entry || isEvolving) return;
    setIsEvolving(true);
    playButtonFeedback();
    try {
      const result = await rewardsApi.evolve(studentId, entry.id);
      setLocalStage(result.current_stage);
      setPreviewStage(null);
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
  // Real feature Sep 19: whichever stage is actually being shown right now - the real
  // current one by default, or whatever the child tapped to preview. Only ever drives the
  // main visual box and the evoRow's own selection ring below; progress bar/Evolve button/
  // "Stage X / Y" text all read localStage directly, never this, so previewing never implies
  // more (or less) real progress than the child actually has.
  const displayStage = previewStage ?? localStage;
  const previewingOther = previewStage !== null && previewStage !== localStage;
  const displayReached = displayStage <= localStage;

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
                // Real feature Sep 19 (live device report): owned items only ever had a
                // plain light-gray border, identical to every other card - the small
                // checkmark pill at the bottom was the ONLY "you own this" signal, easy to
                // miss at a glance. Adds the creature's own zone colour as a real border on
                // every owned card - the same colour system used everywhere else in the app
                // (ZONE_COLORS/`color` above), not a new one. isReplaying's existing
                // temporary border (same colour, briefly thicker during the 2.2s replay
                // animation) stays last in this array so it still wins during that moment.
                style={[s.itemCard, !item.owned && s.itemLocked, item.owned && { borderColor: color, borderWidth: 2 }, isReplaying && { borderColor: color, borderWidth: 2.5 }]}
                {...(item.owned ? {
                  onPress: () => {
                    setReplayingId(item.id);
                    setReplayItem({ id: item.id, name: item.name, emoji: item.emoji, category: category as BonusItemCategory });
                    setTimeout(() => setReplayingId(null), 2200);
                    // Real feature Sep 20 (engagement analytics): the replay tap is the only
                    // real per-item "view" interaction this grid has (all items in a category
                    // render simultaneously, so logging on render would count every item as
                    // equally "viewed" - not useful data). Fire-and-forget.
                    if (studentId) analyticsApi.logEvent('item_view', studentId, undefined, item.id).catch(() => {});
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
            <View style={{ position: 'relative' }}>
              <View style={[s.visualBox, { backgroundColor: color + '20' }]}>
                <AnimatedCreatureVisual
                  zone={colour}
                  size={110}
                  unlocked
                  emoji={entry.type === 'default' && displayReached ? (entry.stage_emojis?.[displayStage] ?? entry.emoji) : undefined}
                  localSource={entry.type === 'default' && !displayReached ? SILHOUETTE_ASSETS[`${entry.id}_${displayStage}`] : undefined}
                  imageUrl={entry.type === 'community' ? (entry.stage_urls?.[displayStage] ?? entry.stage_image ?? undefined) : undefined}
                  maskSilhouette={entry.type === 'community' && !displayReached}
                />
              </View>
              {/* Real fix Sep 21 (device report): "Active" describes the CREATURE overall
                  (entry.is_active - it's the one the student is currently evolving), not
                  whichever stage happens to be on screen - it used to show unconditionally,
                  so previewing an old, already-completed stage of the active creature showed
                  "★ Active" right next to a "👁️ Previewing..." banner saying otherwise, on
                  a separate line below it. Now mutually exclusive with the preview banner
                  (only shown when actually viewing the real current stage) and folded onto
                  the SAME line/element as the banner otherwise - see previewSlot below. */}
              {!previewingOther && entry.is_active && <Text style={[s.activeBadge, { color }]}>{t('active_badge') || '★ Active'}</Text>}
              {/* Real fix Sep 19 (Jono correction #2): this banner used to mount/unmount
                  directly in document flow, so appearing/disappearing pushed the "Evolution"
                  title, evoRow and progress line up/down beneath it. It now lives inside a
                  fixed-height reserved slot that always occupies the same space whether or
                  not a preview is active - toggling the preview only changes what's drawn
                  inside that slot, never the slot's own height, so nothing below it moves. */}
              <View style={s.previewSlot}>
                {previewingOther && (
                  <TouchableOpacity onPress={() => setPreviewStage(null)} style={[s.previewBanner, { backgroundColor: color + '20' }]}>
                    <Text
                      style={[s.previewBannerText, { color }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {/* Real fix Sep 21 (device report): a previewed stage the creature has
                          already passed is "Completed", never "Active" - that word is
                          reserved for the true current stage above. Folded into this same
                          Text/line rather than a second badge, satisfying both the wording
                          fix and the "same line" layout ask at once. numberOfLines/
                          adjustsFontSizeToFit keep it literally one line even for a longer
                          translation now that "Completed ·" can prepend it. */}
                      {displayReached ? `✓ ${t('completed_badge') || 'Completed'} · ` : ''}👁️ {(t('previewing_stage') || 'Previewing Stage {n}').replace('{n}', String(displayStage + 1))} · {t('back_to_current') || 'tap to return'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {entry.type === 'community' && !!localizedDescription(entry, language) && (
              <Text style={s.communityDescription}>{localizedDescription(entry, language)}</Text>
            )}

            <Text style={s.sectionTitle}>{t('creature_collection') || 'Evolution'}</Text>
            <View style={s.evoRow}>
              {Array.from({ length: stageCount }, (_, idx) => {
                const reached = idx <= localStage;
                const isSelected = idx === displayStage;
                const label = entry.type === 'default' ? entry.stage_emojis?.[idx] : null;
                const url = entry.type === 'community' ? entry.stage_urls?.[idx] : null;
                return (
                  // Real feature Sep 19 (live device report, Jono's explicit approval):
                  // bidirectional tap navigation - EVERY stage box is now tappable, reached
                  // or not. Past/current stages are a real, full-opacity look back at
                  // something the child actually achieved; future ones stay visually locked
                  // (dimmed + 🔒, same "not yet reached" signal as before) but are still
                  // previewable, per Jono's explicit spec - tapping shows what's coming, it
                  // just never pretends it's already unlocked.
                  <TouchableOpacity
                    key={idx}
                    onPress={() => setPreviewStage(idx)}
                    style={[
                      s.evoStage,
                      // Real fix Sep 21 (device report): evoStage's own flat #F0F0F0 base
                      // showed as a visible grey/white box behind an unreached stage's
                      // silhouette, clashing against the modal's near-white #F8F9FA
                      // background - reached stages never had this problem since their own
                      // colour tint always overrode the base. Giving unreached stages a
                      // faint tint of the SAME zone colour (not a fixed neutral) instead of
                      // removing the background outright keeps every stage box the same
                      // size/shape, just visually part of one family instead of one flat
                      // institutional-grey outlier.
                      { backgroundColor: color + (reached ? '30' : '12') },
                      isSelected && { borderWidth: 2, borderColor: color },
                    ]}
                  >
                    {entry.type === 'default' ? (
                      reached ? (
                        <Text style={{ fontSize: 22 }}>{label || '🥚'}</Text>
                      ) : (
                        <Image
                          source={SILHOUETTE_ASSETS[`${entry.id}_${idx}`]}
                          style={{ width: 26, height: 26 }}
                          resizeMode="contain"
                        />
                      )
                    ) : url ? (
                      <AnimatedCreatureVisual zone={colour} size={32} unlocked={reached} imageUrl={url} maskSilhouette={!reached} />
                    ) : null}
                    {!reached && <Text style={s.evoLockBadge}>🔒</Text>}
                    {/* Real fix Sep 15 (Marisa build-26, S08): idx is 0-indexed (fish=0,
                        dolphin=1, shark=2, whale=3) - labelling the box with the raw index
                        showed "Stage 0" for the very first stage. +1 for the human-facing
                        label; idx itself stays 0-indexed everywhere else (array access,
                        `reached` comparison) since that's genuinely correct there. */}
                    <Text style={s.evoName}>{t('stage') || 'Stage'} {idx + 1}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.progressLine}>
              {localStage >= stageCount - 1
                ? `🏆 ${t('fully_evolved') || 'Fully evolved!'}`
                // Real fix Sep 15 (Marisa build-26, S08): confirmed in server.py's
                // /students/{id}/my-creatures - a DEFAULT creature's current_stage is
                // 0-indexed with max_stage hardcoded to 3 (the max INDEX, not a count), so
                // this showed "Stage 1 / 3" for a creature with 4 real stages sitting on its
                // 2nd one. A COMMUNITY creature's current_stage (stages_unlocked) is already
                // 1-indexed with max_stage as a real count of 4 - correct as-is, so the +1
                // must be type-conditional or community creatures would go from correct to
                // off-by-one. stageCount (already the real, verified total) replaces
                // entry.max_stage as the denominator so this can't disagree with the boxes
                // rendered above it.
                : `${t('stage') || 'Stage'} ${entry.type === 'default' ? localStage + 1 : localStage} / ${stageCount}`}
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
                penalty. Always free, same as the reward screen.
                Real fix Sep 15 (B1 core-loop bug): community creatures now reach this too -
                they used to silently auto-evolve on check-in with no explicit-evolve step at
                all (see server.py's _progress_community_creature docstring for the live-
                confirmed evidence), which is exactly why this used to be gated to
                entry.type === 'default' only. eligible_stage (new, from GET /my-creatures)
                carries the same signal creatureRecord.next_stage_points does for defaults. */}
            {((entry.type === 'default' && creatureRecord && creatureRecord.next_stage_points != null &&
                creatureRecord.current_points >= creatureRecord.next_stage_points) ||
              (entry.type === 'community' && (entry.eligible_stage ?? localStage) > localStage)) && (
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
  // Real fix Sep 21 (device report): marginBottom trimmed 10->4 as part of tightening the
  // gap to the "Evolution" section below - see previewSlot's note just below for the rest.
  visualBox: { width: 150, height: 150, borderRadius: 75, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  activeBadge: { fontSize: 13, fontWeight: '900', marginBottom: 8 },
  // Real feature Sep 19: the "you're looking at a stage other than your real current one"
  // banner - tappable itself (returns to current), deliberately using the creature's own
  // zone colour rather than a neutral/warning colour, since previewing isn't an error state.
  // Real fix Sep 21 (device report): this reserved slot sits empty (nothing being
  // previewed) far more often than it shows a banner, so its own height/margin end up
  // being most of the "too much gap before Evolution" complaint. height trimmed to just
  // clear the real banner's content height (previewBannerText's ~14px line + 12px vertical
  // padding = ~26px - 28 keeps a couple px of headroom, not the previous 32) and
  // marginBottom dropped to 0 - sectionTitle's own weight/colour already reads as a clear
  // section break without extra space stacked on top. Still non-zero height, so the
  // anti-layout-jump fix this slot exists for (Sep 19) is untouched.
  previewSlot: { height: 28, alignItems: 'center', justifyContent: 'center', marginBottom: 0 },
  previewBanner: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  previewBannerText: { fontSize: 11.5, fontWeight: '800' },
  sectionTitle: { alignSelf: 'flex-start', fontSize: 15, fontWeight: '900', color: '#1A1A2E', marginBottom: 10 },
  communityDescription: { alignSelf: 'stretch', textAlign: 'center', fontSize: 13, lineHeight: 18, color: '#555', marginBottom: 14 },
  evoRow: { flexDirection: 'row', gap: 8, width: '100%' },
  evoStage: { flex: 1, alignItems: 'center', padding: 8, borderRadius: 12, position: 'relative', borderWidth: 2, borderColor: 'transparent' },
  evoLockBadge: { position: 'absolute', top: 4, right: 4, fontSize: 10 },
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
