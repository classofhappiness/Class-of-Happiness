import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { supportRequestsApi, SupportRequest } from './api';

// Real fix Sep 11 (stop-ship): the banner and the status screen each ran their OWN
// setInterval poll. Confirmed live - Metro log showed hundreds of GET /support-requests
// calls per second, sustained, starving the local backend (students/classrooms timeouts,
// several sends "not pressing through"). Root cause: React Navigation's stack keeps
// previous screens mounted (hidden, not unmounted) by default, so every visit to the
// status screen that didn't end in RESOLVED left its own poller running forever in the
// background; repeated Fast Refresh during dev made this worse.
//
// Root cause fix Sep 25 (round-3 device test, item 0): the module-singleton poller from the
// Sep 11 fix still tied start/stop to component subscribe/unsubscribe (ensureRunning on
// every subscribe, stopIfIdle on every unsubscribe) - meaning its real lifecycle was
// whatever arbitrary mount/unmount/focus churn up to four different call sites produced
// (admin/dashboard.tsx, teacher/support-request.tsx, teacher/dashboard.tsx AND the
// SupportRequestBanner it renders - two subscribers live on the same screen at once). A
// Sep 25 "cooldown" tried to stop a rapid resubscribe from firing an extra immediate tick,
// but it still created a brand new setInterval on every restart - a fast enough churn (this
// being a dev Metro session, exactly the Fast Refresh aggravator this file's own Sep 11
// comment already named) could still stack multiple live timers, each unaware of the
// others. Confirmed live: 19 real GET /support-requests calls in ~5s, with per-call server
// duration climbing under the self-inflicted load (up to 15s, per the new timing
// middleware) - the storm was making itself worse.
//
// The poller is no longer started or stopped by subscribing at all. AppContext calls
// start/stop exactly once, tied to real login/logout (see its own effect on
// isAuthenticated/user.role) - never to any screen's mount. Every subscriber from here on
// is a pure state reader: it can request at most one immediate extra tick (rate-limited to
// once per 5s), and can never touch setInterval/clearInterval, so this whole class of
// stacking-timers bug is now impossible by construction, not just cooled down.
// Oct 10: 15s foreground interval (was 2.5s). Push + focus + immediate ticks cover the
// urgent paths; the interval is a safety net. Paused entirely while backgrounded.
const POLL_MS = 15000;
const MIN_IMMEDIATE_TICK_GAP_MS = 5000;

type Listener = (list: SupportRequest[]) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastResult: SupportRequest[] = [];
let lastTickAt = 0;
let appStateSub: { remove: () => void } | null = null;
// Oct 10: push-driven refresh (debounced, trailing) state.
const PUSH_REFRESH_DEBOUNCE_MS = 1000;
let pushRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let rerunAfterInFlight = false;

// Oct 10: handles are mirrored on globalThis. When Metro Fast Refresh re-evaluates this module the
// module-level variables above reset to null while the OLD copy's timers keep running (nothing could
// clear them), so every refresh used to add one more orphaned 15s interval. Anything left on
// globalThis by a previous copy is cleared before a new one is created. No effect on a cold start.
const g = globalThis as any;

function startInterval() {
  if (intervalId) return; // single interval, never stacked
  if (g.__cohSrInterval) clearInterval(g.__cohSrInterval); // orphan from a previous module copy
  intervalId = setInterval(tick, POLL_MS);
  g.__cohSrInterval = intervalId;
}

function clearIntervalIfAny() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (g.__cohSrInterval) {
    clearInterval(g.__cohSrInterval);
    g.__cohSrInterval = null;
  }
}

function handleAppStateChange(next: AppStateStatus) {
  if (next === 'active') {
    if (!intervalId) {
      tick(); // one immediate catch-up tick on return to foreground, then resume
      startInterval();
    }
  } else {
    clearIntervalIfAny(); // background/inactive: no polling
  }
}

async function tick() {
  if (inFlight) return; // never let two fetches stack, no matter how the interval fires
  inFlight = true;
  lastTickAt = Date.now();
  try {
    const list = await supportRequestsApi.list();
    lastResult = list;
    listeners.forEach((l) => l(list));
  } catch {
    // transient failure - next tick retries, never throws into a caller
  } finally {
    inFlight = false;
    // A push-driven refresh arrived while a (possibly older) fetch was in flight: run once more
    // so the push's change is never lost behind that stale response.
    if (rerunAfterInFlight) {
      rerunAfterInFlight = false;
      tick();
    }
  }
}

