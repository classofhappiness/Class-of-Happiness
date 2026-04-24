import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { ZONE_FACES } from '../src/components/ZoneButton';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user, login, t, hasActiveSubscription } = useApp();

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.appTitle} allowFontScaling={false}>Class of Happiness</Text>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => router.push('/settings')}>
            <MaterialIcons name="settings" size={24} color="#CCC" />
          </TouchableOpacity>
          {!isAuthenticated && (
            <TouchableOpacity style={styles.loginButton} onPress={login}>
              <MaterialIcons name="login" size={18} color="#5C6BC0" />
              <Text style={styles.loginButtonText}>{t('login') || 'Login'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('../assets/images/logo_coh.png')} style={styles.mainLogo} resizeMode="contain" />
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle} allowFontScaling={false}>{t('how_are_you_feeling') || 'How are you feeling today?'}</Text>

        {/* Zone emoji faces — decorative, sets the tone */}
        <View style={styles.zonePreviewRow}>
          {[
            { color: '#4A90D9', face: ZONE_FACES.blue },
            { color: '#4CAF50', face: ZONE_FACES.green },
            { color: '#FFC107', face: ZONE_FACES.yellow },
            { color: '#F44336', face: ZONE_FACES.red },
          ].map((z, i) => (
            <View key={i} style={[styles.zoneFaceContainer, { backgroundColor: z.color }]}>
              <Text style={styles.zoneFace}>{z.face}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.zoneTip}>Tap your colour to check in</Text>

        {/* STUDENT — hero button, much bigger */}
        <TouchableOpacity
          style={styles.studentButton}
          onPress={() => router.push('/student/select')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="child-care" size={44} color="white" />
          <View style={styles.studentButtonText}>
            <Text style={styles.studentButtonTitle} allowFontScaling={false}>{t('student') || 'Student'}</Text>
            <Text style={styles.studentButtonSub}>{t('check_in_feelings') || 'Check in my feelings'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Teacher + Parent — smaller, side by side */}
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleButton, styles.teacherButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              if (!hasActiveSubscription) { router.push('/subscription'); return; }
              router.push('/teacher/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="school" size={30} color="white" />
            <Text style={styles.roleButtonTitle}>{t('teacher') || 'Teacher'}</Text>
            {!isAuthenticated && <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.parentButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              if (!hasActiveSubscription) { router.push('/subscription'); return; }
              router.push('/parent/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="family-restroom" size={30} color="white" />
            <Text style={styles.roleButtonTitle}>{t('parent') || 'Parent'}</Text>
            {!isAuthenticated && <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>
        </View>

        {/* Trial button */}
        {!isAuthenticated && (
          <TouchableOpacity style={styles.trialButton} onPress={login}>
            <MaterialIcons name="card-giftcard" size={18} color="#4CAF50" />
            <Text style={styles.trialButtonText}>{t('trial') || 'Free Trial'} — {t('trial_desc') || 'No credit card needed'}</Text>
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={styles.footerSection}>
          <Text style={styles.copyrightText}>© 2025 Class of Happiness</Text>
          <TouchableOpacity style={styles.aboutButton} onPress={() => router.push('/about' as any)}>
            <MaterialIcons name="info-outline" size={14} color="#CCC" />
            <Text style={styles.aboutButtonText}>About & Privacy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#5C6BC0' },
  loadingText: { fontSize: 18, color: '#666', marginTop: 20 },

  topBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginBottom: 4 },
  topBarBtn: { padding: 8 },
  loginButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  loginButtonText: { fontSize: 14, fontWeight: '600', color: '#5C6BC0' },

  logoContainer: { alignItems: 'center', marginBottom: 4 },
  mainLogo: { width: 130, height: 130 },

  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 12, fontWeight: '500' },

  zonePreviewRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 6 },
  zoneFaceContainer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 3 },
  zoneFace: { fontSize: 22 },
  zoneTip: { fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 16 },

  // Student — hero button
  studentButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', borderRadius: 22, paddingVertical: 20, paddingHorizontal: 20, marginBottom: 12, elevation: 5, shadowColor: '#4CAF50', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  studentButtonText: { flex: 1, marginLeft: 14 },
  studentButtonTitle: { fontSize: 26, fontWeight: 'bold', color: 'white' },
  studentButtonSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 2 },

  // Teacher + Parent — side by side smaller
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  roleButton: { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 6, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  teacherButton: { backgroundColor: '#FFC107' },
  parentButton: { backgroundColor: '#4A90D9' },
  roleButtonTitle: { fontSize: 17, fontWeight: 'bold', color: 'white' },

  trialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, gap: 8, borderWidth: 1, borderColor: '#4CAF50', marginBottom: 12 },
  trialButtonText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },

  footerSection: { alignItems: 'center', paddingTop: 8 },
  copyrightText: { fontSize: 11, color: '#CCC' },
  aboutButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  aboutButtonText: { fontSize: 12, color: '#CCC' },
});
