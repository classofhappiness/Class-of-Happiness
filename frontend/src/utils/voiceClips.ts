import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setSoundEnabled } from './sounds';
import { preloadAudioUrls, createResilientSound } from './audioCache';

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
  } catch (e) { console.error('[utils/voiceClips:31]', e); }
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
  try { await AsyncStorage.setItem(VOICE_ENABLED_KEY, enabled ? 'true' : 'false'); } catch (e) { console.error('[utils/voiceClips:55]', e); }
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
      // Real fix Sep 24 (device report - launch-blocking crash): createResilientSound
      // tries the cached local file first (the common case by the time a kid actually taps
      // a colour, since preloadZoneAudio starts on the same screen's mount, well before the
      // tap), and self-heals + falls back to the remote URL if that cached file turns out
      // to be unreadable - see its own comment in audioCache.ts for why that's a real,
      // not just theoretical, gap the old direct createAsync call had.
      const sound = await createResilientSound(url, { shouldPlay: true, volume: 1.0 });
      sound?.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
        }
      });
    } catch (e) { console.error('[utils/voiceClips:112]', e); }
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
// Real fix Sep 24 (item1, device report - greeting plays late): added `options.shouldPlay`
// (defaults true, unchanged for every existing caller). zone.tsx's greeting needs to load the
// sound WITHOUT starting it, race that load against a 600ms grace window, and only call
// sound.playAsync() itself if the load won - passing shouldPlay:true here (as before) would
// start audible playback the instant the sound object resolves, which is exactly the "play
// late" behaviour the 600ms skip rule exists to prevent (createResilientSound has no way to
// un-start a sound that's already mid-playback without an audible blip).
export const playPhraseFromPool = async (
  moment: VoicePhraseMoment,
  language: string,
  options?: { shouldPlay?: boolean }
): Promise<Audio.Sound | null> => {
  if (!voiceEnabled) return null;
  try {
    const urls = await loadPhrasePool(moment, language);
    if (!urls.length) return null;
    const url = urls[Math.floor(Math.random() * urls.length)];
    // Real fix Sep 24 (device report - launch-blocking crash): same resilient path as
    // playVoiceClip above - see createResilientSound's own comment for why a bare
    // getCachedAudioUri + createAsync call wasn't actually fail-safe against a cache entry
    // going bad between being written and being played.
    const sound = await createResilientSound(url, { shouldPlay: options?.shouldPlay ?? true, volume: 1.0 });
    sound?.setOnPlaybackStatusUpdate((status) => {
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
    // Real fix Sep 24 (item1, device report - greeting plays late): openingUrls (the
    // greeting) moved first - zone.tsx needs it the INSTANT it mounts, while the 4 zone
    // clips are only ever needed later, on an actual colour tap. preloadAudioUrls itself
    // fires every getCachedAudioUri call in the same synchronous loop (no real download
    // concurrency limit to exploit), so this ordering doesn't throttle anything - it's about
    // being the correct, honest priority order for what's actually warmed first, not a
    // functional fix on its own (see warmGreetingAudio below for the fix that actually
    // matters: warming the greeting well before this screen even mounts).
    preloadAudioUrls([...openingUrls, manifest.blue, manifest.green, manifest.yellow, manifest.red]);
  } catch (e) { console.error('[utils/voiceClips:221]', e); }
};

// Real fix Sep 24 (item1, device report - greeting plays late, root cause): NOTHING warmed
// the opening greeting before today - _layout.tsx's app-start effect only ever called
// preloadSounds() (sounds.ts's fixed UI-effect set: button taps, dings, reward/evolution
// stingers), never anything in this file. Every zone.tsx mount was therefore a guaranteed
// cold path: loadPhrasePool's own network fetch for the {moment,language} -> urls[] list,
// THEN a fresh audio-bytes download for whichever variant got picked, THEN decode, all
// strictly before playback could start - exactly the delay Jono saw, worse on a slower
// connection or the very first check-in of the day. Called once from _layout.tsx alongside
// preloadSounds, keyed on the same `language` the rest of the app already tracks - by the
// time a kid actually reaches zone.tsx (auth, profile select, at least one screen transition
// later), the greeting clip is normally already a local file, and zone.tsx's own 600ms race
// (see that screen) resolves near-instantly off this cache instead of a cold fetch.
export const warmGreetingAudio = async (language: string): Promise<void> => {
  if (!voiceEnabled) return;
  try {
    const urls = await loadPhrasePool('opening', language);
    preloadAudioUrls(urls);
  } catch (e) { console.error('[utils/voiceClips:241]', e); }
};
