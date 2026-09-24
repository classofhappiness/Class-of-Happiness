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
export function useWellbeingSharing(enabled: boolean) {
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        const res = await fetch(`${BACKEND_URL}/api/teacher/wellbeing-sharing-status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setShared(!!data.shared);
        }
      } catch {}
    })();
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
        setShared(!!data.shared);
        return { ok: true };
      }
      return { ok: false, detail: data?.detail };
    } catch {
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, []);

  return { shared, loading, toggle };
}
