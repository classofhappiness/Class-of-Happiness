import React, { useState, useLayoutEffect, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput, Switch, Platform, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { translationsApi, subscriptionApi, authApiExtended } from '../src/utils/api';
import { loadVoiceEnabled, setVoiceEnabled } from '../src/utils/voiceClips';

// hasVoice matches the backend's VOICE_CLIP_LANGUAGES ("en","pt" only, as of Aug 21) -
// real recordings exist only for these two; the other 4 languages are UI-text-only for now.
const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇦🇺', hasVoice: true },
  { code: 'es', name: 'Español', flag: '🇪🇸', hasVoice: false },
  { code: 'fr', name: 'Français', flag: '🇫🇷', hasVoice: false },
  { code: 'pt', name: 'Português', flag: '🇵🇹', hasVoice: true },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', hasVoice: false },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', hasVoice: false },
];

// Same client IDs as auth/login.tsx, reused here for re-authentication before account deletion.
const GOOGLE_CLIENT_IDS = {
  ios: '691097467706-b7qooo5be0iu5nlk8krb546ji98ik1k0.apps.googleusercontent.com',
  android: '691097467706-k1s2g9p0ektmpmkj0t3j6l9bl22sg69c.apps.googleusercontent.com',
  default: '691097467706-n2r5n885bqh8qtqrdgnlbvgfd4i2ti5k.apps.googleusercontent.com',
};
const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

// Real feature Aug 25 (item 2): "Parent Subscription Active" instead of the bare plan name -
// subscription_plan is a lowercase machine key ("parent"/"teacher"/"school_starter") set by
// the Stripe webhook via _get_plan_from_price, not display text on its own.
function subscriptionStatusLabel(user: any): string {
  const plan = (user?.subscription_plan || 'Subscriber') as string;
  const label = plan.charAt(0).toUpperCase() + plan.slice(1).replace(/_/g, ' ');
  return `${label} Subscription Active`;
}

