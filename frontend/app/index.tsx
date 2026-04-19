import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { ZONE_FACES } from '../src/components/ZoneButton';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user, login, t, hasActiveSubscription } = useApp();

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.appTitle}>Class of Happiness</Text>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Settings + Login */}
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => router.push('/settings')}
          >
            <MaterialIcons name="settings" size={26} color="#666" />
          </TouchableOpacity>
          {isAuthenticated ? (
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <MaterialIcons name="settings" size={24} color="#666" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.loginButton}
              onPress={login}
            >
              <MaterialIcons name="login" size={20} color="#5C6BC0" />
              <Text style={styles.loginButtonText}>{t('login')}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logo_coh.png')}
            style={styles.mainLogo}
            resizeMode="contain"
          />
        </View>

        {/* Title */}
        <View style={styles.header}>
          <Text style={styles.subtitle}>{t('how_are_you_feeling')}</Text>
        </View>

        {/* Zone Preview */}
        <View style={styles.zonePreviewContainer}>
          <View style={styles.zonePreviewRow}>
            <View style={[styles.zoneFaceContainer, { backgroundColor: '#4A90D9' }]}>
              <Text style={styles.zoneFace}>{ZONE_FACES.blue}</Text>
            </View>
            <View style={[styles.zoneFaceContainer, { backgroundColor: '#4CAF50' }]}>
              <Text style={styles.zoneFace}>{ZONE_FACES.green}</Text>
            </View>
            <View style={[styles.zoneFaceContainer, { backgroundColor: '#FFC107' }]}>
              <Text style={styles.zoneFace}>{ZONE_FACES.yellow}</Text>
            </View>
            <View style={[styles.zoneFaceContainer, { backgroundColor: '#F44336' }]}>
              <Text style={styles.zoneFace}>{ZONE_FACES.red}</Text>
            </View>
          </View>
        </View>

        {/* Role Selection */}
        <View style={styles.roleContainer}>
          <Text style={styles.roleTitle}>{t('i_am_a')}</Text>

          <TouchableOpacity
            style={[styles.roleButton, styles.studentButton]}
            onPress={() => router.push('/student/select')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="child-care" size={36} color="white" />
            <Text style={styles.roleButtonText}>{t('student')}</Text>
            <Text style={styles.roleButtonSubtext}>{t('check_in_feelings')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.teacherButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); }
              else if (!hasActiveSubscription) { router.push('/subscription'); }
              else { router.push('/teacher/dashboard'); }
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="school" size={36} color="white" />
            <Text style={styles.roleButtonText}>{t('teacher')}</Text>
            <Text style={styles.roleButtonSubtext}>{t('view_progress')}</Text>
            {!isAuthenticated && (
              <View style={styles.loginBadge}>
                <Text style={styles.loginBadgeText}>{t('login_required')}</Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.parentButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); }
              else if (!hasActiveSubscription) { router.push('/subscription'); }
              else { router.push('/parent/dashboard'); }
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="family-restroom" size={36} color="white" />
            <Text style={styles.roleButtonText}>{t('parent')}</Text>
            <Text style={styles.roleButtonSubtext}>{t('your_family_emotions')}</Text>
            {!isAuthenticated && (
              <View style={styles.loginBadge}>
                <Text style={styles.loginBadgeText}>{t('login_required')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Trial Link */}
        {!isAuthenticated && (
          <View style={styles.trialSection}>
            <TouchableOpacity style={styles.trialButton} onPress={login}>
              <MaterialIcons name="card-giftcard" size={20} color="#4CAF50" />
              <Text style={styles.trialButtonText}>{t('trial')} - {t('trial_desc')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footerSection}>
          <Text style={styles.copyrightText}>© 2025 Class of Happiness</Text>
          <TouchableOpacity
            style={styles.aboutButton}
            onPress={() => router.push('/about' as any)}
          >
            <MaterialIcons name="info-outline" size={16} color="#999" />
            <Text style={styles.aboutButtonText}>About & Privacy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#5C6BC0', marginBottom: 16 },
  loadingText: { fontSize: 18, color: '#666', marginTop: 20 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 4 },
  settingsButton: { padding: 8 },
  loginButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, gap: 6, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  loginButtonText: { fontSize: 14, fontWeight: '600', color: '#5C6BC0' },
  logoContainer: { alignItems: 'center', marginBottom: 8 },
  mainLogo: { width: 140, height: 140 },
  header: { alignItems: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, color: '#666', textAlign: 'center' },
  zonePreviewContainer: { marginBottom: 12 },
  zonePreviewRow: { flexDirection: 'row', justifyContent: 'center', gap: 12 },
  zoneFaceContainer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
  zoneFace: { fontSize: 22 },
  roleContainer: { gap: 8 },
  roleTitle: { fontSize: 20, fontWeight: '600', color: '#333', textAlign: 'center', marginBottom: 6 },
  roleButton: { borderRadius: 20, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5 },
  studentButton: { backgroundColor: '#4CAF50' },
  teacherButton: { backgroundColor: '#FFC107' },
  parentButton: { backgroundColor: '#4A90D9' },
  roleButtonText: { fontSize: 22, fontWeight: 'bold', color: 'white', marginTop: 4 },
  roleButtonSubtext: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 2 },
  loginBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 4 },
  loginBadgeText: { fontSize: 12, color: 'white' },
  trialSection: { marginTop: 12, alignItems: 'center' },
  trialButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, gap: 8, borderWidth: 1, borderColor: '#4CAF50' },
  trialButtonText: { fontSize: 14, fontWeight: '600', color: '#4CAF50' },
  footerSection: { marginTop: 12, alignItems: 'center', paddingBottom: 8 },
  copyrightText: { fontSize: 12, color: '#999', marginBottom: 4 },
  aboutButton: { flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8 },
  aboutButtonText: { fontSize: 14, color: '#999' },
});
