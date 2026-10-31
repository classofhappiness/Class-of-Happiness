import AsyncStorage from '@react-native-async-storage/async-storage';

// Android can end the app's process while another app (a PDF viewer, the browser) is in front,
// and the next open then starts from Home. The current screen is remembered here so a launch
// shortly after leaving can return to it. Module state resets per launch.
const KEY = 'coh_resume_route_v1';
const MAX_AGE_MS = 30 * 60 * 1000;
let tried = false;

const SKIP = ['/', '/auth', '/subscription/success', '/+not-found'];
const skip = (path: string) => !path || SKIP.some((p) => path === p || (p !== '/' && path.startsWith(p + '/')));

export function rememberRoute(path: string, search: string) {
  // Reaching a sign-in screen means a sign-out or a different person: nothing to go back to.
  if (path.startsWith('/auth')) { AsyncStorage.removeItem(KEY).catch(() => {}); return; }
  if (skip(path)) return;
  AsyncStorage.setItem(KEY, JSON.stringify({ path, search, at: Date.now() })).catch(() => {});
}

// Once per launch: the remembered screen if it is recent, otherwise null.
export async function takeResumeRoute(): Promise<string | null> {
  if (tried) return null;
  tried = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v?.path || skip(v.path) || Date.now() - Number(v.at) > MAX_AGE_MS) return null;
    return v.path + (v.search || '');
  } catch {
    return null;
  }
}

export function forgetRoute() {
  AsyncStorage.removeItem(KEY).catch(() => {});
}
