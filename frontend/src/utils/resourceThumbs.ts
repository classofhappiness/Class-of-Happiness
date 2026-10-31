import { resourcesApi } from './api';

// Small page thumbnails for the resource list cards, loaded on demand (only for cards that are on
// screen) and cached for the session. Never part of a list response. Resolves to the data-URI list
// (first preview page first), or [] when the resource has no previews / is locked / the request failed.
const THUMB_WIDTH = 240;
const MAX_ENTRIES = 80;
const EMPTY_TTL_MS = 5 * 60 * 1000;   // retry "none" results (locked, offline, no previews) after a while

const cache = new Map<string, { uris: string[]; at: number }>();
const inflight = new Map<string, Promise<string[]>>();

export function cachedThumbs(id: string): string[] | null {
  const hit = cache.get(id);
  if (!hit) return null;
  if (hit.uris.length === 0 && Date.now() - hit.at > EMPTY_TTL_MS) { cache.delete(id); return null; }
  return hit.uris;
}

export function loadThumbs(id: string): Promise<string[]> {
  const hit = cachedThumbs(id);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(id);
  if (pending) return pending;
  const p = resourcesApi.getPreviewThumbnails(id, THUMB_WIDTH)
    .then((r) => (r.previews || []).slice().sort((a, b) => a.page_order - b.page_order).map((x) => `data:image/jpeg;base64,${x.image}`))
    .catch(() => [] as string[])
    .then((uris) => {
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(id, { uris, at: Date.now() });
      inflight.delete(id);
      return uris;
    });
  inflight.set(id, p);
  return p;
}
