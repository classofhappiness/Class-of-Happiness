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

// Animation configurations for each creature type based on zone
const getCreatureAnimationConfig = (zone: string, stage: number) => {
  const baseConfig = {
    // How far creature moves horizontally (swimming/hopping)
    horizontalMovement: 0,
    // How far creature moves vertically (bouncing)
    verticalMovement: 8,
    // Rotation amplitude in degrees
    rotationAmplitude: 5,
    // Speed multiplier (higher = faster animations)
    speedMultiplier: 1,
    // Special effect type
    effectType: 'none' as 'none' | 'bubbles' | 'leaves' | 'sparks' | 'flames',
    // Effect emoji
    effectEmoji: '',
    // Custom animation style
    animStyle: 'bounce' as 'bounce' | 'swim' | 'hop' | 'zap' | 'flicker',
  };

  switch (zone) {
    case 'blue':
      // Aqua creatures - swimming motion
      return {
        ...baseConfig,
        horizontalMovement: 15 + (stage * 5), // Swim further as they evolve
        verticalMovement: 4 + (stage * 2), // Gentle wave motion
        rotationAmplitude: 8 + (stage * 2), // More fish-like wiggle
        speedMultiplier: 0.8 + (stage * 0.1), // Get faster
        effectType: 'bubbles' as const,
        effectEmoji: '🫧',
        animStyle: 'swim' as const,
      };
    case 'green':
      // Nature creatures - hopping/swaying motion
      return {
        ...baseConfig,
        horizontalMovement: 3 + (stage * 2),
        verticalMovement: 12 + (stage * 4), // Big hops!
        rotationAmplitude: 3,
        speedMultiplier: 0.7 + (stage * 0.15),
        effectType: 'leaves' as const,
        effectEmoji: '🍃',
        animStyle: 'hop' as const,
      };
    case 'yellow':
      // Electric creatures - quick zappy motions
      return {
        ...baseConfig,
        horizontalMovement: 8 + (stage * 3),
        verticalMovement: 6 + (stage * 3),
        rotationAmplitude: 10 + (stage * 3), // Energetic shaking
        speedMultiplier: 1.2 + (stage * 0.2), // Very quick!
        effectType: 'sparks' as const,
        effectEmoji: '⚡',
        animStyle: 'zap' as const,
      };
    case 'red':
      // Fire creatures - flickering flame motion
      return {
        ...baseConfig,
        horizontalMovement: 5 + (stage * 2),
        verticalMovement: 10 + (stage * 3),
        rotationAmplitude: 6 + (stage * 2),
        speedMultiplier: 1 + (stage * 0.1),
        effectType: 'flames' as const,
        effectEmoji: '🔥',
        animStyle: 'flicker' as const,
      };
    default:
      return baseConfig;
  }
};

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
  // Animation values
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const swimAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const effectAnim = useRef(new Animated.Value(0)).current;
  const effectOpacity = useRef(new Animated.Value(0)).current;

  const stageInfo = creature.stages[stage];
  const animConfig = getCreatureAnimationConfig(creature.zone, stage);
  
  // Calculate growth progress within current stage (0 to 1)
  const previousThreshold = stage > 0 ? creature.stages[stage].required_points : 0;
  const nextThreshold = pointsForNext || (previousThreshold + 20);
  const progressInStage = pointsForNext 
    ? Math.min((currentPoints - previousThreshold) / (nextThreshold - previousThreshold), 1)
    : 1;
  
  // Growth multiplier: creature grows 25% larger as it progresses through stage
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

    const baseDuration = 1000 / animConfig.speedMultiplier;

    // Main creature animation based on type
    let mainAnimation: Animated.CompositeAnimation;

    switch (animConfig.animStyle) {
      case 'swim':
        // Swimming: horizontal wave motion with slight vertical bob
        mainAnimation = Animated.loop(
          Animated.parallel([
            Animated.sequence([
              Animated.timing(swimAnim, {
                toValue: animConfig.horizontalMovement,
                duration: baseDuration,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: -animConfig.horizontalMovement,
                duration: baseDuration,
                easing: Easing.inOut(Easing.sin),
                useNativeDriver: true,
              }),
            ]),
            Animated.sequence([
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement,
                duration: baseDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: animConfig.verticalMovement / 2,
                duration: baseDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement / 2,
                duration: baseDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: 0,
                duration: baseDuration / 2,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        break;

      case 'hop':
        // Hopping: strong vertical with slight horizontal
        mainAnimation = Animated.loop(
          Animated.sequence([
            // Prepare to hop
            Animated.timing(bounceAnim, {
              toValue: 3,
              duration: baseDuration * 0.2,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
            // Big hop up!
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement,
                duration: baseDuration * 0.3,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: animConfig.horizontalMovement,
                duration: baseDuration * 0.3,
                useNativeDriver: true,
              }),
            ]),
            // Land
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: 2,
                duration: baseDuration * 0.2,
                easing: Easing.bounce,
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: 0,
                duration: baseDuration * 0.2,
                useNativeDriver: true,
              }),
            ]),
            // Settle
            Animated.timing(bounceAnim, {
              toValue: 0,
              duration: baseDuration * 0.3,
              useNativeDriver: true,
            }),
          ])
        );
        break;

      case 'zap':
        // Electric zapping: quick random-like movements
        mainAnimation = Animated.loop(
          Animated.sequence([
            // Quick zap right
            Animated.parallel([
              Animated.timing(swimAnim, {
                toValue: animConfig.horizontalMovement,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement / 2,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
            ]),
            // Zap back center
            Animated.parallel([
              Animated.timing(swimAnim, {
                toValue: 0,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: animConfig.verticalMovement / 3,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
            ]),
            // Zap left
            Animated.parallel([
              Animated.timing(swimAnim, {
                toValue: -animConfig.horizontalMovement * 0.7,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement * 0.8,
                duration: baseDuration * 0.1,
                useNativeDriver: true,
              }),
            ]),
            // Quick return
            Animated.parallel([
              Animated.timing(swimAnim, {
                toValue: 0,
                duration: baseDuration * 0.15,
                useNativeDriver: true,
              }),
              Animated.timing(bounceAnim, {
                toValue: 0,
                duration: baseDuration * 0.15,
                useNativeDriver: true,
              }),
            ]),
            // Pause
            Animated.delay(baseDuration * 0.3),
          ])
        );
        break;

      case 'flicker':
        // Fire flickering: vertical flame-like motion
        mainAnimation = Animated.loop(
          Animated.sequence([
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement,
                duration: baseDuration * 0.3,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: animConfig.horizontalMovement * 0.5,
                duration: baseDuration * 0.3,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement * 0.3,
                duration: baseDuration * 0.2,
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: -animConfig.horizontalMovement * 0.3,
                duration: baseDuration * 0.2,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: -animConfig.verticalMovement * 0.7,
                duration: baseDuration * 0.25,
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: animConfig.horizontalMovement * 0.2,
                duration: baseDuration * 0.25,
                useNativeDriver: true,
              }),
            ]),
            Animated.parallel([
              Animated.timing(bounceAnim, {
                toValue: 0,
                duration: baseDuration * 0.25,
                useNativeDriver: true,
              }),
              Animated.timing(swimAnim, {
                toValue: 0,
                duration: baseDuration * 0.25,
                useNativeDriver: true,
              }),
            ]),
          ])
        );
        break;

      default:
        // Default bounce
        mainAnimation = Animated.loop(
          Animated.sequence([
            Animated.timing(bounceAnim, {
              toValue: -animConfig.verticalMovement,
              duration: baseDuration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(bounceAnim, {
              toValue: 0,
              duration: baseDuration,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ])
        );
    }

    // Rotation animation - wiggle/sway
    const rotateLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: baseDuration * 0.8,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: baseDuration * 1.6,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: baseDuration * 0.8,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // Pulse animation - creature "breathes"
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1 + (progressInStage * 0.08),
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

    // Effect animation (bubbles, leaves, sparks, flames)
    const effectLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(effectAnim, {
            toValue: 1,
            duration: baseDuration * 1.5,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(effectOpacity, {
              toValue: 1,
              duration: baseDuration * 0.3,
              useNativeDriver: true,
            }),
            Animated.timing(effectOpacity, {
              toValue: 0,
              duration: baseDuration * 1.2,
              useNativeDriver: true,
            }),
          ]),
        ]),
        Animated.timing(effectAnim, {
          toValue: 0,
          duration: 0,
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

    mainAnimation.start();
    rotateLoop.start();
    pulseLoop.start();
    effectLoop.start();

    return () => {
      mainAnimation.stop();
      rotateLoop.stop();
      pulseLoop.stop();
      effectLoop.stop();
      if (glowLoop) glowLoop.stop();
    };
  }, [animated, progressInStage, animConfig.animStyle, animConfig.speedMultiplier]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: [`-${animConfig.rotationAmplitude}deg`, '0deg', `${animConfig.rotationAmplitude}deg`],
  });

  const effectTranslateY = effectAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -40],
  });

  const progress = pointsForNext ? (currentPoints / pointsForNext) * 100 : 100;
  
  // Glow intensity based on progress
  const glowOpacity = progressInStage > 0.7 ? glowAnim : new Animated.Value(0);

  // Render effect particles
  const renderEffects = () => {
    if (animConfig.effectType === 'none') return null;

    return (
      <View style={styles.effectsContainer}>
        {[0, 1, 2].map((i) => (
          <Animated.Text
            key={i}
            style={[
              styles.effectEmoji,
              {
                opacity: effectOpacity,
                transform: [
                  { translateY: effectTranslateY },
                  { translateX: (i - 1) * 15 },
                ],
                left: '50%',
                marginLeft: -10 + (i - 1) * 15,
              },
            ]}
          >
            {animConfig.effectEmoji}
          </Animated.Text>
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Creature Container with dynamic glow */}
      <View style={[styles.creatureContainer, { 
        width: sizeConfig.container, 
        height: sizeConfig.container,
        backgroundColor: creature.color + '20',
        borderColor: creature.color,
        borderWidth: 3 + (progressInStage * 2),
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
        
        {/* Effect particles */}
        {renderEffects()}
        
        <Animated.View
          style={[
            styles.emojiContainer,
            {
              transform: [
                { translateY: bounceAnim },
                { translateX: swimAnim },
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
  effectsContainer: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  effectEmoji: {
    position: 'absolute',
    fontSize: 16,
    top: '20%',
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
