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
          <Image
            source={require('../assets/images/logo_coh.png')}
            style={styles.splashLogo}
            resizeMode="contain"
          />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Header with Login */}
      <View style={styles.topBar}>
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
        <Text style={styles.title}>{t('zones_of_regulation')}</Text>
        <Text style={styles.subtitle}>{t('how_are_you_feeling')}</Text>
      </View>

      {/* Zone Preview - Faces with colors behind */}
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
          <MaterialIcons name="child-care" size={48} color="white" />
          <Text style={styles.roleButtonText}>{t('student')}</Text>
          <Text style={styles.roleButtonSubtext}>{t('check_in_feelings')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleButton, styles.teacherButton]}
          onPress={() => {
            if (!isAuthenticated) {
              login();
            } else if (!hasActiveSubscription) {
              router.push('/subscription');
            } else {
              router.push('/teacher/dashboard');
            }
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="school" size={48} color="white" />
          <Text style={styles.roleButtonText}>{t('teacher')}</Text>
          <Text style={styles.roleButtonSubtext}>{t('view_progress')}</Text>
          {!isAuthenticated && (
            <View style={styles.loginBadge}>
              <Text style={styles.loginBadgeText}>{t('login')} required</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.roleButton, styles.parentButton]}
          onPress={() => {
            if (!isAuthenticated) {
              login();
            } else if (!hasActiveSubscription) {
              router.push('/subscription');
            } else {
              router.push('/parent/dashboard');
            }
          }}
          activeOpacity={0.8}
        >
          <MaterialIcons name="family-restroom" size={48} color="white" />
          <Text style={styles.roleButtonText}>Parent</Text>
          <Text style={styles.roleButtonSubtext}>View child's progress</Text>
          {!isAuthenticated && (
            <View style={styles.loginBadge}>
              <Text style={styles.loginBadgeText}>{t('login')} required</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Trial Link for sharing */}
      {!isAuthenticated && (
        <View style={styles.trialSection}>
          <TouchableOpacity
            style={styles.trialButton}
            onPress={login}
          >
            <MaterialIcons name="card-giftcard" size={20} color="#4CAF50" />
            <Text style={styles.trialButtonText}>{t('trial')} - {t('trial_desc')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogo: {
    width: 200,
    height: 200,
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  settingsButton: {
    padding: 8,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  loginButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#5C6BC0',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  mainLogo: {
    width: 140,
    height: 140,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 6,
    textAlign: 'center',
  },
  zonePreviewContainer: {
    marginBottom: 24,
  },
  zonePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  zoneFaceContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  zoneFace: {
    fontSize: 26,
  },
  roleContainer: {
    flex: 1,
  },
  roleTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
  },
  roleButton: {
    borderRadius: 24,
    padding: 20,
    alignItems: 'center',
    marginVertical: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  studentButton: {
    backgroundColor: '#4CAF50',
  },
  teacherButton: {
    backgroundColor: '#FFC107',
  },
  parentButton: {
    backgroundColor: '#4A90D9',
  },
  roleButtonText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 8,
  },
  roleButtonSubtext: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  loginBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  loginBadgeText: {
    fontSize: 12,
    color: 'white',
  },
  trialSection: {
    marginTop: 20,
    alignItems: 'center',
  },
  trialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  trialButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
});
