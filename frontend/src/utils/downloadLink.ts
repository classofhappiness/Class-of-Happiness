// fix51: PDF / report / resource / export downloads are opened in the system browser (Linking.openURL) or fetched without
// an Authorization header, so they used to carry the SESSION TOKEN in the url (?token=...), which ends up in server logs and
// browser history. getDownloadUrl asks the backend for a short-lived (about 2 minutes), single-purpose signed link instead
// (POST /api/downloads/link with the normal Authorization header). If that call fails for any reason (older backend,
// network error, unexpected answer) it falls back to the old behaviour through `legacyBuild`, so nothing stops working.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSessionToken } from './api';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

/**
 * @param path   endpoint path relative to /api, without a query, e.g. '/reports/pdf/student/<id>/month/2026/10'
 * @param query  query parameters the endpoint needs (lang, days, ...); undefined/empty values are dropped
 * @param legacyBuild  builds the old `?token=` url; only used when no signed link could be obtained
 */
export async function getDownloadUrl(path: string, query: Record<string, string | number | null | undefined>, legacyBuild: () => string): Promise<string> {
  try {
    const token = (await getSessionToken()) || (await AsyncStorage.getItem('session_token'));
    if (!token) return legacyBuild();
    const clean: Record<string, string> = {};
    Object.keys(query || {}).forEach(k => {
      const v = query[k];
      if (v !== undefined && v !== null && String(v) !== '') clean[k] = String(v);
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(`${BACKEND_URL}/api/downloads/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path, query: clean }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) return legacyBuild();
    const data = await res.json();
    const url = data && typeof data.url === 'string' ? data.url : '';
    if (!url.startsWith('https://') || !url.includes('/api/')) return legacyBuild();
    return url;
  } catch {
    return legacyBuild();
  }
}
