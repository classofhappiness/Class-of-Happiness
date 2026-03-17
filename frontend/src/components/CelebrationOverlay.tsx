import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, Dimensions } from 'react-native';
import { Audio } from 'expo-av';
import { MaterialIcons } from '@expo/vector-icons';
import { Avatar } from './Avatar';

const { width, height } = Dimensions.get('window');

interface CelebrationOverlayProps {
  visible: boolean;
  studentName: string;
  avatarType: 'preset' | 'custom';
  avatarPreset?: string;
  avatarCustom?: string;
  presetAvatars?: { id: string; emoji: string }[];
  onComplete: () => void;
}

export const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  visible,
  studentName,
  avatarType,
  avatarPreset,
  avatarCustom,
  presetAvatars,
  onComplete,
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const starAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (visible) {
      // Play celebration sound
      playSound();
      
      // Start animations
      Animated.sequence([
        // Fade in and scale up
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 4,
            useNativeDriver: true,
          }),
        ]),
        // Star sparkle animation
        Animated.loop(
          Animated.sequence([
            Animated.timing(starAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }),
            Animated.timing(starAnim, {
              toValue: 0,
              duration: 500,
              useNativeDriver: true,
            }),
          ]),
          { iterations: 3 }
        ),
        // Hold for a moment
        Animated.delay(500),
        // Fade out
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start(() => {
        // Reset animations
        scaleAnim.setValue(0.5);
        starAnim.setValue(0);
        onComplete();
      });
    }
  }, [visible]);

  const playSound = async () => {
    try {
      // Set audio mode for playback
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      
      // Use a royalty-free celebration/success sound
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3' }, // Success chime
        { shouldPlay: true, volume: 0.8 }
      );
      soundRef.current = sound;
      
      // Cleanup sound after playing
      sound.setOnPlaybackStatusUpdate((status) => {
        if ('didJustFinish' in status && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('Could not play sound:', error);
      // Fallback - continue without sound (app won't crash)
    }
  };

  if (!visible) return null;

  const starOpacity = starAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 1],
  });

  const starScale = starAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.2],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
        {/* Stars background */}
        <Animated.View style={[styles.star, styles.star1, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={40} color="#FFD700" />
        </Animated.View>
        <Animated.View style={[styles.star, styles.star2, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={30} color="#FFD700" />
        </Animated.View>
        <Animated.View style={[styles.star, styles.star3, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={35} color="#FFD700" />
        </Animated.View>
        <Animated.View style={[styles.star, styles.star4, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={25} color="#FFD700" />
        </Animated.View>
        <Animated.View style={[styles.star, styles.star5, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={32} color="#FFD700" />
        </Animated.View>
        <Animated.View style={[styles.star, styles.star6, { opacity: starOpacity, transform: [{ scale: starScale }] }]}>
          <MaterialIcons name="star" size={28} color="#FFD700" />
        </Animated.View>

        {/* Main content */}
        <View style={styles.celebrationCard}>
          {/* Avatar */}
          <View style={styles.avatarContainer}>
            <Avatar
              type={avatarType}
              preset={avatarPreset}
              custom={avatarCustom}
              size={100}
              presetAvatars={presetAvatars}
            />
          </View>

          {/* Trophy icon */}
          <View style={styles.trophyContainer}>
            <MaterialIcons name="emoji-events" size={60} color="#FFD700" />
          </View>

          {/* Message */}
          <Text style={styles.title}>Well Done!</Text>
          <Text style={styles.name}>{studentName}</Text>
          
          <View style={styles.messageContainer}>
            <Text style={styles.message}>
              You can always ask an adult{'\n'}and friends for support
            </Text>
          </View>

          {/* Decorative elements */}
          <View style={styles.confettiRow}>
            <Text style={styles.confetti}>🎉</Text>
            <Text style={styles.confetti}>⭐</Text>
            <Text style={styles.confetti}>🎉</Text>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  celebrationCard: {
    backgroundColor: 'white',
    borderRadius: 30,
    padding: 30,
    alignItems: 'center',
    width: width * 0.85,
    maxWidth: 350,
    elevation: 10,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  avatarContainer: {
    marginBottom: 16,
    borderWidth: 4,
    borderColor: '#4CAF50',
    borderRadius: 60,
    padding: 4,
  },
  trophyContainer: {
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 8,
    textAlign: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  messageContainer: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  message: {
    fontSize: 16,
    color: '#2E7D32',
    textAlign: 'center',
    lineHeight: 24,
    fontWeight: '500',
  },
  confettiRow: {
    flexDirection: 'row',
    gap: 16,
  },
  confetti: {
    fontSize: 28,
  },
  star: {
    position: 'absolute',
  },
  star1: {
    top: -60,
    left: -40,
  },
  star2: {
    top: -30,
    right: -30,
  },
  star3: {
    bottom: -50,
    left: -20,
  },
  star4: {
    bottom: -40,
    right: -40,
  },
  star5: {
    top: 50,
    left: -50,
  },
  star6: {
    top: 80,
    right: -45,
  },
});
