import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';

// Real product fix Sep 12: registration email verification. app/_layout.tsx redirects any
// authenticated session with email_verified === false here, on every navigation, until this
// is completed - same shape as set-password-required.tsx's has_password gate, deliberately
// no way to reach the rest of the app first.
//
// Real fix Sep 19 (live device report, researched against documented industry precedent -
// e.g. GitLab added exactly this reactively after support was overwhelmed by "I mistyped my
// email and now I'm stuck" reports): a dead end with no way to correct a mistyped email is a
// known, real failure pattern, not a stylistic nice-to-have. "Not you? Sign out" already
// existed as an escape hatch, but it's a full account sign-out with no clear next step -
// this adds a real back button that explicitly returns to signup (via the same logout()
// this screen's own sign-out link already used, just landing on signup specifically instead
// of wherever a generic sign-out lands) so a mistyped email can actually be corrected, not
// just abandoned into. Resend-code already existed (handleResend below) - only the
// go-back/correct-the-email path was missing.
export default function VerifyEmailRequiredScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verifyEmail, resendVerificationEmail, logout, user, t } = useApp();
  const [goingBack, setGoingBack] = useState(false);

  const handleBackToSignup = async () => {
    setGoingBack(true);
    try {
      await logout();
      router.replace('/auth/signup');
    } catch {
      setGoingBack(false);
    }
  };
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState('');
  const [resent, setResent] = useState(false);

  const handleVerify = async () => {
    if (code.trim().length < 6) {
      setError(t('enter_6_digit_code') || 'Enter the 6-digit code from your email');
      return;
    }
    setError('');
    setResent(false);
    setVerifying(true);
    try {
      await verifyEmail(code.trim());
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : (t('could_not_verify_retry') || 'Could not verify. Please try again.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setResending(true);
    try {
      await resendVerificationEmail();
      setResent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : (t('could_not_resend_retry') || 'Could not resend. Please try again.'));
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={[styles.backButton, { marginTop: insets.top }]} onPress={handleBackToSignup} disabled={goingBack}>
            <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.iconWrap}>
            <MaterialIcons name="mark-email-read" size={48} color="#5C6BC0" />
          </View>
          <Text style={styles.title}>{t('verify_email_title') || 'Verify Your Email'}</Text>
          <Text style={styles.subtitle}>
            {(t('verify_email_subtitle') || 'We sent a 6-digit code to {email}. Enter it below to continue.')
              .replace('{email}', user?.email ? user.email : (t('your_email_address') || 'your email address'))}
          </Text>
          <TouchableOpacity onPress={handleBackToSignup} disabled={goingBack}>
            <Text style={styles.changeEmailLink}>{t('wrong_email_go_back') || 'Wrong email? Go back and fix it'}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>{t('verification_code_label') || 'Verification Code'}</Text>
          <TextInput
            style={styles.input}
            placeholder="123456"
            placeholderTextColor="#BBB"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
            onSubmitEditing={handleVerify}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          {resent ? <Text style={styles.resentText}>{t('new_code_on_way') || 'A new code is on its way.'}</Text> : null}

          <TouchableOpacity
            style={[styles.button, verifying && styles.buttonDisabled]}
            onPress={handleVerify}
            disabled={verifying}
          >
            {verifying ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{t('verify_and_continue') || 'Verify & Continue'}</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.resendLink} onPress={handleResend} disabled={resending}>
            <Text style={styles.resendLinkText}>{resending ? (t('sending_ellipsis') || 'Sending…') : (t('resend_code_link') || "Didn't get a code? Resend")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.logoutLink} onPress={() => logout()}>
            <Text style={styles.logoutLinkText}>{t('not_you_sign_out') || 'Not you? Sign out'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  inner: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: 16, alignItems: 'stretch' },
  backButton: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#1A1A2E',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#1A1A2E', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 12,
    padding: 14, fontSize: 20, letterSpacing: 4, textAlign: 'center', color: '#1A1A2E',
  },
  error: { color: '#E53935', fontSize: 13, marginTop: 8 },
  resentText: { color: '#4CAF50', fontSize: 13, marginTop: 8, textAlign: 'center' },
  changeEmailLink: { color: '#5C6BC0', fontSize: 13, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  resendLink: { marginTop: 16, alignItems: 'center' },
  resendLinkText: { color: '#5C6BC0', fontSize: 13, fontWeight: '600' },
  logoutLink: { marginTop: 20, alignItems: 'center' },
  logoutLinkText: { color: '#888', fontSize: 13 },
});
