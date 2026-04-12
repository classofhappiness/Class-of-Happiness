import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Easing } from 'react-native';
import { Creature } from '../utils/api';
import { useApp } from '../context/AppContext';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../utils/sounds';
import { CreatureShowcase } from './CreatureShowcase';

interface CreatureCollectionProps {
  visible: boolean;
  collectedCreatures: Creature[];
  currentCreature: Creature;
  currentStage: number;
  currentPoints: number;
  totalCreatures: number;
  unlockedMoves: string[];
  unlockedOutfits: string[];
  unlockedFoods: string[];
  unlockedHomes: string[];
  t?: (key: string) => string;
  onClose: () => void;
  allCreatures?: Creature[];
}

const zoneColors: Record<string, string> = {
  blue: '#4FC3F7',
  green: '#81C784',
  yellow: '#FFD54F',
  red: '#FF7043',
};

const THRESHOLDS = [0, 25, 60, 120];

const AnimatedCreature: React.FC<{
  emoji: string;
  zone: string;
  size?: 'small' | 'medium' | 'large';
  unlocked?: boolean;
}> = ({ emoji, zone, size = 'medium', unlocked = true }) => {
  const moveAnim = useRef(new Animated.Value(0)).current;
  const sizeConfig = { small: 24, medium: 52, large: 80 };

  useEffect(() => {
    if (!unlocked) return;
    let animation: Animated.CompositeAnimation;
    switch (zone) {
      case 'blue':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: 12, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -12, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        break;
      case 'green':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -16, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 400, easing: Easing.in(Easing.quad), useNativeDriver: true }),
          Animated.delay(200),
        ]));
        break;
      case 'yellow':
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: 6, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: -6, duration: 100, useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
          Animated.delay(600),
        ]));
        break;
      default:
        animation = Animated.loop(Animated.sequence([
          Animated.timing(moveAnim, { toValue: -10, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(moveAnim, { toValue: 0, duration: 300, easing: Easing.bounce, useNativeDriver: true }),
          Animated.delay(400),
        ]));
    }
    animation.start();
    return () => animation.stop();
  }, [unlocked, zone]);

  const isHorizontal = zone === 'blue';
  return (
    <Animated.View style={{
      transform: isHorizontal ? [{ translateX: moveAnim }] : [{ translateY: moveAnim }],
      opacity: unlocked ? 1 : 0.3,
    }}>
      <Text style={{ fontSize: sizeConfig[size] }}>{emoji}</Text>
    </Animated.View>
  );
};

