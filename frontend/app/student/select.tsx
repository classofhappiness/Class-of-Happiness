import React, { useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Animated, Pressable } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { CreatureCollection } from '../../src/components/CreatureCollection';
import { rewardsApi, StudentCollection, StudentRewards, Creature } from '../../src/utils/api';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';

interface StudentCreatureData {
  currentCreature: Creature;
  currentStage: number;
  collectedCreatures: Creature[];
  totalPoints: number;
}

export default function StudentSelectScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { students, presetAvatars, setCurrentStudent, currentStudent, refreshStudents, t, language, translations } = useApp();
  const [showCollection, setShowCollection] = useState(false);
  const [collectionData, setCollectionData] = useState<StudentCollection | null>(null);
  const [selectedStudentForCollection, setSelectedStudentForCollection] = useState<string | null>(null);
  const [studentCreatures, setStudentCreatures] = useState<Record<string, StudentCreatureData>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Hide default header and use custom translated header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Fetch creature data for all students
  useEffect(() => {
    // Preload sounds for the student pages
    preloadSounds();
    
    const fetchAllCreatures = async () => {
      const creatureData: Record<string, StudentCreatureData> = {};
      
      for (const student of students) {
        try {
          const collection = await rewardsApi.getCollection(student.id);
          creatureData[student.id] = {
            currentCreature: collection.current_creature,
            currentStage: collection.current_stage,
            collectedCreatures: collection.collected_creatures,
            totalPoints: collection.current_points,
            allCreatures: collection.all_creatures || [],
          } as any;
        } catch (error) {
          console.error(`Error fetching creatures for ${student.id}:`, error);
        }
      }
      
      setStudentCreatures(creatureData);
    };

    if (students.length > 0) {
      fetchAllCreatures();
    }
  }, [students]);

  const handleSelectStudent = useCallback((student: typeof students[0]) => {
    playSelectFeedback(); // Sound effect for selecting student
    setSelectedStudentId(student.id);
    setCurrentStudent(student);
    // Short delay to show selection before navigating
    setTimeout(() => {
      router.push('/student/zone');
    }, 200);
  }, [setCurrentStudent, router]);

  const handleViewCreatures = async (studentId: string) => {
    playButtonFeedback(); // Sound effect for button press
    try {
      const collection = await rewardsApi.getCollection(studentId);
      setCollectionData(collection);
      setSelectedStudentForCollection(studentId);
      setShowCollection(true);
    } catch (error) {
      console.error('Error fetching collection:', error);
    }
  };

  const handleCreateProfile = () => {
    playButtonFeedback(); // Sound effect for button press
    router.push('/profiles/create');
  };

  // Render mini creature icons for a student
  const renderCreatureIcons = (studentId: string) => {
    const data = studentCreatures[studentId];
    if (!data) return null;

    const { currentCreature, currentStage, collectedCreatures } = data;
    
    // Get ALL 4 creatures with progress from collection data
    const allCreatures = (data as any).allCreatures || [];
    
    // If we have all creatures data, show all 4
    if (allCreatures.length > 0) {
      return (
        <View style={styles.creatureIconsContainer}>
          <View style={styles.collectedIcons}>
            {allCreatures.slice(0, 4).map((creature: any) => {
              const cStage = Number(creature.current_stage || 0);
              const cColor = creature.color || '#CCC';
              const cEmoji = creature.stages?.[cStage]?.emoji || '🥚';
              const hasPoints = Number(creature.current_points || 0) > 0;
              return (
                <View
                  key={creature.id}
                  style={[styles.collectedCreatureIcon, { 
                    backgroundColor: hasPoints ? cColor + '30' : '#F0F0F0',
                    borderWidth: 1,
                    borderColor: hasPoints ? cColor : '#DDD',
                  }]}
                >
                  <Text style={[styles.collectedEmoji, { opacity: hasPoints ? 1 : 0.4 }]}>
                    {cEmoji}
                  </Text>
                  {cStage >= 3 && (
                    <View style={[styles.completeBadge, { backgroundColor: cColor }]}>
                      <Text style={styles.completeBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.creatureIconsContainer}>
        {/* Current creature (animated) */}
        <View style={[styles.currentCreatureIcon, { borderColor: currentCreature.color }]}>
          <Text style={styles.miniCreatureEmoji}>
            {currentCreature.stages[currentStage].emoji}
          </Text>
          <View style={styles.stageDots}>
            {[0, 1, 2, 3].map((s) => (
              <View 
                key={s} 
                style={[styles.stageDot, { backgroundColor: s <= currentStage ? currentCreature.color : '#DDD' }]} 
              />
            ))}
          </View>
        </View>

        {/* Collected creatures (smaller) */}
        {collectedCreatures.length > 0 && (
          <View style={styles.collectedIcons}>
            {collectedCreatures.slice(0, 3).map((creature) => (
              <View 
                key={creature.id} 
                style={[styles.collectedCreatureIcon, { backgroundColor: creature.color + '30' }]}
              >
                <Text style={styles.collectedEmoji}>
                  {creature.stages[3].emoji}
                </Text>
                <View style={[styles.completeBadge, { backgroundColor: creature.color }]}>
                  <Text style={styles.completeBadgeText}>✓</Text>
                </View>
              </View>
            ))}
            {collectedCreatures.length > 3 && (
              <View style={styles.moreCreatures}>
                <Text style={styles.moreText}>+{collectedCreatures.length - 3}</Text>
              </View>
            )}
          </View>
        )}

        {/* Total points badge */}
        {data.totalPoints > 0 && (
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsText}>⭐ {data.totalPoints}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('select_profile')} backTo="/" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.instruction}>{t('tap_to_check_in')}</Text>

        <View style={styles.studentsGrid}>
          {students.map((student) => (
            <Pressable
              key={student.id}
              style={({ pressed }) => [
                styles.studentCard, 
                selectedStudentId === student.id && styles.studentCardSelected,
                pressed && styles.studentCardPressed
              ]}
              onPress={() => handleSelectStudent(student)}
              android_ripple={{ color: 'rgba(76, 175, 80, 0.2)' }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              delayLongPress={200}
            >
              <View style={styles.studentMain}>
                {/* Selection indicator */}
                {selectedStudentId === student.id && (
                  <View style={styles.selectionIndicator}>
                    <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                  </View>
                )}
                <Avatar
                  type={student.avatar_type}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={60}
                  presetAvatars={presetAvatars}
                />
                <Text style={styles.studentName} numberOfLines={1}>
                  {student.name}
                </Text>
              </View>
              
              {/* Mini Creature Display */}
              {renderCreatureIcons(student.id)}
              
              <TouchableOpacity
                style={styles.creaturesButton}
                onPress={() => handleViewCreatures(student.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="pets" size={14} color="#FF9800" />
                <Text style={styles.creaturesButtonText}>{t('my_creatures') || 'My Creatures'}</Text>
              </TouchableOpacity>
            </Pressable>
          ))}

          {/* Add New Profile Button */}
          <TouchableOpacity
            style={[styles.studentCard, styles.addCard]}
            onPress={handleCreateProfile}
            activeOpacity={0.7}
          >
            <View style={styles.addIconContainer}>
              <MaterialIcons name="add" size={40} color="#4CAF50" />
            </View>
            <Text style={styles.addText}>{t('add_profile')}</Text>
          </TouchableOpacity>
        </View>

        {students.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="person-add" size={64} color="#CCC" />
            <Text style={styles.emptyText}>{t('no_profiles_yet')}</Text>
            <Text style={styles.emptySubtext}>{t('create_first_profile')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Creature Collection Modal */}
      {collectionData && (
        <CreatureCollection
          visible={showCollection}
          collectedCreatures={collectionData.collected_creatures}
          currentCreature={collectionData.current_creature}
          currentStage={collectionData.current_stage}
          currentPoints={collectionData.current_points || 0}
          totalCreatures={collectionData.total_creatures}
          unlockedMoves={collectionData.unlocked_moves || []}
          unlockedOutfits={collectionData.unlocked_outfits || []}
          unlockedFoods={collectionData.unlocked_foods || []}
          unlockedHomes={collectionData.unlocked_homes || []}
          allCreatures={collectionData?.all_creatures || []}
          t={t}
          onClose={() => setShowCollection(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 12,
    paddingTop: 20,
    paddingBottom: 30,
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  studentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  studentCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    width: '48%',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  studentCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  studentCardPressed: {
    backgroundColor: '#F0F0F0',
    transform: [{ scale: 0.98 }],
  },
  selectionIndicator: {
    position: 'absolute',
    top: -12,
    right: -12,
    backgroundColor: 'white',
    borderRadius: 12,
    zIndex: 1,
  },
  studentMain: {
    alignItems: 'center',
    position: 'relative',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 6,
    textAlign: 'center',
  },
  creaturesButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#333',
  },
  creaturesButtonText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  // Creature icons styles
  creatureIconsContainer: {
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  currentCreatureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  miniCreatureEmoji: {
    fontSize: 22,
  },
  stageDots: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 2,
  },
  stageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  collectedIcons: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 3,
  },
  collectedCreatureIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  collectedEmoji: {
    fontSize: 12,
  },
  completeBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeBadgeText: {
    color: 'white',
    fontSize: 6,
    fontWeight: 'bold',
  },
  moreCreatures: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#666',
  },
  pointsBadge: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
  },
  pointsText: {
    fontSize: 9,
    color: '#F9A825',
    fontWeight: 'bold',
  },
  addCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    backgroundColor: '#F1F8F1',
  },
  addIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 8,
  },
});
