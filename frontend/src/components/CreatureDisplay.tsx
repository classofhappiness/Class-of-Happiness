import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { Creature, CreatureStage } from '../utils/api';

interface CreatureDisplayProps {
  creature: Creature;
  stage: number;
  currentPoints: number;
  pointsForNext: number | null;
  size?: 'small' | 'medium' | 'large';
  showProgress?: boolean;
  animated?: boolean;
  showGrowthIndicator?: boolean;
}

export const CreatureDisplay: React.FC<CreatureDisplayProps> = ({
  creature,
  stage,
  currentPoints,
  pointsForNext,
  size = 'medium',
  showProgress = true,
  animated = true,
  showGrowthIndicator = true,
}) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const stageInfo = creature.stages[stage];
  
  // Calculate growth progress within current stage (0 to 1)
  const previousThreshold = stage > 0 ? creature.stages[stage].required_points : 0;
  const nextThreshold = pointsForNext || (previousThreshold + 20);
  const progressInStage = pointsForNext 
    ? Math.min((currentPoints - previousThreshold) / (nextThreshold - previousThreshold), 1)
    : 1;
  
  // Growth multiplier: creature grows 20% larger as it progresses through stage
  const growthMultiplier = 1 + (progressInStage * 0.25);
  
  const sizeConfig = {
    small: { emoji: 40, container: 80, fontSize: 12 },
    medium: { emoji: 80, container: 140, fontSize: 14 },
    large: { emoji: 120, container: 200, fontSize: 16 },
  }[size];

  // Apply growth to emoji size
  const dynamicEmojiSize = sizeConfig.emoji * growthMultiplier;

  useEffect(() => {
    if (!animated) return;

    // Idle bounce animation - faster when more progress
    const bounceDuration = 800 - (progressInStage * 200); // 800ms to 600ms
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -8 - (progressInStage * 7), // Bounce higher with more progress
          duration: bounceDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: bounceDuration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Glow animation when close to evolution (>70% progress)
    let glowLoop: Animated.CompositeAnimation | null = null;
    if (progressInStage > 0.7) {
      glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: false,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: false,
          }),
        ])
      );
      glowLoop.start();
    }

    // Pulse animation - creature "breathes"
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1 + (progressInStage * 0.08), // Pulse more with progress
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Gentle rotation for life-like movement
    const rotateLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 2000 - (progressInStage * 500),
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 2000 - (progressInStage * 500),
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 2000 - (progressInStage * 500),
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    bounceLoop.start();
    pulseLoop.start();
    rotateLoop.start();

    return () => {
      bounceLoop.stop();
      pulseLoop.stop();
      rotateLoop.stop();
      if (glowLoop) glowLoop.stop();
    };
  }, [animated, progressInStage]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-5deg', '0deg', '5deg'],
  });

  const progress = pointsForNext ? (currentPoints / pointsForNext) * 100 : 100;
  
  // Glow intensity based on progress
  const glowOpacity = progressInStage > 0.7 ? glowAnim : new Animated.Value(0);

  return (
    <View style={styles.container}>
      {/* Creature Container with dynamic glow */}
      <View style={[styles.creatureContainer, { 
        width: sizeConfig.container, 
        height: sizeConfig.container,
        backgroundColor: creature.color + '20',
        borderColor: creature.color,
        borderWidth: 3 + (progressInStage * 2), // Border gets thicker with progress
      }]}>
        {/* Glow effect when close to evolution */}
        {progressInStage > 0.7 && (
          <Animated.View
            style={[
              styles.glowEffect,
              {
                backgroundColor: creature.color,
                opacity: glowOpacity,
              },
            ]}
          />
        )}
        
        <Animated.View
          style={[
            styles.emojiContainer,
            {
              transform: [
                { translateY: bounceAnim },
                { rotate: rotateInterpolate },
                { scale: pulseAnim },
              ],
            },
          ]}
        >
          <Text style={[styles.emoji, { fontSize: dynamicEmojiSize }]}>
            {stageInfo.emoji}
          </Text>
        </Animated.View>
        
        {/* Growth sparkles when progressing */}
        {progressInStage > 0.3 && progressInStage < 1 && (
          <View style={styles.sparklesContainer}>
            {[...Array(Math.floor(progressInStage * 5))].map((_, i) => (
              <Text 
                key={i} 
                style={[
                  styles.sparkle,
                  { 
                    top: `${20 + (i * 15)}%`,
                    left: i % 2 === 0 ? '10%' : '80%',
                    opacity: 0.5 + (progressInStage * 0.5),
                  }
                ]}
              >
                ✨
              </Text>
            ))}
          </View>
        )}
      </View>

      {/* Name and Stage */}
      <Text style={[styles.name, { fontSize: sizeConfig.fontSize + 2, color: creature.color }]}>
        {stageInfo.name}
      </Text>
      
      <Text style={[styles.description, { fontSize: sizeConfig.fontSize - 2 }]}>
        {stageInfo.description}
      </Text>

      {/* Growth indicator */}
      {showGrowthIndicator && pointsForNext && (
        <View style={styles.growthContainer}>
          <View style={styles.growthStars}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Text 
                key={star} 
                style={[
                  styles.growthStar,
                  { opacity: progressInStage >= (star / 5) ? 1 : 0.2 }
                ]}
              >
                ⭐
              </Text>
            ))}
          </View>
          <Text style={styles.growthText}>
            {progressInStage >= 0.9 ? '🔥 Almost ready to evolve!' : 
             progressInStage >= 0.5 ? '💪 Growing strong!' : 
             '🌱 Keep going!'}
          </Text>
        </View>
      )}

      {/* Progress Bar */}
      {showProgress && pointsForNext && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <Animated.View 
              style={[
                styles.progressFill, 
                { 
                  width: `${Math.min(progress, 100)}%`,
                  backgroundColor: creature.color,
                }
              ]} 
            />
            {/* Progress milestones */}
            <View style={[styles.milestone, { left: '25%' }]} />
            <View style={[styles.milestone, { left: '50%' }]} />
            <View style={[styles.milestone, { left: '75%' }]} />
          </View>
          <Text style={[styles.progressText, { fontSize: sizeConfig.fontSize - 2 }]}>
            {currentPoints} / {pointsForNext} pts
          </Text>
        </View>
      )}

      {/* Fully Evolved Badge */}
      {stage >= 3 && (
        <View style={[styles.evolvedBadge, { backgroundColor: creature.color }]}>
          <Text style={styles.evolvedText}>✨ Fully Evolved!</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    padding: 16,
  },
  creatureContainer: {
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  glowEffect: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    borderRadius: 100,
  },
  emojiContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
  sparklesContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  sparkle: {
    position: 'absolute',
    fontSize: 14,
  },
  name: {
    fontWeight: 'bold',
    marginTop: 12,
    textAlign: 'center',
  },
  description: {
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 200,
  },
  growthContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  growthStars: {
    flexDirection: 'row',
    gap: 4,
  },
  growthStar: {
    fontSize: 16,
  },
  growthText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  progressContainer: {
    marginTop: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 200,
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#E0E0E0',
    borderRadius: 5,
    overflow: 'hidden',
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    borderRadius: 5,
  },
  milestone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  progressText: {
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  evolvedBadge: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  evolvedText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
