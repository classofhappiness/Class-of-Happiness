import { useEffect, useState } from 'react';
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
const POLL_MS = 2500;
const MIN_IMMEDIATE_TICK_GAP_MS = 5000;

type Listener = (list: SupportRequest[]) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastResult: SupportRequest[] = [];
let lastTickAt = 0;

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
  }
}

// Called exactly once, from AppContext, when a support-requests-eligible role
// (teacher/school_admin/admin/superadmin) becomes authenticated.
export function startSupportRequestsPoller(): void {
  if (intervalId) return;
  tick();
  intervalId = setInterval(tick, POLL_MS);
}

// Called exactly once, from AppContext, on logout or a role that never needed this poller.
export function stopSupportRequestsPoller(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
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
