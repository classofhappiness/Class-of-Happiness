import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Animated,
  Easing,
  ScrollView,
  Alert
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { rewardsApi, Creature, AddPointsResponse } from '../../src/utils/api';
import { getStudentShield, SHIELD_LEVELS } from '../../src/utils/notifications';
import { CreatureDisplay } from '../../src/components/CreatureDisplay';
import { CommunityCreatureDisplay } from '../../src/components/CommunityCreatureDisplay';
import { EvolutionAnimation } from '../../src/components/EvolutionAnimation';
import { CommunityEvolutionAnimation } from '../../src/components/CommunityEvolutionAnimation';
import { BonusItemCelebration, CelebrationItem } from '../../src/components/BonusItemCelebration';
import { playButtonFeedback, playRewardFeedback, playEvolutionSound, preloadSounds } from '../../src/utils/sounds';
import { playPhraseFromPool } from '../../src/utils/voiceClips';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { Swipeable } from 'react-native-gesture-handler';
import { EvolutionProgressBar, DEFAULT_CREATURE_THRESHOLDS, COMMUNITY_CREATURE_THRESHOLDS } from '../../src/components/EvolutionProgressBar';


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
  const { currentStudent, t, language } = useApp();
  const params = useLocalSearchParams<{ 
    strategiesUsed?: string; 
    hasComment?: string;
    zone?: string;
    fromFamily?: string;
    returnTo?: string;
  }>();

  const [rewardsData, setRewardsData] = useState<AddPointsResponse | null>(null);
  const [shield, setShield] = useState<{ has_shield: boolean; level: string | null; count: number; label?: string } | null>(null);
  const [shieldDismissed, setShieldDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showContinue, setShowContinue] = useState(false);
  const [showEvolution, setShowEvolution] = useState(false);
  // Real fix Sep 15 (B1 core-loop bug): community creatures need their own "you just
  // evolved!" moment - the default showEvolution modal is hard-gated to creatures with a
  // .stages array (community creatures don't have one, and would crash it), so it silently
  // never rendered for them, and worse, visibleStage never advanced either since nothing ever
  // called its onComplete. See CommunityEvolutionAnimation for the full context.
  const [showCommunityEvolution, setShowCommunityEvolution] = useState(false);
  const [showBonusCelebration, setShowBonusCelebration] = useState(false);
  const [celebrationItems, setCelebrationItems] = useState<CelebrationItem[]>([]);
  const [previousStage, setPreviousStage] = useState(0);
  // Real fix Sep 15 (Marisa build-26, S06 sync bug): the main creature display behind the
  // evolution modal used to render rewardsData.current_stage directly - the NEW, already-
  // evolved stage - from the very first render, while the modal itself still correctly
  // starts its animation from the OLD stage 1500ms later. Result: the background screen
  // already showed/named "shark" before the modal's own dolphin->shark transition had even
  // started. This tracks what the main display should actually show right now - the old
  // stage while an evolution is pending/animating, switching to the new one only once the
  // modal's onComplete fires (see below).
  const [visibleStage, setVisibleStage] = useState(0);
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): evolution is now explicit -
  // this screen shows an Evolve button instead of auto-triggering the animation the instant a
  // threshold is crossed. evolvingCreatureId doubles as the "is the evolve request in
  // flight" flag so the button can't be double-tapped.
  const [evolutionReady, setEvolutionReady] = useState(false);
  const [evolvingCreatureId, setEvolvingCreatureId] = useState<string | null>(null);
  const [isEvolving, setIsEvolving] = useState(false);
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): evolving is a genuine choice,
  // never forced in the moment - a child can skip and evolve later from My Creatures instead
  // (see CreatureDetailModal's own Evolve button). No persistence needed for skipping: the
  // creature simply stays "ready" (evolution_ready keeps coming back true) until they
  // explicitly tap Evolve somewhere, on this screen or that one - no time limit, no penalty.
  const [evolveSkipped, setEvolveSkipped] = useState(false);
  const [tipVisible, setTipVisible] = useState(true);
  const tipOpacityAnim = useRef(new Animated.Value(1)).current;

  const dismissTip = () => {
    Animated.timing(tipOpacityAnim, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start(() => setTipVisible(false));
  };

  useEffect(() => {
    // Real fix Aug 21: bumped from 5000ms - kids weren't getting enough time to read the tip
    // before it faded.
    const timer = setTimeout(() => dismissTip(), 7000);
    return () => clearTimeout(timer);
  }, []);

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
    // Real fix Sep 15 (Marisa build-26, S06): "space the reward screen out" - on a fast
    // connection this loading state (egg + EmotionColourLoader) could flash for well under a
    // second before the full reward screen slammed in. Floor of 900ms below gives it a
    // deliberate minimum beat regardless of network speed; a slow/cold-start fetch is
    // unaffected since it already takes longer than that on its own.
    const loadStartedAt = Date.now();

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

      // Fetch shield badge
      const shieldData = await getStudentShield(effectiveStudentId);
      setShield(shieldData);

      // Start animations
      startAnimations(response);
    setTimeout(() => setShowContinue(true), 5500);

      // Real feature Sep 15 (B1, points economy v2, Jono-approved): evolution is no longer
      // automatic - add_points never advances the stage any more (see server.py), so the
      // background display always shows the real current stage with nothing to hold back.
      // evolution_ready (only ever true for default creatures - community creatures have no
      // .stages array and use a different, check-in-count progression) drives the Evolve
      // button below instead of an auto-triggered animation.
      setVisibleStage(response.current_stage);
      setEvolutionReady(!!response.evolution_ready);
      setEvolvingCreatureId(response.current_creature?.id || null);

      // Real fix Sep 15 (Marisa build-26, S06): one sound effect for this moment - the plain
      // reward sound. The evolution sound now plays only when the student actually taps
      // Evolve (see handleEvolvePress), not blindly the instant a threshold is crossed.
      playRewardFeedback(true);
      // Real feature Aug 21, extended Aug 28 (item A): praise-phrase pool (Great_job/
      // Well_done/You_did_it/I_did_it), randomized so it's not the same line every check-in.
      playPhraseFromPool('praise', language);

    } catch (error) {
      console.error('Error fetching rewards:', error);
    } finally {
      const elapsed = Date.now() - loadStartedAt;
      if (elapsed < 900) {
        setTimeout(() => setLoading(false), 900 - elapsed);
      } else {
        setLoading(false);
      }
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

    // Bounce animation for creature. Real fix Aug 21: was -15 - combined with the header's
    // paddingBottom, the bounce could reach up into the "Keep it up!" subtitle above it.
    // Softened to -8, plus more fixed clearance in the header style, so it can't overlap
    // even at the top of the bounce.
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8,
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
    // Real feature Aug 28 (item A): farewell-phrase pool (See_you_tomorrow/
    // Thank_you_for_checking_in), the genuine "leaving the check-in session" moment -
    // fire-and-forget like every other voice clip in this app, plays over the navigation.
    playPhraseFromPool('farewell', language);
    if (params.returnTo === 'family') {
      router.replace('/parent/dashboard');
    } else if (params.returnTo === 'kiosk') {
      // Real fix Aug 30 (build-26, kiosk restore): a kiosk device only ever has
      // kiosk_token in storage, never session_token - falling through to the default
      // /student/select below (which reads session_token) was a dead end.
      router.replace('/kiosk');
    } else {
      router.replace('/student/select');
    }
  };

  // Real feature Sep 15 (B1, points economy v2, Jono-approved): the explicit Evolve action -
  // always free (see server.py's evolve_creature), never gated on anything spent in the Shop.
  const handleEvolvePress = async () => {
    if (!evolvingCreatureId || isEvolving) return;
    const effectiveStudentId = currentStudent ? ((currentStudent as any).student_id || currentStudent.id) : null;
    if (!effectiveStudentId) return;
    setIsEvolving(true);
    playButtonFeedback();
    try {
      const result = await rewardsApi.evolve(effectiveStudentId, evolvingCreatureId);
      const isCommunity = rewardsData?.current_creature?.creature_type === 'community';
      setPreviousStage(visibleStage);
      setEvolutionReady(false);
      playEvolutionSound();
      // Real fix Sep 15 (B1 core-loop bug): community creatures get their own animation
      // instead of the default one, which is hard-gated to creatures with a .stages array
      // and would never render for them - see CommunityEvolutionAnimation.
      if (isCommunity) {
        setShowCommunityEvolution(true);
      } else {
        setShowEvolution(true);
      }
      setRewardsData(prev => prev ? { ...prev, current_stage: result.current_stage, current_creature: result.current_creature } : prev);
      // Real feature Sep 15 ("Class of Happiness Shop"): newly-available items are announced
      // as a Shop invitation, not an auto-grant celebration - the child still chooses whether
      // and what to buy. No loss framing, no urgency - just letting them know what's there.
      if (result.newly_available_items && result.newly_available_items.length > 0) {
        setTimeout(() => {
          setCelebrationItems(result.newly_available_items as any);
          setShowBonusCelebration(true);
        }, 1800);
      }
    } catch (e) {
      Alert.alert(t('error') || 'Error', t('evolve_failed') || 'Could not evolve right now. Please try again.');
    } finally {
      setIsEvolving(false);
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
          <EmotionColourLoader visible size={56} />
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
        <TouchableOpacity onPress={() => {
          // Real fix Aug 30 (build-26, kiosk restore): same returnTo-aware destination as
          // handleContinue below - this header shortcut was bypassing it entirely.
          if (params.returnTo === 'family') router.replace('/parent/dashboard');
          else if (params.returnTo === 'kiosk') router.replace('/kiosk');
          else router.replace('/student/select');
        }} style={{ padding: 6 }}>
          <MaterialIcons name="home" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      {/* Real bug fix Aug 22: this whole middle section had no ScrollView - once the Bronze
          Shield overlap fix removed creatureSection's greedy flex:1, content could exceed
          screen height with nothing to scroll it, hiding the Continue button entirely. Action
          buttons stay pinned outside the ScrollView so the primary CTA is always reachable
          regardless of how much scrollable content stacks above it.
          Real fix Sep 15 (Marisa build-26 round 2, S06): flexGrow:1 here forced this content
          container to stretch and fill the full available height whenever its natural content
          was shorter than the screen - exactly the case once the Bronze Shield banner is
          dismissed (its whole block unmounts). Since buttonContainer already sits pinned
          outside the ScrollView as a fixed sibling, the scroll content never needed to fill
          the remaining space itself - dropping flexGrow lets it size to its real content
          height instead, so the gap above the buttons collapses when the shield is gone,
          while still scrolling correctly when content is genuinely tall (shield showing). */}
      <ScrollView showsVerticalScrollIndicator={false}>
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

      {/* Creature Display — real feature Aug 21: a community creature (photo-based) can now be
          the active pursuit for a colour, alongside the emoji-based default creatures. */}
      <Animated.View style={[styles.creatureSection, { transform: [{ translateY: bounceAnim }] }]}>
        {rewardsData?.current_creature?.creature_type === 'community' ? (
          <CommunityCreatureDisplay
            name={rewardsData.current_creature.name}
            emotionColour={rewardsData.current_creature.feeling_colour}
            stage1_url={rewardsData.current_creature.stage1_url}
            stage2_url={rewardsData.current_creature.stage2_url}
            stage3_url={rewardsData.current_creature.stage3_url}
            stage4_url={rewardsData.current_creature.stage4_url}
            stage={visibleStage}
            size="large"
          />
        ) : (
          <CreatureDisplay
            creature={rewardsData?.current_creature}
            stage={visibleStage}
            currentPoints={rewardsData?.current_points}
            pointsForNext={rewardsData?.points_for_next_evolution}
            size="large"
            showProgress={false}
            showGrowthIndicator={false}
            animated={true}
          />
        )}
      </Animated.View>

      {/* Real feature Sep 15 (B1, points economy v2, Jono-approved): colour-matched
          evolve-progress bar, shown right here in the moment points were just earned rather
          than only on My Creatures/creature detail - now the same EvolutionProgressBar used on
          those two screens too (extracted per Jono's instruction, one implementation instead
          of three). Replaces CreatureDisplay's own internal bar (disabled above via
          showProgress/showGrowthIndicator).
          Real fix Sep 15: the first version of this block used current_points and the default
          [0,25,60,120] thresholds for BOTH creature types - wrong for community creatures,
          whose current_points is deliberately repurposed by add_points to carry the stage
          count (0-4), not a points value, and whose real thresholds are a rolling 30-day
          check-in count ([0,5,10,15,20]). checkins_30d (new backend field, same change) carries
          the real current value for that branch. */}
      {(() => {
        const isCommunity = rewardsData?.current_creature?.creature_type === 'community';
        const zone = isCommunity ? rewardsData?.current_creature?.feeling_colour : rewardsData?.current_creature?.zone;
        const current = isCommunity ? (rewardsData?.checkins_30d || 0) : (rewardsData?.current_points || 0);
        const thresholds = isCommunity ? COMMUNITY_CREATURE_THRESHOLDS : DEFAULT_CREATURE_THRESHOLDS;
        return (
          <EvolutionProgressBar
            zone={zone}
            current={current}
            stageIndex={visibleStage}
            thresholds={thresholds}
            style={styles.evolveProgressContainer}
          />
        );
      })()}

      {/* Points Earned */}
      {rewardsData?.points_added > 0 && (
        <Animated.View style={[styles.pointsSection, { transform: [{ scale: celebrateScale }] }]}>
          <Text style={styles.pointsEarned}>+{rewardsData?.points_added} {t('points')}!</Text>
          {/* Real fix Sep 15 (B1, points economy v2, Jono-approved tone): genuine, specific
              praise for something the child actually did (checking in consistently) - never
              framed as progress toward an artificial goal or at risk of being lost. No "keep
              it up or lose your streak" pressure language anywhere. */}
          {rewardsData?.streak_bonus > 0 && rewardsData?.streak_days >= 2 && (
            <Text style={styles.streakBonus}>
              {(t('streak_praise') || "You checked in {days} days in a row - that's real consistency! 🔥").replace('{days}', String(rewardsData?.streak_days || 0))}
            </Text>
          )}
        </Animated.View>
      )}

      {/* Real feature Sep 15 (B1, points economy v2, Jono-approved): evolution is explicit
          now - this button only appears once genuinely eligible, replacing the old progress
          hint for that moment. The hint itself is also fixed here: points_for_next_evolution
          is now a real "points still needed" number from the backend (previously always
          undefined - this whole block never actually rendered in production before today),
          so it's shown directly rather than double-subtracting current_points from it. */}
      {evolutionReady && !evolveSkipped ? (
        <View style={styles.evolveActionsRow}>
          <TouchableOpacity
            style={styles.evolveButton}
            onPress={handleEvolvePress}
            disabled={isEvolving}
            activeOpacity={0.85}
          >
            <MaterialIcons name="auto-awesome" size={20} color="white" />
            <Text style={styles.evolveButtonText}>
              {isEvolving ? (t('evolving') || 'Evolving...') : (t('evolve_btn') || 'Evolve!')}
            </Text>
          </TouchableOpacity>
          {/* Real feature Sep 15 (B1, points economy v2, Jono-approved): evolving is always a
              choice, never forced in the celebratory moment - purely a local UI dismissal, no
              backend call and nothing persisted, since evolution_ready keeps being reported
              true by add_points until the student actually taps Evolve (here or later in
              My Creatures). No time limit, no penalty for skipping. */}
          <TouchableOpacity
            style={styles.evolveSkipButton}
            onPress={() => setEvolveSkipped(true)}
            disabled={isEvolving}
            activeOpacity={0.7}
          >
            <Text style={styles.evolveSkipButtonText}>{t('evolve_skip_btn') || 'Skip — evolve later'}</Text>
          </TouchableOpacity>
        </View>
      ) : evolutionReady && evolveSkipped ? (
        <View style={styles.progressHint}>
          <Text style={styles.progressHintText}>
            {t('evolve_ready_hint') || '✨ Ready to evolve whenever you like! Find them in My Creatures.'}
          </Text>
        </View>
      ) : rewardsData?.points_for_next_evolution ? (
        <View style={styles.progressHint}>
          <Text style={styles.progressHintText}>
            {rewardsData.points_for_next_evolution} {t('more_points_until')} {rewardsData?.current_creature?.name} {t('evolves')}
          </Text>
        </View>
      ) : null}

      {/* Zone-specific tip - real fix Aug 16: auto-dismisses after 5s, or tap
          the X to close immediately. Was permanently on-screen before,
          blocking the creature graphic below it. */}
      {(() => {
        const colour = (params as any)?.zone || '';
        const tips = ZONE_TIPS[colour] || ZONE_TIPS.green;
        const tip = tips[Math.floor(Date.now() / 1000) % tips.length];
        const msg = STUDENT_COLOUR_MESSAGE[colour] || '';
        return colour && tipVisible ? (
          <Animated.View style={{ opacity: tipOpacityAnim, marginHorizontal:20, marginBottom:10, padding:14, borderRadius:14,
            backgroundColor: colour==='blue'?'#EBF5FB': colour==='green'?'#EAFAF1': colour==='yellow'?'#FEFDE7':'#FDEDEC',
            borderLeftWidth:4, borderLeftColor: colour==='blue'?EMOTION_COLOURS.blue: colour==='green'?EMOTION_COLOURS.green: colour==='yellow'?EMOTION_COLOURS.yellow:EMOTION_COLOURS.red }}>
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
              <View style={{ flex:1 }}>
                <Text style={{ fontSize:13, fontWeight:'700', color:'#333', marginBottom:4 }}>{tip}</Text>
                <Text style={{ fontSize:12, color:'#555', lineHeight:18 }}>{msg}</Text>
              </View>
              <TouchableOpacity onPress={dismissTip} style={{ padding:4, marginLeft:8 }}>
                <Text style={{ fontSize:16, color:'#888', fontWeight:'700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        ) : null;
      })()}

      {/* Brave Shield Badge */}
      {shield?.has_shield && !shieldDismissed && (
        <View style={styles.shieldContainer}>
          {/* Real fix Sep 15: swipe-to-dismiss added, matching the Swipeable pattern already
              used for the parent/teacher dashboard tips (renderRightActions null +
              onSwipeableOpen dismiss). The X button stays too - swipe is additive, not a
              replacement. Explicit width:'100%' on the immediate child is required - Swipeable
              measures it via onLayout to compute the drag threshold, and without it the same
              gesture silently failed to register on the parent dashboard's identical card. */}
          <Swipeable renderRightActions={() => null} onSwipeableOpen={() => setShieldDismissed(true)}>
          <View style={[styles.shieldCard, { width: '100%' }]}>
            {/* Real feature Aug 22: lets a student dismiss the badge and just see their
                creature without it in the way. */}
            <TouchableOpacity
              onPress={() => setShieldDismissed(true)}
              style={styles.shieldDismissBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.shieldDismissText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.shieldEmoji}>
              {shield.level === 'gold' ? '🏆🛡️' :
               shield.level?.startsWith('silver') ? '🥈🛡️' : '🛡️'}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.shieldTitle}>{shield.label || 'Brave Shield'}</Text>
              <Text style={styles.shieldSub}>You asked for help {shield.count} time{shield.count !== 1 ? 's' : ''}, that takes courage!</Text>
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
          </Swipeable>
        </View>
      )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {/* Real fix Aug 23: My Creatures and Find World Creatures used to stack as two
            full-width buttons - Jono's ask was one row, side by side, half-width each, with
            Continue staying the one full-width, biggest button below. */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {/* real fix Aug 21: this used to open a modal (CreatureCollection) fed by the old
              defaults-only /rewards/{id}/collection endpoint, a separate surface from the
              community-creature collection screen reachable via World Creatures. Now
              navigates to the same, unified "My Creatures" screen either path leads to. */}
          <TouchableOpacity
            style={[styles.collectionButton, { flex: 1, width: undefined }]}
            onPress={() => {
              playButtonFeedback();
              router.push('/student/creatures');
            }}
          >
            <MaterialIcons name="pets" size={20} color="#FFD700" />
            <Text style={styles.collectionButtonText}>{t('my_creatures') || 'My Creatures'}</Text>
          </TouchableOpacity>

          {/* real fix Aug 22: this used to be two buttons (Submit a Creature + World
              Creatures) - redundant now that My Creatures (above) already surfaces both
              "Submit a Creature" and "Find a New Creature". Collapsed to the one action
              that's genuinely useful as a reward-page shortcut. */}
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: '#4CAF73', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            onPress={() => router.push('/student/world-creatures')}>
            <Text style={{ fontSize: 14 }}>🌍</Text>
            {/* Real bug fix Aug 23: this text had no flexShrink/wrap protection at all in a
                flex:1 row - fine for short English text, but a longer translation (e.g.
                Spanish "Buscar Criaturas del Mundo") had nowhere to go but overflow the
                button. flexShrink lets it wrap onto a second line instead, for any language,
                not just a patch for this one string. */}
            <Text style={{ color: 'white', fontWeight: '900', fontSize: 12, flexShrink: 1, textAlign: 'center' }}>{t('find_world_creatures') || 'Find World Creatures'}</Text>
          </TouchableOpacity>
        </View>

        {/* Continue Button */}
        {showContinue && (
          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: rewardsData?.current_creature?.color || EMOTION_COLOURS[(rewardsData?.current_creature?.feeling_colour || rewardsData?.feeling_colour) as keyof typeof EMOTION_COLOURS] || '#5C6BC0' }]}
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

      {/* Evolution Animation Modal — real fix Aug 23: this was gated on rewardsData?.evolution_info,
          a field add_points never actually returns, so the modal never showed for anyone. The
          real requirement is that current_creature has a stages array (only default creatures
          do — community creatures don't and would crash EvolutionAnimation's stages![fromStage]
          lookup), which this gate now checks directly. */}
      {showEvolution && rewardsData?.current_creature?.stages && (
        <EvolutionAnimation
          visible={showEvolution}
          creature={rewardsData?.current_creature}
          fromStage={previousStage}
          toStage={rewardsData?.current_stage}
          onComplete={() => {
            setShowEvolution(false);
            // Reveal the new stage on the background display now that the modal's own
            // dolphin->shark (etc.) transition has actually finished - see visibleStage note.
            setVisibleStage(rewardsData?.current_stage ?? 0);
          }}
        />
      )}

      {/* Real fix Sep 15 (B1 core-loop bug): the community-creature equivalent of the modal
          above - see CommunityEvolutionAnimation and handleEvolvePress for the full context.
          Same onComplete contract (reveal the new stage only once the animation finishes). */}
      {showCommunityEvolution && rewardsData?.current_creature?.creature_type === 'community' && (
        <CommunityEvolutionAnimation
          visible={showCommunityEvolution}
          name={rewardsData?.current_creature?.name}
          color={EMOTION_COLOURS[(rewardsData?.current_creature?.feeling_colour as keyof typeof EMOTION_COLOURS)] || EMOTION_COLOURS.blue}
          stage1_url={rewardsData?.current_creature?.stage1_url}
          stage2_url={rewardsData?.current_creature?.stage2_url}
          stage3_url={rewardsData?.current_creature?.stage3_url}
          stage4_url={rewardsData?.current_creature?.stage4_url}
          fromStage={previousStage}
          toStage={rewardsData?.current_stage ?? 0}
          onComplete={() => {
            setShowCommunityEvolution(false);
            setVisibleStage(rewardsData?.current_stage ?? 0);
          }}
        />
      )}

      {/* Bonus Items Celebration - real feature Aug 23 */}
      <BonusItemCelebration
        visible={showBonusCelebration}
        items={celebrationItems}
        colour={rewardsData?.feeling_colour || params.zone || 'blue'}
        onClose={() => setShowBonusCelebration(false)}
      />

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
    gap: 12,
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
    // Real fix Aug 21: was 10 - not enough fixed clearance before the creature circle below,
    // so its bounce animation reached up into this subtitle. Combined with softening the
    // bounce range itself (see bounceAnim below) so there's no overlap even at full bounce.
    paddingBottom: 26,
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
    // Real bug fix Aug 21: this was `flex: 1`, competing for space with every sibling below it
    // (points/progress/tip/shield/buttons) in the same flex column - when the Bronze Shield
    // badge was also showing, the box could compress enough that the bouncing creature's
    // bottom edge visually overlapped the shield card. Bounded to a fixed minHeight instead so
    // it never shrinks below the creature graphic's own size, regardless of what else renders.
    minHeight: 240,
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
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): the explicit Evolve button -
  // warm, not stimulating (Jono's design note) - same visual weight as other primary actions
  // on this screen, no flashing/pulsing.
  evolveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#5C6BC0', borderRadius: 16, paddingVertical: 12, paddingHorizontal: 24,
  },
  evolveButtonText: {
    color: 'white', fontSize: 15, fontWeight: '800',
  },
  evolveActionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginBottom: 20,
  },
  // Real feature Sep 15 (B1, points economy v2, Jono-approved): deliberately lower visual
  // weight than evolveButton (outline, not filled) - a real, easy-to-take option, but not
  // competing with the primary joyful action.
  evolveSkipButton: {
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 16,
    borderWidth: 1.5, borderColor: '#DDD',
  },
  evolveSkipButtonText: {
    color: '#888', fontSize: 13, fontWeight: '700',
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
  shieldContainer: { paddingHorizontal: 20, marginTop: 8, marginBottom: 12 },
  shieldCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14, paddingRight: 30, gap: 12, borderWidth: 1.5, borderColor: '#FFD54F', position: 'relative' },
  shieldDismissBtn: { position: 'absolute', top: 8, right: 8, zIndex: 1 },
  shieldDismissText: { fontSize: 14, fontWeight: '900', color: '#B8860B' },
  shieldEmoji: { fontSize: 32, marginTop: 2 },
  shieldTitle: { fontSize: 15, fontWeight: '700', color: '#F57F17' },
  shieldSub: { fontSize: 11, color: '#888', marginTop: 2 },
  shieldNext: { fontSize: 11, color: '#5C6BC0', fontWeight: '600', marginBottom: 4 },
  shieldMax: { fontSize: 11, color: '#FF8F00', fontWeight: '700', marginTop: 4 },
  shieldBar: { height: 6, backgroundColor: '#FFE082', borderRadius: 3, overflow: 'hidden' },
  shieldBarFill: { height: 6, backgroundColor: '#FFA000', borderRadius: 3 },
  evolveProgressContainer: { maxWidth: 220, alignSelf: 'center', marginTop: -8, marginBottom: 12 },
  collectionButtonText: {
    color: '#FFD700',
    fontSize: 16,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'center',
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
