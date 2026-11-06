import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { KeyboardSafeView } from './KeyboardSafeView';
import {
  WL_PROMPTS, WL_PROMPT_KEYS, WL_PROMPT_FALLBACK, WlPrompt, WlResult, WlStatus,
  getLockStatus, saveLockHint, verifyLockReset,
} from '../utils/wellbeingLock';

type T = (k: string) => string;

function errorText(r: WlResult, t: T): string {
  if (r.code === 'locked') return (t('wl_locked') || 'Too many wrong answers. Reset is locked for {n} minutes.').replace('{n}', String(r.retryMinutes || 15));
  if (r.code === 'wrong') return (t('wl_wrong_left') || 'Wrong answer. {n} tries left.').replace('{n}', String(r.attemptsLeft ?? 0));
  if (r.status === 400 && r.message) return t('wl_hint_one_word') || 'The answer must be one word.';
  return t('error') || 'Error';
}

// Choose one of three prompts and type a one-word answer. Used when the PIN is first created, and
// to ask existing users (who have a PIN but no hint yet) to add one.
export function WellbeingHintModal({ visible, scope, t, onSaved, onSkip }: {
  visible: boolean; scope: string; t: T; onSaved: () => void; onSkip?: () => void;
}) {
  const [prompt, setPrompt] = useState<WlPrompt>('pet');
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (visible) { setAnswer(''); setErr(''); setPrompt('pet'); } }, [visible]);

  const save = async () => {
    const a = answer.trim();
    if (!a || /\s/.test(a)) { setErr(t('wl_hint_one_word') || 'The answer must be one word.'); return; }
    setBusy(true); setErr('');
    const r = await saveLockHint(scope, prompt, a);
    setBusy(false);
    if (r.ok) onSaved(); else setErr(errorText(r, t));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onSkip && onSkip()}>
      <KeyboardSafeView style={st.overlay}>
        <View style={st.card}>
          <Text style={st.title}>{t('wl_hint_title') || 'Add a hint to reset your PIN'}</Text>
          <Text style={st.desc}>{t('wl_hint_desc') || 'If you forget your PIN, you will need the one-word answer to choose a new one. Pick a question and type one word.'}</Text>
          {WL_PROMPTS.map(p => (
            <TouchableOpacity key={p} style={[st.chip, prompt === p && st.chipOn]} onPress={() => setPrompt(p)}>
              <Text style={[st.chipText, prompt === p && st.chipTextOn]}>{t(WL_PROMPT_KEYS[p]) || WL_PROMPT_FALLBACK[p]}</Text>
            </TouchableOpacity>
          ))}
          <TextInput style={st.input} value={answer} onChangeText={setAnswer} autoCapitalize="none" autoCorrect={false}
            placeholder={t('wl_answer_placeholder') || 'One-word answer'} placeholderTextColor="#999" editable={!busy} maxLength={40} />
          {err ? <Text style={st.err}>{err}</Text> : null}
          <TouchableOpacity style={st.primary} onPress={save} disabled={busy}>
            {busy ? <ActivityIndicator color="white" /> : <Text style={st.primaryText}>{t('wl_hint_save') || 'Save hint'}</Text>}
          </TouchableOpacity>
          {onSkip ? (
            <TouchableOpacity style={st.secondary} onPress={onSkip} disabled={busy}>
              <Text style={st.secondaryText}>{t('wl_not_now') || 'Not now'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </KeyboardSafeView>
    </Modal>
  );
}

// Forgot PIN: prove it is the owner. Hint set -> show only the chosen prompt and ask for the
// answer. No hint yet -> ask for the account password.
export function WellbeingResetModal({ visible, scope, t, onVerified, onClose }: {
  visible: boolean; scope: string; t: T; onVerified: () => void; onClose: () => void;
}) {
  const [status, setStatus] = useState<WlStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible) return;
    setValue(''); setErr(''); setStatus(null); setLoading(true);
    getLockStatus(scope).then(s => {
      setStatus(s); setLoading(false);
      if (s && s.locked_minutes) setErr((t('wl_locked') || 'Too many wrong answers. Reset is locked for {n} minutes.').replace('{n}', String(s.locked_minutes)));
    });
  }, [visible, scope]);

  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true); setErr('');
    const r = status?.has_hint ? await verifyLockReset(scope, value, '') : await verifyLockReset(scope, '', value);
    setBusy(false);
    if (r.ok) { onVerified(); return; }
    setValue('');
    setErr(errorText(r, t));
  };

  const noWayToReset = !!status && !status.has_hint && !status.has_account_password;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafeView style={st.overlay}>
        <View style={st.card}>
          <Text style={st.title}>{t('wellbeing_pin_reset') || 'Reset PIN'}</Text>
          {loading || !status ? <ActivityIndicator style={{ marginVertical: 16 }} /> : noWayToReset ? (
            <Text style={st.desc}>{t('wl_no_password') || "This account has no password, so the PIN can't be reset here. Please contact support."}</Text>
          ) : (
            <>
              {status.has_hint && status.prompt ? (
                <>
                  <Text style={st.desc}>{t('wl_reset_answer_desc') || 'Answer your question to choose a new PIN.'}</Text>
                  <Text style={st.prompt}>{t(WL_PROMPT_KEYS[status.prompt]) || WL_PROMPT_FALLBACK[status.prompt]}</Text>
                </>
              ) : (
                <Text style={st.desc}>{t('wl_reset_password_desc') || "You haven't added a hint yet. Enter your account password to choose a new PIN."}</Text>
              )}
              <TextInput style={st.input} value={value} onChangeText={setValue} autoCapitalize="none" autoCorrect={false}
                secureTextEntry={!status.has_hint}
                placeholder={status.has_hint ? (t('wl_answer_placeholder') || 'One-word answer') : (t('wl_password_placeholder') || 'Account password')}
                placeholderTextColor="#999" editable={!busy} maxLength={status.has_hint ? 40 : 200} />
            </>
          )}
          {err ? <Text style={st.err}>{err}</Text> : null}
          {!noWayToReset && status ? (
            <TouchableOpacity style={st.primary} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color="white" /> : <Text style={st.primaryText}>{t('wl_continue') || 'Continue'}</Text>}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={st.secondary} onPress={onClose} disabled={busy}>
            <Text style={st.secondaryText}>{t('cancel') || 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardSafeView>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, width: '100%', maxWidth: 420 },
  title: { fontSize: 18, fontWeight: '800', color: '#333', marginBottom: 6 },
  desc: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 12 },
  prompt: { fontSize: 15, fontWeight: '700', color: '#5C6BC0', marginBottom: 10 },
  chip: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 8 },
  chipOn: { borderColor: '#5C6BC0', backgroundColor: '#EEF1FB' },
  chipText: { fontSize: 14, color: '#555' },
  chipTextOn: { color: '#5C6BC0', fontWeight: '700' },
  input: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#E8E8E8', borderRadius: 10, padding: 12, fontSize: 15, color: '#333', marginTop: 4 },
  err: { color: '#C62828', fontSize: 13, marginTop: 8 },
  primary: { backgroundColor: '#5C6BC0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  primaryText: { color: 'white', fontWeight: '700', fontSize: 15 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: '#666', fontSize: 14 },
});
