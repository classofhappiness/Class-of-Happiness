import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { t } = useApp();
  const [step, setStep] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  // CRITICAL security fix Aug 26: the backend used to hand the reset token straight back in
  // this response, which this screen then auto-filled into the token field below - meaning
  // "forgot password" required nothing but knowing the target's email, no identity
  // verification at all. Fixed on the backend to stop returning it; this screen now shows
  // that honest message instead of silently moving to a "reset" step with a token nobody
  // actually has.
  const [requestMessage, setRequestMessage] = useState('');

  const handleRequestReset = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError(t('invalid_email_error') || 'Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      setRequestMessage(data.status || "If this email exists, please contact jono@classofhappiness.com to reset your password for now.");
    } catch (e) {
      setError(t('reset_request_failed') || 'Could not request a reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!token.trim()) {
      setError(t('reset_token_required') || 'Reset token is required');
      return;
    }
    if (newPassword.length < 8) {
      setError(t('password_too_short_error') || 'Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwords_no_match_error') || 'Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || (t('reset_password_failed') || 'Could not reset password. Please try again.'));
        return;
      }
      setSuccess(true);
    } catch (e) {
      setError(t('reset_password_failed') || 'Could not reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
          <Text style={styles.successTitle}>{t('password_reset_success_title') || 'Password Reset!'}</Text>
          <Text style={styles.successText}>{t('password_reset_success_msg') || 'You can now sign in with your new password.'}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth/login')}>
            <Text style={styles.buttonText}>{t('back_to_signin') || 'Back to Sign In'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.inner}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>

          <Text style={styles.title}>{t('reset_password_title') || 'Reset Password'}</Text>

          {step === 'request' ? (
            <>
              <Text style={styles.subtitle}>{t('reset_password_email_prompt') || 'Enter your email to reset your password.'}</Text>
              <Text style={styles.label}>{t('email') || 'Email'}</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#BBB"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
                onSubmitEditing={handleRequestReset}
                returnKeyType="go"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {requestMessage ? <Text style={styles.subtitle}>{requestMessage}</Text> : null}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRequestReset}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{t('continue_btn') || 'Continue'}</Text>}
              </TouchableOpacity>
              {/* Manual recovery path: Jono can verify identity out-of-band (phone/email) and
                  hand a real reset code to a real user - this just lets them enter it. */}
              <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setStep('reset')}>
                <Text style={{ color: '#5C6BC0', fontSize: 13, fontWeight: '600' }}>{t('have_reset_code_link') || 'I already have a reset code'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.subtitle}>{t('enter_new_password_prompt') || 'Enter your new password below.'}</Text>
              <Text style={styles.label}>{t('reset_token_label') || 'Reset Token'}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('reset_token_placeholder') || 'Reset token'}
                placeholderTextColor="#BBB"
                value={token}
                onChangeText={setToken}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>{t('new_password_label') || 'New Password'}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('password_min_chars_placeholder') || 'At least 8 characters'}
                placeholderTextColor="#BBB"
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={styles.label}>{t('confirm_password_label') || 'Confirm Password'}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('confirm_password_placeholder') || 'Re-enter your password'}
                placeholderTextColor="#BBB"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={handleResetPassword}
                returnKeyType="go"
              />
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{t('reset_password_title') || 'Reset Password'}</Text>}
              </TouchableOpacity>
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
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: 16 },
  backButton: { marginBottom: 16, width: 40 },
  title: { fontSize: 24, fontWeight: '900', color: '#1A1A2E', marginBottom: 8, fontFamily: 'Nunito' },
  subtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: 'white', borderRadius: 12, padding: 14, fontSize: 15,
    borderWidth: 1, borderColor: '#E0E0E0', color: '#1A1A2E',
  },
  error: { color: '#E53935', fontSize: 13, marginTop: 8, marginBottom: 8 },
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successTitle: { fontSize: 22, fontWeight: '900', color: '#1A1A2E', marginTop: 16, marginBottom: 8 },
  successText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 24 },
});
