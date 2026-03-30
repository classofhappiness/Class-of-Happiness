import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
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
  allCreatures?: Creature[]; // All available creatures for filtering
}

// Element filter configuration
const ELEMENT_FILTERS = [
  { id: 'all', name: 'All', color: '#9C27B0', emoji: '🌟' },
  { id: 'blue', name: 'Aqua', color: '#4FC3F7', emoji: '💧' },
  { id: 'green', name: 'Leaf', color: '#81C784', emoji: '🌱' },
  { id: 'yellow', name: 'Spark', color: '#FFD54F', emoji: '⚡' },
  { id: 'red', name: 'Blaze', color: '#FF7043', emoji: '🔥' },
];

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
  
  // Preload sounds when component mounts
  useEffect(() => {
    preloadSounds();
  }, []);
  
  // Get next evolution threshold
  const nextThreshold = currentStage < 3 ? currentCreature.stages[currentStage + 1]?.required_points || 0 : null;
  const progressPercent = nextThreshold ? Math.min((currentPoints / nextThreshold) * 100, 100) : 100;

  // Get zone color for background
  const zoneColors: Record<string, string> = {
    blue: '#4FC3F7',
    green: '#81C784',
    yellow: '#FFD54F',
    red: '#FF7043',
  };
  const creatureZone = currentCreature.zone || 'blue';
  const zoneColor = zoneColors[creatureZone] || '#4FC3F7';

  // Filter collected creatures by element
  const filteredCollectedCreatures = selectedElement === 'all' 
    ? collectedCreatures 
    : collectedCreatures.filter(c => c.zone === selectedElement);

  // Check if current creature matches filter
  const showCurrentCreature = selectedElement === 'all' || currentCreature.zone === selectedElement;

  // Handle tab change with sound
  const handleTabChange = (tab: 'creature' | 'items') => {
    playButtonFeedback();
    setActiveTab(tab);
  };

  // Handle element filter change with sound
  const handleElementFilter = (elementId: string) => {
    playSelectFeedback();
    setSelectedElement(elementId);
  };

  // Handle close with sound
  const handleClose = () => {
    playButtonFeedback();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
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

          {/* Element Filter Tabs (only show in creatures tab) */}
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
                    <Text style={[
                      styles.elementText,
                      selectedElement === filter.id && styles.elementTextActive,
                    ]}>
                      {filter.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'creature' ? (
              <>
                {/* Current Creature (if matches filter) */}
                {showCurrentCreature && (
                  <View style={[styles.currentCreatureCard, { borderColor: zoneColor }]}>
                    <View style={styles.currentBadge}>
                      <Text style={styles.currentBadgeText}>Current</Text>
                    </View>
                    <View style={[styles.creatureAvatar, { backgroundColor: zoneColor + '30' }]}>
                      <Text style={styles.creatureEmoji}>
                        {currentCreature.stages[currentStage].emoji}
                      </Text>
                    </View>
                    <Text style={styles.creatureName}>{currentCreature.stages[currentStage].name}</Text>
                    <Text style={styles.creatureDesc}>{currentCreature.description}</Text>
                    
                    {/* Stage Progress */}
                    <View style={styles.stageProgress}>
                      <Text style={styles.stageLabel}>
                        {t('stage') || 'Stage'} {currentStage + 1}/4
                      </Text>
                      <View style={styles.stageIndicator}>
                        {currentCreature.stages.map((stage, index) => (
                          <View
                            key={index}
                            style={[
                              styles.stageDot,
                              { backgroundColor: index <= currentStage ? zoneColor : '#DDD' },
                            ]}
                          >
                            <Text style={styles.stageDotEmoji}>{stage.emoji}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    {/* Points Progress */}
                    {currentStage < 3 && (
                      <View style={styles.progressSection}>
                        <Text style={styles.progressLabel}>
                          {t('next_evolution') || 'Next Evolution'}: {currentPoints}/{nextThreshold} {t('points_needed') || 'points'}
                        </Text>
                        <View style={styles.progressBar}>
                          <View style={[styles.progressFill, { width: `${progressPercent}%`, backgroundColor: zoneColor }]} />
                        </View>
                      </View>
                    )}
                    {currentStage >= 3 && (
                      <View style={[styles.fullyEvolvedBadge, { backgroundColor: zoneColor }]}>
                        <Text style={styles.fullyEvolvedText}>{t('fully_evolved') || 'Fully Evolved!'}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Collected Creatures - Grid View */}
                {filteredCollectedCreatures.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>
                      {selectedElement === 'all' 
                        ? t('collected_creatures') || 'Collected Creatures' 
                        : `${ELEMENT_FILTERS.find(f => f.id === selectedElement)?.name} Creatures`}
                      {' '}({filteredCollectedCreatures.length})
                    </Text>
                    <View style={styles.collectionGrid}>
                      {filteredCollectedCreatures.map((creature) => {
                        const cZone = creature.zone || 'blue';
                        const cColor = zoneColors[cZone] || '#4FC3F7';
                        return (
                          <TouchableOpacity 
                            key={creature.id} 
                            style={[styles.collectedCard, { borderColor: cColor }]}
                            onPress={() => playButtonFeedback()}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.collectedAvatar, { backgroundColor: cColor + '30' }]}>
                              <Text style={styles.collectedEmoji}>{creature.stages[3].emoji}</Text>
                            </View>
                            <Text style={styles.collectedName}>{creature.stages[3].name}</Text>
                            <View style={[styles.elementBadge, { backgroundColor: cColor }]}>
                              <Text style={styles.elementBadgeText}>
                                {ELEMENT_FILTERS.find(f => f.id === cZone)?.emoji}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* Empty state for filtered view */}
                {selectedElement !== 'all' && filteredCollectedCreatures.length === 0 && !showCurrentCreature && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyEmoji}>
                      {ELEMENT_FILTERS.find(f => f.id === selectedElement)?.emoji}
                    </Text>
                    <Text style={styles.emptyText}>
                      No {ELEMENT_FILTERS.find(f => f.id === selectedElement)?.name} creatures yet!
                    </Text>
                    <Text style={styles.emptySubtext}>
                      Keep checking in to discover more creatures
                    </Text>
                  </View>
                )}

                {/* All 4 Elements Preview */}
                <Text style={styles.sectionTitle}>All Element Types</Text>
                <View style={styles.allCreaturesRow}>
                  {ELEMENT_FILTERS.filter(f => f.id !== 'all').map((element) => (
                    <TouchableOpacity 
                      key={element.id}
                      style={[styles.previewCreature, { borderColor: element.color }]}
                      onPress={() => handleElementFilter(element.id)}
                    >
                      <Text style={styles.previewEmoji}>{element.emoji}</Text>
                      <Text style={[styles.previewName, { color: element.color }]}>{element.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <>
                {/* Moves Section */}
                <Text style={styles.sectionTitle}>{t('moves') || 'Moves'}</Text>
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
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{move.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? move.name : `Stage ${move.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Outfits Section */}
                <Text style={styles.sectionTitle}>{t('outfits') || 'Outfits'}</Text>
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
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{outfit.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? outfit.name : `Stage ${outfit.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Foods Section */}
                <Text style={styles.sectionTitle}>{t('foods') || 'Food'}</Text>
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
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{food.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? food.name : `Stage ${food.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Homes Section */}
                <Text style={styles.sectionTitle}>{t('homes') || 'Homes'}</Text>
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
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{home.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? home.name : `Stage ${home.unlocks_at_stage}`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Hint */}
                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>
                    Keep checking in and using strategies to unlock more items!
                  </Text>
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 24,
    width: '100%',
    maxHeight: '90%',
    minHeight: 400,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 18,
    color: '#666',
    fontWeight: 'bold',
  },
  tabs: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: 'white',
  },
  elementFilters: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  elementScrollContent: {
    gap: 8,
    paddingRight: 12,
  },
  elementChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    gap: 4,
  },
  elementEmoji: {
    fontSize: 14,
  },
  elementText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  elementTextActive: {
    color: 'white',
  },
  scrollView: {
    flexGrow: 1,
    flexShrink: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  currentCreatureCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    borderWidth: 3,
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  currentBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  currentBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  creatureAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  creatureEmoji: {
    fontSize: 50,
  },
  creatureName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  creatureDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  stageProgress: {
    alignItems: 'center',
    marginBottom: 16,
  },
  stageLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 8,
  },
  stageIndicator: {
    flexDirection: 'row',
    gap: 8,
  },
  stageDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stageDotEmoji: {
    fontSize: 20,
  },
  progressSection: {
    width: '100%',
    marginTop: 8,
  },
  progressLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 12,
    backgroundColor: '#E0E0E0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 6,
  },
  fullyEvolvedBadge: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 8,
  },
  fullyEvolvedText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    marginTop: 8,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  collectedCard: {
    width: 85,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    alignItems: 'center',
    position: 'relative',
  },
  collectedAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  collectedEmoji: {
    fontSize: 28,
  },
  collectedName: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  elementBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  elementBadgeText: {
    fontSize: 10,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#999',
  },
  allCreaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  previewCreature: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'white',
    minWidth: 70,
  },
  previewEmoji: {
    fontSize: 24,
  },
  previewName: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  itemsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  itemCard: {
    width: 80,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  itemLocked: {
    backgroundColor: '#F8F8F8',
    opacity: 0.7,
  },
  itemEmoji: {
    fontSize: 28,
    marginBottom: 4,
  },
  itemEmojiLocked: {
    opacity: 0.3,
  },
  lockIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
    fontSize: 12,
  },
  itemName: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  itemNameLocked: {
    color: '#AAA',
  },
  hintBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  hintText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
  },
});
