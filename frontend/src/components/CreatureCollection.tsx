import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Creature } from '../utils/api';

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
}

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
}) => {
  const [activeTab, setActiveTab] = useState<'creature' | 'items'>('creature');
  
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: zoneColor + '20' }]}>
            <Text style={styles.title}>{t('creature_collection') || 'My Creatures'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Tabs */}
          <View style={styles.tabs}>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'creature' && { backgroundColor: zoneColor }]}
              onPress={() => setActiveTab('creature')}
            >
              <Text style={[styles.tabText, activeTab === 'creature' && styles.tabTextActive]}>
                {t('your_creature') || 'Your Creature'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === 'items' && { backgroundColor: zoneColor }]}
              onPress={() => setActiveTab('items')}
            >
              <Text style={[styles.tabText, activeTab === 'items' && styles.tabTextActive]}>
                {t('bonus_items') || 'Bonus Items'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.scrollView} 
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {activeTab === 'creature' ? (
              <>
                {/* Current Creature */}
                <View style={[styles.currentCreatureCard, { borderColor: zoneColor }]}>
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

                {/* Collected Creatures */}
                {collectedCreatures.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{t('collected_creatures') || 'Collected'}</Text>
                    <View style={styles.collectionGrid}>
                      {collectedCreatures.map((creature) => {
                        const cZone = creature.zone || 'blue';
                        const cColor = zoneColors[cZone] || '#4FC3F7';
                        return (
                          <View key={creature.id} style={[styles.collectedCard, { borderColor: cColor }]}>
                            <View style={[styles.collectedAvatar, { backgroundColor: cColor + '30' }]}>
                              <Text style={styles.collectedEmoji}>{creature.stages[3].emoji}</Text>
                            </View>
                            <Text style={styles.collectedName}>{creature.stages[3].name}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                )}

                {/* All 4 Creatures Preview */}
                <Text style={styles.sectionTitle}>All Creatures</Text>
                <View style={styles.allCreaturesRow}>
                  <View style={[styles.previewCreature, { borderColor: '#4FC3F7' }]}>
                    <Text style={styles.previewEmoji}>💧</Text>
                    <Text style={styles.previewName}>Aqua</Text>
                  </View>
                  <View style={[styles.previewCreature, { borderColor: '#81C784' }]}>
                    <Text style={styles.previewEmoji}>🌱</Text>
                    <Text style={styles.previewName}>Leaf</Text>
                  </View>
                  <View style={[styles.previewCreature, { borderColor: '#FFD54F' }]}>
                    <Text style={styles.previewEmoji}>⚡</Text>
                    <Text style={styles.previewName}>Spark</Text>
                  </View>
                  <View style={[styles.previewCreature, { borderColor: '#FF7043' }]}>
                    <Text style={styles.previewEmoji}>🔥</Text>
                    <Text style={styles.previewName}>Blaze</Text>
                  </View>
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
                      <View key={move.id} style={[styles.itemCard, !isUnlocked && styles.itemLocked]}>
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{move.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? move.name : `Stage ${move.unlocks_at_stage}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Outfits Section */}
                <Text style={styles.sectionTitle}>{t('outfits') || 'Outfits'}</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.outfits || []).map((outfit: any) => {
                    const isUnlocked = unlockedOutfits.includes(outfit.id);
                    return (
                      <View key={outfit.id} style={[styles.itemCard, !isUnlocked && styles.itemLocked]}>
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{outfit.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? outfit.name : `Stage ${outfit.unlocks_at_stage}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Foods Section */}
                <Text style={styles.sectionTitle}>{t('foods') || 'Food'}</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.foods || []).map((food: any) => {
                    const isUnlocked = unlockedFoods.includes(food.id);
                    return (
                      <View key={food.id} style={[styles.itemCard, !isUnlocked && styles.itemLocked]}>
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{food.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? food.name : `Stage ${food.unlocks_at_stage}`}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Homes Section */}
                <Text style={styles.sectionTitle}>{t('homes') || 'Homes'}</Text>
                <View style={styles.itemsGrid}>
                  {(currentCreature.homes || []).map((home: any) => {
                    const isUnlocked = unlockedHomes.includes(home.id);
                    return (
                      <View key={home.id} style={[styles.itemCard, !isUnlocked && styles.itemLocked]}>
                        <Text style={[styles.itemEmoji, !isUnlocked && styles.itemEmojiLocked]}>{home.emoji}</Text>
                        {!isUnlocked && <Text style={styles.lockIcon}>🔒</Text>}
                        <Text style={[styles.itemName, !isUnlocked && styles.itemNameLocked]}>
                          {isUnlocked ? home.name : `Stage ${home.unlocks_at_stage}`}
                        </Text>
                      </View>
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
    maxHeight: '85%',
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
    width: 80,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    borderWidth: 2,
    alignItems: 'center',
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
  allCreaturesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  previewCreature: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    backgroundColor: 'white',
  },
  previewEmoji: {
    fontSize: 24,
  },
  previewName: {
    fontSize: 10,
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
