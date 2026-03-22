import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import { authApi, setSessionToken } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';

// Required for Expo Go to complete the auth session
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { checkAuth } = useApp();
  const [error, setError] = useState<string | null>(null);
  const params = useLocalSearchParams();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      let sessionId: string | null = null;

      // Try to get session_id from route params first (works for deep links)
      if (params.session_id) {
        sessionId = params.session_id as string;
        console.log('[Callback] Got session_id from params:', sessionId ? 'yes' : 'no');
      }

      // For web, also check window.location
      if (!sessionId && Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        const hashParams = new URLSearchParams(hash.replace('#', ''));
        sessionId = hashParams.get('session_id');
        
        // Also check query params
        if (!sessionId) {
          const queryParams = new URLSearchParams(window.location.search);
          sessionId = queryParams.get('session_id');
        }
        console.log('[Callback] Got session_id from window:', sessionId ? 'yes' : 'no');
      }

      // For mobile, try to get from linking URL
      if (!sessionId && Platform.OS !== 'web') {
        const url = await ExpoLinking.getInitialURL();
        if (url) {
          console.log('[Callback] Initial URL:', url);
          const parsed = ExpoLinking.parse(url);
          sessionId = parsed.queryParams?.session_id as string || null;
          
          // Also try to extract from URL directly
          if (!sessionId) {
            const match = url.match(/session_id[=:]([^&\s#]+)/);
            if (match) {
              sessionId = match[1];
            }
          }
        }
        console.log('[Callback] Got session_id from linking:', sessionId ? 'yes' : 'no');
      }
      
      if (!sessionId) {
        console.log('[Callback] No session ID found');
        setError('No session ID found');
        setTimeout(() => router.replace('/'), 2000);
        return;
      }
      
      console.log('[Callback] Exchanging session...');
      
      // Exchange session
      const userData: any = await authApi.exchangeSession(sessionId);
      
      // Store session token for mobile auth
      if (userData && userData.session_token) {
        await setSessionToken(userData.session_token);
        console.log('[Callback] Session token stored');
      }
      
      // Refresh auth state
      await checkAuth();
      
      console.log('[Callback] Auth complete, navigating home');
      
      // Navigate to home
      router.replace('/');
    } catch (err: any) {
      console.error('[Callback] Auth error:', err);
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
