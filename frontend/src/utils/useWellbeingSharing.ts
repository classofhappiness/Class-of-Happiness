import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Real fix Sep 24 (item4, second device-log pass): extracted from settings.tsx so
// teacher/checkin.tsx can show the SAME "Share With My School Admin" toggle Jono asked for -
// same GET /teacher/wellbeing-sharing-status + PUT /teacher/toggle-wellbeing-sharing calls,
// same teacher_wellbeing_shared_with_admin backend field, one implementation instead of two
// that could drift (the exact "do not create a second setting" instruction this was built
// for). `enabled` gates the initial fetch - both callers pass `user?.role === 'teacher'`
// (this feature only exists for that role); toggle() itself is safe to call regardless, since
// the Switch it drives is never rendered for anyone else.
//
// Real fix Sep 24 (item4, third device-log pass - stale initial state): Jono flipped this on
// via Check-In, opened Settings, and watched it render off then flip on - each screen's own
// useWellbeingSharing() call started from a hardcoded `useState(false)`, showing the WRONG
// value for the whole window between mount and that screen's own fetch resolving, even though
// the real value had already been fetched moments earlier by the other screen. cachedShared is
// a module-level (not React state) last-known value shared by every consumer, however many
// screens call this hook - a second/third mount renders the real value on its very first
// render, no flicker, and still kicks off its own background refetch to stay current (e.g. if
// changed from a different device). `null` means "genuinely never fetched this session yet" -
// the one real "unknown" case, which now drives `loading` (see below) instead of ever
// rendering the false default.
let cachedShared: boolean | null = null;

export function useWellbeingSharing(enabled: boolean) {
  const [shared, setShared] = useState<boolean | null>(cachedShared);
  // Real fix Sep 24 (item4, third device-log pass): loading now also covers the INITIAL
  // fetch, not just toggle() - previously only toggle() set this, so the first-ever fetch (no
  // cached value yet) rendered a real Switch defaulting to off for the whole fetch window
  // instead of the disabled/neutral state callers already render for `loading`. With a cached
  // value already in hand (shared !== null on mount), there's nothing "unknown" to hide, so
  // this stays false and the correct value renders immediately.
  const [loading, setLoading] = useState(shared === null);

  useEffect(() => {
    if (!enabled) return;
    if (shared === null) setLoading(true);
    (async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        const res = await fetch(`${BACKEND_URL}/api/teacher/wellbeing-sharing-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          cachedShared = !!data.shared;
          setShared(cachedShared);
        }
      } catch (e) { console.error('[utils/useWellbeingSharing:51]', e); } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const toggle = useCallback(async (): Promise<{ ok: true } | { ok: false; detail?: string }> => {
    setLoading(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/teacher/toggle-wellbeing-sharing`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        cachedShared = !!data.shared;
        setShared(cachedShared);
        return { ok: true };
      }
      return { ok: false, detail: data?.detail };
    } catch {
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, []);

  // shared is only ever null for the true first-ever fetch of the session - callers already
  // gate their Switch on `loading`, which is true for exactly that same window, so the false
  // fallback here is never actually shown as a real value, only ever alongside the loading
  // indicator.
  return { shared: shared ?? false, loading, toggle };
}
