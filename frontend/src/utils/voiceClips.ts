import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSoundEnabled } from './sounds';
import { getCachedAudioUri, preloadAudioUrls } from './audioCache';

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
  // Real fix Sep 15 (Marisa build-26, S05) - see setVoiceEnabled's note below: a mute
  // persisted from a previous session must silence sound effects too, not just voice, from
  // the moment this loads (not only the next time the user actively toggles it).
  setSoundEnabled(voiceEnabled);
  return voiceEnabled;
};

export const isVoiceEnabled = () => voiceEnabled;

// Real fix Sep 15 (Marisa build-26, S05): "with audio off, tapping a helper still plays the
// ding" - traced to two entirely separate mute systems that never talked to each other.
// voiceEnabled here gates spoken phrase clips (playVoiceClip/playPhraseFromPool) and is what
// the visible VoiceToggleButton on the check-in screens actually controls. Sound EFFECTS
// (button taps, the helper-select "ding", reward/evolution sounds - sounds.ts's
// soundEnabled) are a completely independent flag - and setSoundEnabled/isSoundEnabled were
// never called from anywhere in the app, so sound effects could never actually be muted by
// any control a user could reach. The one visible toggle now drives both, matching what a
// user actually expects "audio off" to mean.
export const setVoiceEnabled = async (enabled: boolean) => {
  voiceEnabled = enabled;
  voiceEnabledLoaded = true;
  setSoundEnabled(enabled);
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
  setTimeout(async () => {
    try {
      // Real fix Sep 21 (device report): resolves to a local file if preloadZoneAudio
      // already cached this clip - the common case by the time a kid actually taps a
      // colour, since that preload starts on the same screen's mount, well before the tap.
      const localUri = await getCachedAudioUri(url);
      const { sound } = await Audio.Sound.createAsync({ uri: localUri }, { shouldPlay: true, volume: 1.0 });
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch {}
  }, 0);
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

// Real fix Sep 14 (Marisa build-26, S04): now returns a Promise, resolving once playback has
// actually started (or has genuinely given up - voice off, no clips, network failure) -
// callers that need to gate a loading screen on real audio readiness (zone.tsx) can await
// it; existing fire-and-forget callers (rewards.tsx) are unaffected since they never awaited
// it before either. Dropped the old setTimeout(...,0) wrapper - it only deferred to the next
// tick for no real reason and made this impossible to await.
// Real fix Sep 21 (device report): now returns the Audio.Sound it created (or null if it
// never got that far) instead of void - a caller gating a loading screen on this (zone.tsx)
// needs a handle to actually tear the sound down on unmount, not just skip its OWN setState
// call. A kid tapping a colour before the greeting finishes navigates away while this is
// still mid-flight; without a real handle the Sound object keeps playing and keeps calling
// its own status-update callback into a screen that's gone, which is what was actually
// producing the "cannot update an unmounted component" warnings (a JS-bridge-level effect
// of the sound object outliving its caller, not a plain missed React state guard - the
// zone.tsx setAudioReady calls were already `cancelled`-guarded and always have been).
export const playPhraseFromPool = async (moment: VoicePhraseMoment, language: string): Promise<Audio.Sound | null> => {
  if (!voiceEnabled) return null;
  try {
    const urls = await loadPhrasePool(moment, language);
    if (!urls.length) return null;
    const url = urls[Math.floor(Math.random() * urls.length)];
    // Real fix Sep 21 (device report): same cache resolution as playVoiceClip above -
    // whichever of the 2-4 pool variants gets picked here, preloadZoneAudio (zone.tsx)
    // already fired off downloads for every one of them, not just this random pick.
    const localUri = await getCachedAudioUri(url);
    const { sound } = await Audio.Sound.createAsync({ uri: localUri }, { shouldPlay: true, volume: 1.0 });
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
      }
    });
    return sound;
  } catch {
    return null;
  }
};

// Real feature Sep 21 (device report): S04 (zone.tsx) is where the delay is most
// noticed - the opening greeting plays on every visit, and tapping a colour should sound
// instant, not fetch-on-tap. Called from zone.tsx's mount effect alongside (not instead
// of) the loader-gated playPhraseFromPool('opening', ...) call above - getCachedAudioUri's
// in-flight de-dupe means whichever opening variant that call ends up playing shares the
// same download this fires, never a duplicate fetch. The 4 zone (question) clips have no
// other caller that would ever warm them ahead of the actual tap, so this is their only
// chance to be ready before handleZoneSelect's playVoiceClip needs them.
export const preloadZoneAudio = async (language: string): Promise<void> => {
  if (!voiceEnabled) return;
  try {
    const [manifest, openingUrls] = await Promise.all([
      manifestLanguage === language ? manifestCache : loadVoiceManifest(language),
      loadPhrasePool('opening', language),
    ]);
    preloadAudioUrls([manifest.blue, manifest.green, manifest.yellow, manifest.red, ...openingUrls]);
  } catch {}
};
