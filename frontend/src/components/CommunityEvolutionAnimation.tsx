// Real feature Sep 15 (B1 core-loop fix): community/submitted creatures never had an
// evolution moment of their own - they used to auto-advance silently on check-in (see
// server.py's _progress_community_creature docstring for the live-confirmed history), and the
// reward screen's only evolution animation (EvolutionAnimation) is hard-gated to creatures with
// a `.stages` array, which community creatures don't have (they'd crash on
// creature.stages![fromStage]). This is that same "you just evolved!" moment, image-based
// instead of emoji-based, for community creatures specifically - so crossing a threshold is
// never silent for either creature type. Mirrors EvolutionAnimation's animation sequence
// exactly; only the visual (Image instead of emoji Text) and data shape differ.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Modal, Easing, TouchableOpacity, Image } from 'react-native';

interface CommunityEvolutionAnimationProps {
  visible: boolean;
  name?: string | null;
  color: string;
  stage1_url?: string | null;
  stage2_url?: string | null;
  stage3_url?: string | null;
  stage4_url?: string | null;
  fromStage: number;
  toStage: number;
  onComplete: () => void;
}

export const CommunityEvolutionAnimation: React.FC<CommunityEvolutionAnimationProps> = ({
  visible, name, color, stage1_url, stage2_url, stage3_url, stage4_url, fromStage, toStage, onComplete,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [showNewForm, setShowNewForm] = useState(false);
  const [animationComplete, setAnimationComplete] = useState(false);

  // Same stage->image indexing CommunityCreatureDisplay already uses elsewhere, so this
  // shows the exact same image a student would see anywhere else in the app for that stage.
  const urls: Record<number, string | null | undefined> = { 1: stage1_url, 2: stage2_url, 3: stage3_url, 4: stage4_url };
  const oldUrl = urls[Math.max(1, Math.min(fromStage, 4))] || stage1_url;
  const newUrl = urls[Math.max(1, Math.min(toStage, 4))] || stage1_url;

  useEffect(() => {
    if (!visible) {
      setShowNewForm(false);
      setAnimationComplete(false);
      scaleAnim.setValue(1);
      glowAnim.setValue(0);
      rotateAnim.setValue(0);
      fadeAnim.setValue(0);
      return;
    }

    const evolutionSequence = Animated.sequence([
      Animated.parallel([
        Animated.timing(glowAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
        Animated.loop(
          Animated.sequence([
            Animated.timing(rotateAnim, { toValue: 1, duration: 50, useNativeDriver: true }),
            Animated.timing(rotateAnim, { toValue: -1, duration: 50, useNativeDriver: true }),
          ]),
          { iterations: 10 }
        ),
      ]),
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1.5, duration: 500, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.timing(rotateAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);

    evolutionSequence.start(() => {
      setShowNewForm(true);
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 3, tension: 100, useNativeDriver: true }),
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
    outputRange: ['transparent', color],
  });

  const currentUrl = showNewForm ? newUrl : oldUrl;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onComplete}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.evolutionTitle}>
            {showNewForm ? '🎉 EVOLVED! 🎉' : '✨ EVOLVING... ✨'}
          </Text>

          <Animated.View
            style={[
              styles.creatureContainer,
              {
                backgroundColor: color + '30',
                borderColor: color,
                transform: [{ scale: scaleAnim }, { rotate: rotateInterpolate }],
              },
            ]}
          >
            <Animated.View style={[styles.glowEffect, { backgroundColor: glowColor, opacity: glowAnim }]} />
            <Animated.View style={[styles.flashEffect, { opacity: fadeAnim }]} />
            {currentUrl ? (
              <Image source={{ uri: currentUrl }} style={styles.image} />
            ) : (
              <Text style={styles.placeholderEmoji}>🐾</Text>
            )}
          </Animated.View>

          {!!name && <Text style={[styles.creatureName, { color }]}>{name}</Text>}

          {animationComplete && (
            <TouchableOpacity style={[styles.continueButton, { backgroundColor: color }]} onPress={onComplete}>
              <Text style={styles.continueText}>Amazing! Continue →</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.85)', justifyContent: 'center', alignItems: 'center' },
  container: { width: '90%', maxWidth: 350, backgroundColor: '#1a1a2e', borderRadius: 24, padding: 32, alignItems: 'center', overflow: 'hidden' },
  evolutionTitle: { fontSize: 24, fontWeight: 'bold', color: '#FFD700', marginBottom: 24, textAlign: 'center' },
  creatureContainer: { width: 160, height: 160, borderRadius: 80, borderWidth: 4, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  glowEffect: { position: 'absolute', width: '150%', height: '150%', borderRadius: 100 },
  flashEffect: { position: 'absolute', width: '100%', height: '100%', backgroundColor: 'white' },
  image: { width: 130, height: 130, borderRadius: 65 },
  placeholderEmoji: { fontSize: 80 },
  creatureName: { fontSize: 28, fontWeight: 'bold', marginTop: 20 },
  continueButton: { marginTop: 24, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25 },
  continueText: { color: 'white', fontSize: 18, fontWeight: 'bold' },
});
