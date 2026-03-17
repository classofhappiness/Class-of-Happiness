import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal } from 'react-native';
import { Creature } from '../utils/api';

interface CreatureCollectionProps {
  visible: boolean;
  collectedCreatures: Creature[];
  currentCreature: Creature;
  currentStage: number;
  totalCreatures: number;
  onClose: () => void;
}

export const CreatureCollection: React.FC<CreatureCollectionProps> = ({
  visible,
  collectedCreatures,
  currentCreature,
  currentStage,
  totalCreatures,
  onClose,
}) => {
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
          <View style={styles.header}>
            <Text style={styles.title}>🏆 My Creatures</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Progress */}
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Collected: {collectedCreatures.length} / {totalCreatures}
            </Text>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${(collectedCreatures.length / totalCreatures) * 100}%` }
                ]} 
              />
            </View>
          </View>

          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Current Creature */}
            <Text style={styles.sectionTitle}>🌟 Current Friend</Text>
            <View style={[styles.creatureCard, { borderColor: currentCreature.color }]}>
              <View style={[styles.creatureAvatar, { backgroundColor: currentCreature.color + '20' }]}>
                <Text style={styles.creatureEmoji}>
                  {currentCreature.stages[currentStage].emoji}
                </Text>
              </View>
              <View style={styles.creatureInfo}>
                <Text style={styles.creatureName}>{currentCreature.stages[currentStage].name}</Text>
                <Text style={styles.creatureDesc}>{currentCreature.description}</Text>
                <View style={styles.stageIndicator}>
                  {currentCreature.stages.map((stage, index) => (
                    <View
                      key={index}
                      style={[
                        styles.stageDot,
                        { 
                          backgroundColor: index <= currentStage ? currentCreature.color : '#DDD',
                        },
                      ]}
                    />
                  ))}
                </View>
              </View>
            </View>

            {/* Collected Creatures */}
            {collectedCreatures.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>✨ Fully Evolved</Text>
                <View style={styles.collectionGrid}>
                  {collectedCreatures.map((creature) => (
                    <View 
                      key={creature.id} 
                      style={[styles.collectedCard, { borderColor: creature.color }]}
                    >
                      <View style={[styles.collectedAvatar, { backgroundColor: creature.color + '20' }]}>
                        <Text style={styles.collectedEmoji}>
                          {creature.stages[3].emoji}
                        </Text>
                      </View>
                      <Text style={styles.collectedName}>{creature.stages[3].name}</Text>
                      <View style={[styles.completeBadge, { backgroundColor: creature.color }]}>
                        <Text style={styles.completeBadgeText}>Complete!</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Empty State */}
            {collectedCreatures.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>🥚</Text>
                <Text style={styles.emptyTitle}>Keep Growing!</Text>
                <Text style={styles.emptyText}>
                  Use strategies and write about your feelings to evolve your creature and start collecting!
                </Text>
              </View>
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
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 24,
    color: '#666',
  },
  progressContainer: {
    padding: 16,
    backgroundColor: '#F8F9FA',
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFD700',
    borderRadius: 4,
  },
  scrollView: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    marginBottom: 12,
  },
  creatureCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  creatureAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  creatureEmoji: {
    fontSize: 48,
  },
  creatureInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  creatureName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  creatureDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  stageIndicator: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 6,
  },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  collectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  collectedCard: {
    width: '47%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  collectedAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  collectedEmoji: {
    fontSize: 36,
  },
  collectedName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  completeBadge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  completeBadgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
    marginTop: 16,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});
