// Real security feature Nov 4 (build 22): ONE lock screen shared by the parent "My Wellbeing"
// screen and the teacher check-in screen. Both previously carried their own near-identical copy
// of a numpad + PIN flow, and both had the same three holes:
//
//   1. the 4-digit PIN was written to this device's AsyncStorage in PLAIN TEXT;
//   2. "Forgot PIN?" deleted it with no identity check at all, so anyone holding the unlocked
//      phone could clear it, set their own, and read every private entry;
//   3. nothing anywhere counted a wrong attempt.
//
// The PIN hash, a recovery hint (one of three fixed prompts + a salted hash of a ONE-WORD
// answer) and the attempt counters now live server-side - see backend/server.py's
// /wellbeing-lock/* endpoints and scripts/wellbeing-lock/01_wellbeing_locks.sql. The plain PIN
// and the plain answer are sent to be checked and are never stored on the device, never read
// back from the server, and never logged.
//
// Deliberate fallback: until that migration is run the API reports storage:'unavailable' and
// this component drops back to exactly the old device-local behaviour. A missing migration must
// not shut anyone out of their own wellbeing data, so the new protection simply doesn't engage
// until the table exists.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { SecureField } from './SecureField';
import { useAndroidKeyboardOffset } from '../utils/useAndroidKeyboardOffset';
import {
  wellbeingLockApi, parseWellbeingLockError, WellbeingLockState, WellbeingHintPrompt,
} from '../utils/api';

export const WELLBEING_HINT_PROMPTS: WellbeingHintPrompt[] = ['pet', 'hobby', 'place'];

// The three prompts, in the order the brief fixed them. Keys only - the text is translated.
const PROMPT_KEYS: Record<WellbeingHintPrompt, { key: string; fallback: string }> = {
  pet: { key: 'wb_hint_q_pet', fallback: 'Name of your pet' },
  hobby: { key: 'wb_hint_q_hobby', fallback: 'Your favourite hobby' },
  place: { key: 'wb_hint_q_place', fallback: 'A place you want to visit' },
};

type Step =
  | 'loading'
  | 'enter'     // a server-side lock exists: type the PIN
  | 'setup'     // no lock yet: choose a PIN
  | 'confirm'   // ...and type it again
  | 'hint'      // ...and pick a recovery question (required, item 1)
  | 'migrate'   // a device-local PIN from before this feature: prove it, then add a hint
  | 'addhint'   // unlocked, but this lock has no hint yet (item 3)
  | 'reset';    // forgot the PIN: prove identity, then set a new one (item 2)

interface Props {
  /** 'teacher' | `family:${familyMemberId}` */
  scope: string;
  title: string;
  /** Shown above the title - the family member's name on the parent screen. */
  subtitle?: string;
  description?: string;
  onUnlocked: () => void;
  onBack: () => void;
  t: (key: string) => string;
}

