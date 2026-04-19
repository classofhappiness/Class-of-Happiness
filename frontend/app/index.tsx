import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';

const { width, height } = Dimensions.get('window');

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

  const handleTeacher = () => {
    if (!isAuthenticated) { login(); return; }
    if (!hasActiveSubscription) { router.push('/subscription'); return; }
    router.push('/teacher/dashboard');
  };

  const handleParent = () => {
    if (!isAuthenticated) { login(); return; }
    if (!hasActiveSubscription) { router.push('/subscription'); return; }
    router.push('/parent/dashboard');
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>

      {/* Top bar — settings + login */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.push('/about' as any)}>
          <MaterialIcons name="info-outline" size={22} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.push('/settings')}>
          <MaterialIcons name="settings" size={22} color="#666" />
        </TouchableOpacity>
        {!isAuthenticated && (
          <TouchableOpacity style={styles.loginBtn} onPress={login}>
            <MaterialIcons name="login" size={18} color="#5C6BC0" />
            <Text style={styles.loginBtnText}>{t('login') || 'Login'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Logo + tagline */}
      <View style={styles.logoSection}>
        <Image
          source={require('../assets/images/logo_coh.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>{t('how_are_you_feeling') || 'How are you feeling?'}</Text>
      </View>

      {/* Role buttons — fill remaining space */}
      <View style={styles.rolesSection}>
        <Text style={styles.rolePrompt}>{t('i_am_a') || 'I am a...'}</Text>

        {/* Student */}
        <TouchableOpacity
          style={[styles.roleBtn, styles.studentBtn]}
          onPress={() => router.push('/student/select')}
          activeOpacity={0.85}
        >
          <View style={styles.roleBtnLeft}>
            <Text style={styles.roleBtnEmoji}>🧒</Text>
            <View>
              <Text style={styles.roleBtnTitle}>{t('student') || 'Student'}</Text>
              <Text style={styles.roleBtnSub}>{t('check_in_feelings') || 'Check in my feelings'}</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.8)" />
        </TouchableOpacity>

        {/* Teacher */}
        <TouchableOpacity
          style={[styles.roleBtn, styles.teacherBtn]}
          onPress={handleTeacher}
          activeOpacity={0.85}
        >
          <View style={styles.roleBtnLeft}>
            <Text style={styles.roleBtnEmoji}>👩‍🏫</Text>
            <View>
              <Text style={styles.roleBtnTitle}>{t('teacher') || 'Teacher'}</Text>
              <Text style={styles.roleBtnSub}>{t('view_progress') || 'View class progress'}</Text>
            </View>
          </View>
          <View style={styles.roleBtnRight}>
            {!isAuthenticated && (
              <View style={styles.loginBadge}>
                <MaterialIcons name="lock" size={12} color="rgba(255,255,255,0.9)" />
              </View>
            )}
            <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.8)" />
          </View>
        </TouchableOpacity>

        {/* Parent / Family */}
        <TouchableOpacity
          style={[styles.roleBtn, styles.parentBtn]}
          onPress={handleParent}
          activeOpacity={0.85}
        >
          <View style={styles.roleBtnLeft}>
            <Text style={styles.roleBtnEmoji}>👨‍👩‍👧</Text>
            <View>
              <Text style={styles.roleBtnTitle}>{t('parent') || 'Parent / Family'}</Text>
              <Text style={styles.roleBtnSub}>{t('your_family_emotions') || 'Family check-ins'}</Text>
            </View>
          </View>
          <View style={styles.roleBtnRight}>
            {!isAuthenticated && (
              <View style={styles.loginBadge}>
                <MaterialIcons name="lock" size={12} color="rgba(255,255,255,0.9)" />
              </View>
            )}
            <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.8)" />
          </View>
        </TouchableOpacity>

        {/* Trial button — only when not logged in */}
        {!isAuthenticated && (
          <TouchableOpacity style={styles.trialBtn} onPress={login}>
            <MaterialIcons name="card-giftcard" size={18} color="#4CAF50" />
            <Text style={styles.trialBtnText}>{t('trial') || 'Free Trial'} — {t('trial_desc') || 'No credit card needed'}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <Text style={styles.copyright}>© 2025 Class of Happiness</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#5C6BC0',
    marginBottom: 16,
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  topBarBtn: {
    padding: 8,
  },
  loginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    marginLeft: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  loginBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C6BC0',
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  logo: {
    width: 90,
    height: 90,
  },
  tagline: {
    fontSize: 15,
    color: '#888',
    marginTop: 4,
    fontWeight: '500',
  },

  // Roles
  rolesSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 10,
    justifyContent: 'center',
  },
  rolePrompt: {
    fontSize: 18,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
    marginBottom: 4,
  },
  roleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
  },
  studentBtn: { backgroundColor: '#4CAF50' },
  teacherBtn: { backgroundColor: '#FFC107' },
  parentBtn: { backgroundColor: '#4A90D9' },
  roleBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  roleBtnEmoji: {
    fontSize: 34,
  },
  roleBtnTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  roleBtnSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  roleBtnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  loginBadge: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: 4,
  },

  // Trial
  trialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 20,
    paddingVertical: 12,
    paddingHorizontal: 20,
    gap: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
    marginTop: 4,
  },
  trialBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },

  // Footer
  copyright: {
    fontSize: 11,
    color: '#CCC',
    textAlign: 'center',
    paddingBottom: 8,
  },
});
