import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  TouchableOpacity, 
  Animated,
  Easing
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { rewardsApi, Creature, AddPointsResponse } from '../../src/utils/api';
import { CreatureDisplay } from '../../src/components/CreatureDisplay';
import { EvolutionAnimation } from '../../src/components/EvolutionAnimation';
import { CreatureCollection } from '../../src/components/CreatureCollection';

export default function RewardsScreen() {
  const router = useRouter();
  const { currentStudent, t } = useApp();
  const params = useLocalSearchParams<{ 
    strategiesUsed?: string; 
    hasComment?: string;
  }>();

  const [rewardsData, setRewardsData] = useState<AddPointsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEvolution, setShowEvolution] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [previousStage, setPreviousStage] = useState(0);
  const [collectionData, setCollectionData] = useState<any>(null);

  // Animation refs
  const pointsAnim = useRef(new Animated.Value(0)).current;
  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (currentStudent) {
      addPointsAndFetchRewards();
    }
  }, [currentStudent]);

  const addPointsAndFetchRewards = async () => {
    if (!currentStudent) return;

    try {
      // First get current stage to track evolution
      const currentRewards = await rewardsApi.getStudentRewards(currentStudent.id);
      setPreviousStage(currentRewards.current_stage);

      const strategiesCount = params.strategiesUsed ? parseInt(params.strategiesUsed) : 0;
      const hasComment = params.hasComment === 'true';

      // Always add points for checking in!
      let response: AddPointsResponse = await rewardsApi.addPoints(currentStudent.id, 'checkin');

      // Add bonus points for strategies used
      if (strategiesCount > 0) {
        response = await rewardsApi.addPoints(currentStudent.id, 'strategy', strategiesCount);
      }

      // Add bonus points for comment if present
      if (hasComment) {
        response = await rewardsApi.addPoints(currentStudent.id, 'comment');
      }

      setRewardsData(response);

      // Fetch collection data
      const collection = await rewardsApi.getCollection(currentStudent.id);
      setCollectionData(collection);

      // Start animations
      startAnimations(response);

      // Check if evolved
      if (response.evolved && response.current_stage > previousStage) {
        setTimeout(() => setShowEvolution(true), 1500);
      }

    } catch (error) {
      console.error('Error fetching rewards:', error);
    } finally {
      setLoading(false);
    }
  };

  const startAnimations = (response: AddPointsResponse) => {
    // Points counting animation
    Animated.timing(pointsAnim, {
      toValue: response.points_added,
      duration: 1000,
      easing: Easing.out(Easing.ease),
      useNativeDriver: false,
    }).start();

    // Celebration animation
    if (response.points_added > 0) {
      Animated.sequence([
        Animated.timing(celebrateAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.spring(celebrateAnim, {
          toValue: 0,
          friction: 3,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Bounce animation for creature
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -15,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const handleContinue = () => {
    router.replace('/student/select');
  };

  const celebrateScale = celebrateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.3, 1],
  });

  if (loading || !rewardsData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingEmoji}>🥚</Text>
          <Text style={styles.loadingText}>{t('loading_creature')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎉 {t('great_job_title')}</Text>
        <Text style={styles.headerSubtitle}>
          {rewardsData.streak_days > 1 
            ? `🔥 ${rewardsData.streak_days} ${t('day_streak')}` 
            : t('keep_it_up')}
        </Text>
      </View>

      {/* Creature Display */}
      <Animated.View style={[styles.creatureSection, { transform: [{ translateY: bounceAnim }] }]}>
        <CreatureDisplay
          creature={rewardsData.current_creature}
          stage={rewardsData.current_stage}
          currentPoints={rewardsData.current_points}
          pointsForNext={rewardsData.points_for_next_evolution}
          size="large"
          showProgress={true}
          animated={true}
        />
      </Animated.View>

      {/* Points Earned */}
      {rewardsData.points_added > 0 && (
        <Animated.View style={[styles.pointsSection, { transform: [{ scale: celebrateScale }] }]}>
          <Text style={styles.pointsEarned}>+{rewardsData.points_added} {t('points')}!</Text>
          {rewardsData.streak_bonus > 0 && (
            <Text style={styles.streakBonus}>
              (+{rewardsData.streak_bonus} streak bonus! 🔥)
            </Text>
          )}
        </Animated.View>
      )}

      {/* Evolution Progress Hint */}
      {rewardsData.points_for_next_evolution && (
        <View style={styles.progressHint}>
          <Text style={styles.progressHintText}>
            {rewardsData.points_for_next_evolution - rewardsData.current_points} {t('more_points_until')} {rewardsData.current_creature.name} {t('evolves')}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {/* Collection Button */}
        <TouchableOpacity 
          style={styles.collectionButton}
          onPress={() => setShowCollection(true)}
        >
          <MaterialIcons name="pets" size={24} color="#FFD700" />
          <Text style={styles.collectionButtonText}>{t('my_creatures')}</Text>
        </TouchableOpacity>

        {/* Continue Button */}
        <TouchableOpacity 
          style={[styles.continueButton, { backgroundColor: rewardsData.current_creature.color }]}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>{t('continue')}</Text>
          <MaterialIcons name="arrow-forward" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Evolution Animation Modal */}
      {showEvolution && rewardsData.evolution_info && (
        <EvolutionAnimation
          visible={showEvolution}
          creature={rewardsData.current_creature}
          fromStage={previousStage}
          toStage={rewardsData.current_stage}
          onComplete={() => setShowEvolution(false)}
        />
      )}

      {/* Collection Modal */}
      {collectionData && (
        <CreatureCollection
          visible={showCollection}
          collectedCreatures={collectionData.collected_creatures}
          currentCreature={rewardsData.current_creature}
          currentStage={rewardsData.current_stage}
          totalCreatures={collectionData.total_creatures}
          onClose={() => setShowCollection(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 4,
  },
  creatureSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  pointsSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  pointsEarned: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  streakBonus: {
    fontSize: 14,
    color: '#FF9800',
    marginTop: 4,
  },
  progressHint: {
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 32,
  },
  progressHintText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  collectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#1a1a2e',
    gap: 8,
  },
  collectionButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 8,
  },
  continueText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
