import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { KeyboardSafeView } from './KeyboardSafeView';
import {
  WL_PROMPTS, WL_PROMPT_KEYS, WL_PROMPT_FALLBACK, WlPrompt, WlResult, WlStatus,
  getLockStatus, saveLockHint, verifyLockReset, sendLockEmailCode,
} from '../utils/wellbeingLock';

type T = (k: string) => string;

function errorText(r: WlResult, t: T): string {
  if (r.code === 'locked') return (t('wl_locked') || 'Too many wrong answers. Reset is locked for {n} minutes.').replace('{n}', String(r.retryMinutes || 15));
  if (r.code === 'wrong') return (t('wl_wrong_left') || 'Wrong answer. {n} tries left.').replace('{n}', String(r.attemptsLeft ?? 0));
  if (r.code === 'cooldown') return (t('wl_email_cooldown') || 'Please wait {n} seconds before asking for another code.').replace('{n}', String(r.retrySeconds || 60));
  if (r.code === 'hourly') return (t('wl_email_hourly') || 'Too many codes requested. Try again in {n} minutes.').replace('{n}', String(r.retryMinutes || 60));
  if (r.code === 'send_failed') return t('wl_email_failed') || "We couldn't send the email. Please try again.";
  if (r.code === 'no_email') return t('wl_email_no_address') || 'This account has no email address.';
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
  const [codeMode, setCodeMode] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState('');

  useEffect(() => {
    if (!visible) return;
    setValue(''); setErr(''); setStatus(null); setLoading(true); setCodeMode(false); setMaskedEmail('');
    getLockStatus(scope).then(s => {
      setStatus(s); setLoading(false);
      if (s && s.locked_minutes) setErr((t('wl_locked') || 'Too many wrong answers. Reset is locked for {n} minutes.').replace('{n}', String(s.locked_minutes)));
    });
  }, [visible, scope]);

  const submit = async () => {
    if (!value.trim()) return;
    setBusy(true); setErr('');
    const r = codeMode ? await verifyLockReset(scope, '', '', value.trim())
      : status?.has_hint ? await verifyLockReset(scope, value, '') : await verifyLockReset(scope, '', value);
    setBusy(false);
    if (r.ok) { onVerified(); return; }
    setValue('');
    setErr(errorText(r, t));
  };

  const emailCode = async () => {
    setBusy(true); setErr('');
    const r = await sendLockEmailCode(scope);
    setBusy(false);
    if (r.ok) { setMaskedEmail(r.data?.email_masked || ''); setCodeMode(true); setValue(''); }
    else setErr(errorText(r, t));
  };

  // The emailed code is always offered, so nobody is stuck even with no hint and no password.
  const noWayToReset = false;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardSafeView style={st.overlay}>
        <View style={st.card}>
          <Text style={st.title}>{t('wellbeing_pin_reset') || 'Reset PIN'}</Text>
          {loading || !status ? <ActivityIndicator style={{ marginVertical: 16 }} /> : codeMode ? (
            <>
              <Text style={st.desc}>{(t('wl_email_sent') || 'We sent a 6-digit code to {email}. It is valid for 10 minutes.').replace('{email}', maskedEmail)}</Text>
              <Text style={st.desc}>{t('wl_email_junk') || 'Check your Junk/Spam folder.'}</Text>
              <TextInput style={st.input} value={value} onChangeText={setValue} keyboardType="number-pad"
                placeholder={t('wl_code_placeholder') || '6-digit code'} placeholderTextColor="#999" editable={!busy} maxLength={6} />
            </>
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
          {status ? (
            <TouchableOpacity style={st.secondary} onPress={codeMode ? () => { setCodeMode(false); setValue(''); setErr(''); } : emailCode} disabled={busy}>
              <Text style={st.linkText}>{codeMode ? (t('wl_use_other_way') || 'Use another way') : (t('wl_email_btn') || 'Email me a code')}</Text>
            </TouchableOpacity>
          ) : null}
          {codeMode ? (
            <TouchableOpacity style={st.secondary} onPress={emailCode} disabled={busy}>
              <Text style={st.linkText}>{t('wl_email_resend') || 'Send a new code'}</Text>
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
  linkText: { color: '#5C6BC0', fontSize: 14, fontWeight: '600' },
});
