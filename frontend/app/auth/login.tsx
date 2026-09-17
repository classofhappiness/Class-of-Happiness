import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { SecureField } from '../../src/components/SecureField';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_IDS = {
  ios: '691097467706-b7qooo5be0iu5nlk8krb546ji98ik1k0.apps.googleusercontent.com',
  android: '691097467706-k1s2g9p0ektmpmkj0t3j6l9bl22sg69c.apps.googleusercontent.com',
  default: '691097467706-n2r5n885bqh8qtqrdgnlbvgfd4i2ti5k.apps.googleusercontent.com',
};

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, verifyLoginCode, loginWithGoogle, t } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Real feature Sep 16 (minimal fix: superadmin's own login was actively broken by the
  // missing code-entry step, not a "someday" gap - see AppContext's code_required handling).
  // Kept deliberately minimal: no resend button (tapping Sign In again re-runs the password
  // check and emails a fresh code, reusing existing behaviour rather than adding a new path),
  // no separate screen/route (state on this same screen is enough for "just complete login").
  const [codeStep, setCodeStep] = useState(false);
  const [codeRequiredEmail, setCodeRequiredEmail] = useState('');
  const [code, setCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  const [googleRequest, googleResponse, promptGoogleAsync] = AuthSession.useAuthRequest(
    {
      clientId: Platform.select({ ios: GOOGLE_CLIENT_IDS.ios, android: GOOGLE_CLIENT_IDS.android, default: GOOGLE_CLIENT_IDS.default }),
      scopes: ['openid', 'profile', 'email'],
      redirectUri: (() => {
        const uri = AuthSession.makeRedirectUri();
        console.log('[GoogleAuth] Redirect URI:', uri);
        return uri;
      })(),
      responseType: AuthSession.ResponseType.Token,
    },
    GOOGLE_DISCOVERY
  );

  React.useEffect(() => {
    if (googleResponse?.type === 'success' && googleResponse.authentication?.accessToken) {
      (async () => {
        try {
          await loginWithGoogle(googleResponse.authentication!.accessToken);
          router.replace('/');
        } catch (e) {
          setError(t('google_signin_failed_error') || 'Google sign-in failed. Please try again.');
        }
      })();
    }
  }, [googleResponse]);

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('invalid_email_error') || 'Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Real fix Sep 16 (Group A): the dead PIN field is gone (backend never read admin_pin
      // for any account - confirmed via server.py's /auth/email-login) - '' preserves
      // loginWithEmail's existing positional signature without touching AppContext tonight.
      await loginWithEmail(trimmed, '', 1, password);
      router.replace('/');
    } catch (e) {
      // Real feature Sep 16 (minimal fix): the password check succeeded and a real code was
      // just emailed - this is progress, not a failure, so route to the code-entry step
      // instead of showing an error.
      if ((e as any)?.code_required) {
        setCodeRequiredEmail((e as any).email || trimmed);
        setCodeStep(true);
        setError('');
        return;
      }
      // Real fix Sep 15: loginWithEmail used to swallow every failure internally (its own
      // Alert, no re-throw), so this catch could never actually fire - router.replace('/')
      // above ran unconditionally regardless of whether login succeeded, bouncing the user
      // off the login screen into an unauthenticated home screen on any failure (wrong
      // password, 2FA response the app couldn't handle, etc.) with no persistent visible
      // reason why. Now that loginWithEmail re-throws, this genuinely only runs on failure -
      // the specific reason (e.g. "Incorrect password") is used here too, not just in the
      // transient Alert, so it stays visible on-screen after the Alert is dismissed.
      const message = e instanceof Error ? e.message : (t('signin_failed_error') || 'Sign in failed. Please try again.');
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  // Real feature Sep 16 (minimal fix): second step of the emailed one-time-code flow -
  // completes login the same way handleLogin does on success (router.replace('/')).
  const handleVerifyCode = async () => {
    const trimmedCode = code.trim();
    if (!trimmedCode) {
      setError(t('code_required') || 'Code is required');
      return;
    }
    setError('');
    setVerifyingCode(true);
    try {
      await verifyLoginCode(codeRequiredEmail, trimmedCode);
      router.replace('/');
    } catch (e) {
      const message = e instanceof Error ? e.message : (t('signin_failed_error') || 'Sign in failed. Please try again.');
      setError(message);
    } finally {
      setVerifyingCode(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ✅ Logo instead of rainbow emoji */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/logo_coh.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title} allowFontScaling={false}>Class of Happiness</Text>
            <Text style={styles.subtitle}>{t('login_subtitle') || 'Enter your email to sign in'}</Text>
          </View>

          {codeStep ? (
            // Real feature Sep 16 (minimal fix): second step of the emailed one-time-code
            // flow - only ever reached via a real code_required response from the backend
            // (see AppContext's loginWithEmail), never a client-side guess. Deliberately
            // minimal: no resend button (going back and signing in again re-runs the password
            // check and emails a fresh code, reusing existing behaviour), no separate route.
            <View style={styles.form}>
              <Text style={styles.label}>{t('enter_code_label') || 'Enter the code we emailed you'}</Text>
              <Text style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>{codeRequiredEmail}</Text>
              <TextInput
                style={styles.input}
                placeholder="123456"
                placeholderTextColor="#BBB"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                maxLength={6}
                autoFocus
                onSubmitEditing={handleVerifyCode}
                returnKeyType="go"
              />

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <TouchableOpacity
                style={[styles.button, verifyingCode && styles.buttonDisabled]}
                onPress={handleVerifyCode}
                disabled={verifyingCode}
              >
                {verifyingCode ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialIcons name="lock-open" size={20} color="white" />
                    <Text style={styles.buttonText}>{t('verify_code_btn') || 'Verify Code'}</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { setCodeStep(false); setCode(''); setError(''); }}>
                <Text style={styles.forgotPasswordLink}>{t('back_to_signin') || 'Back to sign in'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.form}>
                <Text style={styles.label}>{t('email_address_label') || 'Email Address'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#BBB"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                  onSubmitEditing={handleLogin}
                  // ✅ Ensures input stays visible above keyboard
                  returnKeyType="go"
                />

                {/* Real fix Sep 16 (Group A): the PIN field is gone entirely - it never
                    enforced anything server-side (confirmed: /auth/email-login never reads
                    admin_pin for any account), and a client-side email-allowlist heuristic
                    for showing it can't be made genuinely role-based (the frontend has no
                    session/role info before login completes). The real, enforced second
                    factor is superadmin's emailed one-time code (server.py's
                    /auth/email-login code-required branch) - driven by that real backend
                    signal (the code_required error from loginWithEmail), not a client-side
                    guess list - see the codeStep block above. */}
                <Text style={styles.label}>{t('password_optional_label') || 'Password (optional)'}</Text>
                <SecureField
                  containerStyle={{ borderWidth: 2, marginBottom: 12 }}
                  placeholder={t('password_optional_placeholder') || "Only if you've set one"}
                  placeholderTextColor="#BBB"
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onSubmitEditing={handleLogin}
                  returnKeyType="go"
                />
                <TouchableOpacity onPress={() => router.push('/auth/forgot-password')}>
                  <Text style={styles.forgotPasswordLink}>{t('forgot_password_link') || 'Forgot password?'}</Text>
                </TouchableOpacity>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <MaterialIcons name="login" size={20} color="white" />
                      <Text style={styles.buttonText}>{t('sign_in_btn') || 'Sign In'}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.googleButton}
                  onPress={() => promptGoogleAsync()}
                  disabled={!googleRequest}
                >
                  <MaterialIcons name="g-translate" size={18} color="#4285F4" />
                  <Text style={styles.googleButtonText}>{t('sign_in_google_btn') || 'Sign in with Google'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => router.push('/auth/signup')}>
                  <Text style={styles.signupLink}>{t('new_here_create_account') || 'New here? Create an account'}</Text>
                </TouchableOpacity>

                <Text style={styles.hint}>
                  {t('login_hint_invite_code') || 'Already have a school invite or class link code?\nSign in first, then enter it in Settings.'}
                </Text>
              </View>

              <View style={styles.trialBox}>
                <Text style={styles.trialTitle}>🎫 {t('have_trial_code') || 'Have a Trial Code?'}</Text>
                <Text style={styles.trialText}>{t('trial_code_signin_hint') || 'Sign in first, then enter your code in Settings.'}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  inner: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center', paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 32 },
  // ✅ Logo replacing emoji
  logo: { width: 110, height: 110, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: 'bold', color: '#333', marginBottom: 6 },
  subtitle: { fontSize: 15, color: '#888' },
  form: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, marginBottom: 20,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  input: {
    borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 12,
    padding: 14, fontSize: 16, color: '#333', marginBottom: 12,
  },
  error: { color: '#E53935', fontSize: 13, marginBottom: 8 },
  forgotPasswordLink: { color: '#5C6BC0', fontSize: 13, marginBottom: 12, textAlign: 'right', fontWeight: '600' },
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
  googleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'white', borderWidth: 1.5, borderColor: '#E0E0E0',
    borderRadius: 14, padding: 14, marginTop: 12,
  },
  googleButtonText: { color: '#333', fontSize: 15, fontWeight: '600' },
  signupLink: { color: '#5C6BC0', fontSize: 14, fontWeight: '600', textAlign: 'center', marginTop: 18 },
  hint: { fontSize: 12, color: '#AAA', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  trialBox: { backgroundColor: '#EEF2FF', borderRadius: 14, padding: 16, alignItems: 'center' },
  trialTitle: { fontSize: 15, fontWeight: '600', color: '#5C6BC0', marginBottom: 4 },
  trialText: { fontSize: 13, color: '#666', textAlign: 'center' },
});
