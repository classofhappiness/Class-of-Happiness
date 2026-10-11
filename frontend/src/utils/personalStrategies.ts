// Oct 11: a teacher's PERSONAL check-in strategies.
// Source of truth for the UI is the on-device list (AsyncStorage `teacher_custom_strategies_<user_id>`, the same key the
// app always used, so existing items are read as before). Every change is mirrored to the server (custom_helpers rows
// with student_id NULL) on a best-effort basis; anything that could not be sent stays flagged `dirty` and is retried on
// the next sync. DELETE IS SOFT: the item stays in the list with active=false, so a past check-in that used it keeps
// showing its name (here) and in the PDF (server row kept with is_active=false).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { teacherPersonalStrategiesApi } from './api';

export type PersonalColour = 'blue' | 'green' | 'yellow' | 'red';
export const PERSONAL_COLOURS: PersonalColour[] = ['blue', 'green', 'yellow', 'red'];

export interface PersonalStrategy {
  id: string;
  name: string;
  description: string;
  colours: PersonalColour[];   // all four = "All colours"
  active: boolean;
  dirty?: boolean;             // has a change the server has not confirmed yet
}

const storeKey = (userId: string) => `teacher_custom_strategies_${userId}`;

const normalise = (raw: any): PersonalStrategy | null => {
  if (!raw || !raw.id || !raw.name) return null;
  const cols = Array.isArray(raw.colours) ? PERSONAL_COLOURS.filter(c => raw.colours.includes(c)) : [];
  return {
    id: String(raw.id), name: String(raw.name), description: String(raw.description || ''),
    colours: cols.length ? cols : [...PERSONAL_COLOURS],     // items saved before colours existed belong to every colour
    active: raw.active !== false,
    dirty: !!raw.dirty,
  };
};

