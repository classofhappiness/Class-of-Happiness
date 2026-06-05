import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../../src/context/AppContext';
import { subscriptionApi } from '../../src/utils/api';

const PARENT_PLANS = [
  { id: 'parent_monthly', name: 'Monthly', price: '$4.99', period: '/month', savings: '', popular: false },
  { id: 'parent_annual', name: 'Annual', price: '$39.99', period: '/year', savings: 'Save 33%', popular: true },
];

const TEACHER_PLANS = [
  { id: 'teacher_monthly', name: 'Monthly', price: '$7.99', period: '/month', savings: '', popular: false },
  { id: 'teacher_annual', name: 'Annual', price: '$59.99', period: '/year', savings: 'Save 37%', popular: true },
];

const PARENT_FEATURES = [
  'Unlimited family members',
  'Home check-ins for all family',
  'Family strategies & wellbeing',
  'My Wellbeing private journal',
  'Link to school — see school data',
  'Monthly PDF wellbeing reports',
  'Creature reward system',
  '6 languages supported',
];

const TEACHER_FEATURES = [
  'Unlimited students per class',
  'Full analytics dashboard',
  'PDF reports per student',
  'Family linking & home data',
  'Bulk check-ins',
  'SMS & push alerts',
  'Strategy library',
  '6 languages supported',
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, t, checkAuth, isAuthenticated, login } = useApp();
  const [selectedRole, setSelectedRole] = useState<'parent' | 'teacher'>('parent');
  const [selectedPlan, setSelectedPlan] = useState('parent_annual');
  const [loading, setLoading] = useState(false);
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialDays, setTrialDays] = useState(30);

  useEffect(() => {
    subscriptionApi.getPlans().then(d => setTrialDays(d.trial_days || 30)).catch(() => {});
  }, []);

  useEffect(() => {
    setSelectedPlan(selectedRole === 'parent' ? 'parent_annual' : 'teacher_annual');
  }, [selectedRole]);

  const plans = selectedRole === 'parent' ? PARENT_PLANS : TEACHER_PLANS;
  // Teachers can also subscribe as parents — show note
  const features = selectedRole === 'parent' ? PARENT_FEATURES : TEACHER_FEATURES;
  const isTrialUsed = user?.trial_started_at != null;
  const isActive = user?.subscription_status === 'active' || user?.subscription_status === 'trial';

  const handleStartTrial = async () => {
    if (!isAuthenticated) { login(); return; }
    setTrialLoading(true);
    try {
      await subscriptionApi.startTrial();
      await checkAuth();
      Alert.alert('🎉 Trial Started!', `You have ${trialDays} days free to explore all features. No credit card needed.`, [
        { text: 'Let\'s Go!', onPress: () => router.replace(selectedRole === 'teacher' ? '/teacher/dashboard' : '/parent/dashboard') }
      ]);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not start trial');
    } finally { setTrialLoading(false); }
  };

  const handleSubscribe = async () => {
    if (!isAuthenticated) { login(); return; }
    setLoading(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const { url } = await subscriptionApi.createCheckout(selectedPlan, origin);
      if (url) {
        if (typeof window !== 'undefined') window.location.href = url;
        else await Linking.openURL(url);
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not create checkout');
    } finally { setLoading(false); }
  };

  const selectedPrice = plans.find(p => p.id === selectedPlan)?.price || '';

  return (
    <ScrollView style={[st.container, { paddingTop: insets.top }]} contentContainerStyle={st.scroll}>

      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={st.headerTitle}>Class of Happiness</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero */}
      <View style={st.hero}>
        <Image source={require('../../assets/images/logo_coh.png')} style={{width:80, height:80, alignSelf:'center', marginBottom:8}} resizeMode="contain" />
        <Text style={st.heroTitle}>Emotional Wellbeing{'\n'}for Every Child</Text>
        <Text style={st.heroSub}>Evidence-based check-ins that connect{'\n'}home and school</Text>
      </View>

      {/* Free tier */}
      <View style={st.freeCard}>
        <View style={st.freeRow}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <Text style={st.freeText}><Text style={{ fontWeight: '700' }}>Free forever:</Text> 1 parent · 2 family members · basic check-ins · creature rewards</Text>
        </View>
      </View>

      {/* Status */}
      {isActive && (
        <View style={[st.statusCard, { backgroundColor: '#E8F5E9' }]}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          <View>
            <Text style={[st.statusText, { color: '#2E7D32' }]}>
              {user?.subscription_status === 'trial' 
                ? `✨ ${t('trial_active')||'Free trial active'}` 
                : user?.subscription_plan 
                  ? `✅ ${user.subscription_plan} ${t('trial_active_desc')||'plan active'}` 
                  : `✅ ${t('trial_active')||'Access active'}`}
            </Text>
            {user?.subscription_status === 'trial' && user?.trial_started_at && (() => {
              const start = new Date(user.trial_started_at);
              const daysUsed = Math.floor((Date.now() - start.getTime()) / (1000*60*60*24));
              const daysLeft = Math.max(0, trialDays - daysUsed);
              return <Text style={{fontSize:12, color:'#388E3C', marginTop:2}}>{daysLeft} days remaining</Text>;
            })()}
            {user?.subscription_expires_at && user?.subscription_status !== 'trial' && (() => {
              const exp = new Date(user.subscription_expires_at);
              const daysLeft = Math.max(0, Math.floor((exp.getTime() - Date.now()) / (1000*60*60*24)));
              return <Text style={{fontSize:12, color:'#388E3C', marginTop:2}}>Expires in {daysLeft} days</Text>;
            })()}
          </View>
        </View>
      )}

      {/* Trial CTA */}
      {!isTrialUsed && !isActive && (
        <View style={st.trialCard}>
          <View style={st.trialBadge}>
            <MaterialIcons name="card-giftcard" size={16} color="white" />
            <Text style={st.trialBadgeText}>{trialDays} Days Free</Text>
          </View>
          <Text style={st.trialTitle}>Try everything free</Text>
          <Text style={st.trialSub}>No credit card · No commitment · Cancel anytime</Text>
          <TouchableOpacity style={st.trialBtn} onPress={handleStartTrial} disabled={trialLoading}>
            {trialLoading ? <ActivityIndicator color="#5C6BC0" /> : <Text style={st.trialBtnText}>Start Free Trial</Text>}
          </TouchableOpacity>
        </View>
      )}

      {/* Role Toggle */}
      <Text style={st.sectionLabel}>I am a...</Text>
      <View style={st.roleRow}>
        <TouchableOpacity
          style={[st.roleBtn, selectedRole === 'parent' && st.roleBtnActive]}
          onPress={() => setSelectedRole('parent')}>
          <MaterialIcons name="family-restroom" size={22} color={selectedRole === 'parent' ? 'white' : '#5C6BC0'} />
          <Text style={[st.roleBtnText, selectedRole === 'parent' && st.roleBtnTextActive]}>Parent / Family</Text>
          <Text style={[st.rolePrice, selectedRole === 'parent' && { color: 'rgba(255,255,255,0.8)' }]}>from $4.99/mo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[st.roleBtn, selectedRole === 'teacher' && st.roleBtnActive]}
          onPress={() => setSelectedRole('teacher')}>
          <MaterialIcons name="school" size={22} color={selectedRole === 'teacher' ? 'white' : '#5C6BC0'} />
          <Text style={[st.roleBtnText, selectedRole === 'teacher' && st.roleBtnTextActive]}>Teacher / Educator</Text>
          <Text style={[st.rolePrice, selectedRole === 'teacher' && { color: 'rgba(255,255,255,0.8)' }]}>from $7.99/mo</Text>
        </TouchableOpacity>
      </View>

      {/* Both roles note */}
      {selectedRole === 'teacher' && (
        <TouchableOpacity
          onPress={() => Linking.openURL('mailto:hello@classofhappiness.com?subject=Parent and Teacher Plan')}
          style={{ backgroundColor:'#E8F5E9', borderRadius:10, padding:10, marginBottom:12, flexDirection:'row', alignItems:'center', gap:8 }}>
          <MaterialIcons name="info" size={16} color="#4CAF50" />
          <Text style={{ fontSize:12, color:'#2E7D32', flex:1 }}>Need parent AND teacher access? Contact us for a combined plan.</Text>
        </TouchableOpacity>
      )}

      {/* Plans */}
      <Text style={st.sectionLabel}>Choose your plan</Text>
      {plans.map(plan => (
        <TouchableOpacity
          key={plan.id}
          style={[st.planCard, selectedPlan === plan.id && st.planCardActive, plan.popular && st.planCardPopular]}
          onPress={() => setSelectedPlan(plan.id)}>
          {plan.popular && <View style={st.popularPill}><Text style={st.popularText}>Best Value</Text></View>}
          <View style={st.planRow}>
            <View style={[st.radio, selectedPlan === plan.id && st.radioActive]}>
              {selectedPlan === plan.id && <View style={st.radioDot} />}
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={st.planName}>{plan.name}</Text>
              {plan.savings ? <View style={st.savingsPill}><Text style={st.savingsText}>{plan.savings}</Text></View> : null}
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={st.planPrice}>{plan.price}</Text>
              <Text style={st.planPeriod}>{plan.period}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}

      {/* Features */}
      <View style={st.featuresCard}>
        <Text style={st.featuresTitle}>
          {selectedRole === 'parent' ? '👨‍👩‍👧 Parent Plan includes' : '🏫 Teacher Plan includes'}
        </Text>
        {features.map((f, i) => (
          <View key={i} style={st.featureRow}>
            <MaterialIcons name="check" size={16} color="#4CAF50" />
            <Text style={st.featureText}>{f}</Text>
          </View>
        ))}
      </View>

      {/* Subscribe Button */}
      {!isActive && (
        <TouchableOpacity style={st.subscribeBtn} onPress={handleSubscribe} disabled={loading}>
          {loading
            ? <ActivityIndicator color="white" />
            : <Text style={st.subscribeBtnText}>Subscribe — {selectedPrice}</Text>}
        </TouchableOpacity>
      )}

      {/* School Package CTA */}
      <Text style={[st.sectionLabel, { marginTop: 8 }]}>For schools & districts</Text>
      <TouchableOpacity
        style={st.schoolCard}
        onPress={() => Linking.openURL('mailto:hello@classofhappiness.com?subject=School Package Enquiry')}>
        <View style={{ flex: 1 }}>
          <Text style={st.schoolTitle}>🏛️ School Package</Text>
          <Text style={st.schoolSub}>Whole-school pricing from $299/year · All teachers + parents included · Admin dashboard · GDPR docs</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#5C6BC0" />
      </TouchableOpacity>

      <Text style={st.legalText}>
        Subscriptions renew automatically. Cancel anytime in Settings.{'\n'}
        Prices in USD · Local pricing may vary by region.
      </Text>

    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { padding: 16, paddingBottom: 60 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#333' },
  hero: { alignItems: 'center', paddingVertical: 24 },
  heroEmoji: { fontSize: 48, marginBottom: 12 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#333', textAlign: 'center', lineHeight: 32 },
  heroSub: { fontSize: 14, color: '#666', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  freeCard: { backgroundColor: '#F1F8E9', borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#C8E6C9' },
  freeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  freeText: { flex: 1, fontSize: 13, color: '#388E3C', lineHeight: 18 },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 12, marginBottom: 16 },
  statusText: { fontSize: 14, fontWeight: '600' },
  trialCard: { backgroundColor: '#5C6BC0', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 24 },
  trialBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, gap: 6, marginBottom: 12 },
  trialBadgeText: { fontSize: 13, fontWeight: '700', color: 'white' },
  trialTitle: { fontSize: 22, fontWeight: '800', color: 'white', marginBottom: 6 },
  trialSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 16 },
  trialBtn: { backgroundColor: 'white', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 24 },
  trialBtnText: { fontSize: 16, fontWeight: '700', color: '#5C6BC0' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 10, marginTop: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  roleBtn: { flex: 1, alignItems: 'center', padding: 14, borderRadius: 14, backgroundColor: 'white', borderWidth: 2, borderColor: '#E8EAF6', gap: 4 },
  roleBtnActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  roleBtnText: { fontSize: 13, fontWeight: '700', color: '#5C6BC0', textAlign: 'center' },
  roleBtnTextActive: { color: 'white' },
  rolePrice: { fontSize: 11, color: '#888' },
  planCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 2, borderColor: '#E0E0E0' },
  planCardActive: { borderColor: '#5C6BC0', backgroundColor: '#F5F3FF' },
  planCardPopular: { borderColor: '#4CAF50' },
  popularPill: { position: 'absolute', top: -10, right: 16, backgroundColor: '#4CAF50', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  popularText: { fontSize: 10, fontWeight: '700', color: 'white' },
  planRow: { flexDirection: 'row', alignItems: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CCC', alignItems: 'center', justifyContent: 'center' },
  radioActive: { borderColor: '#5C6BC0' },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#5C6BC0' },
  planName: { fontSize: 17, fontWeight: '600', color: '#333' },
  savingsPill: { backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start', marginTop: 4 },
  savingsText: { fontSize: 11, fontWeight: '700', color: '#4CAF50' },
  planPrice: { fontSize: 22, fontWeight: '800', color: '#333' },
  planPeriod: { fontSize: 11, color: '#888' },
  featuresCard: { backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 20 },
  featuresTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 12 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  featureText: { fontSize: 13, color: '#555', flex: 1 },
  subscribeBtn: { backgroundColor: '#5C6BC0', borderRadius: 14, padding: 18, alignItems: 'center', marginBottom: 16 },
  subscribeBtnText: { fontSize: 17, fontWeight: '700', color: 'white' },
  schoolCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EDE7F6', borderRadius: 14, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: '#D1C4E9' },
  schoolTitle: { fontSize: 15, fontWeight: '700', color: '#4527A0', marginBottom: 4 },
  schoolSub: { fontSize: 12, color: '#666', lineHeight: 17 },
  legalText: { fontSize: 11, color: '#AAA', textAlign: 'center', lineHeight: 16, paddingHorizontal: 8 },
});
