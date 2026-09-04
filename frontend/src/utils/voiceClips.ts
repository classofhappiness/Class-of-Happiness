import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const VOICE_ENABLED_KEY = 'voice_enabled';

let voiceEnabled = true;
let voiceEnabledLoaded = false;
let manifestLanguage: string | null = null;
let manifestCache: Record<string, string> = {};
let manifestPromise: Promise<Record<string, string>> | null = null;

// Real bug fix Sep 4 (Android build 25, live device): playVoiceClip/playPhraseFromPool each
// fired an independent Audio.Sound with no shared reference and no way to cancel it - tap a
// colour, tap a helper before the first clip loads, and both eventually played on top of each
// other, out of sync. currentSound + playToken turn this into a single-flight player: starting
// a new clip always stops/unloads whatever's currently playing first, and a token captured
// before the (possibly slow) createAsync call lets a load that's been superseded while it was
// still in flight - by another play call, including one from a screen navigated to in the
// meantime - discard itself instead of playing late.
let currentSound: Audio.Sound | null = null;
let playToken = 0;

const stopCurrentClip = async (): Promise<void> => {
  playToken++;
  const s = currentSound;
  currentSound = null;
  if (!s) return;
  try { await s.stopAsync(); } catch {}
  try { await s.unloadAsync(); } catch {}
};

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
//
// Real fix Aug 26 (item 6): manifestCache/manifestLanguage are shared module-level
// singletons, and this used to read manifestCache directly with no check that it actually
// matched the caller's current language. loadVoiceManifest(language) is fired
// fire-and-forget on mount (zone.tsx/strategies.tsx useEffect) and never awaited before the
// screen allows interaction - switch language, tap a colour before the fresh fetch
// resolves, and this played whatever was still cached from the PREVIOUS language (usually
// English), even though the correct Italian clips genuinely exist and were already
// confirmed live. Now takes the caller's current language and awaits a fresh fetch itself
// whenever the cache doesn't already match it, instead of trusting a background effect's
// timing.
export const playVoiceClip = async (rawKey: string, language: string) => {
  if (!voiceEnabled) return;
  const key = normalizeClipKey(rawKey);
  const manifest = manifestLanguage === language ? manifestCache : await loadVoiceManifest(language);
  const url = manifest[key];
  if (!url) return;
  await stopCurrentClip();
  const myToken = playToken;
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: false, volume: 1.0 });
    if (myToken !== playToken) {
      // Superseded by a newer play/stop call while this was still loading - don't play late.
      sound.unloadAsync().catch(() => {});
      return;
    }
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        if (currentSound === sound) currentSound = null;
        sound.unloadAsync().catch(() => {});
      }
    });
    await sound.playAsync();
  } catch {}
};

// Real feature Aug 21, extended Aug 28 (item A): "greeting/praise" phrase pools - same mute
// toggle, same play-once pattern as playVoiceClip, but a separate endpoint/cache since
// these clips live outside the 28-key manifest (GET /voice-clips/phrases, not /voice-clips).
// Each moment ("opening"/"praise"/"farewell") has 2-4 near-synonymous real recordings -
// cached per moment+language, one picked at random on every play so a kid hears variety
// instead of the identical line every check-in. Was a single hardcoded Great_job-only call
// (playRewardVoiceClip) before this - see server.py's VOICE_PHRASE_POOLS for the real
// per-moment grouping this was confirmed against with Jono.
const phrasePoolCache: Record<string, string[] | undefined> = {};
const phrasePoolPromises: Record<string, Promise<string[]> | undefined> = {};

export type VoicePhraseMoment = 'opening' | 'praise' | 'farewell';

const loadPhrasePool = async (moment: VoicePhraseMoment, language: string): Promise<string[]> => {
  const cacheKey = `${moment}:${language}`;
  if (phrasePoolCache[cacheKey]) return phrasePoolCache[cacheKey];
  if (phrasePoolPromises[cacheKey]) return phrasePoolPromises[cacheKey];
  phrasePoolPromises[cacheKey] = (async () => {
    let urls: string[] = [];
    try {
      const res = await fetch(`${BACKEND_URL}/api/voice-clips/phrases?moment=${encodeURIComponent(moment)}&language=${encodeURIComponent(language)}`);
      const data = res.ok ? await res.json() : {};
      urls = Array.isArray(data?.urls) ? data.urls : [];
    } catch {
      urls = [];
    }
    phrasePoolCache[cacheKey] = urls;
    delete phrasePoolPromises[cacheKey];
    return urls;
  })();
  return phrasePoolPromises[cacheKey];
};

export const playPhraseFromPool = async (moment: VoicePhraseMoment, language: string) => {
  if (!voiceEnabled) return;
  try {
    const urls = await loadPhrasePool(moment, language);
    if (!urls.length) return;
    const url = urls[Math.floor(Math.random() * urls.length)];
    await stopCurrentClip();
    const myToken = playToken;
    const { sound } = await Audio.Sound.createAsync({ uri: url }, { shouldPlay: false, volume: 1.0 });
    if (myToken !== playToken) {
      sound.unloadAsync().catch(() => {});
      return;
    }
    currentSound = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        if (currentSound === sound) currentSound = null;
        sound.unloadAsync().catch(() => {});
      }
    });
    await sound.playAsync();
  } catch {}
};