export async function loadLocalPersonalStrategies(userId?: string | null): Promise<PersonalStrategy[]> {
  if (!userId) return [];
  try {
    const raw = await AsyncStorage.getItem(storeKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return (Array.isArray(list) ? list : []).map(normalise).filter(Boolean) as PersonalStrategy[];
  } catch { return []; }
}

async function saveLocal(userId: string, list: PersonalStrategy[]) {
  try { await AsyncStorage.setItem(storeKey(userId), JSON.stringify(list)); } catch (e) { console.error('[personalStrategies save]', e); }
}

// Oct 11 (fix41): two things used to run at once - the sync started when the screen loads and the sync started by
// "Save" - and the slower one wrote its (older) result over the newer one, so a just-added item vanished from the
// screen and from storage. Now (1) every read-modify-write of the device list goes through one lock, (2) only one
// network sync runs at a time (later ones wait their turn), and (3) a sync merges into what is on the device when it
// finishes instead of replacing it, so anything added or edited while it ran is kept (flagged dirty, pushed next sync).
let localLock: Promise<unknown> = Promise.resolve();
function withLocal<T>(fn: () => Promise<T>): Promise<T> {
  const r = localLock.then(fn, fn);
  localLock = r.catch(() => {});
  return r;
}
let syncChain: Promise<unknown> = Promise.resolve();
function inSyncOrder<T>(fn: () => Promise<T>): Promise<T> {
  const r = syncChain.then(fn, fn);
  syncChain = r.catch(() => {});
  return r;
}
/** Change the device list atomically and return the new list. */
function mutateLocal(userId: string, fn: (list: PersonalStrategy[]) => PersonalStrategy[]): Promise<PersonalStrategy[]> {
  return withLocal(async () => {
    const next = fn(await loadLocalPersonalStrategies(userId));
    await saveLocal(userId, next);
    return next;
  });
}

const fromServer = (s: any, prev?: PersonalStrategy): PersonalStrategy => ({
  id: String(s.id), name: s.name, description: s.description || '',
  colours: (Array.isArray(s.colours) ? PERSONAL_COLOURS.filter(c => s.colours.includes(c)) : [...PERSONAL_COLOURS]) as PersonalColour[],
  active: s.is_active !== false, dirty: false,
});

/**
 * Reconcile the device list with the server (idempotent: re-running never duplicates a row, because the server keeps
 * an old on-device id as the row id and answers "existing" the second time). Server wins for anything already
 * confirmed; local items it does not know yet (first run = the one-time migration) and local changes flagged dirty
 * are pushed. If the server is unreachable the local list is returned unchanged.
 */
export function syncPersonalStrategies(userId?: string | null): Promise<PersonalStrategy[]> {
  if (!userId) return Promise.resolve([]);
  return inSyncOrder(() => runSync(userId));
}

async function runSync(userId: string): Promise<PersonalStrategy[]> {
  const local = await loadLocalPersonalStrategies(userId);
  let server: any[];
  try { server = await teacherPersonalStrategiesApi.list(true); } catch { return local; }
  if (!Array.isArray(server)) return local;
  const byId = new Map(server.map(s => [String(s.id), s]));
  const out: { from: string; item: PersonalStrategy }[] = [];
  for (const l of local) {
    const s = byId.get(l.id);
    try {
      if (!s) {
        const r = await teacherPersonalStrategiesApi.create({ id: l.id, name: l.name, description: l.description, colours: l.colours });
        const newId = String(r.id || l.id);
        if (!l.active) await teacherPersonalStrategiesApi.remove(newId);
        out.push({ from: l.id, item: { ...l, id: newId, dirty: false } });
      } else if (l.dirty) {
        await teacherPersonalStrategiesApi.update(l.id, { name: l.name, description: l.description, colours: l.colours, is_active: l.active });
        out.push({ from: l.id, item: { ...l, dirty: false } });
      } else {
        out.push({ from: l.id, item: fromServer(s, l) });
      }
    } catch {
      out.push({ from: l.id, item: { ...l, dirty: true } });          // stays on this device, retried next time
    }
  }
  const have = new Set(out.map(o => o.item.id));
  server.forEach(s => { if (!have.has(String(s.id))) out.push({ from: String(s.id), item: fromServer(s) }); });   // created on another device
  // merge into the CURRENT device list (it may have changed while the requests were running)
  return withLocal(async () => {
    const cur = await loadLocalPersonalStrategies(userId);
    const curBy = new Map(cur.map(c => [c.id, c]));
    const snapBy = new Map(local.map(l => [l.id, JSON.stringify(l)]));
    const merged: PersonalStrategy[] = out.map(({ from, item }) => {
      const c = curBy.get(from);
      const changedMeanwhile = !!c && snapBy.has(from) && JSON.stringify(c) !== snapBy.get(from);
      return changedMeanwhile ? { ...c!, dirty: true } : item;
    });
    const seen = new Set(merged.map(m => m.id)); out.forEach(o => seen.add(o.from));
    cur.forEach(c => { if (!seen.has(c.id)) merged.push(c); });          // added while the sync was running
    await saveLocal(userId, merged);
    return merged;
  });
}

type Listener = (list: PersonalStrategy[]) => void;

/**
 * Add / edit / delete: the device list is changed first and handed to `onLocal` at once (so the screen shows the result
 * immediately), then the change is sent to the server and the confirmed list is returned.
 */
export async function addPersonalStrategy(userId: string, data: { name: string; description: string; colours: PersonalColour[] }, onLocal?: Listener): Promise<PersonalStrategy[]> {
  const item: PersonalStrategy = { id: `custom_${Date.now()}`, name: data.name.trim(), description: data.description.trim(), colours: data.colours.length ? data.colours : [...PERSONAL_COLOURS], active: true, dirty: true };
  const local = await mutateLocal(userId, list => [...list, item]);
  onLocal?.(local);
  return syncPersonalStrategies(userId);
}

export async function updatePersonalStrategy(userId: string, id: string, patch: Partial<Pick<PersonalStrategy, 'name' | 'description' | 'colours'>>, onLocal?: Listener): Promise<PersonalStrategy[]> {
  const local = await mutateLocal(userId, list => list.map(s => s.id === id ? { ...s, ...patch, dirty: true } : s));
  onLocal?.(local);
  return syncPersonalStrategies(userId);
}

/** Soft delete: the item stays (inactive) so old check-ins keep its name. */
export async function deletePersonalStrategy(userId: string, id: string, onLocal?: Listener): Promise<PersonalStrategy[]> {
  const local = await mutateLocal(userId, list => list.map(s => s.id === id ? { ...s, active: false, dirty: true } : s));
  onLocal?.(local);
  return syncPersonalStrategies(userId);
}

/** id -> name for EVERY item, including deleted ones (used to name past check-ins). */
export function personalStrategyNames(list: PersonalStrategy[]): Record<string, string> {
  const o: Record<string, string> = {};
  list.forEach(s => { o[s.id] = s.name; });
  return o;
}
