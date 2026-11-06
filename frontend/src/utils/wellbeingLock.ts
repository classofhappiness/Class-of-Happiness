import AsyncStorage from '@react-native-async-storage/async-storage';

// Server side of the My Wellbeing / teacher check-in PIN locks: the one-word hint and the
// checked reset (see "WELLBEING LOCK" in backend/server.py). The PIN itself stays on the device.
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export const WL_PROMPTS = ['pet', 'hobby', 'place'] as const;
export type WlPrompt = typeof WL_PROMPTS[number];
export const WL_PROMPT_KEYS: Record<WlPrompt, string> = {
  pet: 'wl_prompt_pet', hobby: 'wl_prompt_hobby', place: 'wl_prompt_place',
};
export const WL_PROMPT_FALLBACK: Record<WlPrompt, string> = {
  pet: 'Name of your pet', hobby: 'Your favourite hobby', place: 'A place you want to visit',
};

export const teacherLockScope = 'teacher';
export const memberLockScope = (memberId: string) => `member:${memberId}`;

export type WlStatus = { has_hint: boolean; prompt: WlPrompt | null; has_account_password: boolean; locked_minutes: number };
export type WlResult<T = any> = { ok: boolean; status: number; data: T | null; code?: string; attemptsLeft?: number; retryMinutes?: number; retrySeconds?: number; message?: string; extra?: any };

async function call(path: string, method: string, body?: any): Promise<WlResult> {
  try {
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${BACKEND_URL}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (res.ok) return { ok: true, status: res.status, data };
    const d = data?.detail;
    return {
      ok: false, status: res.status, data,
      code: typeof d === 'object' ? d?.code : undefined,
      attemptsLeft: typeof d === 'object' ? d?.attempts_left : undefined,
      retryMinutes: typeof d === 'object' ? d?.retry_after_minutes : undefined,
      retrySeconds: typeof d === 'object' ? d?.retry_after_seconds : undefined,
      message: typeof d === 'string' ? d : undefined,
    };
  } catch {
    return { ok: false, status: 0, data: null, code: 'network' };
  }
}

export async function getLockStatus(scope: string): Promise<WlStatus | null> {
  const r = await call(`/wellbeing-lock/status?scope=${encodeURIComponent(scope)}`, 'GET');
  return r.ok ? (r.data as WlStatus) : null;
}
export const saveLockHint = (scope: string, prompt: WlPrompt, answer: string, currentAnswer = '') =>
  call('/wellbeing-lock/hint', 'PUT', { scope, prompt, answer, current_answer: currentAnswer });
export const verifyLockReset = (scope: string, answer: string, password: string, code = '') =>
  call('/wellbeing-lock/reset', 'POST', { scope, answer, password, code });
// Emails a 6-digit code to the signed-in account's own address (the server decides the address).
export const sendLockEmailCode = (scope: string) =>
  call('/wellbeing-lock/email-code', 'POST', { scope });
