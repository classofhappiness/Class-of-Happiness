import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

export default function SignupScreen() {
  const router = useRouter();
  const { signupWithEmail, t } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'teacher' | 'parent' | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignup = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setError(t('enter_name_error') || 'Please enter your name');
      return;
    }
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError(t('invalid_email_error') || 'Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      setError(t('password_too_short_error') || 'Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError(t('passwords_no_match_error') || 'Passwords do not match');
      return;
    }
    if (!role) {
      setError(t('choose_role_error') || 'Please choose whether you\'re a Teacher or Parent');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await signupWithEmail(trimmedEmail, password, trimmedName, role);
      router.replace(role === 'teacher' ? '/teacher/dashboard' : '/parent/dashboard');
    } catch (e) {
      setError(e instanceof Error ? e.message : (t('signup_generic_error') || 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
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
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/logo_coh.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title} allowFontScaling={false}>Class of Happiness</Text>
            <Text style={styles.subtitle}>{t('signup_subtitle') || 'Create your account'}</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>{t('i_am_a') || 'I am a...'}</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[styles.roleButton, role === 'teacher' && styles.roleButtonActive]}
                onPress={() => setRole('teacher')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="school" size={22} color={role === 'teacher' ? 'white' : '#5C6BC0'} />
                <Text style={[styles.roleButtonText, role === 'teacher' && styles.roleButtonTextActive]}>{t('teacher') || 'Teacher'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.roleButton, role === 'parent' && styles.roleButtonActive]}
                onPress={() => setRole('parent')}
                activeOpacity={0.8}
              >
                <MaterialIcons name="family-restroom" size={22} color={role === 'parent' ? 'white' : '#5C6BC0'} />
                <Text style={[styles.roleButtonText, role === 'parent' && styles.roleButtonTextActive]}>{t('parent') || 'Parent / Family'}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('your_name_label') || 'Your Name'}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('name_placeholder') || 'Jane Smith'}
              placeholderTextColor="#BBB"
              value={name}
              onChangeText={setName}
              autoCorrect={false}
              returnKeyType="next"
            />

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
              returnKeyType="next"
            />

            <Text style={styles.label}>{t('password') || 'Password'}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('password_min_chars_placeholder') || 'At least 8 characters'}
              placeholderTextColor="#BBB"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
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
              onSubmitEditing={handleSignup}
              returnKeyType="go"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleSignup}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <MaterialIcons name="person-add" size={20} color="white" />
                  <Text style={styles.buttonText}>{t('create_account_btn') || 'Create Account'}</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity onPress={() => router.replace('/auth/login')}>
              <Text style={styles.loginLink}>{t('already_have_account_signin') || 'Already have an account? Sign In'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  inner: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 24, justifyContent: 'center', paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 90, height: 90, marginBottom: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#888' },
  form: {
    backgroundColor: 'white', borderRadius: 20, padding: 24,
    elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, marginBottom: 20,
  },
  label: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  roleButton: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 2, borderColor: '#5C6BC0', borderRadius: 12, paddingVertical: 12,
  },
  roleButtonActive: { backgroundColor: '#5C6BC0' },
  roleButtonText: { color: '#5C6BC0', fontSize: 14, fontWeight: '600' },
  roleButtonTextActive: { color: 'white' },
  input: {
    borderWidth: 2, borderColor: '#E0E0E0', borderRadius: 12,
    padding: 14, fontSize: 16, color: '#333', marginBottom: 12,
  },
  error: { color: '#E53935', fontSize: 13, marginBottom: 8 },
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
  loginLink: { color: '#5C6BC0', fontSize: 13, marginTop: 16, textAlign: 'center', fontWeight: '600' },
});
