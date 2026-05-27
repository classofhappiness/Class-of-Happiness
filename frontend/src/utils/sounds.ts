import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';

let soundEnabled = true;
let audioModeSet = false;

const initAudio = async () => {
  if (audioModeSet) return;
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    });
    audioModeSet = true;
  } catch {}
};

// Play a one-shot sound on the main thread safely
const playSoundUrl = (url: string) => {
  // setTimeout forces execution onto main JS thread
  setTimeout(async () => {
    try {
      await initAudio();
      const { sound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true, volume: 0.4 }
      );
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {}
  }, 0);
};

const SOUND_URLS = {
  buttonTap: 'https://cdn.freesound.org/previews/256/256113_3263906-lq.mp3',
  success:   'https://cdn.freesound.org/previews/320/320655_5260872-lq.mp3',
  reward:    'https://cdn.freesound.org/previews/341/341695_5858296-lq.mp3',
  evolution: 'https://cdn.freesound.org/previews/270/270304_5123851-lq.mp3',
  select:    'https://cdn.freesound.org/previews/220/220206_4100837-lq.mp3',
};

export const preloadSounds = async () => { await initAudio(); };
export const unloadSounds = async () => {};

export const playButtonSound  = () => { if (soundEnabled) playSoundUrl(SOUND_URLS.buttonTap); };
export const playSuccessSound = () => { if (soundEnabled) playSoundUrl(SOUND_URLS.success); };
export const playRewardSound  = () => { if (soundEnabled) playSoundUrl(SOUND_URLS.reward); };
export const playEvolutionSound = () => { if (soundEnabled) playSoundUrl(SOUND_URLS.evolution); };
export const playSelectSound  = () => { if (soundEnabled) playSoundUrl(SOUND_URLS.select); };

export const setSoundEnabled = (enabled: boolean) => { soundEnabled = enabled; };
export const isSoundEnabled  = () => soundEnabled;

const playHaptic = (type: 'light' | 'medium' | 'heavy' = 'light') => {
  try {
    const style = type === 'heavy'  ? Haptics.ImpactFeedbackStyle.Heavy
                : type === 'medium' ? Haptics.ImpactFeedbackStyle.Medium
                :                     Haptics.ImpactFeedbackStyle.Light;
    Haptics.impactAsync(style).catch(() => {});
  } catch {}
};

export const playButtonFeedback  = () => { playButtonSound();  playHaptic('light'); };
export const playSelectFeedback  = () => { playSelectSound();  playHaptic('medium'); };
export const playRewardFeedback  = () => { playRewardSound();  playHaptic('heavy'); };
