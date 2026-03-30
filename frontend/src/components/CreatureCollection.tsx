import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, Animated, Easing } from 'react-native';
import { Creature } from '../utils/api';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../utils/sounds';

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
  t: (key: string) => string;
  onClose: () => void;
  allCreatures?: Creature[];
}

// Animated creature component for the collection
const AnimatedCreature: React.FC<{
  emoji: string;
  zone: string;
  size?: 'small' | 'medium' | 'large';
  unlocked?: boolean;
}> = ({ emoji, zone, size = 'medium', unlocked = true }) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const sizeConfig = {
    small: 28,
    medium: 50,
    large: 80,
  };

  useEffect(() => {
    if (!unlocked) return;

    // Different animation styles based on zone
    let animationConfig: Animated.CompositeAnimation;

    switch (zone) {
      case 'blue': // Swimming motion
        animationConfig = Animated.loop(
          Animated.parallel([
            Animated.sequence([
              Animated.timing(bounceAnim, { toValue: -5, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(bounceAnim, { toValue: 5, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ]),
            Animated.sequence([
              Animated.timing(rotateAnim, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
              Animated.timing(rotateAnim, { toValue: -1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ]),
          ])
        );
        break;
      case 'green': // Hopping motion
        animationConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(bounceAnim, { toValue: 2, duration: 200, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: -12, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 2, duration: 200, easing: Easing.bounce, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
          ])
        );
        break;
      case 'yellow': // Electric zap
        animationConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.1, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 0.95, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1.05, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
            Animated.delay(500),
          ])
        );
        break;
      case 'red': // Flame flicker
        animationConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(bounceAnim, { toValue: -8, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: -4, duration: 200, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: -10, duration: 300, useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
          ])
        );
        break;
      default:
        animationConfig = Animated.loop(
          Animated.sequence([
            Animated.timing(bounceAnim, { toValue: -6, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(bounceAnim, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          ])
        );
    }

    animationConfig.start();
    return () => animationConfig.stop();
  }, [zone, unlocked]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-8deg', '0deg', '8deg'],
  });

  return (
    <Animated.View
      style={[
        {
          transform: [
            { translateY: bounceAnim },
            { rotate: rotateInterpolate },
            { scale: scaleAnim },
          ],
          opacity: unlocked ? 1 : 0.4,
        },
      ]}
    >
      <Text style={{ fontSize: sizeConfig[size] }}>{emoji}</Text>
    </Animated.View>
  );
};

// Element filter configuration
const ELEMENT_FILTERS = [
  { id: 'all', name: 'All', color: '#9C27B0', emoji: '🌟' },
  { id: 'blue', name: 'Aqua', color: '#4FC3F7', emoji: '💧' },
  { id: 'green', name: 'Leaf', color: '#81C784', emoji: '🌱' },
  { id: 'yellow', name: 'Spark', color: '#FFD54F', emoji: '⚡' },
  { id: 'red', name: 'Blaze', color: '#FF7043', emoji: '🔥' },
];

const zoneColors: Record<string, string> = {
  blue: '#4FC3F7',
  green: '#81C784',
  yellow: '#FFD54F',
  red: '#FF7043',
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
  t,
  onClose,
  allCreatures = [],
}) => {
  const [activeTab, setActiveTab] = useState<'creature' | 'items'>('creature');
  const [selectedElement, setSelectedElement] = useState<string>('all');
  const [selectedCreatureForDisplay, setSelectedCreatureForDisplay] = useState<Creature | null>(null);

  useEffect(() => {
    preloadSounds();
  }, []);

  const nextThreshold = currentStage < 3 ? currentCreature.stages[currentStage + 1]?.required_points || 0 : null;
  const progressPercent = nextThreshold ? Math.min((currentPoints / nextThreshold) * 100, 100) : 100;
  const creatureZone = currentCreature.zone || 'blue';
  const zoneColor = zoneColors[creatureZone] || '#4FC3F7';

  const filteredCollectedCreatures = selectedElement === 'all' 
    ? collectedCreatures 
    : collectedCreatures.filter(c => c.zone === selectedElement);

  const showCurrentCreature = selectedElement === 'all' || currentCreature.zone === selectedElement;

  const handleTabChange = (tab: 'creature' | 'items') => {
    playButtonFeedback();
    setActiveTab(tab);
  };

  const handleElementFilter = (elementId: string) => {
    playSelectFeedback();
    setSelectedElement(elementId);
  };

  const handleClose = () => {
    playButtonFeedback();
    onClose();
  };

  const handleSelectCreature = (creature: Creature) => {
    playSelectFeedback();
    setSelectedCreatureForDisplay(selectedCreatureForDisplay?.id === creature.id ? null : creature);
  };

  // Get the creature to display (selected or current)
  const displayCreature = selectedCreatureForDisplay || currentCreature;
  const displayStage = selectedCreatureForDisplay ? 3 : currentStage; // Show final stage for collected, current for active

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: zoneColor + '20' }]}>
            <Text style={styles.title}>{t('creature_collection') || 'My Creatures'}</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Main Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'creature' && { backgroundColor: zoneColor }]}
              onPress={() => handleTabChange('creature')}
            >
              <Text style={[styles.tabText, activeTab === 'creature' && styles.tabTextActive]}>
                {t('your_creature') || 'Your Creatures'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'items' && { backgroundColor: zoneColor }]}
              onPress={() => handleTabChange('items')}
            >
              <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>
                {t('bonus_items') || 'Bonus Items'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Element Filter Tabs */}
          {activeTab === 'creature' && (
            <View style={styles.elementFilters}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.elementScrollContent}>
                {ELEMENT_FILTERS.map((filter) => (
                  <TouchableOpacity
                    key={filter.id}
                    style={[
                      styles.elementChip,
                      selectedElement === filter.id && { backgroundColor: filter.color, borderColor: filter.color },
                    ]}
                    onPress={() => handleElementFilter(filter.id)}
                  >
                    <Text style={styles.elementEmoji}>{filter.emoji}</Text>
                    <Text style={[styles.elementText, selectedElement === filter.id && styles.elementTextActive]}>
                      {filter.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {activeTab === 'creature' ? (
              <>
                {/* Main Creature Display with Animation */}
                {showCurrentCreature && (
                  <View style={[styles.mainCreatureCard, { borderColor: zoneColors[displayCreature.zone] || zoneColor }]}>
                    {!selectedCreatureForDisplay && (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    )}
                    
                    {/* Animated Creature Display */}
                    <View style={[styles.creatureStage, { backgroundColor: (zoneColors[displayCreature.zone] || zoneColor) + '20' }]}>
                      <AnimatedCreature
                        emoji={displayCreature.stages[displayStage].emoji}
                        zone={displayCreature.zone}
                        size="large"
                      />
                    </View>
                    
                    <Text style={[styles.creatureName, { color: zoneColors[displayCreature.zone] || zoneColor }]}>
                      {displayCreature.stages[displayStage].name}
                    </Text>
                    <Text style={styles.creatureDesc}>{displayCreature.stages[displayStage].description}</Text>

                    {/* Evolution Stages */}
                    <View style={styles.evolutionRow}>
                      {displayCreature.stages.map((stage, index) => (
                        <View key={index} style={[
                          styles.evolutionStage,
                          index <= (selectedCreatureForDisplay ? 3 : currentStage) && { backgroundColor: (zoneColors[displayCreature.zone] || zoneColor) + '30' },
                        ]}>
                          <AnimatedCreature emoji={stage.emoji} zone={displayCreature.zone} size="small" unlocked={index <= (selectedCreatureForDisplay ? 3 : currentStage)} />
                        </View>
                      ))}
                    </View>

                    {/* Progress (only for current creature) */}
                    {!selectedCreatureForDisplay && currentStage < 3 && (
                      <View style={styles.progressSection}>
                        <Text style={styles.progressLabel}>
                          {currentPoints}/{nextThreshold} points to next stage
                        </Text>
                        <View style={styles.progressBar}>
                          <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: zoneColor }]} />
                        </View>
                      </View>
                    )}
                    
                    {(selectedCreatureForDisplay || currentStage >= 3) && (
                      <View style={[styles.evolvedBadge, { backgroundColor: zoneColors[displayCreature.zone] || zoneColor }]}>
                        <Text style={styles.evolvedText}>✨ Fully Evolved!</Text>
                      </View>
                    )}

                    {/* Unlocked Items Display for this creature */}
                    {!selectedCreatureForDisplay && (unlockedMoves.length > 0 || unlockedOutfits.length > 0 || unlockedFoods.length > 0 || unlockedHomes.length > 0) && (
                      <View style={styles.unlockedItemsRow}>
                        <Text style={styles.unlockedItemsLabel}>Unlocked Items:</Text>
                        <View style={styles.unlockedItemsIcons}>
                          {currentCreature.moves?.filter(m => unlockedMoves.includes(m.id)).map(m => (
                            <Text key={m.id} style={styles.unlockedItemIcon}>{m.emoji}</Text>
                          ))}
                          {currentCreature.outfits?.filter(o => unlockedOutfits.includes(o.id)).map(o => (
                            <Text key={o.id} style={styles.unlockedItemIcon}>{o.emoji}</Text>
                          ))}
                          {currentCreature.foods?.filter(f => unlockedFoods.includes(f.id)).map(f => (
                            <Text key={f.id} style={styles.unlockedItemIcon}>{f.emoji}</Text>
                          ))}
                          {currentCreature.homes?.filter(h => unlockedHomes.includes(h.id)).map(h => (
                            <Text key={h.id} style={styles.unlockedItemIcon}>{h.emoji}</Text>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}

                {/* Collected Creatures Grid */}
                {filteredCollectedCreatures.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>
                      Collected Creatures ({filteredCollectedCreatures.length})
                    </Text>
                    <View style={styles.collectionGrid}>
                      {filteredCollectedCreatures.map((creature) => (
                        <TouchableOpacity
                          key={creature.id}
                          style={[
                            styles.collectedCard,
                            { borderColor: zoneColors[creature.zone] || '#CCC' },
                            selectedCreatureForDisplay?.id === creature.id && styles.collectedCardSelected,
                          ]}
                          onPress={() => handleSelectCreature(creature)}
                        >
                          <View style={[styles.collectedAvatar, { backgroundColor: (zoneColors[creature.zone] || '#CCC') + '30' }]}>
                            <AnimatedCreature emoji={creature.stages[3].emoji} zone={creature.zone} size="small" />
                          </View>
                          <Text style={styles.collectedName} numberOfLines={1}>{creature.stages[3].name}</Text>
                          <View style={[styles.elementBadge, { backgroundColor: zoneColors[creature.zone] }]}>
                            <Text style={styles.elementBadgeText}>
                              {ELEMENT_FILTERS.find(f => f.id === creature.zone)?.emoji}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Empty state */}
                {selectedElement !== 'all' && filteredCollectedCreatures.length === 0 && !showCurrentCreature && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>{ELEMENT_FILTERS.find(f => f.id === selectedElement)?.emoji}</Text>
                    <Text style={styles.emptyText}>No {ELEMENT_FILTERS.find(f => f.id === selectedElement)?.name} creatures yet!</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Bonus Items Tab with Animations */}
                <Text style={styles.sectionTitle}>{t('moves') || 'Moves'} 🎬</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.moves || []).map((move: any) => {
                    const isUnlocked = unlockedMoves.includes(move.id);
                    return (
                      <TouchableOpacity
                        key={move.id}
                        style={[styles.itemCard, !isUnlocked && styles.itemLocked]}
                        onPress={() => isUnlocked && playButtonFeedback()}
                        activeOpacity={isUnlocked ? 0.7 : 1}
                      >
                        {isUnlocked ? (
                          <AnimatedCreature emoji={move.emoji} zone={currentCreature.zone} size="small" />
                        ) : (
                          <Text style={[styles.itemEmoji, styles.itemEmojiLocked]}>{move.emoji}</Text>
                        )}
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? move.name : `Stage ${move.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionTitle}>{t('outfits') || 'Outfits'} 👕</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.outfits || []).map((outfit: any) => {
                    const isUnlocked = unlockedOutfits.includes(outfit.id);
                    return (
                      <TouchableOpacity
                        key={outfit.id}
                        style={[styles.itemCard, !isUnlocked && styles.itemLocked]}
                        onPress={() => isUnlocked && playButtonFeedback()}
                        activeOpacity={isUnlocked ? 0.7 : 1}
                      >
                        {isUnlocked ? (
                          <AnimatedCreature emoji={outfit.emoji} zone={currentCreature.zone} size="small" />
                        ) : (
                          <Text style={[styles.itemEmoji, styles.itemEmojiLocked]}>{outfit.emoji}</Text>
                        )}
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? outfit.name : `Stage ${outfit.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionTitle}>{t('foods') || 'Food'} 🍎</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.foods || []).map((food: any) => {
                    const isUnlocked = unlockedFoods.includes(food.id);
                    return (
                      <TouchableOpacity
                        key={food.id}
                        style={[styles.itemCard, !isUnlocked && styles.itemLocked]}
                        onPress={() => isUnlocked && playButtonFeedback()}
                        activeOpacity={isUnlocked ? 0.7 : 1}
                      >
                        {isUnlocked ? (
                          <AnimatedCreature emoji={food.emoji} zone={currentCreature.zone} size="small" />
                        ) : (
                          <Text style={[styles.itemEmoji, styles.itemEmojiLocked]}>{food.emoji}</Text>
                        )}
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? food.name : `Stage ${food.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={styles.sectionTitle}>{t('homes') || 'Homes'} 🏠</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.homes || []).map((home: any) => {
                    const isUnlocked = unlockedHomes.includes(home.id);
                    return (
                      <TouchableOpacity
                        key={home.id}
                        style={[styles.itemCard, !isUnlocked && styles.itemLocked]}
                        onPress={() => isUnlocked && playButtonFeedback()}
                        activeOpacity={isUnlocked ? 0.7 : 1}
                      >
                        {isUnlocked ? (
                          <AnimatedCreature emoji={home.emoji} zone={currentCreature.zone} size="small" />
                        ) : (
                          <Text style={[styles.itemEmoji, styles.itemEmojiLocked]}>{home.emoji}</Text>
                        )}
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? home.name : `Stage ${home.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>🌟 Keep checking in and using strategies to unlock more items!</Text>
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  container: { backgroundColor: 'white', borderRadius: 24, width: '100%', maxHeight: '90%', overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  closeButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'white', justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 18, color: '#666', fontWeight: 'bold' },
  tabs: { flexDirection: 'row', padding: 12, paddingBottom: 8, gap: 8 },
  tab: { flex: 1, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, backgroundColor: '#F0F0F0', alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  tabTextActive: { color: 'white' },
  elementFilters: { paddingHorizontal: 12, paddingBottom: 8 },
  elementScrollContent: { gap: 8, paddingRight: 12 },
  elementChip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#F5F5F5', borderWidth: 2, borderColor: '#E0E0E0', gap: 4 },
  elementEmoji: { fontSize: 14 },
  elementText: { fontSize: 12, fontWeight: '600', color: '#666' },
  elementTextActive: { color: 'white' },
  scrollView: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  mainCreatureCard: { backgroundColor: 'white', borderRadius: 20, padding: 20, borderWidth: 3, alignItems: 'center', marginBottom: 20, position: 'relative' },
  currentBadge: { position: 'absolute', top: -10, right: 16, backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  currentBadgeText: { color: 'white', fontSize: 11, fontWeight: 'bold' },
  creatureStage: { width: 120, height: 120, borderRadius: 60, justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  creatureName: { fontSize: 24, fontWeight: 'bold', marginBottom: 4 },
  creatureDesc: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 16 },
  evolutionRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  evolutionStage: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0F0F0' },
  progressSection: { width: '100%', marginTop: 8 },
  progressLabel: { fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 8 },
  progressBar: { height: 10, backgroundColor: '#E0E0E0', borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  evolvedBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, marginTop: 12 },
  evolvedText: { color: 'white', fontWeight: 'bold', fontSize: 14 },
  unlockedItemsRow: { marginTop: 16, alignItems: 'center' },
  unlockedItemsLabel: { fontSize: 12, color: '#888', marginBottom: 8 },
  unlockedItemsIcons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  unlockedItemIcon: { fontSize: 24 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12, marginTop: 8 },
  collectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  collectedCard: { width: 85, backgroundColor: 'white', borderRadius: 12, padding: 8, borderWidth: 2, alignItems: 'center', position: 'relative' },
  collectedCardSelected: { borderWidth: 3, transform: [{ scale: 1.05 }] },
  collectedAvatar: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  collectedName: { fontSize: 11, fontWeight: '600', color: '#333', textAlign: 'center' },
  elementBadge: { position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: 'white' },
  elementBadgeText: { fontSize: 10 },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#666' },
  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  itemCard: { width: 80, backgroundColor: 'white', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0', position: 'relative' },
  itemLocked: { backgroundColor: '#F8F8F8', opacity: 0.7 },
  itemEmoji: { fontSize: 28, marginBottom: 4 },
  itemEmojiLocked: { opacity: 0.3 },
  lockIcon: { position: 'absolute', top: 8, right: 8, fontSize: 12 },
  itemName: { fontSize: 10, fontWeight: '600', color: '#333', textAlign: 'center' },
  itemNameLocked: { color: '#AAA' },
  hintBox: { backgroundColor: '#FFF3E0', borderRadius: 12, padding: 16, marginTop: 8 },
  hintText: { fontSize: 13, color: '#E65100', textAlign: 'center' },
});
