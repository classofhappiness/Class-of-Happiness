import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView, Platform, Image, ScrollView
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, t } = useApp();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(trimmed);
      router.replace('/');
    } catch (e) {
      setError('Sign in failed. Please try again.');
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
          {/* ✅ Logo instead of rainbow emoji */}
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/logo_coh.png')}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.title} allowFontScaling={false}>Class of Happiness</Text>
            <Text style={styles.subtitle}>Enter your email to sign in</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>Email Address</Text>
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
                  <Text style={styles.buttonText}>Sign In</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.hint}>
              New users are created automatically.{'\n'}No password needed!
            </Text>
          </View>

          <View style={styles.trialBox}>
            <Text style={styles.trialTitle}>🎫 Have a trial code?</Text>
            <Text style={styles.trialText}>Sign in first, then enter your code in Settings.</Text>
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
  button: {
    backgroundColor: '#5C6BC0', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: 'white', fontSize: 17, fontWeight: 'bold' },
  hint: { fontSize: 12, color: '#AAA', textAlign: 'center', marginTop: 16, lineHeight: 18 },
  trialBox: { backgroundColor: '#EEF2FF', borderRadius: 14, padding: 16, alignItems: 'center' },
  trialTitle: { fontSize: 15, fontWeight: '600', color: '#5C6BC0', marginBottom: 4 },
  trialText: { fontSize: 13, color: '#666', textAlign: 'center' },
});
