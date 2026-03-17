import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { subscriptionApi } from '../../src/utils/api';

const PLANS = [
  { 
    id: 'monthly', 
    name: 'Monthly', 
    price: '$4.99', 
    period: '/month',
    savings: '',
    popular: false 
  },
  { 
    id: 'six_month', 
    name: '6 Months', 
    price: '$19.99', 
    period: '/6 months',
    savings: 'Save 33%',
    popular: true 
  },
  { 
    id: 'annual', 
    name: 'Annual', 
    price: '$35.00', 
    period: '/year',
    savings: 'Save 42%',
    popular: false 
  },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, t, checkAuth, isAuthenticated, login } = useApp();
  const [selectedPlan, setSelectedPlan] = useState('six_month');
  const [loading, setLoading] = useState(false);
  const [trialDays, setTrialDays] = useState(7);

  useEffect(() => {
    loadPlans();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await subscriptionApi.getPlans();
      setTrialDays(data.trial_days);
    } catch (error) {
      console.error('Error loading plans:', error);
    }
  };

  const handleStartTrial = async () => {
    if (!isAuthenticated) {
      login();
      return;
    }

    setLoading(true);
    try {
      await subscriptionApi.startTrial();
      await checkAuth();
      Alert.alert('Trial Started!', `You have ${trialDays} days free to explore all features.`, [
        { text: 'OK', onPress: () => router.replace('/teacher/dashboard') }
      ]);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not start trial');
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      login();
      return;
    }

    setLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { url } = await subscriptionApi.createCheckout(selectedPlan, origin);
      
      if (url) {
        // Open checkout in browser
        if (typeof window !== 'undefined') {
          window.location.href = url;
        } else {
          await Linking.openURL(url);
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Could not create checkout');
    } finally {
      setLoading(false);
    }
  };

  const isTrialUsed = user?.trial_started_at !== null && user?.trial_started_at !== undefined;
  const isActive = user?.subscription_status === 'active' || user?.subscription_status === 'trial';

  return (
    <ScrollView 
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>{t('subscription')}</Text>
      </View>

      {/* Current Status */}
      {user && (
        <View style={[
          styles.statusCard,
          { backgroundColor: isActive ? '#E8F5E9' : '#FFF3E0' }
        ]}>
          <MaterialIcons 
            name={isActive ? "check-circle" : "info"} 
            size={24} 
            color={isActive ? '#4CAF50' : '#FF9800'} 
          />
          <Text style={styles.statusText}>
            {user.subscription_status === 'trial' ? `Free Trial Active` :
             user.subscription_status === 'active' ? `${user.subscription_plan} Plan Active` :
             'No Active Subscription'}
          </Text>
        </View>
      )}

      {/* Trial Section */}
      {!isTrialUsed && !isActive && (
        <View style={styles.trialSection}>
          <View style={styles.trialBadge}>
            <MaterialIcons name="card-giftcard" size={20} color="white" />
            <Text style={styles.trialBadgeText}>{trialDays} Days Free</Text>
          </View>
          <Text style={styles.trialTitle}>Start Your Free Trial</Text>
          <Text style={styles.trialDesc}>
            Try all premium features free for {trialDays} days. No credit card required.
          </Text>
          <TouchableOpacity
            style={styles.trialButton}
            onPress={handleStartTrial}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.trialButtonText}>Start Free Trial</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Plans */}
      <Text style={styles.sectionTitle}>Choose a Plan</Text>
      
      {PLANS.map((plan) => (
        <TouchableOpacity
          key={plan.id}
          style={[
            styles.planCard,
            selectedPlan === plan.id && styles.planCardSelected,
            plan.popular && styles.planCardPopular
          ]}
          onPress={() => setSelectedPlan(plan.id)}
        >
          {plan.popular && (
            <View style={styles.popularBadge}>
              <Text style={styles.popularBadgeText}>Most Popular</Text>
            </View>
          )}
          <View style={styles.planHeader}>
            <View style={[
              styles.radio,
              selectedPlan === plan.id && styles.radioSelected
            ]}>
              {selectedPlan === plan.id && <View style={styles.radioInner} />}
            </View>
            <View style={styles.planInfo}>
              <Text style={styles.planName}>{plan.name}</Text>
              {plan.savings && (
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsText}>{plan.savings}</Text>
                </View>
              )}
            </View>
            <View style={styles.planPrice}>
              <Text style={styles.priceAmount}>{plan.price}</Text>
              <Text style={styles.pricePeriod}>{plan.period}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {/* Features */}
      <View style={styles.featuresSection}>
        <Text style={styles.featuresTitle}>What's Included</Text>
        {[
          'Unlimited student profiles',
          'Custom strategies per student',
          'Detailed analytics & reports',
          'Multi-language support',
          'Classroom organization',
          'Priority support'
        ].map((feature, index) => (
          <View key={index} style={styles.featureItem}>
            <MaterialIcons name="check" size={20} color="#4CAF50" />
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {/* Subscribe Button */}
      {!isActive && (
        <TouchableOpacity
          style={styles.subscribeButton}
          onPress={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.subscribeButtonText}>
              {t('subscribe')} - {PLANS.find(p => p.id === selectedPlan)?.price}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Share Trial Link */}
      <View style={styles.shareSection}>
        <Text style={styles.shareText}>Share with colleagues:</Text>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={() => {
            const url = typeof window !== 'undefined' ? window.location.origin : 'https://emotion-zones-kids.preview.emergentagent.com';
            if (typeof navigator !== 'undefined' && navigator.share) {
              navigator.share({
                title: 'Zones of Regulation App',
                text: 'Try this amazing emotional regulation app for students!',
                url: url
              });
            } else {
              Alert.alert('Share Link', url);
            }
          }}
        >
          <MaterialIcons name="share" size={20} color="#5C6BC0" />
          <Text style={styles.shareButtonText}>Share Trial Link</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  trialSection: {
    backgroundColor: '#5C6BC0',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  trialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 12,
  },
  trialBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  trialTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 8,
  },
  trialDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    marginBottom: 16,
  },
  trialButton: {
    backgroundColor: 'white',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  trialButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#5C6BC0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  planCardSelected: {
    borderColor: '#5C6BC0',
    backgroundColor: '#F5F3FF',
  },
  planCardPopular: {
    borderColor: '#4CAF50',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  popularBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: 'white',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#CCC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#5C6BC0',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#5C6BC0',
  },
  planInfo: {
    flex: 1,
    marginLeft: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  savingsBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  savingsText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  planPrice: {
    alignItems: 'flex-end',
  },
  priceAmount: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  pricePeriod: {
    fontSize: 12,
    color: '#888',
  },
  featuresSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    marginBottom: 20,
  },
  featuresTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  featureText: {
    fontSize: 14,
    color: '#666',
  },
  subscribeButton: {
    backgroundColor: '#5C6BC0',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    marginBottom: 20,
  },
  subscribeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  shareSection: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  shareText: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDE7F6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C6BC0',
  },
});
