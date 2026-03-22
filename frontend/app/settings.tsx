import React, { useState, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { translationsApi } from '../src/utils/api';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, language, setLanguage, logout, t, hasActiveSubscription, translations } = useApp();
  const [showLanguages, setShowLanguages] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<string | null>(null);

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
                {user?.subscription_status === 'trial' ? 'Free Trial' :
                 user?.subscription_status === 'active' ? `${user.subscription_plan || 'Active'}` :
                 'Inactive'}
              </Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#CCC" />
        </TouchableOpacity>
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

      {/* About & Legal */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
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
});
