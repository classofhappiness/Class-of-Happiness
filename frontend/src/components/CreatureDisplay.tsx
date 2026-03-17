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
}

export const CreatureDisplay: React.FC<CreatureDisplayProps> = ({
  creature,
  stage,
  currentPoints,
  pointsForNext,
  size = 'medium',
  showProgress = true,
  animated = true,
}) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const stageInfo = creature.stages[stage];
  
  const sizeConfig = {
    small: { emoji: 40, container: 80, fontSize: 12 },
    medium: { emoji: 80, container: 140, fontSize: 14 },
    large: { emoji: 120, container: 200, fontSize: 16 },
  }[size];

  useEffect(() => {
    if (!animated) return;

    // Idle bounce animation
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -10,
          duration: 800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 800,
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
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    bounceLoop.start();
    rotateLoop.start();

    return () => {
      bounceLoop.stop();
      rotateLoop.stop();
    };
  }, [animated]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-3deg', '0deg', '3deg'],
  });

  const progress = pointsForNext ? (currentPoints / pointsForNext) * 100 : 100;

  return (
    <View style={styles.container}>
      {/* Creature Container */}
      <View style={[styles.creatureContainer, { 
        width: sizeConfig.container, 
        height: sizeConfig.container,
        backgroundColor: creature.color + '20',
        borderColor: creature.color,
      }]}>
        <Animated.View
          style={[
            styles.emojiContainer,
            {
              transform: [
                { translateY: bounceAnim },
                { rotate: rotateInterpolate },
                { scale: scaleAnim },
              ],
            },
          ]}
        >
          <Text style={[styles.emoji, { fontSize: sizeConfig.emoji }]}>
            {stageInfo.emoji}
          </Text>
        </Animated.View>
      </View>

      {/* Name and Stage */}
      <Text style={[styles.name, { fontSize: sizeConfig.fontSize + 2 }]}>
        {stageInfo.name}
      </Text>
      
      <Text style={[styles.description, { fontSize: sizeConfig.fontSize - 2 }]}>
        {stageInfo.description}
      </Text>

      {/* Progress Bar */}
      {showProgress && pointsForNext && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { 
                  width: `${Math.min(progress, 100)}%`,
                  backgroundColor: creature.color,
                }
              ]} 
            />
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
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  emojiContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  emoji: {
    textAlign: 'center',
  },
  name: {
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  description: {
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
    maxWidth: 200,
  },
  progressContainer: {
    marginTop: 12,
    alignItems: 'center',
    width: '100%',
    maxWidth: 200,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    color: '#666',
    marginTop: 4,
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
