import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
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
import { getStudentShield, SHIELD_LEVELS } from '../../src/utils/notifications';
import { CreatureDisplay } from '../../src/components/CreatureDisplay';
import { EvolutionAnimation } from '../../src/components/EvolutionAnimation';
import { CreatureCollection } from '../../src/components/CreatureCollection';
import { playButtonFeedback, playRewardFeedback, playEvolutionSound, preloadSounds } from '../../src/utils/sounds';


// Zone-specific tips — research-backed, age appropriate (6-12), 3-4 words max
const ZONE_TIPS: Record<string, string[]> = {
  blue: [
    'Rest helps you grow',
    'Still waters run deep',
    'Rest is productive',
  ],
  green: [
    'You are doing great',
    'Share your good energy',
    'Help someone today',
  ],
  yellow: [
    'Breathe, then decide',
    "Slow down, you're safe",
    'Wiggle it all out',
  ],
  red: [
    "Breathe deep, you're safe",
    'This feeling will pass',
    'Ask for help now',
  ],
};

const STUDENT_COLOUR_MESSAGE: Record<string, string> = {
  blue: "It's okay to feel quiet. Rest and be kind to yourself.",
  green: "You're in a great space! Keep sharing that energy.",
  yellow: "Feeling wobbly is normal. Use your helpers to find calm.",
  red: "Big feelings are okay. You are safe and supported.",
};