export const CreatureCollection: React.FC<CreatureCollectionProps> = ({
  visible,
  collectedCreatures,
  currentCreature,
  currentStage,
  currentPoints,
  totalCreatures,
  unlockedMoves = [],
  unlockedOutfits = [],
  unlockedFoods = [],
  unlockedHomes = [],
  t: tProp,
  onClose,
  allCreatures = [],
}) => {
  const { t: tContext } = useApp();
  const t = tProp || tContext;

  const [activeTab, setActiveTab] = useState<'creatures' | 'items'>('creatures');
  const [selectedCreature, setSelectedCreature] = useState<any>(null);
  const [showcaseCreature, setShowcaseCreature] = useState<any>(null);
  const [showShowcase, setShowShowcase] = useState(false);

  useEffect(() => { preloadSounds(); }, []);

  const allList = allCreatures.length > 0 ? allCreatures : [currentCreature, ...collectedCreatures.filter(c => c.id !== currentCreature.id)];
  const displayCreature = selectedCreature || currentCreature;
  const displayZone = (displayCreature as any).zone || (displayCreature as any).feeling_colour || 'blue';
  const displayStage = selectedCreature ? ((selectedCreature as any).current_stage || 0) : currentStage;
  const displayPoints = selectedCreature ? ((selectedCreature as any).current_points || 0) : currentPoints;
  const displayColor = zoneColors[displayZone] || '#4FC3F7';
  const nextThreshold = displayStage < 3 ? THRESHOLDS[displayStage + 1] : null;
  const progressPercent = nextThreshold ? Math.min((displayPoints / nextThreshold) * 100, 100) : 100;
  const displayEmoji = displayCreature.stages?.[displayStage]?.emoji || (displayCreature as any).emoji_stages?.[displayStage] || '🥚';
  const outfits = (displayCreature as any).outfits || [];
  const moves = (displayCreature as any).moves || [];
  const equippedOutfit = outfits.filter((o: any) => unlockedOutfits.includes(o.id)).slice(-1)[0];
  const equippedMove = moves.filter((m: any) => unlockedMoves.includes(m.id)).slice(-1)[0];

  const handleClose = () => { playButtonFeedback(); onClose(); };

  const renderItemGrid = (items: any[], unlockedIds: string[], label: string, emoji: string) => {
    const limitedItems = items.slice(0, 3);
    return (
      <View style={styles.categoryBlock}>
        <Text style={styles.categoryLabel}>{emoji} {label}</Text>
        <View style={styles.itemsRow}>
          {limitedItems.map((item: any) => {
            const isUnlocked = unlockedIds.includes(item.id);
            return (
              <View key={item.id} style={[styles.itemCard, !isUnlocked && styles.itemLocked]}>
                <Text style={[styles.itemEmoji, !isUnlocked && { opacity: 0.25 }]}>{item.emoji}</Text>
                {!isUnlocked && <Text style={styles.lockOverlay}>🔒</Text>}
                <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]} numberOfLines={2}>
                  {isUnlocked ? item.name : '???'}
                </Text>
                {isUnlocked && (
                  <View style={[styles.unlockedTag, { backgroundColor: displayColor }]}>
                    <Text style={styles.unlockedTagText}>{t('unlocked') || '✓'}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>

          <CreatureShowcase
            visible={showShowcase}
            creature={showcaseCreature}
            stage={(showcaseCreature as any)?.current_stage || 0}
            points={(showcaseCreature as any)?.current_points || 0}
            unlockedMoves={unlockedMoves}
            unlockedOutfits={unlockedOutfits}
            unlockedFoods={unlockedFoods}
            unlockedHomes={unlockedHomes}
            onClose={() => setShowShowcase(false)}
          />

          {/* Header */}
          <View style={[styles.header, { backgroundColor: displayColor + '25' }]}>
            <Text style={styles.title}>🌟 {t('creature_collection') || 'My Creatures'}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'creatures' && { backgroundColor: '#5C6BC0' }]}
              onPress={() => { setActiveTab('creatures'); playButtonFeedback(); }}
            >
              <Text style={[styles.tabTxt, activeTab === 'creatures' && styles.tabTxtActive]}>
                🐾 {t('your_creature') || 'Creatures'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'items' && { backgroundColor: '#5C6BC0' }]}
              onPress={() => { setActiveTab('items'); playButtonFeedback(); }}
            >
              <Text style={[styles.tabTxt, activeTab === 'items' && styles.tabTxtActive]}>
                🎁 {t('bonus_items') || 'Bonus Items'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {activeTab === 'creatures' ? (
              <View style={styles.scrollPad}>

                {/* All Creatures Grid */}
                <Text style={styles.sectionTitle}>{t('creature_collection') || 'All Creatures'}</Text>
                <View style={styles.creatureGrid}>
                  {allList.map((creature: any) => {
                    const cStage = creature.current_stage || 0;
                    const cPoints = creature.current_points || 0;
                    const cZone = creature.zone || creature.feeling_colour || 'blue';
                    const cColor = zoneColors[cZone] || '#4FC3F7';
                    const isSelected = selectedCreature?.id === creature.id;
                    const cEmoji = creature.stages?.[cStage]?.emoji || creature.emoji_stages?.[cStage] || '🥚';
                    const nextT = cStage < 3 ? THRESHOLDS[cStage + 1] : null;
                    const prog = nextT ? Math.min((cPoints / nextT) * 100, 100) : 100;

                    return (
                      <TouchableOpacity
                        key={creature.id}
                        style={[styles.creatureCard, { borderColor: cColor }, isSelected && { borderWidth: 3, backgroundColor: cColor + '18' }]}
                        onPress={() => {
                          playSelectFeedback();
                          setSelectedCreature(isSelected ? null : creature);
                          if (!isSelected) {
                            setShowcaseCreature(creature);
                            setShowShowcase(true);
                          }
                        }}
                      >
                        <View style={[styles.creatureEmojiBox, { backgroundColor: cColor + '25' }]}>
                          <AnimatedCreature emoji={cEmoji} zone={cZone} size="medium" unlocked={cPoints > 0} />
                        </View>
                        <Text style={[styles.creatureName, { color: cColor }]} numberOfLines={1}>{creature.name}</Text>
                        <Text style={styles.stageLabel}>
                          {cStage >= 3 ? `⭐ ${t('fully_evolved') || 'Evolved!'}` : `${t('stage') || 'Stage'} ${cStage}`}
                        </Text>
                        <View style={styles.miniBar}>
                          <View style={[styles.miniBarFill, { width: `${prog}%`, backgroundColor: cColor }]} />
                        </View>
                        <Text style={styles.ptsTxt}>{cPoints} {t('points') || 'pts'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Selected creature detail */}
                <View style={[styles.detailCard, { borderColor: displayColor }]}>
                  <Text style={[styles.detailTitle, { color: displayColor }]}>
                    {displayCreature.stages?.[displayStage]?.name || displayCreature.name}
                  </Text>
                  <View style={[styles.detailEmojiBox, { backgroundColor: displayColor + '20' }]}>
                    <AnimatedCreature emoji={displayEmoji} zone={displayZone} size="large" unlocked={displayPoints > 0 || displayStage > 0} />
                    {equippedOutfit && <Text style={styles.wearingTxt}>{equippedOutfit.emoji} {equippedOutfit.name}</Text>}
                    {equippedMove && <Text style={styles.wearingTxt}>{equippedMove.emoji} {equippedMove.name}</Text>}
                  </View>
                  <Text style={styles.detailDesc}>{displayCreature.stages?.[displayStage]?.description || ''}</Text>

                  <View style={styles.evoRow}>
                    {displayCreature.stages?.map((stage: any, idx: number) => (
                      <View key={idx} style={[styles.evoStage, idx <= displayStage && { backgroundColor: displayColor + '30' }]}>
                        <Text style={{ fontSize: 20, opacity: idx <= displayStage ? 1 : 0.3 }}>{stage.emoji}</Text>
                        <Text style={styles.evoName} numberOfLines={1}>{stage.name}</Text>
                      </View>
                    ))}
                  </View>

                  {nextThreshold && (
                    <View style={styles.progSection}>
                      <Text style={styles.progLabel}>{displayPoints} / {nextThreshold} {t('points_needed') || 'points to next stage'}</Text>
                      <View style={styles.progBar}>
                        <View style={[styles.progFill, { width: `${progressPercent}%`, backgroundColor: displayColor }]} />
                      </View>
                    </View>
                  )}
                  {displayStage >= 3 && (
                    <View style={[styles.evolvedBadge, { backgroundColor: displayColor }]}>
                      <Text style={styles.evolvedTxt}>⭐ {t('fully_evolved') || 'Fully Evolved!'}</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.scrollPad}>
                <Text style={styles.sectionTitle}>{t('bonus_items') || 'Bonus Items'} - {displayCreature.name}</Text>
                <Text style={styles.hintTxt}>{t('grow_creature_hint') || 'Use helpers and share your feelings to unlock bonus items!'}</Text>
                {renderItemGrid((displayCreature as any).moves || [], unlockedMoves, t('moves') || 'Moves', '🎬')}
                {renderItemGrid((displayCreature as any).outfits || [], unlockedOutfits, t('outfits') || 'Outfits', '👗')}
                {renderItemGrid((displayCreature as any).foods || [], unlockedFoods, t('foods') || 'Foods', '🍎')}
                {renderItemGrid((displayCreature as any).homes || [], unlockedHomes, t('homes') || 'Homes', '🏠')}
                <View style={[styles.hintBox, { borderColor: displayColor }]}>
                  <Text style={styles.hintBoxTxt}>
                    🔒 {t('keep_growing') || 'Keep going!'}{'\n'}{t('grow_creature_hint') || 'Use more helpers = more items!'}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#F8F9FA', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', minHeight: '75%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  title: { fontSize: 19, fontWeight: 'bold', color: '#333' },
  closeBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.12)', justifyContent: 'center', alignItems: 'center' },
  closeTxt: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  tabs: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: '#E0E0E0' },
  tabTxt: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTxtActive: { color: 'white' },
  scrollPad: { padding: 14, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  creatureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16, justifyContent: 'space-between' },
  creatureCard: { width: '47%', backgroundColor: 'white', borderRadius: 18, padding: 12, borderWidth: 2, alignItems: 'center' },
  creatureEmojiBox: { width: 72, height: 72, borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  creatureName: { fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  stageLabel: { fontSize: 11, color: '#888', marginBottom: 6 },
  miniBar: { width: '100%', height: 6, backgroundColor: '#E8E8E8', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  miniBarFill: { height: '100%', borderRadius: 3 },
  ptsTxt: { fontSize: 11, color: '#888', fontWeight: '600' },
  detailCard: { backgroundColor: 'white', borderRadius: 22, padding: 18, borderWidth: 2.5, alignItems: 'center', marginBottom: 8 },
  detailTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  detailEmojiBox: { width: 130, height: 130, borderRadius: 65, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  wearingTxt: { fontSize: 11, color: '#888', marginTop: 4, textAlign: 'center' },
  detailDesc: { fontSize: 13, color: '#666', textAlign: 'center', marginVertical: 10 },
  evoRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  evoStage: { alignItems: 'center', padding: 8, borderRadius: 12, backgroundColor: '#F0F0F0', flex: 1 },
  evoName: { fontSize: 9, color: '#666', marginTop: 3, textAlign: 'center' },
  progSection: { width: '100%' },
  progLabel: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 6 },
  progBar: { height: 12, backgroundColor: '#E8E8E8', borderRadius: 6, overflow: 'hidden' },
  progFill: { height: '100%', borderRadius: 6 },
  evolvedBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 12 },
  evolvedTxt: { color: 'white', fontWeight: 'bold', fontSize: 15 },
  categoryBlock: { marginBottom: 16 },
  categoryLabel: { fontSize: 15, fontWeight: 'bold', color: '#444', marginBottom: 10 },
  itemsRow: { flexDirection: 'row', gap: 10 },
  itemCard: { flex: 1, backgroundColor: 'white', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: '#E8E8E8', position: 'relative', minHeight: 90 },
  itemLocked: { backgroundColor: '#F5F5F5', borderColor: '#DDD' },
  itemEmoji: { fontSize: 30, marginBottom: 4 },
  lockOverlay: { position: 'absolute', top: 6, right: 6, fontSize: 14 },
  itemName: { fontSize: 10, fontWeight: '600', color: '#333', textAlign: 'center' },
  itemNameLocked: { color: '#BBB' },
  unlockedTag: { marginTop: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  unlockedTagText: { fontSize: 9, color: 'white', fontWeight: 'bold' },
  hintTxt: { fontSize: 13, color: '#888', marginBottom: 16, fontStyle: 'italic' },
  hintBox: { borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1.5, backgroundColor: '#FFFDE7' },
  hintBoxTxt: { fontSize: 13, color: '#666', textAlign: 'center', lineHeight: 20 },
});
