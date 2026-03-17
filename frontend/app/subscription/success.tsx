import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { subscriptionApi } from '../../src/utils/api';

export default function SubscriptionSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session_id } = useLocalSearchParams<{ session_id: string }>();
  const { checkAuth } = useApp();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    if (session_id) {
      verifyPayment();
    }
  }, [session_id]);

  const verifyPayment = async () => {
    try {
      const result = await subscriptionApi.getPaymentStatus(session_id!);
      if (result.status === 'paid') {
        setStatus('success');
        setPlan(result.plan || null);
        await checkAuth();
      } else {
        setStatus('error');
      }
    } catch (error) {
      console.error('Error verifying payment:', error);
      setStatus('error');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color="#5C6BC0" />
            <Text style={styles.loadingText}>Verifying your payment...</Text>
          </>
        )}

        {status === 'success' && (
          <>
            <View style={styles.successIcon}>
              <MaterialIcons name="check-circle" size={80} color="#4CAF50" />
            </View>
            <Text style={styles.successTitle}>Payment Successful!</Text>
            <Text style={styles.successDesc}>
              Your {plan || ''} subscription is now active. Enjoy all premium features!
            </Text>
            <TouchableOpacity
              style={styles.continueButton}
              onPress={() => router.replace('/teacher/dashboard')}
            >
              <Text style={styles.continueButtonText}>Continue to Dashboard</Text>
            </TouchableOpacity>
          </>
        )}

        {status === 'error' && (
          <>
            <View style={styles.errorIcon}>
              <MaterialIcons name="error" size={80} color="#F44336" />
            </View>
            <Text style={styles.errorTitle}>Payment Issue</Text>
            <Text style={styles.errorDesc}>
              We couldn't verify your payment. Please contact support if you were charged.
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={() => router.replace('/subscription')}
            >
              <Text style={styles.retryButtonText}>Try Again</Text>
            </TouchableOpacity>
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
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },
  successIcon: {
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  successDesc: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  continueButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  continueButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  errorIcon: {
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  errorDesc: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  retryButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});
