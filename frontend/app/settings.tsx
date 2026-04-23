import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { translationsApi, subscriptionApi, authApiExtended } from '../src/utils/api';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇦🇺' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, language, setLanguage, logout, t, hasActiveSubscription, translations, checkAuth, isAuthenticated } = useApp();
  const [showLanguages, setShowLanguages] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [showTrialCode, setShowTrialCode] = useState(false);
  const [trialCode, setTrialCode] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [showTrialCodeText, setShowTrialCodeText] = useState(true);  // Show text by default
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [promotingAdmin, setPromotingAdmin] = useState(false);
  const [showAdminCodeText, setShowAdminCodeText] = useState(true);  // Show text by default

  // Set translated header title - depend on language/translations to trigger updates
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('settings'),
    });
  }, [navigation, language, translations]);

  const handleLogout = () => {
    Alert.alert(
      t('logout'),
      t('confirm_logout'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('logout'),
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  };

  const handleLanguageSelect = (langCode: string) => {
    const selectedLang = LANGUAGES.find(l => l.code === langCode);
    if (!selectedLang || langCode === language) {
      setShowLanguages(false);
      return;
    }
    
    setPendingLanguage(langCode);
    setShowLanguages(false);
    
    // Show confirmation dialog
    Alert.alert(
      t('change_language') || 'Change Language',
      `${t('change_language_confirm') || 'Set'} ${selectedLang.name} ${t('as_default_language') || 'as your default language?'}`,
      [
        { 
          text: t('cancel'), 
          style: 'cancel',
          onPress: () => setPendingLanguage(null),
        },
        {
          text: t('confirm'),
          onPress: async () => {
            await setLanguage(langCode);
            setPendingLanguage(null);
            Alert.alert(
              '✓ ' + (t('language_changed') || 'Language Changed'),
              `${selectedLang.name} ${t('is_now_default') || 'is now your default language. The app will remember this choice.'}`,
              [{ text: t('done') || 'OK' }]
            );
          },
        },
      ]
    );
  };

  const currentLang = LANGUAGES.find(l => l.code === language) || LANGUAGES[0];

  // Handle trial code redemption
  const handleRedeemCode = async () => {
    if (!trialCode.trim()) {
      Alert.alert(t('error'), t('trial_code_placeholder') || 'Please enter a trial code');
      return;
    }
    
    setRedeemingCode(true);
    try {
      const result = await subscriptionApi.redeemTrialCode(trialCode.trim());
      Alert.alert(
        '🎉 ' + (t('success') || 'Success'),
        result.message,
        [{ text: 'OK' }]
      );
      setTrialCode('');
      setShowTrialCode(false);
      // Refresh user data to get updated subscription status
      await checkAuth();
    } catch (error: any) {
      Alert.alert(t('error'), error.message || t('trial_code_invalid'));
    } finally {
      setRedeemingCode(false);
    }
  };

  // Handle superadmin promotion (Jono only)
  const handleSuperAdminCode = async () => {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    try {
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/auth/promote-superadmin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: adminCode.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('✅ Superadmin', 'You now have full superadmin access!');
      }
    } catch {}
  };

  // Handle admin code promotion
  const handlePromoteAdmin = async () => {
    if (!adminCode.trim()) {
      Alert.alert(t('error') || 'Error', 'Please enter an admin code');
      return;
    }
    
    setPromotingAdmin(true);
    try {
      // Try superadmin first, fall back to school admin
      if (['JONO_SUPERADMIN_2026', 'CLASS_CREATOR_2026'].includes(adminCode.trim())) {
        await handleSuperAdminCode();
        setAdminCode('');
        return;
      }
      const result = await authApiExtended.promoteToAdmin(adminCode.trim());
      Alert.alert(
        '🔐 ' + (t('success') || 'Success'),
        result.message,
        [{ text: 'OK' }]
      );
      setAdminCode('');
      setShowAdminCode(false);
      // Refresh user data to get updated role
      await checkAuth();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || 'Invalid admin code');
    } finally {
      setPromotingAdmin(false);
    }
  };


  // Join school with invite code
  const [schoolInviteCode, setSchoolInviteCode] = useState('');
  const [joiningSchool, setJoiningSchool] = useState(false);

  const handleJoinSchool = async () => {
    if (!schoolInviteCode.trim()) {
      Alert.alert('Enter invite code', 'Please enter the invite code from your school admin.');
      return;
    }
    setJoiningSchool(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/school/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ code: schoolInviteCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Welcome! 🎉', data.message || 'You have joined your school!');
        setSchoolInviteCode('');
      } else {
        Alert.alert('Error', data.detail || 'Invalid invite code');
      }
    } catch {
      Alert.alert('Error', 'Could not join school. Please try again.');
    } finally {
      setJoiningSchool(false);
    }
  };

  // Generate school invite code (school admin only)
  const [generatedCode, setGeneratedCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);

  const handleGenerateInviteCode = async () => {
    setGeneratingCode(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/school/generate-invite-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setGeneratedCode(data.code);
        Alert.alert('Invite Code Generated! 🎉',
          `Share this code with your teachers:\n\n${data.code}\n\nValid for 90 days.`);
      }
    } catch {
      Alert.alert('Error', 'Could not generate code.');
    } finally {
      setGeneratingCode(false);
    }
  };

  // Start trial
  const [startingTrial, setStartingTrial] = useState(false);

  const handleStartTrial = async (trialType: string) => {
    setStartingTrial(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/trial/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ type: trialType }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Trial Started! 🌟', data.message);
        await checkAuth();
      } else {
        Alert.alert('Error', data.detail || 'Could not start trial.');
      }
    } catch {
      Alert.alert('Error', 'Could not start trial.');
    } finally {
      setStartingTrial(false);
    }
  };

  return (
    <ScrollView 
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* User Info */}
      {user && (
        <View style={styles.userCard}>
          <View style={styles.userAvatar}>
            <Text style={styles.userInitial}>{user.name?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        </View>
      )}

      {/* Subscription Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('subscription')}</Text>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => router.push('/subscription')}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="card-membership" size={24} color="#5C6BC0" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Status</Text>
              <Text style={[styles.settingValue, { color: hasActiveSubscription ? '#4CAF50' : '#F44336' }]}>
                {user?.subscription_status === 'trial' ? t('free_trial')||'Free Trial' :
                 user?.subscription_status === 'active' ? `${user.subscription_plan || 'Active'}` :
                 'Inactive'}
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#CCC" />
        </TouchableOpacity>
        
        {/* Trial Code Section */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowTrialCode(!showTrialCode)}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="card-giftcard" size={24} color="#FF9800" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{t('have_trial_code')}</Text>
            </View>
          </View>
          <MaterialIcons 
            name={showTrialCode ? "expand-less" : "expand-more"} 
            size={24} 
            color="#CCC" 
          />
        </TouchableOpacity>
        
        {showTrialCode && (
          <View style={styles.trialCodeContainer}>
            <View style={styles.codeInputWrapper}>
              <TextInput
                style={styles.trialCodeInputWithIcon}
                placeholder={t('trial_code_placeholder') || 'Enter code'}
                placeholderTextColor="#999"
                value={trialCode}
                onChangeText={setTrialCode}
                autoCapitalize="characters"
                autoCorrect={false}
                secureTextEntry={!showTrialCodeText}
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setShowTrialCodeText(!showTrialCodeText)}
              >
                <MaterialIcons 
                  name={showTrialCodeText ? "visibility" : "visibility-off"} 
                  size={22} 
                  color="#888" 
                />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={[styles.redeemButton, redeemingCode && styles.redeemButtonDisabled]}
              onPress={handleRedeemCode}
              disabled={redeemingCode}
            >
              <Text style={styles.redeemButtonText}>
                {redeemingCode ? t('redeeming') : t('redeem_code')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Language */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('language')}</Text>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowLanguages(!showLanguages)}
        >
          <View style={styles.settingLeft}>
            <Text style={styles.langFlag}>{currentLang.flag}</Text>
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{t('language')}</Text>
              <Text style={styles.settingValue}>{currentLang.name}</Text>
            </View>
          </View>
          <MaterialIcons 
            name={showLanguages ? "expand-less" : "expand-more"} 
            size={24} 
            color="#CCC" 
          />
        </TouchableOpacity>

        {showLanguages && (
          <View style={styles.languageList}>
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languageItem,
                  language === lang.code && styles.languageItemActive
                ]}
                onPress={() => handleLanguageSelect(lang.code)}
              >
                <Text style={styles.langFlag}>{lang.flag}</Text>
                <Text style={styles.langName}>{lang.name}</Text>
                {language === lang.code && (
                  <MaterialIcons name="check" size={20} color="#5C6BC0" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* {t('about_app')||'About'} & {t('legal')||'Legal'} */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('legal') || 'Legal'}</Text>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => router.push('/about' as any)}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="info-outline" size={24} color="#5C6BC0" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>About & Privacy</Text>
              <Text style={styles.settingValue}>Disclaimer, Privacy Policy, Terms</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#CCC" />
        </TouchableOpacity>
      </View>

      {/* Admin Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Administration</Text>
        
        {/* Show Admin Dashboard if already admin */}
        {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'school_admin') && (
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/admin/dashboard' as any)}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="admin-panel-settings" size={24} color="#9C27B0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Admin Dashboard</Text>
                <Text style={styles.settingValue}>{user?.role === 'superadmin' ? 'Super Admin — manage all schools' : 'School Admin — manage and support your school'}</Text>
              </View>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#CCC" />
          </TouchableOpacity>
        )}
        

        {/* Trial Section - show for free teachers and parents */}
        {isAuthenticated && user?.subscription_status === 'free' && (user?.role === 'teacher' || user?.role === 'parent') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="star" size={20} color="#FF9800" />
              <Text style={styles.sectionTitle}>Free Trial</Text>
            </View>
            <View style={[styles.settingItem, { backgroundColor: '#FFF8E1', borderRadius: 12, margin: 8 }]}>
              <View style={styles.settingLeft}>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Start Your 7-Day Free Trial</Text>
                  <Text style={styles.settingValue}>
                    Full access to all {user?.role} features. No credit card needed.
                  </Text>
                </View>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.settingItem, { backgroundColor: '#FF9800', borderRadius: 12, margin: 8, justifyContent: 'center' }]}
              onPress={() => handleStartTrial(user?.role || 'teacher')}
              disabled={startingTrial}
            >
              <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>
                {startingTrial ? 'Starting...' : '🌟 Start Free Trial'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Trial Status - show days remaining */}
        {isAuthenticated && user?.subscription_status === 'trial' && (
          <View style={styles.section}>
            <View style={[styles.settingItem, { backgroundColor: '#E8F5E9', borderRadius: 12, margin: 8 }]}>
              <View style={styles.settingLeft}>
                <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>✅ Free Trial Active</Text>
                  <Text style={styles.settingValue}>
                    Enjoy full access during your trial period.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Join School - show for teachers without a school */}
        {isAuthenticated && (user?.role === 'teacher') && !(user as any)?.school_name && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="school" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Join Your School</Text>
            </View>
            <View style={[styles.settingItem, { flexDirection: 'column', padding: 16 }]}>
              <Text style={[styles.settingValue, { marginBottom: 8 }]}>
                Enter the invite code from your school admin to connect to your school.
              </Text>
              <TextInput
                style={[styles.trialCodeInputWithIcon, { borderRadius: 10, padding: 12, backgroundColor: '#F5F5F5', marginBottom: 8 }]}
                placeholder="e.g. SCH-X7K2-M9P4"
                value={schoolInviteCode}
                onChangeText={setSchoolInviteCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={[styles.settingItem, { backgroundColor: '#5C6BC0', borderRadius: 10, justifyContent: 'center', padding: 12 }]}
                onPress={handleJoinSchool}
                disabled={joiningSchool}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                  {joiningSchool ? 'Joining...' : '🏫 Join School'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* School Invite Code Generator - for school admins */}
        {isAuthenticated && (user?.role === 'school_admin' || user?.role === 'admin') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="vpn-key" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>School Invite Code</Text>
            </View>
            <View style={[styles.settingItem, { flexDirection: 'column', padding: 16 }]}>
              <Text style={[styles.settingValue, { marginBottom: 12 }]}>
                Generate a code to share with your teachers so they can join your school.
              </Text>
              {generatedCode ? (
                <View style={{ backgroundColor: '#E8EAF6', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#3949AB', letterSpacing: 2 }}>{generatedCode}</Text>
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Share this with your teachers</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[styles.settingItem, { backgroundColor: '#5C6BC0', borderRadius: 10, justifyContent: 'center', padding: 12 }]}
                onPress={handleGenerateInviteCode}
                disabled={generatingCode}
              >
                <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>
                  {generatingCode ? t('loading')||'Generating...' : '🔑 ' + (t('generate_invite_code')||'Generate Invite Code')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}


        

        {/* Join School - teachers without school */}
        {isAuthenticated && user?.role === 'teacher' && !(user as any)?.school_name && (
          <View style={styles.section}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <MaterialIcons name="school" size={24} color="#5C6BC0" />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Join Your School</Text>
                  <Text style={styles.settingValue}>Enter the invite code from your school admin</Text>
                </View>
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
              <TextInput
                style={[styles.trialCodeInputWithIcon, { borderRadius: 10, padding: 12, backgroundColor: '#F5F5F5' }]}
                placeholder="e.g. SCH-X7K2-M9P4"
                value={schoolInviteCode}
                onChangeText={setSchoolInviteCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={{ backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, alignItems: 'center' }}
                onPress={handleJoinSchool}
                disabled={joiningSchool}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>{joiningSchool ? 'Joining...' : t('join_school') || 'Join School'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Admin Code Entry (only show if not already admin) */}
        {user?.role !== 'admin' && user?.role !== 'superadmin' && (
          <>
            <TouchableOpacity
              style={styles.settingItem}
              onPress={() => setShowAdminCode(!showAdminCode)}
            >
              <View style={styles.settingLeft}>
                <MaterialIcons name="vpn-key" size={24} color="#9C27B0" />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>{t('admin_access') || 'Admin Access'}</Text>
                  <Text style={styles.settingValue}>Enter admin code to unlock</Text>
                </View>
              </View>
              <MaterialIcons 
                name={showAdminCode ? "expand-less" : "expand-more"} 
                size={24} 
                color="#CCC" 
              />
            </TouchableOpacity>
            
            {showAdminCode && (
              <View style={styles.trialCodeContainer}>
                {!user && (
                  <Text style={styles.loginRequiredText}>
                    ⚠️ You must be logged in as Teacher or Parent first
                  </Text>
                )}
                <View style={styles.codeInputWrapper}>
                  <TextInput
                    style={styles.trialCodeInputWithIcon}
                    placeholder="Enter admin code"
                    placeholderTextColor="#999"
                    value={adminCode}
                    onChangeText={setAdminCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    secureTextEntry={!showAdminCodeText}
                  />
                  <TouchableOpacity
                    style={styles.eyeIconButton}
                    onPress={() => setShowAdminCodeText(!showAdminCodeText)}
                  >
                    <MaterialIcons 
                      name={showAdminCodeText ? "visibility" : "visibility-off"} 
                      size={22} 
                      color="#888" 
                    />
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[styles.redeemButton, { backgroundColor: '#9C27B0' }, (promotingAdmin || !user) && styles.redeemButtonDisabled]}
                  onPress={handlePromoteAdmin}
                  disabled={promotingAdmin || !user}
                >
                  <Text style={styles.redeemButtonText}>
                    {promotingAdmin ? 'Verifying...' : 'Unlock Admin'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <MaterialIcons name="logout" size={24} color="#F44336" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>
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
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  userAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#5C6BC0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  userInfo: {
    marginLeft: 16,
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    marginLeft: 12,
  },
  settingLabel: {
    fontSize: 14,
    color: '#888',
  },
  settingValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 2,
  },
  langFlag: {
    fontSize: 24,
  },
  languageList: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  languageItemActive: {
    backgroundColor: '#EDE7F6',
  },
  langName: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
    flex: 1,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    gap: 8,
    marginTop: 16,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F44336',
  },
  trialCodeContainer: {
    backgroundColor: '#FFF8E1',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginHorizontal: 4,
  },
  trialCodeInput: {
    color: '#333',
    color: '#333',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '600',
  },
  codeInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#FFD54F',
    borderRadius: 8,
  },
  trialCodeInputWithIcon: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 2,
    fontWeight: '600',
    color: '#333',
  },
  eyeIconButton: {
    padding: 12,
    paddingLeft: 0,
  },
  redeemButton: {
    backgroundColor: '#FF9800',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  redeemButtonDisabled: {
    backgroundColor: '#FFCC80',
  },
  redeemButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loginRequiredText: {
    fontSize: 13,
    color: '#E65100',
    textAlign: 'center',
    marginBottom: 12,
    backgroundColor: '#FFF3E0',
    padding: 8,
    borderRadius: 6,
  },
});