export function WellbeingLock({ scope, title, subtitle, description, onUnlocked, onBack, t }: Props) {
  // The AsyncStorage keys this feature replaces. Still read (never newly written in server
  // mode) so an existing user is recognised and migrated instead of being offered a fresh
  // "create a PIN" screen that would hand their old entries to whoever is holding the phone.
  const [LEGACY_PIN_KEY, LEGACY_HINT_KEY] = useMemo(() => {
    const member = scope.replace('family:', '');
    return [scope === 'teacher' ? 'teacher_checkin_pin' : `wellbeing_pin_${member}`, `wellbeing_hint_${member}`];
  }, [scope]);

  const [step, setStep] = useState<Step>('loading');
  const [mode, setMode] = useState<'server' | 'legacy-local'>('server');
  const [state, setState] = useState<WellbeingLockState | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [chosenPrompt, setChosenPrompt] = useState<WellbeingHintPrompt | null>(null);
  const [answer, setAnswer] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [lockedSeconds, setLockedSeconds] = useState(0);
  // Legacy-local mode only: the free-text hint the old screen stored in plain text.
  const [legacyHint, setLegacyHint] = useState('');
  const androidKeyboardOffset = useAndroidKeyboardOffset();
  // The PIN proved in 'migrate'/'addhint', needed as current_pin on the follow-up call. Held in
  // a ref for the few seconds that flow lasts and never persisted anywhere.
  const provenPin = useRef('');

  const fmt = useCallback(
    (key: string, fallback: string, count: number) => (t(key) || fallback).replace('{count}', String(count)),
    [t],
  );

  // ---- lockout countdown ---------------------------------------------------
  const isLocked = lockedSeconds > 0;
  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => setLockedSeconds(s => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  const applyError = useCallback((e: any) => {
    const { key, count } = parseWellbeingLockError(e);
    switch (key) {
      case 'wellbeing_locked':
        setLockedSeconds(count);
        setError(fmt('wb_locked_msg', 'Too many tries. For your security this is locked for {count} more minutes.', Math.max(1, Math.ceil(count / 60))));
        break;
      case 'wellbeing_wrong_pin':
        setError(fmt('wb_wrong_pin_left', 'Incorrect PIN. {count} tries left.', count));
        break;
      case 'wellbeing_wrong_answer':
        setError(fmt('wb_wrong_answer_left', "That's not the right answer. {count} tries left.", count));
        break;
      case 'wellbeing_wrong_account_password':
        setError(fmt('wb_wrong_account_password_left', 'Incorrect account password. {count} tries left.', count));
        break;
      case 'wellbeing_needs_account_password':
        setError(t('wb_needs_account_password') || 'This PIN has no recovery question yet, and your account has no password to fall back on. Set an account password in Settings, then come back here.');
        break;
      case 'wellbeing_hint_answer_invalid':
        setError(t('wb_answer_one_word') || 'Please answer with a single word.');
        break;
      case 'wellbeing_hint_prompt_invalid':
        setError(t('wb_choose_question') || 'Choose a question first.');
        break;
      case 'wellbeing_pin_format':
        setError(t('wb_pin_4_digits') || 'Your PIN must be 4 digits.');
        break;
      case 'wellbeing_storage_unavailable':
      case 'wellbeing_no_lock':
        setError(t('wb_server_unreachable') || "Couldn't reach the server. Check your connection and try again.");
        break;
      default:
        setError(e?.message || t('error') || 'Something went wrong');
    }
  }, [t, fmt]);

  // ---- initial load --------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const localPin = await AsyncStorage.getItem(LEGACY_PIN_KEY).catch(() => null);
      let s: WellbeingLockState | null = null;
      try {
        s = await wellbeingLockApi.getState(scope);
      } catch {
        // Offline or the endpoint isn't deployed: behave exactly as the app did before this
        // feature rather than blocking the screen.
        if (cancelled) return;
        setMode('legacy-local');
        setLegacyHint((await AsyncStorage.getItem(LEGACY_HINT_KEY).catch(() => null)) || '');
        setStep(localPin ? 'enter' : 'setup');
        return;
      }
      if (cancelled) return;
      setState(s);
      if (s.storage === 'unavailable') {
        setMode('legacy-local');
        setLegacyHint((await AsyncStorage.getItem(LEGACY_HINT_KEY).catch(() => null)) || '');
        setStep(localPin ? 'enter' : 'setup');
        return;
      }
      setMode('server');
      if (s.locked_seconds > 0) setLockedSeconds(s.locked_seconds);
      if (s.configured) { setStep('enter'); return; }
      // No server lock. A PIN sitting in AsyncStorage means this person set one before this
      // feature shipped: ask for it, then move the lock to the server with a hint (item 3).
      setStep(localPin ? 'migrate' : 'setup');
    })();
    return () => { cancelled = true; };
  }, [scope, LEGACY_PIN_KEY, LEGACY_HINT_KEY]);

  // ---- numpad --------------------------------------------------------------
  const target = step === 'confirm' ? pinConfirm : pinInput;
  const setTarget = step === 'confirm' ? setPinConfirm : setPinInput;

  const onDigit = (d: string) => {
    if (busy || lockedSeconds > 0) return;
    setError('');
    const next = target + d;
    if (next.length > 4) return;
    setTarget(next);
    if (next.length === 4) setTimeout(() => submitPin(next), 60);
  };

  const onDelete = () => { setError(''); setTarget(target.slice(0, -1)); };

  const submitPin = async (pin: string) => {
    if (step === 'setup') { setPinConfirm(''); setStep('confirm'); return; }

    if (step === 'confirm') {
      if (pin !== pinInput) {
        setError(t('wellbeing_pin_mismatch') || 'PINs do not match. Try again.');
        setPinInput(''); setPinConfirm(''); setStep('setup');
        return;
      }
      if (mode === 'legacy-local') {
        // Pre-migration behaviour, unchanged.
        await AsyncStorage.setItem(LEGACY_PIN_KEY, pinInput);
        if (legacyHint.trim()) await AsyncStorage.setItem(LEGACY_HINT_KEY, legacyHint.trim());
        onUnlocked();
        return;
      }
      // Item 1: a hint is part of setting a PIN, not an optional extra afterwards.
      setStep('hint');
      return;
    }

    if (step === 'enter') {
      if (mode === 'legacy-local') {
        const stored = await AsyncStorage.getItem(LEGACY_PIN_KEY);
        if (pin === stored) { onUnlocked(); return; }
        setError(t('wellbeing_pin_wrong') || 'Incorrect PIN.');
        setPinInput('');
        return;
      }
      setBusy(true);
      try {
        const res = await wellbeingLockApi.verify(scope, pin);
        // Item 3: a lock with no hint can't be reset by hint, so ask for one the moment we
        // have a proven PIN in hand rather than leaving the account stuck on the password path.
        if (res.needs_hint) {
          provenPin.current = pin;
          setChosenPrompt(null); setAnswer(''); setPinInput('');
          setStep('addhint');
        } else {
          onUnlocked();
        }
      } catch (e) {
        applyError(e);
        setPinInput('');
      } finally { setBusy(false); }
      return;
    }

    if (step === 'migrate') {
      // Verify against the device's old plain-text PIN - that is the only copy that exists
      // for this account until it reaches the server a moment from now.
      const stored = await AsyncStorage.getItem(LEGACY_PIN_KEY);
      if (pin !== stored) {
        setError(t('wellbeing_pin_wrong') || 'Incorrect PIN.');
        setPinInput('');
        return;
      }
      // Move it to the server now, before asking anything else: that is what closes the
      // reinstall hole, and it must not depend on them accepting the hint prompt below.
      setBusy(true);
      try {
        await wellbeingLockApi.migrate(scope, pin);
        await AsyncStorage.removeItem(LEGACY_PIN_KEY).catch(() => {});
        await AsyncStorage.removeItem(LEGACY_HINT_KEY).catch(() => {});
        provenPin.current = pin;
        setPinInput('');
        setChosenPrompt(null); setAnswer('');
        setStep('addhint');
      } catch (e) {
        applyError(e);
        setPinInput('');
      } finally { setBusy(false); }
      return;
    }
  };

  // ---- hint / reset submits ------------------------------------------------
  const saveHintAndFinish = async () => {
    if (!chosenPrompt) { setError(t('wb_choose_question') || 'Choose a question first.'); return; }
    if (!answer.trim() || /\s/.test(answer.trim())) {
      setError(t('wb_answer_one_word') || 'Please answer with a single word.');
      return;
    }
    setBusy(true); setError('');
    try {
      if (step === 'addhint') {
        await wellbeingLockApi.addHint(scope, { current_pin: provenPin.current, hint_prompt: chosenPrompt, hint_answer: answer.trim() });
      } else {
        // 'hint' is reached only from first-ever setup now - a migrating lock goes through
        // /migrate then 'addhint', so that someone who declines the question still gets in.
        await wellbeingLockApi.set(scope, {
          pin: pinInput,
          hint_prompt: chosenPrompt,
          hint_answer: answer.trim(),
        });
        // The device's plain-text copies are what this feature exists to remove.
        await AsyncStorage.removeItem(LEGACY_PIN_KEY).catch(() => {});
        await AsyncStorage.removeItem(LEGACY_HINT_KEY).catch(() => {});
      }
      provenPin.current = '';
      onUnlocked();
    } catch (e) { applyError(e); } finally { setBusy(false); }
  };

  const submitReset = async () => {
    if (!/^\d{4}$/.test(pinInput)) { setError(t('wb_pin_4_digits') || 'Your PIN must be 4 digits.'); return; }
    const byAnswer = !state?.needs_hint;
    if (byAnswer && !answer.trim()) { setError(t('wb_answer_one_word') || 'Please answer with a single word.'); return; }
    if (!byAnswer && !accountPassword) { setError(t('wb_enter_account_password') || 'Enter your account password.'); return; }
    setBusy(true); setError('');
    try {
      await wellbeingLockApi.reset(scope, byAnswer
        ? { new_pin: pinInput, hint_answer: answer.trim() }
        // Coming through the account-password bridge: carry a new hint along so this account
        // stops being hintless (optional server-side - a rejected answer must never be the
        // thing that blocks someone's only route back in).
        : {
            new_pin: pinInput,
            account_password: accountPassword,
            ...(chosenPrompt && answer.trim() && !/\s/.test(answer.trim())
              ? { hint_prompt: chosenPrompt, hint_answer_new: answer.trim() }
              : {}),
          });
      await AsyncStorage.removeItem(LEGACY_PIN_KEY).catch(() => {});
      await AsyncStorage.removeItem(LEGACY_HINT_KEY).catch(() => {});
      onUnlocked();
    } catch (e) { applyError(e); } finally { setBusy(false); }
  };

  // ---- legacy-local reset (pre-migration behaviour, unchanged) -------------
  const legacyReset = async () => {
    await AsyncStorage.removeItem(LEGACY_PIN_KEY);
    await AsyncStorage.removeItem(LEGACY_HINT_KEY);
    setLegacyHint(''); setPinInput(''); setPinConfirm(''); setError('');
    setStep('setup');
  };

  // ---- render --------------------------------------------------------------
  const heading =
    step === 'setup' ? (t('wellbeing_pin_setup') || 'Create your private PIN')
    : step === 'confirm' ? (t('wellbeing_pin_confirm') || 'Confirm PIN')
    : step === 'migrate' ? (t('wb_enter_current_pin') || 'Enter your current PIN')
    : step === 'hint' || step === 'addhint' ? (t('wb_choose_hint_title') || 'Choose a recovery question')
    : step === 'reset' ? (t('wb_forgot_title') || 'Forgot your PIN?')
    : (t('wellbeing_pin_enter') || 'Enter your PIN');

  const showNumpad = step === 'enter' || step === 'setup' || step === 'confirm' || step === 'migrate';

  if (step === 'loading') {
    return (
      <SafeAreaView style={st.screen}>
        <View style={st.center}><ActivityIndicator size="large" color="#5C6BC0" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.screen}>
      <TouchableOpacity style={st.back} onPress={onBack} accessibilityRole="button">
        <MaterialIcons name="arrow-back" size={24} color="#333" />
      </TouchableOpacity>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          contentContainerStyle={[st.body, Platform.OS === 'android' && { paddingBottom: 24 + androidKeyboardOffset }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={st.icon}>🔒</Text>
          {!!subtitle && <Text style={st.subtitle}>{subtitle}</Text>}
          <Text style={st.title}>{title}</Text>
          <Text style={st.heading}>{heading}</Text>
          {step === 'setup' && !!description && <Text style={st.desc}>{description}</Text>}

          {step === 'addhint' && (
            <Text style={st.desc}>
              {t('wb_add_hint_msg') || 'Your PIN has no recovery question yet. Add one now so you can reset your PIN if you ever forget it.'}
            </Text>
          )}

          {step === 'reset' && (
            <Text style={st.desc}>
              {state?.needs_hint
                ? (t('wb_forgot_password_intro') || 'This PIN was set before recovery questions existed, so enter your account password to set a new one.')
                : (t('wb_forgot_answer_intro') || 'Answer your recovery question to set a new PIN.')}
            </Text>
          )}

          {/* PIN dots + numpad */}
          {showNumpad && (
            <>
              <View style={st.dots}>
                {[0, 1, 2, 3].map(i => (
                  <View key={i} style={[st.dot, target.length > i && st.dotFilled]} />
                ))}
              </View>
              {/* Legacy-local mode only: the old free-text hint field, kept so behaviour before
                  the migration is byte-for-byte what it was. */}
              {mode === 'legacy-local' && step === 'setup' && (
                <SecureField
                  variant="password"
                  containerStyle={st.field}
                  placeholder={t('wellbeing_pin_hint_label') || 'PIN hint (optional)'}
                  placeholderTextColor="#AAA"
                  value={legacyHint}
                  onChangeText={setLegacyHint}
                />
              )}
              <View style={st.numpad}>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[st.key, !d && { opacity: 0 }]}
                    disabled={!d || busy || lockedSeconds > 0}
                    onPress={() => (d === '⌫' ? onDelete() : d && onDigit(d))}
                  >
                    <Text style={st.keyTxt}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Recovery question picker - setup, add-hint, and the answer side of a reset */}
          {(step === 'hint' || step === 'addhint' || (step === 'reset' && !state?.needs_hint)) && (
            <>
              {step !== 'reset' && (
                <>
                  <Text style={st.desc}>
                    {t('wb_hint_intro') || "Pick one question and answer it in a single word. You'll need that word if you ever forget your PIN."}
                  </Text>
                  {WELLBEING_HINT_PROMPTS.map(p => (
                    <TouchableOpacity
                      key={p}
                      style={[st.option, chosenPrompt === p && st.optionOn]}
                      onPress={() => { setChosenPrompt(p); setError(''); }}
                    >
                      <MaterialIcons
                        name={chosenPrompt === p ? 'radio-button-checked' : 'radio-button-unchecked'}
                        size={20}
                        color={chosenPrompt === p ? '#5C6BC0' : '#AAA'}
                      />
                      <Text style={[st.optionTxt, chosenPrompt === p && st.optionTxtOn]}>
                        {t(PROMPT_KEYS[p].key) || PROMPT_KEYS[p].fallback}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
              {step === 'reset' && !!state?.hint_prompt && (
                <Text style={st.question}>
                  {t(PROMPT_KEYS[state.hint_prompt].key) || PROMPT_KEYS[state.hint_prompt].fallback}
                </Text>
              )}
              <SecureField
                variant="password"
                containerStyle={st.field}
                placeholder={t('wb_answer_ph') || 'One word'}
                placeholderTextColor="#AAA"
                value={answer}
                onChangeText={v => { setAnswer(v); setError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          )}

          {/* Account-password bridge (item 3) */}
          {step === 'reset' && state?.needs_hint && (
            <>
              {state.can_use_account_password ? (
                <SecureField
                  variant="password"
                  containerStyle={st.field}
                  placeholder={t('wb_account_password_ph') || 'Account password'}
                  placeholderTextColor="#AAA"
                  value={accountPassword}
                  onChangeText={v => { setAccountPassword(v); setError(''); }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              ) : (
                <Text style={st.warn}>
                  {t('wb_needs_account_password') || 'This PIN has no recovery question yet, and your account has no password to fall back on. Set an account password in Settings, then come back here.'}
                </Text>
              )}
            </>
          )}

          {/* New PIN for a reset - typed, not tapped, since the numpad is not shown here */}
          {step === 'reset' && (state?.can_use_account_password || !state?.needs_hint) && (
            <SecureField
              variant="code"
              containerStyle={st.field}
              placeholder={t('wb_new_pin') || 'New 4-digit PIN'}
              placeholderTextColor="#AAA"
              value={pinInput}
              onChangeText={v => { setPinInput(v.replace(/\D/g, '').slice(0, 4)); setError(''); }}
              keyboardType="number-pad"
              maxLength={4}
            />
          )}

          {!!error && <Text style={st.error}>{error}</Text>}
          {lockedSeconds > 0 && (
            <Text style={st.error}>
              {fmt('wb_locked_msg', 'Too many tries. For your security this is locked for {count} more minutes.', Math.max(1, Math.ceil(lockedSeconds / 60)))}
            </Text>
          )}

          {/* Primary action for the typed steps */}
          {(step === 'hint' || step === 'addhint') && (
            <TouchableOpacity
              style={[st.primary, busy && { opacity: 0.6 }]}
              disabled={busy}
              onPress={saveHintAndFinish}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryTxt}>{t('save') || 'Save'}</Text>}
            </TouchableOpacity>
          )}
          {step === 'reset' && (state?.can_use_account_password || !state?.needs_hint) && (
            <TouchableOpacity
              style={[st.primary, (busy || lockedSeconds > 0) && { opacity: 0.6 }]}
              disabled={busy || lockedSeconds > 0}
              onPress={submitReset}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={st.primaryTxt}>{t('wellbeing_pin_reset') || 'Reset PIN'}</Text>}
            </TouchableOpacity>
          )}

          {/* "Forgot PIN?" - server mode routes to the proof screen; legacy-local keeps the
              old unverified delete so pre-migration behaviour is unchanged. */}
          {step === 'enter' && (
            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => {
                setError(''); setAnswer(''); setAccountPassword(''); setPinInput(''); setChosenPrompt(null);
                if (mode === 'legacy-local') legacyReset();
                else setStep('reset');
              }}
            >
              <Text style={st.link}>{t('wellbeing_pin_forgot') || 'Forgot PIN?'}</Text>
            </TouchableOpacity>
          )}
          {mode === 'legacy-local' && step === 'enter' && !!legacyHint && (
            <Text style={st.desc}>{`${t('wellbeing_pin_hint_show') || 'Your hint:'} ${legacyHint}`}</Text>
          )}

          {step === 'addhint' && (
            <TouchableOpacity
              style={st.linkBtn}
              disabled={busy}
              onPress={() => {
                // Item 3: the hint prompt is a prompt, not a toll gate. This person has
                // already proved the PIN, so declining lets them straight in - their reset
                // path simply stays on the account-password bridge until they add one.
                provenPin.current = '';
                onUnlocked();
              }}
            >
              <Text style={st.link}>{t('not_now') || 'Not Now'}</Text>
            </TouchableOpacity>
          )}
          {step === 'reset' && (
            <TouchableOpacity
              style={st.linkBtn}
              onPress={() => {
                setError(''); setAnswer(''); setAccountPassword(''); setPinInput(''); setChosenPrompt(null);
                setStep('enter');
              }}
            >
              <Text style={st.link}>{t('cancel') || 'Cancel'}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'white' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { padding: 16 },
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 24, width: '100%', maxWidth: 480, alignSelf: 'center' },
  icon: { fontSize: 40, marginBottom: 8 },
  subtitle: { fontSize: 16, fontWeight: '600', color: '#5C6BC0', marginBottom: 2 },
  title: { fontSize: 20, fontWeight: '700', color: '#333', marginBottom: 4, textAlign: 'center' },
  heading: { fontSize: 14, color: '#666', marginBottom: 16, textAlign: 'center' },
  desc: { fontSize: 13, color: '#777', marginBottom: 14, textAlign: 'center', lineHeight: 18 },
  question: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 10, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#5C6BC0', backgroundColor: 'transparent' },
  dotFilled: { backgroundColor: '#5C6BC0' },
  numpad: { flexDirection: 'row', flexWrap: 'wrap', width: 240, gap: 8, justifyContent: 'center' },
  key: { width: 72, height: 56, borderRadius: 12, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center' },
  keyTxt: { fontSize: 22, fontWeight: '600', color: '#333' },
  field: { width: '100%', marginBottom: 12 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', marginBottom: 8 },
  optionOn: { borderColor: '#5C6BC0', backgroundColor: '#F3F4FF' },
  optionTxt: { fontSize: 14, color: '#555', flex: 1 },
  optionTxtOn: { color: '#333', fontWeight: '600' },
  primary: { backgroundColor: '#5C6BC0', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 32, width: '100%', alignItems: 'center', marginTop: 4 },
  primaryTxt: { color: 'white', fontSize: 15, fontWeight: '700' },
  linkBtn: { marginTop: 20 },
  link: { color: '#5C6BC0', fontSize: 14 },
  error: { color: '#D32F2F', fontSize: 13, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  warn: { color: '#E65100', fontSize: 13, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
});
