import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const VOICE_ENABLED_KEY = 'voice_enabled';

let voiceEnabled = true;
let voiceEnabledLoaded = false;
let manifestLanguage: string | null = null;
let manifestCache: Record<string, string> = {};
let manifestPromise: Promise<Record<string, string>> | null = null;

// Frontend fallback strategy IDs (b1..r6) don't match the backend's real IDs
// (blue_1..red_6) - normalize both to the canonical clip_key so playback works
// regardless of which source the strategy card came from.
const SHORT_ZONE: Record<string, string> = { b: 'blue', g: 'green', y: 'yellow', r: 'red' };
const normalizeClipKey = (id: string): string => {
  if (!id) return id;
  const m = /^([bgyr])(\d)$/.exec(id);
  if (m) return `${SHORT_ZONE[m[1]]}_${m[2]}`;
  return id;
};

export const loadVoiceEnabled = async (): Promise<boolean> => {
  if (voiceEnabledLoaded) return voiceEnabled;
  try {
    const stored = await AsyncStorage.getItem(VOICE_ENABLED_KEY);
    voiceEnabled = stored === null ? true : stored === 'true';
  } catch {}
  voiceEnabledLoaded = true;
  return voiceEnabled;
};

export const isVoiceEnabled = () => voiceEnabled;

export const setVoiceEnabled = async (enabled: boolean) => {
  voiceEnabled = enabled;
  voiceEnabledLoaded = true;
  try { await AsyncStorage.setItem(VOICE_ENABLED_KEY, enabled ? 'true' : 'false'); } catch {}
};

// Fetches {clip_key: url} once per language and caches in memory. Missing keys
// (unfinished clips, unsupported languages) are simply absent from the response.
export const loadVoiceManifest = async (language: string): Promise<Record<string, string>> => {
  if (manifestLanguage === language) return manifestCache;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice-clips?language=${encodeURIComponent(language)}`);
      const data = res.ok ? await res.json() : {};
      manifestCache = data && typeof data === 'object' ? data : {};
    } catch {
      manifestCache = {};
    }
    manifestLanguage = language;
    manifestPromise = null;
    return manifestCache;
  })();
  return manifestPromise;
};

// Plays the voice clip for a colour or helper id, if one exists for the current
// manifest and voice is enabled. Silently no-ops for any other reason (missing
// clip, unsupported language, playback error) - one code path for all of them.
export const playVoiceClip = (rawKey: string) => {
  if (!voiceEnabled) return;
  const key = normalizeClipKey(rawKey);
  const url = manifestCache[key];
  if (!url) return;
  setTimeout(async () => {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: true, volume: 1.0 });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {}
  }, 0);
};
