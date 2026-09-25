import { useEffect, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { supportRequestsApi, SupportRequest } from './api';

// Real fix Sep 11 (stop-ship): the banner and the status screen each ran their OWN
// setInterval poll. Confirmed live - Metro log showed hundreds of GET /support-requests
// calls per second, sustained, starving the local backend (students/classrooms timeouts,
// several sends "not pressing through"). Root cause: React Navigation's stack keeps
// previous screens mounted (hidden, not unmounted) by default, so every visit to the
// status screen that didn't end in RESOLVED left its own poller running forever in the
// background; repeated Fast Refresh during dev made this worse. Every prior fix (cleanup
// on unmount) only helps if unmount actually fires - it doesn't when a screen is merely
// navigated away from, not popped.
//
// Real fix: ONE shared poller for the whole app, module-scoped (this file is edited far
// less often than the UI components that were stacking intervals). Every subscriber -
// no matter how many, even leaked ones - shares the same in-flight-guarded tick, so at
// most one GET /support-requests call goes out per tick, period. useSupportRequestsList
// additionally unsubscribes the moment a screen loses focus (useIsFocused), so a
// backgrounded screen contributes zero listeners, not just zero intervals.
const POLL_MS = 2500;

type Listener = (list: SupportRequest[]) => void;

const listeners = new Set<Listener>();
let intervalId: ReturnType<typeof setInterval> | null = null;
let inFlight = false;
let lastResult: SupportRequest[] = [];
// Real fix Sep 25 (item1, fourth device-log pass): tracks when a tick last actually ran (start
// time, not completion) - see ensureRunning's own comment for why.
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

function ensureRunning() {
  if (intervalId) return;
  // Real fix Sep 25 (item1, fourth device-log pass - Metro log: GET /support-requests firing
  // twice ~1s apart on cold app open only): useSupportRequestsList's own useIsFocused (from
  // @react-navigation/native, the same focus-tracking machinery useFocusEffect uses) can
  // report an extra transition during a navigator's initial state resolution on cold boot -
  // subscribe -> unsubscribe -> resubscribe in quick succession, which without this guard
  // stopped the poller (last listener gone) and immediately restarted it (tick() on `!
  // intervalId`), firing a second real request seconds after the first had barely returned.
  // In-flight alone doesn't catch this - by the time the second subscribe arrives, the first
  // tick has usually already resolved. This is a real cooldown, not a workaround: a stop+
  // restart within POLL_MS of the last tick just resumes the existing cadence instead of
  // firing an extra one, and a genuinely stale restart (the poller having been idle for a
  // while) still ticks immediately as before.
  if (Date.now() - lastTickAt < POLL_MS) {
    intervalId = setInterval(tick, POLL_MS);
    return;
  }
  tick();
  intervalId = setInterval(tick, POLL_MS);
}

function stopIfIdle() {
  if (listeners.size === 0 && intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function subscribeSupportRequestsList(listener: Listener): () => void {
  listeners.add(listener);
  if (lastResult.length) listener(lastResult); // immediate cached data, don't wait for the next tick
  ensureRunning();
  return () => {
    listeners.delete(listener);
    stopIfIdle();
  };
}

export function useSupportRequestsList(enabled: boolean): SupportRequest[] {
  const [list, setList] = useState<SupportRequest[]>([]);
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!enabled || !isFocused) {
      setList([]);
      return;
    }
    return subscribeSupportRequestsList(setList);
  }, [enabled, isFocused]);
  return list;
}
