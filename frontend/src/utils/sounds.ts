import { Audio } from 'expo-av';
import { Platform } from 'react-native';

// Sound configuration
let soundEnabled = true;
let soundsLoaded = false;

// Sound objects cache
const sounds: Record<string, Audio.Sound | null> = {
  buttonTap: null,
  success: null,
  reward: null,
  evolution: null,
  select: null,
};

// Base64 encoded short sound effects (to avoid needing external files)
// These are simple beep/click sounds encoded as data URIs
const SOUND_URLS = {
  // Simple click/tap sound
  buttonTap: 'https://cdn.freesound.org/previews/256/256113_3263906-lq.mp3',
  // Success/positive sound
  success: 'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3',
  // Reward/points earned
  reward: 'https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3',
  // Evolution fanfare
  evolution: 'https://cdn.freesound.org/previews/270/270304_5123851-lq.mp3',
  // Selection made
  select: 'https://cdn.freesound.org/previews/220/220206_4100837-lq.mp3',
};

// Initialize audio mode for playback
const initAudio = async () => {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
  } catch (error) {
    console.log('Audio init error:', error);
  }
};

// Preload all sounds
export const preloadSounds = async () => {
  if (soundsLoaded) return;
  
  try {
    await initAudio();
    
    // Preload each sound
    for (const [key, url] of Object.entries(SOUND_URLS)) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: url },
          { shouldPlay: false, volume: 0.5 }
        );
        sounds[key] = sound;
      } catch (err) {
        console.log(`Failed to load sound ${key}:`, err);
        sounds[key] = null;
      }
    }
    
    soundsLoaded = true;
  } catch (error) {
    console.log('Error preloading sounds:', error);
  }
};

// Play a specific sound
export const playSound = async (soundName: keyof typeof sounds) => {
  if (!soundEnabled) return;
  
  try {
    const sound = sounds[soundName];
    if (sound) {
      await sound.setPositionAsync(0);
      await sound.playAsync();
    } else {
      // Try to play directly if not preloaded
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: (SOUND_URLS as any)[soundName] },
        { shouldPlay: true, volume: 0.5 }
      );
      // Clean up after playing
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          newSound.unloadAsync();
        }
      });
    }
  } catch (error) {
    console.log('Error playing sound:', error);
  }
};

// Quick play functions for common sounds
export const playButtonSound = () => playSound('buttonTap');
export const playSuccessSound = () => playSound('success');
export const playRewardSound = () => playSound('reward');
export const playEvolutionSound = () => playSound('evolution');
export const playSelectSound = () => playSound('select');

// Enable/disable sounds
export const setSoundEnabled = (enabled: boolean) => {
  soundEnabled = enabled;
};

export const isSoundEnabled = () => soundEnabled;

// Cleanup sounds on unmount
export const unloadSounds = async () => {
  for (const sound of Object.values(sounds)) {
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
  soundsLoaded = false;
};

// Vibration feedback (optional, for haptic feedback)
import * as Haptics from 'expo-haptics';

export const playHaptic = async (type: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    switch (type) {
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
    }
  } catch (error) {
    // Haptics not available on all devices
  }
};

// Combined sound + haptic for buttons
export const playButtonFeedback = async () => {
  playButtonSound();
  playHaptic('light');
};

export const playSelectFeedback = async () => {
  playSelectSound();
  playHaptic('medium');
};

export const playRewardFeedback = async () => {
  playRewardSound();
  playHaptic('heavy');
};
