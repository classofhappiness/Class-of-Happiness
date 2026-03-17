import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { authApi } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { checkAuth } = useApp();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      // Get session_id from URL hash
      if (typeof window === 'undefined') return;
      
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.replace('#', ''));
      const sessionId = params.get('session_id');
      
      if (!sessionId) {
        setError('No session ID found');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }
      
      // Exchange session
      await authApi.exchangeSession(sessionId);
      
      // Refresh auth state
      await checkAuth();
      
      // Navigate to home or subscription
      router.replace('/');
    } catch (err: any) {
      console.error('Auth callback error:', err);
      setError(err.message || 'Authentication failed');
      setTimeout(() => router.replace('/'), 2000);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.redirectText}>Redirecting...</Text>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color="#5C6BC0" />
            <Text style={styles.text}>Signing you in...</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  text: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#F44336',
    marginBottom: 10,
  },
  redirectText: {
    fontSize: 14,
    color: '#999',
  },
});