export default function RewardsScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { currentStudent, t } = useApp();
  const params = useLocalSearchParams<{ 
    strategiesUsed?: string; 
    hasComment?: string;
    zone?: string;
    fromFamily?: string;
    returnTo?: string;
  }>();

  const [rewardsData, setRewardsData] = useState<AddPointsResponse | null>(null);
  const [shield, setShield] = useState<{ has_shield: boolean; level: string | null; count: number; label?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [showContinue, setShowContinue] = useState(false);
  const [showEvolution, setShowEvolution] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [previousStage, setPreviousStage] = useState(0);
  const [collectionData, setCollectionData] = useState<any>(null);

  // Animation refs
  const pointsAnim = useRef(new Animated.Value(0)).current;
  const celebrateAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    preloadSounds();
    if (currentStudent) {
      addPointsAndFetchRewards();
    } else {
      // No student found - just show celebration
      setLoading(false);
    }
  }, [currentStudent]);

  const addPointsAndFetchRewards = async () => {
    if (!currentStudent) return;
    
    // For family members, use their auto-created student_id if available
    const effectiveStudentId = (currentStudent as any).student_id || currentStudent.id;
    const isFamilyMember = (currentStudent as any).is_family_member;
    if (isFamilyMember && !(currentStudent as any).student_id) {
      // No student record yet — show simple celebration
      setLoading(false);
      return;
    }

    try {
      const zone = params.zone || 'blue';
      const isLinkedStudent = true;
      
      // First get current stage to track evolution
      const currentRewards = await rewardsApi.getStudentRewards(effectiveStudentId);
      setPreviousStage(currentRewards.current_stage);

      const strategiesCount = params.strategiesUsed ? parseInt(params.strategiesUsed) : 0;
      const hasComment = params.hasComment === 'true';

      // Always add points for checking in - WITH THE ZONE to feed correct creature!
      let response: AddPointsResponse = await rewardsApi.addPoints(effectiveStudentId, 'checkin', 1, zone);

      // Add bonus points for strategies used - same zone
      if (strategiesCount > 0) {
        response = await rewardsApi.addPoints(effectiveStudentId, 'strategy', strategiesCount, zone);
      }

      // Add bonus points for comment if present - same zone
      if (hasComment) {
        response = await rewardsApi.addPoints(effectiveStudentId, 'comment', 1, zone);
      }

      setRewardsData(response);

      // Fetch collection data
      const collection = await rewardsApi.getCollection(effectiveStudentId);
      // Fetch shield badge
      const shieldData = await getStudentShield(effectiveStudentId);
      setShield(shieldData);
      setCollectionData(collection);

      // Start animations
      startAnimations(response);
    setTimeout(() => setShowContinue(true), 5500);
      
      // Play reward sound
      playRewardFeedback();

      // Check if evolved
      if (response.evolved && response.current_stage > previousStage) {
        setTimeout(() => {
          playEvolutionSound(); // Play evolution sound
          setShowEvolution(true);
        }, 1500);
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
    playButtonFeedback();
    if (params.returnTo === 'family') {
      router.replace('/parent/dashboard');
    } else {
      router.replace('/student/select');
    }
  };

  const celebrateScale = celebrateAnim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.3, 1],
  });

  if (loading || (!rewardsData && !(currentStudent as any)?.is_family_member)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingEmoji}>🥚</Text>
          <Text style={styles.loadingText}>{t('loading_creature')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Family member simple celebration (no rewards data)
  if (!rewardsData && ((currentStudent as any)?.is_family_member || (currentStudent as any)?.family_member_id)) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex:1, alignItems:'center', justifyContent:'center', padding:32 }}>
          <Text style={{ fontSize:80, marginBottom:16 }}>🎉</Text>
          <Text style={{ fontSize:24, fontWeight:'800', color:'#333', textAlign:'center', marginBottom:8 }}>
            {t('great_job_title') || 'Great job!'}
          </Text>
          <Text style={{ fontSize:15, color:'#888', textAlign:'center', marginBottom:40 }}>
            {currentStudent?.name}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor:'#5C6BC0', borderRadius:16, padding:18, width:'100%', alignItems:'center' }}
            onPress={() => router.replace('/parent/dashboard')}
          >
            <Text style={{ color:'white', fontSize:16, fontWeight:'700' }}>
              {t('done') || 'Done'} ✓
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.replace('/student/select')} style={{ padding: 6 }}>
          <MaterialIcons name="home" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      {/* Header - pushed down from top */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>🎉 {t('great_job_title')}</Text>
        <Text style={styles.headerSubtitle}>
          {rewardsData?.streak_days && rewardsData?.streak_days > 1 
            ? `🔥 ${rewardsData?.streak_days} ${t('day_streak')}` 
            : t('keep_it_up') || 'Keep it up!'}
        </Text>
      </View>

      {/* Creature Display */}
      <Animated.View style={[styles.creatureSection, { transform: [{ translateY: bounceAnim }] }]}>
        <CreatureDisplay
          creature={rewardsData?.current_creature}
          stage={rewardsData?.current_stage}
          currentPoints={rewardsData?.current_points}
          pointsForNext={rewardsData?.points_for_next_evolution}
          size="large"
          showProgress={true}
          animated={true}
        />
      </Animated.View>

      {/* Points Earned */}
      {rewardsData?.points_added > 0 && (
        <Animated.View style={[styles.pointsSection, { transform: [{ scale: celebrateScale }] }]}>
          <Text style={styles.pointsEarned}>+{rewardsData?.points_added} {t('points')}!</Text>
          {rewardsData?.streak_bonus > 0 && (
            <Text style={styles.streakBonus}>
              (+{rewardsData?.streak_bonus} {t('streak_bonus')} 🔥)
            </Text>
          )}
        </Animated.View>
      )}

      {/* Evolution Progress Hint */}
      {rewardsData?.points_for_next_evolution && (
        <View style={styles.progressHint}>
          <Text style={styles.progressHintText}>
            {rewardsData?.points_for_next_evolution - rewardsData?.current_points} {t('more_points_until')} {rewardsData?.current_creature.name} {t('evolves')}
          </Text>
        </View>
      )}

      {/* Zone-specific tip */}
      {(() => {
        const colour = (params as any)?.zone || '';
        const tips = ZONE_TIPS[colour] || ZONE_TIPS.green;
        const tip = tips[Math.floor(Date.now() / 1000) % tips.length];
        const msg = STUDENT_COLOUR_MESSAGE[colour] || '';
        return colour ? (
          <View style={{ marginHorizontal:20, marginBottom:10, padding:14, borderRadius:14,
            backgroundColor: colour==='blue'?'#EBF5FB': colour==='green'?'#EAFAF1': colour==='yellow'?'#FEFDE7':'#FDEDEC',
            borderLeftWidth:4, borderLeftColor: colour==='blue'?'#4A90D9': colour==='green'?'#4CAF50': colour==='yellow'?'#FFC107':'#F44336' }}>
            <Text style={{ fontSize:13, fontWeight:'700', color:'#333', marginBottom:4 }}>{tip}</Text>
            <Text style={{ fontSize:12, color:'#555', lineHeight:18 }}>{msg}</Text>
          </View>
        ) : null;
      })()}

      {/* Brave Shield Badge */}
      {shield?.has_shield && (
        <View style={styles.shieldContainer}>
          <View style={styles.shieldCard}>
            <Text style={styles.shieldEmoji}>
              {shield.level === 'gold' ? '🏆🛡️' :
               shield.level?.startsWith('silver') ? '🥈🛡️' : '🛡️'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.shieldTitle}>{shield.label || 'Brave Shield'}</Text>
              <Text style={styles.shieldSub}>You asked for help {shield.count} time{shield.count !== 1 ? 's' : ''} — that takes courage!</Text>
              {/* Progress to next level */}
              {(() => {
                const currentIdx = SHIELD_LEVELS.findIndex(s => s.level === shield.level);
                const next = SHIELD_LEVELS[currentIdx + 1];
                if (!next) return <Text style={styles.shieldMax}>🏆 Maximum level reached!</Text>;
                const progress = shield.count - SHIELD_LEVELS[currentIdx].min;
                const needed = next.min - SHIELD_LEVELS[currentIdx].min;
                const pct = Math.min(progress / needed, 1);
                return (
                  <View style={{ marginTop: 6 }}>
                    <Text style={styles.shieldNext}>{next.emoji} Next: {next.label} ({next.min - shield.count} more)</Text>
                    <View style={styles.shieldBar}>
                      <View style={[styles.shieldBarFill, { width: `${Math.round(pct * 100)}%` as any }]} />
                    </View>
                  </View>
                );
              })()}
            </View>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {/* Collection Button */}
        <TouchableOpacity 
          style={styles.collectionButton}
          onPress={() => {
            playButtonFeedback();
            setShowCollection(true);
          }}
        >
          <MaterialIcons name="pets" size={24} color="#FFD700" />
          <Text style={styles.collectionButtonText}>{t('my_creatures')}</Text>
        </TouchableOpacity>

        {/* New creature actions */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#1A1A2E', borderRadius: 50, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            onPress={() => router.push('/student/submit-creature')}>
            <Text style={{ fontSize: 14 }}>🎨</Text>
            <Text style={{ color: '#FFD93D', fontWeight: '900', fontSize: 12 }}>Submit a Creature</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#4CAF73', borderRadius: 50, paddingVertical: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            onPress={() => router.push('/student/world-creatures')}>
            <Text style={{ fontSize: 14 }}>🌍</Text>
            <Text style={{ color: 'white', fontWeight: '900', fontSize: 12 }}>World Creatures</Text>
          </TouchableOpacity>
        </View>

        {/* Continue Button */}
        {showContinue && (
          <TouchableOpacity 
            style={[styles.continueButton, { backgroundColor: rewardsData?.current_creature.color }]}
            onPress={handleContinue}
          >
            <Text style={styles.continueText}>{t('continue')}</Text>
            <MaterialIcons name="arrow-forward" size={24} color="white" />
          </TouchableOpacity>
        )}
        {!showContinue && (
          <View style={[styles.continueButton, { backgroundColor: '#DDD', alignItems:'center', justifyContent:'center' }]}>
            <Text style={{ color:'#AAA', fontSize:14, fontWeight:'600' }}>{'...'}</Text>
          </View>
        )}
      </View>

      {/* Evolution Animation Modal */}
      {showEvolution && rewardsData?.evolution_info && (
        <EvolutionAnimation
          visible={showEvolution}
          creature={rewardsData?.current_creature}
          fromStage={previousStage}
          toStage={rewardsData?.current_stage}
          onComplete={() => setShowEvolution(false)}
        />
      )}

      {/* Collection Modal */}
      {collectionData && (
        <CreatureCollection
          visible={showCollection}
          collectedCreatures={collectionData.collected_creatures || []}
          currentCreature={rewardsData?.current_creature}
          currentStage={rewardsData?.current_stage}
          currentPoints={rewardsData?.current_points}
          totalCreatures={collectionData.total_creatures}
          unlockedMoves={collectionData.unlocked_moves || []}
          unlockedOutfits={collectionData.unlocked_outfits || []}
          unlockedFoods={collectionData.unlocked_foods || []}
          unlockedHomes={collectionData.unlocked_homes || []}
          allCreatures={collectionData.all_creatures || []}
          t={t}
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
    flexDirection: 'column',
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 16,
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
    width: '100%',
  },
  shieldContainer: { paddingHorizontal: 20, marginBottom: 12 },
  shieldCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1.5, borderColor: '#FFD54F' },
  shieldEmoji: { fontSize: 32, marginTop: 2 },
  shieldTitle: { fontSize: 15, fontWeight: '700', color: '#F57F17' },
  shieldSub: { fontSize: 11, color: '#888', marginTop: 2 },
  shieldNext: { fontSize: 11, color: '#5C6BC0', fontWeight: '600', marginBottom: 4 },
  shieldMax: { fontSize: 11, color: '#FF8F00', fontWeight: '700', marginTop: 4 },
  shieldBar: { height: 6, backgroundColor: '#FFE082', borderRadius: 3, overflow: 'hidden' },
  shieldBarFill: { height: 6, backgroundColor: '#FFA000', borderRadius: 3 },
  collectionButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    gap: 8,
    width: '100%',
  },
  headerSpacer: { height: 20 },
  continueText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
