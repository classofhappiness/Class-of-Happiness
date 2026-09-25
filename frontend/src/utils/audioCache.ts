import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { File, Directory, Paths } from 'expo-file-system';

// Real feature Sep 21 (device report): every sound effect and voice clip was fetched
// fresh from its remote URL on EVERY single play, via Audio.Sound.createAsync({ uri:
// remoteUrl }) - "preloading" never actually existed despite the name (sounds.ts's
// preloadSounds only set the audio mode, and voiceClips.ts's loadVoiceManifest only
// fetched the {key: url} JSON map, never the audio bytes themselves). Streaming a
// remote mp3 has real network latency baked into the very first frame of playback -
// downloading it once to a local file and always playing from THAT uri removes the
// network from the playback path entirely after the first fetch, whenever that fetch
// happens to run. That's what makes a "preload" call actually able to make first play
// instant, rather than just warming an HTTP connection that gets torn down anyway.
//
// expo-file-system's File/Directory classes are explicitly unimplemented on web
// (their own web module just console.warns and no-ops every method) - this app's
// student/audio flows are native-only in practice, so rather than trust that every
// getter/method call fails in a way this file's try/catches happen to catch, web is
// short-circuited up front: every function below returns the plain remote URL
// untouched, exactly the pre-existing (already correct) web behaviour.
const IS_WEB = Platform.OS === 'web';
const CACHE_DIR = IS_WEB ? null : new Directory(Paths.cache, 'audio-cache');

function ensureCacheDir() {
  if (!CACHE_DIR) return;
  try {
    if (!CACHE_DIR.exists) CACHE_DIR.create({ intermediates: true, idempotent: true });
  } catch (e) { console.error('[utils/audioCache:29]', e); }
}

// Deterministic per-URL filename (no crypto needed, just needs to be stable and
// collision-resistant enough for a few dozen known audio URLs) so repeat requests for
// the same remote file - across preload calls, play calls, even app restarts since
// Paths.cache persists until the OS reclaims it - resolve to the same cached path
// instead of re-downloading.
function stableFilename(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash * 31 + url.charCodeAt(i)) | 0;
  }
  const extMatch = /\.(mp3|m4a|wav|aac|ogg)(\?|$)/i.exec(url);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'mp3';
  return `${Math.abs(hash)}.${ext}`;
}

const inFlight: Record<string, Promise<string> | undefined> = {};

// Resolves a remote audio URL to a local, already-downloaded file uri - downloading it
// the first time this exact URL is ever requested (by a preload call or a play call,
// whichever runs first) and returning the cached path on every call after that. Never
// throws: any failure (offline, storage full, bad URL) just falls back to the original
// remote URL, so playback still works exactly as it did before this existed - it just
// won't be instant that one time.
export async function getCachedAudioUri(remoteUrl: string): Promise<string> {
  if (!remoteUrl || IS_WEB || !CACHE_DIR) return remoteUrl;
  ensureCacheDir();
  const destFile = new File(CACHE_DIR, stableFilename(remoteUrl));
  try {
    if (destFile.exists) return destFile.uri;
  } catch {
    return remoteUrl;
  }
  const pending = inFlight[remoteUrl];
  if (pending) return pending;
  const promise = (async () => {
    try {
      const downloaded = await File.downloadFileAsync(remoteUrl, destFile);
      return downloaded.exists ? downloaded.uri : remoteUrl;
    } catch {
      return remoteUrl;
    } finally {
      delete inFlight[remoteUrl];
    }
  })();
  inFlight[remoteUrl] = promise;
  return promise;
}

// Fire-and-forget cache warming for a batch of URLs - used to get audio local ahead of
// the moment it's actually needed (app start for the fixed sound-effect set, a screen's
// mount for that screen's own voice clips). Callers don't await this; it just makes the
// eventual real play call above more likely to already be sitting in getCachedAudioUri's
// exists-check fast path instead of falling through to a fresh download.
export function preloadAudioUrls(urls: (string | undefined | null)[]): void {
  for (const url of urls) {
    if (url) getCachedAudioUri(url).catch(() => {});
  }
}

// Real fix Sep 24 (device report - launch-blocking crash, "Failed to load audio from
// cache: Cannot access file"): getCachedAudioUri's own .exists check only proves the file
// was there at THAT instant - a real TOCTOU gap, since Paths.cache is explicitly, by
// Expo's own docs, "a place to store files that can be deleted by the system when the
// device runs low on storage" at any time, not just checked once at write time. A file
// left partial by an interrupted download (the app killed mid-write) would also pass
// .exists (the file is there, just not a valid decodable audio file) with the same result.
// Every caller previously took getCachedAudioUri's answer on faith and had no plan B if
// that local file turned out to be unreadable when actually opened - exactly what "the
// crash must never take the app down, fall back to streaming the CDN URL" was asking for,
// and what Monday's fix claimed but never actually implemented for this specific case (it
// only handled the DOWNLOAD failing, never "downloaded fine earlier, unreadable now").
// Deletes the bad entry so the NEXT request re-downloads a fresh copy instead of hitting
// the same corrupt file forever (self-healing), and this call itself never throws - same
// fail-safe contract as everything else in this file.
export async function invalidateCachedAudio(remoteUrl: string): Promise<void> {
  if (!remoteUrl || IS_WEB || !CACHE_DIR) return;
  try {
    const destFile = new File(CACHE_DIR, stableFilename(remoteUrl));
    if (destFile.exists) destFile.delete();
  } catch (e) { console.error('[utils/audioCache:111]', e); }
}

// Single, shared "create and play this sound" implementation for every caller in sounds.ts
// and voiceClips.ts - centralizing this (rather than each of the 3 call sites repeating its
// own Audio.Sound.createAsync + catch) is what actually makes the fallback-to-remote
// guarantee real everywhere at once, instead of something that has to be remembered and
// re-implemented correctly at every future call site. Tries the cached local file first
// (instant when it's good); if THAT throws, treats it as a bad cache entry - invalidates it
// and retries once against the plain remote URL, exactly the pre-cache behaviour. Returns
// null (never throws) if both attempts fail, matching every other function in this file.
export async function createResilientSound(
  remoteUrl: string,
  options: Parameters<typeof Audio.Sound.createAsync>[1]
): Promise<Audio.Sound | null> {
  if (!remoteUrl) return null;
  const localUri = await getCachedAudioUri(remoteUrl);
  try {
    const { sound } = await Audio.Sound.createAsync({ uri: localUri }, options);
    return sound;
  } catch {
    if (localUri === remoteUrl) return null; // was never cached in the first place - nothing to fall back from
    await invalidateCachedAudio(remoteUrl);
    try {
      const { sound } = await Audio.Sound.createAsync({ uri: remoteUrl }, options);
      return sound;
    } catch {
      return null;
    }
  }
}
