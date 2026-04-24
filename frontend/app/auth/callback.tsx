import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useGlobalSearchParams } from 'expo-router';
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
  const [status, setStatus] = useState<string>('Checking authentication...');
  const localParams = useLocalSearchParams();
  const globalParams = useGlobalSearchParams();

  useEffect(() => {
    handleCallback();
  }, []);

  const handleCallback = async () => {
    try {
      let sessionId: string | null = null;

      console.log('[Callback] Platform:', Platform.OS);
      console.log('[Callback] Local params:', JSON.stringify(localParams));
      console.log('[Callback] Global params:', JSON.stringify(globalParams));

      // Method 1: Check route params (both local and global)
      if (localParams.session_id) {
        sessionId = localParams.session_id as string;
        console.log('[Callback] Got session_id from local params');
      } else if (globalParams.session_id) {
        sessionId = globalParams.session_id as string;
        console.log('[Callback] Got session_id from global params');
      }

      // Method 2: For web, check window.location
      if (!sessionId && Platform.OS === 'web' && typeof window !== 'undefined') {
        setStatus('Checking web URL...');
        
        // Check hash first (auth often returns in hash)
        const hash = window.location.hash;
        if (hash) {
          const hashParams = new URLSearchParams(hash.replace('#', ''));
          sessionId = hashParams.get('session_id');
          if (sessionId) console.log('[Callback] Got session_id from hash');
        }
        
        // Check query params
        if (!sessionId) {
          const queryParams = new URLSearchParams(window.location.search);
          sessionId = queryParams.get('session_id');
          if (sessionId) console.log('[Callback] Got session_id from query');
        }

        // Check full URL with regex
        if (!sessionId) {
          const fullUrl = window.location.href;
          const match = fullUrl.match(/session_id[=]([^&\s#]+)/);
          if (match) {
            sessionId = match[1];
            console.log('[Callback] Got session_id from URL regex');
          }
        }
      }

      // Method 3: For mobile, get from Linking
      if (!sessionId && Platform.OS !== 'web') {
        setStatus('Checking mobile deep link...');
        
        // Get initial URL that opened the app
        const initialUrl = await ExpoLinking.getInitialURL();
        console.log('[Callback] Initial URL:', initialUrl);
        
        if (initialUrl) {
          // Parse the URL
          const parsed = ExpoLinking.parse(initialUrl);
          console.log('[Callback] Parsed URL:', JSON.stringify(parsed));
          
          // Check queryParams
          if (parsed.queryParams?.session_id) {
            sessionId = parsed.queryParams.session_id as string;
            console.log('[Callback] Got session_id from parsed queryParams');
          }
          
          // Check path for session_id
          if (!sessionId && parsed.path) {
            const pathMatch = parsed.path.match(/session_id[=]([^&\s#/]+)/);
            if (pathMatch) {
              sessionId = pathMatch[1];
              console.log('[Callback] Got session_id from path');
            }
          }
          
          // Regex fallback on full URL
          if (!sessionId) {
            const match = initialUrl.match(/session_id[=]([^&\s#]+)/);
            if (match) {
              sessionId = match[1];
              console.log('[Callback] Got session_id from URL regex');
            }
          }
        }

        // Also try getCurrentURL as fallback
        if (!sessionId) {
          try {
            const currentUrl = await ExpoLinking.parseInitialURLAsync();
            console.log('[Callback] Current URL async:', JSON.stringify(currentUrl));
            if (currentUrl.queryParams?.session_id) {
              sessionId = currentUrl.queryParams.session_id as string;
              console.log('[Callback] Got session_id from parseInitialURLAsync');
            }
          } catch (e) {
            console.log('[Callback] parseInitialURLAsync error:', e);
          }
        }
      }
      
      if (!sessionId) {
        console.log('[Callback] No session ID found after all methods');
        setError('No session ID found');
        setTimeout(() => router.replace('/'), 3000);
        return;
      }
      
      setStatus('Exchanging session...');
      console.log('[Callback] Exchanging session with ID:', sessionId.substring(0, 8) + '...');
      
      // Exchange session
      const userData: any = await authApi.exchangeSession(sessionId);
      
      // Store session token for mobile auth
      if (userData && userData.session_token) {
        await setSessionToken(userData.session_token);
        console.log('[Callback] Session token stored');
      }
      
      setStatus('Finalizing...');
      
      // Refresh auth state
      await checkAuth();
      
      console.log('[Callback] Auth complete, navigating home');
      
      // Navigate to home
      router.replace('/');
    } catch (err: any) {
      console.error('[Callback] Auth error:', err);
      setError(err.message || 'Authentication failed');
      setTimeout(() => router.replace('/'), 3000);
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
            <Text style={styles.statusText}>{status}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
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
  statusText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
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