// Called exactly once, from AppContext, when a support-requests-eligible role
// (teacher/school_admin/admin/superadmin) becomes authenticated.
export function startSupportRequestsPoller(): void {
  if (intervalId || appStateSub) return;
  if (g.__cohSrAppStateSub) { g.__cohSrAppStateSub.remove(); g.__cohSrAppStateSub = null; } // orphan from a previous module copy
  if (!appStateSub) appStateSub = AppState.addEventListener('change', handleAppStateChange);
  g.__cohSrAppStateSub = appStateSub;
  if (AppState.currentState === 'active') {
    tick();
    startInterval();
  }
}

// Called exactly once, from AppContext, on logout or a role that never needed this poller.
export function stopSupportRequestsPoller(): void {
  clearIntervalIfAny();
  if (pushRefreshTimer) {
    clearTimeout(pushRefreshTimer);
    pushRefreshTimer = null;
  }
  if (g.__cohSrPushTimer) { clearTimeout(g.__cohSrPushTimer); g.__cohSrPushTimer = null; }
  rerunAfterInFlight = false;
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  g.__cohSrAppStateSub = null;
  lastResult = [];
  listeners.forEach((l) => l([]));
}

// A focus/refresh event may ask for one extra, real, up-to-date tick - but only if the last
// real tick was more than 5s ago, and it never starts or stops the interval itself.
export function requestImmediateSupportRequestsTick(): void {
  if (Date.now() - lastTickAt > MIN_IMMEDIATE_TICK_GAP_MS) {
    tick();
  }
}

// Oct 10: for the user's OWN action (acknowledge/respond) - refresh the list right after the API call
// without the 5s gap, so the UI doesn't wait for the 15s interval. Still never touches the interval.
export function refreshSupportRequestsNow(): void {
  tick();
}

// Oct 10: for support_request* PUSHES (new/response/cancelled/rebuzz). Bypasses the 5s gap but is
// debounced 1s (trailing): a burst of pushes causes ONE tick. Does nothing if the poller isn't
// running (logged out) - the start tick covers that case. Timer is cleared in stop.
export function requestSupportRequestsRefreshFromPush(): void {
  if (pushRefreshTimer) clearTimeout(pushRefreshTimer);
  if (g.__cohSrPushTimer) clearTimeout(g.__cohSrPushTimer); // pending timeout of a previous module copy
  pushRefreshTimer = setTimeout(() => {
    pushRefreshTimer = null;
    g.__cohSrPushTimer = null;
    if (!appStateSub) return;
    if (inFlight) rerunAfterInFlight = true;
    else tick();
  }, PUSH_REFRESH_DEBOUNCE_MS);
  g.__cohSrPushTimer = pushRefreshTimer;
}

// Oct 10: re-buzz pushes carry only {type, id} (no is_incident), so the app looks the request up.
// Returns the cached row if present, else fetches the list once (also feeds subscribers).
// Returns null if it can't be determined (not found / network error).
export async function findSupportRequestForPush(id: string): Promise<SupportRequest | null> {
  const cached = lastResult.find((r) => r.id === id);
  // A cached PENDING row is only trusted as-is if present; status is re-checked by the caller.
  try {
    const list = await supportRequestsApi.list();
    lastResult = list;
    listeners.forEach((l) => l(list));
    return list.find((r) => r.id === id) || null;
  } catch {
    return cached || null;
  }
}

export function subscribeSupportRequestsList(listener: Listener): () => void {
  listeners.add(listener);
  if (lastResult.length) listener(lastResult); // immediate cached data, don't wait for the next tick
  return () => {
    listeners.delete(listener);
  };
}

export function useSupportRequestsList(enabled: boolean): SupportRequest[] {
  const [list, setList] = useState<SupportRequest[]>(lastResult);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!enabled) return;
    // Pure state subscription - never starts/stops the shared interval.
    return subscribeSupportRequestsList(setList);
  }, [enabled]);
  useEffect(() => {
    if (enabled && isFocused) requestImmediateSupportRequestsTick();
  }, [enabled, isFocused]);
  return enabled && isFocused ? list : [];
}
