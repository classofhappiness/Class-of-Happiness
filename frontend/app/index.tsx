import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { ZONE_FACES } from '../src/components/ZoneButton';
import { EMOTION_COLOURS } from '../src/constants/emotionColours';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user, login, t, hasActiveSubscription } = useApp();

  // Real bug fix Aug 28 (item 5): a parent account is genuinely on a lower-tier plan than
  // teacher (confirmed in server.py's SUBSCRIPTION_PLANS: parent_monthly is priced below
  // teacher_monthly) and has no real access to Teacher Dashboard - teacher/dashboard.tsx's
  // own guard already correctly blocks it, this just makes that visible before the tap
  // instead of after a confusing silent redirect.
  const teacherLocked = isAuthenticated && user?.role === 'parent';

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
            { color: EMOTION_COLOURS.blue, face: ZONE_FACES.blue },
            { color: EMOTION_COLOURS.green, face: ZONE_FACES.green },
            { color: EMOTION_COLOURS.yellow, face: ZONE_FACES.yellow },
            { color: EMOTION_COLOURS.red, face: ZONE_FACES.red },
          ].map((z, i) => (
            <View key={i} style={[styles.zoneFaceContainer, { backgroundColor: z.color }]}>
              <Text style={styles.zoneFace}>{z.face}</Text>
            </View>
          ))}
        </View>
        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, marginBottom:16}}>
          <Text style={{fontSize:12, fontStyle:'italic', color:'#000', fontWeight:'400'}}>Select below to begin</Text>
          <Text style={{fontSize:13, color:'#000'}}>↓</Text>
        </View>

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
            style={[styles.roleButton, styles.teacherButton, teacherLocked && styles.roleButtonLocked]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              // Real bug fix Aug 28 (item 5): a parent account tapping this previously
              // navigated straight to /teacher/dashboard, which then silently redirected to
              // /parent/dashboard (the guard was working correctly - see teacher/dashboard.tsx)
              // - but from the user's side that just looks like the button did something
              // confusing rather than clearly communicating "not available on your account".
              // Now locked and explained up front instead, matching the existing
              // not-logged-in lock treatment, extended to "logged in as the wrong role".
              if (teacherLocked) {
                Alert.alert(
                  t('teacher_dashboard_locked_title') || 'Teacher Dashboard',
                  t('teacher_dashboard_locked_desc') || "This is only available on a teacher account. You're logged in as a parent."
                );
                return;
              }
              router.push('/teacher/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="school" size={26} color="white" />
            <View style={{alignItems:'center'}}>
              <Text style={styles.roleButtonTitle}>{t('teacher') || 'Teacher'}</Text>
              <Text style={{fontSize:10, color:'#1A1A2E', fontStyle:'italic', fontWeight:'600', textAlign:'center', marginTop:1, lineHeight:14, opacity:0.95}}>{'Teachers Dashboard — support your students here'}</Text>
            </View>
            {(!isAuthenticated || teacherLocked) && <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.parentButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              router.push('/parent/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="family-restroom" size={26} color="white" />
            <View style={{alignItems:'center'}}>
              <Text style={styles.roleButtonTitle}>{t('parent') || 'Parent'}</Text>
              <Text style={{fontSize:10, color:'#1A1A2E', fontStyle:'italic', fontWeight:'600', textAlign:'center', marginTop:1, lineHeight:14, opacity:0.95}}>{'Family Dashboard — support your family here'}</Text>
            </View>
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
          <Text style={styles.copyrightText}>© 2026 Class of Happiness</Text>
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
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#5C6BC0' },
  loadingText: { fontSize: 18, color: '#666', marginTop: 20 },

  topBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginBottom: 4 },
  topBarBtn: { padding: 8 },
  loginButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, gap: 6, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  loginButtonText: { fontSize: 14, fontWeight: '600', color: '#5C6BC0' },

  logoContainer: { alignItems: 'center', marginBottom: 12, marginTop: 0 },
  mainLogo: { width: 140, height: 150 },

  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 14, fontWeight: '500' },

  zonePreviewRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 },
  zoneFaceContainer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  zoneFace: { fontSize: 22 },
  zoneTip: { fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 28 },

  // Student — hero button
  studentButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', borderRadius: 22, paddingVertical: 20, paddingHorizontal: 20, marginBottom: 10 },
  studentButtonText: { flex: 1, marginLeft: 14 },
  studentButtonTitle: { fontSize: 26, fontWeight: '900', color: '#1A1A2E' },
  studentButtonSub: { fontSize: 13, color: '#1A1A2E', marginTop: 2, fontStyle: 'italic', fontWeight: '600', opacity: 0.95 },

  // Teacher + Parent — side by side smaller
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 0, marginTop: 0 },
  roleButton: { flex: 1, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 4 },
  teacherButton: { backgroundColor: '#FFC107', elevation: 0 },
  parentButton: { backgroundColor: '#4A90D9', elevation: 0 },
  // Real feature Aug 28 (item 5): visually lighter/disabled treatment for a button that's
  // genuinely unavailable on the current account, distinct from the normal not-yet-tapped
  // state - opacity alone (rather than a colour swap) keeps it recognisably the same button,
  // just clearly inactive.
  roleButtonLocked: { opacity: 0.45 },
  roleButtonTitle: { fontSize: 17, fontWeight: '900', color: '#1A1A2E' },

  trialButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, gap: 8, borderWidth: 1, borderColor: '#4CAF50', marginTop: 12, marginBottom: 0 },
  trialButtonText: { fontSize: 13, fontWeight: '600', color: '#4CAF50' },

  footerSection: { alignItems: 'center', paddingTop: 24, marginTop: 'auto' },
  copyrightText: { fontSize: 11, color: '#CCC' },
  aboutButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  aboutButtonText: { fontSize: 12, color: '#CCC' },
});