function renewalCountdownLabel(expiresAtIso: string): string {
  const daysLeft = Math.max(0, Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  return daysLeft === 1 ? 'Renews in 1 day' : `Renews in ${daysLeft} days`;
}

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, language, setLanguage, logout, t, hasActiveSubscription, translations, checkAuth, isAuthenticated } = useApp();
  const [showLanguages, setShowLanguages] = useState(false);
  const [voiceEnabled, setVoiceEnabledState] = useState(true);

  useEffect(() => { loadVoiceEnabled().then(setVoiceEnabledState); }, []);

  const handleVoiceToggle = async (value: boolean) => {
    setVoiceEnabledState(value);
    await setVoiceEnabled(value);
  };
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);
  const [showTrialCode, setShowTrialCode] = useState(false);
  const [trialCode, setTrialCode] = useState('');
  const [redeemingCode, setRedeemingCode] = useState(false);
  const [showTrialCodeText, setShowTrialCodeText] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPasswordText, setShowNewPasswordText] = useState(false);
  const [settingPassword, setSettingPassword] = useState(false);

  // Account Type / role switch (Aug 25 fix: role used to be silently rewritten by
  // PUT /auth/role every time parent/dashboard.tsx or teacher/resources.tsx mounted -
  // now role is only ever changed here, deliberately, with confirmation.
  const [switchingRole, setSwitchingRole] = useState(false);

  // Account deletion (soft-delete, 30-day grace period — see POST /account/delete-request)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Real feature Aug 21: teacher-consent for school_admin to see individual wellbeing
  // check-ins — default-off, explicit opt-in, revocable any time. Mirrors the parent<->
  // teacher home-sharing toggle pattern.
  const [wellbeingShared, setWellbeingShared] = useState(false);
  const [wellbeingSharedLoading, setWellbeingSharedLoading] = useState(false);
  useEffect(() => {
    if (user?.role !== 'teacher') return;
    (async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        const res = await fetch(`${BACKEND_URL}/api/teacher/wellbeing-sharing-status`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (res.ok) { const data = await res.json(); setWellbeingShared(!!data.shared); }
      } catch {}
    })();
  }, [user?.role]);
  const handleWellbeingSharingToggle = async () => {
    setWellbeingSharedLoading(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/teacher/toggle-wellbeing-sharing`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) { setWellbeingShared(!!data.shared); }
      else { Alert.alert(t('error') || 'Error', data.detail || 'Could not update sharing status.'); }
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not update sharing status. Please try again.');
    } finally {
      setWellbeingSharedLoading(false);
    }
  };

  const [deleteGoogleRequest, deleteGoogleResponse, promptDeleteGoogleAsync] = AuthSession.useAuthRequest(
    {
      clientId: Platform.select({ ios: GOOGLE_CLIENT_IDS.ios, android: GOOGLE_CLIENT_IDS.android, default: GOOGLE_CLIENT_IDS.default }),
      scopes: ['openid', 'profile', 'email'],
      redirectUri: AuthSession.makeRedirectUri(),
      responseType: AuthSession.ResponseType.Token,
    },
    GOOGLE_DISCOVERY
  );

  const submitDeleteAccount = async (body: { password?: string; google_token?: string }) => {
    setDeletingAccount(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/account/delete-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert(
          'Account scheduled for deletion',
          'Your account has been deactivated and will be permanently deleted in 30 days. Contact jono@classofhappiness.com if you change your mind.',
          [{ text: 'OK', onPress: async () => { await logout(); router.replace('/'); } }]
        );
      } else {
        Alert.alert(t('error') || 'Error', data.detail || 'Could not process your request.');
      }
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not process your request. Please try again.');
    } finally {
      setDeletingAccount(false);
    }
  };

  useEffect(() => {
    if (deleteGoogleResponse?.type === 'success' && deleteGoogleResponse.authentication?.accessToken) {
      submitDeleteAccount({ google_token: deleteGoogleResponse.authentication.accessToken });
    }
  }, [deleteGoogleResponse]);

  const handleDeleteAccountConfirm = () => {
    Alert.alert(
      'Delete your account?',
      'This deactivates your account immediately and permanently deletes your data in 30 days. This cannot be undone after that. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account',
          style: 'destructive',
          onPress: () => {
            if (deletePassword.trim()) {
              submitDeleteAccount({ password: deletePassword });
            } else {
              promptDeleteGoogleAsync();
            }
          },
        },
      ]
    );
  };

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
      Alert.alert(t('error'), t('trial_code_required') || 'Please enter a trial code');
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
        await checkAuth();
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

  const handleSetPassword = async () => {
    if (newPassword.length < 8) {
      Alert.alert(t('error') || 'Error', 'Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert(t('error') || 'Error', 'Passwords do not match');
      return;
    }
    setSettingPassword(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/auth/set-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password: newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('✅ ' + (t('success') || 'Success'), 'Your password has been set. You can now sign in with your email and password.');
        setNewPassword('');
        setConfirmPassword('');
        setShowSetPassword(false);
      } else {
        Alert.alert(t('error') || 'Error', data.detail || 'Could not set password.');
      }
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not set password. Please try again.');
    } finally {
      setSettingPassword(false);
    }
  };

  const handleSwitchRole = () => {
    if (!user || (user.role !== 'teacher' && user.role !== 'parent')) return;
    const newRole: 'teacher' | 'parent' = user.role === 'teacher' ? 'parent' : 'teacher';
    const newRoleLabel = newRole === 'teacher' ? (t('teacher') || 'Teacher') : (t('parent') || 'Parent / Family');
    Alert.alert(
      t('switch_account_type_title') || 'Switch account type?',
      (t('switch_account_type_desc') || 'This changes which dashboard you can access.') + ` ${newRoleLabel}.`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('switch_account_type_confirm') || 'Switch',
          onPress: async () => {
            setSwitchingRole(true);
            try {
              await authApiExtended.updateRole(newRole);
              await checkAuth();
              Alert.alert('✅ ' + (t('success') || 'Success'), t('switch_account_type_success') || 'Your account type has been updated.');
            } catch {
              Alert.alert(t('error') || 'Error', t('switch_account_type_error') || 'Could not switch account type. Please try again.');
            } finally {
              setSwitchingRole(false);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
    <ScrollView 
      style={styles.container}
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
              <Text style={styles.settingLabel}>{t('status_label') || 'Status'}</Text>
              <Text style={[styles.settingValue, { color: hasActiveSubscription ? '#4CAF50' : '#F44336' }]}>
                {user?.subscription_status === 'trial' ? t('free_trial')||'Free Trial' :
                 user?.subscription_status === 'active' ? subscriptionStatusLabel(user) :
                 'Inactive'}
              </Text>
              {/* Real feature Aug 25 (item 2): "Parent"/"teacher" alone didn't say the account
                  was actually active or when it renews. subscription_expires_at already holds
                  the real Stripe current_period_end (set by the webhook, confirmed against
                  real source - no new plumbing needed), so the renewal countdown here is real
                  billing data, not a guess. */}
              {user?.subscription_status === 'active' && user?.subscription_expires_at && (
                <Text style={styles.settingSubValue}>{renewalCountdownLabel(user.subscription_expires_at)}</Text>
              )}
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

      {/* Set Password */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('security') || 'Security'}</Text>
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowSetPassword(!showSetPassword)}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="lock-outline" size={24} color="#5C6BC0" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{t('set_password') || 'Set Password'}</Text>
              <Text style={styles.settingValue}>{t('set_password_desc') || 'Add a password to sign in without email-only access'}</Text>
            </View>
          </View>
          <MaterialIcons
            name={showSetPassword ? "expand-less" : "expand-more"}
            size={24}
            color="#CCC"
          />
        </TouchableOpacity>

        {showSetPassword && (
          <View style={styles.trialCodeContainer}>
            <View style={styles.codeInputWrapper}>
              <TextInput
                style={styles.trialCodeInputWithIcon}
                placeholder="New password (min 8 characters)"
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={setNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showNewPasswordText}
              />
              <TouchableOpacity
                style={styles.eyeIconButton}
                onPress={() => setShowNewPasswordText(!showNewPasswordText)}
              >
                <MaterialIcons
                  name={showNewPasswordText ? "visibility" : "visibility-off"}
                  size={22}
                  color="#888"
                />
              </TouchableOpacity>
            </View>
            <View style={[styles.codeInputWrapper, { marginTop: 8 }]}>
              <TextInput
                style={styles.trialCodeInputWithIcon}
                placeholder="Confirm password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!showNewPasswordText}
              />
            </View>
            <TouchableOpacity
              style={[styles.redeemButton, settingPassword && styles.redeemButtonDisabled]}
              onPress={handleSetPassword}
              disabled={settingPassword}
            >
              <Text style={styles.redeemButtonText}>
                {settingPassword ? (t('loading') || 'Setting...') : (t('set_password_btn') || 'Set Password')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Account Type (Aug 25 fix - see handleSwitchRole above) */}
      {(user?.role === 'teacher' || user?.role === 'parent') && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('account_type') || 'Account Type'}</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="swap-horiz" size={24} color="#5C6BC0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('current_account_type') || 'Current account type'}</Text>
                <Text style={styles.settingValue}>
                  {user!.role === 'teacher' ? (t('teacher') || 'Teacher') : (t('parent') || 'Parent / Family')}
                </Text>
              </View>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.switchRoleButton, switchingRole && styles.switchRoleButtonDisabled]}
            onPress={handleSwitchRole}
            disabled={switchingRole}
          >
            <Text style={styles.switchRoleButtonText}>
              {switchingRole
                ? (t('loading') || 'Switching...')
                : user!.role === 'teacher'
                  ? (t('switch_to_parent') || 'Switch to Parent account')
                  : (t('switch_to_teacher') || 'Switch to Teacher account')}
            </Text>
          </TouchableOpacity>
        </View>
      )}

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
                {!lang.hasVoice && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6 }}>
                    <MaterialIcons name="volume-off" size={11} color="#999" />
                    <Text style={{ fontSize: 9, color: '#999', fontWeight: '700', marginLeft: 2 }}>Audio coming soon</Text>
                  </View>
                )}
                {language === lang.code && (
                  <MaterialIcons name="check" size={20} color="#5C6BC0" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Voice narration (student check-in colour/helper audio) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('voice') || 'Voice'}</Text>
        <View style={styles.settingItem}>
          <View style={styles.settingLeft}>
            <MaterialIcons name="record-voice-over" size={24} color="#5C6BC0" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{t('voice_narration') || 'Voice Narration'}</Text>
              <Text style={styles.settingValue}>{t('voice_narration_desc') || 'Plays a recording when a colour or helper is tapped during check-in'}</Text>
            </View>
          </View>
          <Switch value={voiceEnabled} onValueChange={handleVoiceToggle} trackColor={{ false: '#ddd', true: '#81C784' }} thumbColor={voiceEnabled ? '#4CAF50' : '#999'} />
        </View>
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
              <Text style={styles.settingLabel}>{t('about_privacy') || 'About & Privacy'}</Text>
              <Text style={styles.settingValue}>{t('disclaimer_privacy_terms') || 'Disclaimer, Privacy Policy, Terms'}</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#CCC" />
        </TouchableOpacity>
        {/* Real feature Aug 21: simple mailto link, matching how account-deletion support
            already works - no in-app ticketing. */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => Linking.openURL('mailto:jono@classofhappiness.com')}
        >
          <View style={styles.settingLeft}>
            <MaterialIcons name="help-outline" size={24} color="#5C6BC0" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>{t('contact_support') || 'Contact Support'}</Text>
              <Text style={styles.settingValue}>jono@classofhappiness.com</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#CCC" />
        </TouchableOpacity>
      </View>

      {/* Admin Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('administration') || 'Administration'}</Text>
        
        {/* Show Admin Dashboard if already admin */}
        {(user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'school_admin') && (
          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => router.push('/admin/dashboard' as any)}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="admin-panel-settings" size={24} color="#9C27B0" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('admin_dashboard') || 'Admin Dashboard'}</Text>
                <Text style={styles.settingValue} numberOfLines={2}>{user?.role === 'superadmin' ? (t('super_admin') || 'Super Admin') : (t('school_admin_label') || 'School Admin')}</Text>
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
              <Text style={styles.sectionTitle}>{t('free_trial_label') || 'Free Trial'}</Text>
            </View>
            <View style={[styles.settingItem, { backgroundColor: '#FFF8E1', borderRadius: 12, margin: 8 }]}>
              <View style={styles.settingLeft}>
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>{t('start_free_trial') || 'Start Your 7-Day Free Trial'}</Text>
                  <Text style={styles.settingValue}>
                    {t('full_access_no_card') || 'Full access to all features. No credit card needed.'}
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
                {startingTrial ? (t('starting') || 'Starting...') : (t('start_free_trial_btn') || '🌟 Start Free Trial')}
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
                  <Text style={styles.settingLabel}>{t('trial_active') || '✅ Free Trial Active'}</Text>
                  <Text style={styles.settingValue}>
                    {t('trial_active_desc') || 'Enjoy full access during your trial period.'}
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
              <Text style={styles.sectionTitle}>{t('join_your_school') || 'Join Your School'}</Text>
            </View>
            <View style={[styles.settingItem, { flexDirection: 'column', padding: 16 }]}>
              <Text style={[styles.settingValue, { marginBottom: 8 }]}>
                {t('enter_invite_code_desc') || 'Enter the invite code from your school admin to connect to your school.'}
              </Text>
              <TextInput
                style={[styles.trialCodeInputWithIcon, { borderRadius: 10, padding: 12, backgroundColor: '#F5F5F5', marginBottom: 8 }]}
                placeholder={t('invite_code_placeholder') || 'e.g. SCH-X7K2-M9P4'}
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
                  {joiningSchool ? (t('joining') || 'Joining...') : (t('join_school_btn') || '🏫 Join School')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Real feature Aug 21: teacher wellbeing-sharing consent - only shown once actually
            linked to a school (matches "Join Your School" above being gated the same way).
            Default off, explicit opt-in, revocable any time. */}
        {isAuthenticated && user?.role === 'teacher' && !!(user as any)?.school_name && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="favorite-border" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Share My Wellbeing</Text>
            </View>
            <View style={styles.settingItem}>
              <View style={[styles.settingLeft, { flex: 1 }]}>
                <View style={[styles.settingText, { flex: 1 }]}>
                  <Text style={styles.settingLabel}>Share with my school admin</Text>
                  <Text style={styles.settingValue}>
                    When on, your school admin can see your individual wellbeing check-ins. Off by default — you can turn this on or off any time.
                  </Text>
                </View>
              </View>
              {wellbeingSharedLoading
                ? <ActivityIndicator size="small" color="#5C6BC0" />
                : <Switch value={wellbeingShared} onValueChange={handleWellbeingSharingToggle} trackColor={{ false: '#ddd', true: '#81C784' }} thumbColor={wellbeingShared ? '#4CAF50' : '#999'} />
              }
            </View>
          </View>
        )}

        {/* School Invite Code Generator - for school admins */}
        {isAuthenticated && (user?.role === 'school_admin' || user?.role === 'admin' || user?.role === 'superadmin') && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="vpn-key" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>{t('school_invite_code') || 'School Invite Code'}</Text>
            </View>
            <View style={[styles.settingItem, { flexDirection: 'column', padding: 16 }]}>
              <Text style={[styles.settingValue, { marginBottom: 12 }]}>
                {t('generate_code_desc') || 'Generate a code to share with your teachers so they can join your school.'}
              </Text>
              {generatedCode ? (
                <View style={{ backgroundColor: '#E8EAF6', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 24, fontWeight: 'bold', color: '#3949AB', letterSpacing: 2 }}>{generatedCode}</Text>
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>{t('share_with_teachers') || 'Share this with your teachers'}</Text>
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: '#5C6BC0', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
                      onPress={() => {
                        const { Clipboard } = require('react-native');
                        if (Clipboard?.setString) {
                          Clipboard.setString(generatedCode);
                        } else {
                          import('expo-clipboard').then(m => m.setStringAsync(generatedCode)).catch(() => {});
                        }
                        const { Alert } = require('react-native');
                        Alert.alert('Copied!', 'Invite code copied to clipboard.');
                      }}
                    >
                      <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>📋 Copy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: '#4CAF50', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 }}
                      onPress={async () => {
                        const { Share } = require('react-native');
                        await Share.share({
                          message: `Join my Class of Happiness school! Use this invite code: ${generatedCode}`,
                          title: 'Class of Happiness Invite Code',
                        });
                      }}
                    >
                      <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>📤 Share</Text>
                    </TouchableOpacity>
                  </View>
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


        

        {/* Join School section consolidated above */}
      </View>

      {/* Delete Account */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('danger_zone') || 'Danger Zone'}</Text>
        {(user?.role === 'teacher' || user?.role === 'parent') ? (
          <>
            <TouchableOpacity
              style={[styles.settingItem, { borderWidth: 1, borderColor: '#FFCDD2' }]}
              onPress={() => setShowDeleteAccount(!showDeleteAccount)}
            >
              <View style={styles.settingLeft}>
                <MaterialIcons name="delete-forever" size={24} color="#F44336" />
                <View style={styles.settingText}>
                  <Text style={[styles.settingLabel, { color: '#F44336' }]}>{t('delete_account') || 'Delete Account'}</Text>
                  <Text style={styles.settingValue}>{t('delete_account_desc') || 'Permanently delete your account and data'}</Text>
                </View>
              </View>
              <MaterialIcons name={showDeleteAccount ? 'expand-less' : 'expand-more'} size={24} color="#CCC" />
            </TouchableOpacity>
            {showDeleteAccount && (
              <View style={styles.trialCodeContainer}>
                <Text style={{ fontSize: 12, color: '#666', marginBottom: 10, lineHeight: 18 }}>
                  {t('delete_account_warning_1') || 'Deleting your account deactivates it immediately and permanently removes your personal data after a 30-day grace period.'}
                  {user?.role === 'teacher' ? ' ' + (t('delete_account_warning_teacher') || 'Your classrooms and students will be reassigned to your school (requires a linked school account — contact support if you\'re not linked to one).') : ''}
                  {' '}{t('delete_account_warning_2') || 'Confirm with your password, or with Google if that\'s how you sign in.'}
                </Text>
                <TextInput
                  style={styles.trialCodeInputWithIcon}
                  placeholder="Enter your password (if you have one)"
                  placeholderTextColor="#999"
                  value={deletePassword}
                  onChangeText={setDeletePassword}
                  secureTextEntry
                />
                <TouchableOpacity
                  style={[styles.redeemButton, { backgroundColor: '#F44336', marginTop: 10 }, deletingAccount && styles.redeemButtonDisabled]}
                  onPress={handleDeleteAccountConfirm}
                  disabled={deletingAccount}
                >
                  <Text style={styles.redeemButtonText}>{deletingAccount ? (t('processing') || 'Processing...') : (t('delete_account_btn') || 'Delete My Account')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        ) : (
          <View style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="delete-forever" size={24} color="#CCC" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{t('delete_account') || 'Delete Account'}</Text>
                <Text style={styles.settingValue}>{(t('delete_account_contact_support') || 'Contact {email} to close this account').replace('{email}', 'jono@classofhappiness.com')}</Text>
              </View>
            </View>
          </View>
        )}
      </View>

      {/* Logout */}
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <MaterialIcons name="logout" size={24} color="#F44336" />
        <Text style={styles.logoutText}>{t('logout')}</Text>
      </TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },
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
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
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
  settingSubValue: {
    fontSize: 12,
    color: '#888',
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
  switchRoleButton: {
    backgroundColor: '#5C6BC0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    marginHorizontal: 4,
  },
  switchRoleButtonDisabled: {
    backgroundColor: '#C5CAE9',
  },
  switchRoleButtonText: {
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
