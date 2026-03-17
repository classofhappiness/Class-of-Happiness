import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Modal, Easing, TouchableOpacity } from 'react-native';
import { Creature, CreatureStage } from '../utils/api';

interface EvolutionAnimationProps {
  visible: boolean;
  creature: Creature;
  fromStage: number;
  toStage: number;
  onComplete: () => void;
}

export const EvolutionAnimation: React.FC<EvolutionAnimationProps> = ({
  visible,
  creature,
  fromStage,
  toStage,
  onComplete,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showNewForm, setShowNewForm] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  const oldStageInfo = creature.stages[fromStage];
  const newStageInfo = creature.stages[toStage];

  useEffect(() => {
    if (!visible) {
      // Reset state when modal closes
      setShowNewForm(false);
      setAnimationComplete(false);
      scaleAnim.setValue(1);
      glowAnim.setValue(0);
      rotateAnim.setValue(0);
      fadeAnim.setValue(0);
      return;
    }

    // Start evolution animation sequence
    const evolutionSequence = Animated.sequence([
      // Phase 1: Creature starts glowing and shaking
      Animated.parallel([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: false,
        }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(rotateAnim, {
              toValue: 1,
              duration: 50,
              useNativeDriver: true,
            }),
            Animated.timing(rotateAnim, {
              toValue: -1,
              duration: 50,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 10 }
        ),
      ]),
      // Phase 2: Creature grows and spins
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1.5,
          duration: 500,
          easing: Easing.out(Easing.back(2)),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
      // Phase 3: Flash and transform
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]);

    evolutionSequence.start(() => {
      // Switch to new form
      setShowNewForm(true);
      
      // Phase 4: Reveal new form with celebration
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 3,
          tension: 100,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setAnimationComplete(true);
      });
    });
  }, [visible]);

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-10deg', '0deg', '10deg'],
  });

  const glowColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['transparent', creature.color],
  });

  const currentEmoji = showNewForm ? newStageInfo.emoji : oldStageInfo.emoji;
  const currentName = showNewForm ? newStageInfo.name : oldStageInfo.name;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onComplete}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Sparkles Background */}
          <View style={styles.sparklesContainer}>
            {[...Array(20)].map((_, i) => (
              <Text
                key={i}
                style={[
                  styles.sparkle,
                  {
                    top: `${Math.random() * 100}%`,
                    left: `${Math.random() * 100}%`,
                    fontSize: 12 + Math.random() * 16,
                    opacity: 0.6 + Math.random() * 0.4,
                  },
                ]}
              >
                ✨
              </Text>
            ))}
          </View>

          {/* Evolution Title */}
          <Text style={styles.evolutionTitle}>
            {showNewForm ? '🎉 EVOLVED! 🎉' : '✨ EVOLVING... ✨'}
          </Text>

          {/* Creature Container */}
          <Animated.View
            style={[
              styles.creatureContainer,
              {
                backgroundColor: creature.color + '30',
                borderColor: creature.color,
                transform: [
                  { scale: scaleAnim },
                  { rotate: rotateInterpolate },
                ],
              },
            ]}
          >
            {/* Glow Effect */}
            <Animated.View
              style={[
                styles.glowEffect,
                {
                  backgroundColor: glowColor,
                  opacity: glowAnim,
                },
              ]}
            />
            
            {/* Flash Effect */}
            <Animated.View
              style={[
                styles.flashEffect,
                {
                  opacity: fadeAnim,
                },
              ]}
            />

            <Text style={styles.emoji}>{currentEmoji}</Text>
          </Animated.View>

          {/* Creature Name */}
          <Text style={[styles.creatureName, { color: creature.color }]}>
            {currentName}
          </Text>

          {showNewForm && (
            <Text style={styles.description}>
              {newStageInfo.description}
            </Text>
          )}

          {/* Continue Button */}
          {animationComplete && (
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: creature.color }]}
              onPress={onComplete}
            >
              <Text style={styles.continueText}>Amazing! Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxWidth: 350,
    backgroundColor: '#1a1a2e',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  sparklesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  sparkle: {
    position: 'absolute',
  },
  evolutionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 24,
    textAlign: 'center',
  },
  creatureContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  glowEffect: {
    position: 'absolute',
    width: '150%',
    height: '150%',
    borderRadius: 100,
  },
  flashEffect: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'white',
  },
  emoji: {
    fontSize: 80,
  },
  creatureName: {
    fontSize: 28,
    fontWeight: 'bold',
    marginTop: 20,
  },
  description: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 8,
    textAlign: 'center',
  },
  continueButton: {
    marginTop: 24,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
  },
  continueText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
