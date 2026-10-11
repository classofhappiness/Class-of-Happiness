import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { SecureField } from '../../src/components/SecureField';

// CRITICAL security fix Aug 26: force-password-on-next-login. Every account without a real
// password could previously be logged into by anyone who typed that email - see
// COH-REVIEW-PLAN.md for the full investigation. app/_layout.tsx redirects any authenticated
// session with has_password === false here, on every navigation, until this is completed -
// deliberately no back button and no way to reach the rest of the app first. Reuses the exact
// same POST /auth/set-password endpoint already proven in settings.tsx's own "Set Password"
// section, just as a hard gate instead of an optional setting.
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function SetPasswordRequiredScreen() {
  const router = useRouter();
  const { checkAuth, logout, user, t } = useApp();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSetPassword = async () => {
    if (password.length < 8) {
      setError(t('password_too_short_error') || 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwords_no_match_error') || 'Passwords do not match');
      return;
    }
    setError('');
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.detail || (t('set_password_retry_error') || 'Could not set password. Please try again.'));
        return;
      }
      // Refresh user state so has_password flips to true and the _layout.tsx gate clears.
      await checkAuth();
      router.replace('/');
    } catch (e) {
      setError(t('set_password_connection_error') || 'Could not set password. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.inner}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.iconWrap}>
            <MaterialIcons name="lock-outline" size={48} color="#5C6BC0" />
          </View>
          <Text style={styles.title}>{t('set_your_password_title') || 'Set Your Password'}</Text>
          <Text style={styles.subtitle}>
            {(t('set_password_required_desc') || 'To keep {account} secure, please create a real password before continuing. This only takes a moment.').replace('{account}', user?.email ? user.email : (t('your_account') || 'your account'))}
          </Text>

          <Text style={styles.label}>{t('new_password_label') || 'New Password'}</Text>
          <SecureField
            placeholder={t('password_min_chars_placeholder') || 'At least 8 characters'}
            placeholderTextColor="#BBB"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          <Text style={styles.label}>{t('confirm_password_label') || 'Confirm Password'}</Text>
          {/* Real fix Aug 26 (item 13): this is the actual screen with the reported double-
              border and oversized-field complaint - New Password was wrapped in inputWrap
              (its own border) AROUND an input that also had its own border, and Confirm
              Password had neither a wrapper nor an eye icon at all, which is what made it
              read as a plain, oversized field next to New Password's icon+border treatment.
              Both also shared one `showPassword` toggle state. SecureField fixes all three
              as one component: single border, independent per-field toggle. */}
          <SecureField
            placeholder={t('reenter_password_placeholder') || 'Re-enter password'}
            placeholderTextColor="#BBB"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSetPassword}
            returnKeyType="go"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.button, saving && styles.buttonDisabled]}
            onPress={handleSetPassword}
            disabled={saving}
          >
            {saving ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{t('set_password_and_continue') || 'Set Password & Continue'}</Text>}
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
  scrollContent: { flexGrow: 1, padding: 24, paddingTop: 48, alignItems: 'stretch' },
  iconWrap: { alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', color: '#1A1A2E', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 6, marginTop: 12 },
  error: { color: '#E53935', fontSize: 13, marginTop: 8 },
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700' },
  logoutLink: { marginTop: 20, alignItems: 'center' },
  logoutLinkText: { color: '#888', fontSize: 13 },
});
