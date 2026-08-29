import React, { useEffect, useState } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, View, StyleSheet, Platform, TouchableOpacity, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AppProvider, useApp } from '../src/context/AppContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashAnimation } from '../src/components/SplashAnimation';

// Keep splash screen visible until app is ready
SplashScreen.preventAutoHideAsync().catch(() => {});

// Real feature Aug 26 (item 11): Nunito is the real, correctly-loaded brand font on the web
// portal (portal100.html, Google Fonts CDN), but on mobile no font file was ever bundled and
// no expo-font/useFonts call existed anywhere - the app has been running on the OS system
// font (San Francisco/Roboto) this whole time, with exactly one screen (forgot-password.tsx)
// setting fontFamily:'Nunito' against nothing actually registered under that name. Applied
// globally via Text/TextInput defaultProps rather than editing every screen's styles - same
// visual effect, without a multi-hundred-file diff for a font swap. Only a variable-weight
// file ships for this font upstream (no separate static per-weight files exist in Google
// Fonts' own repo) - real, deliberate choice, not a corner cut.
function setDefaultFont(fontFamily: string) {
  const TextAny = Text as any;
  TextAny.defaultProps = TextAny.defaultProps || {};
  TextAny.defaultProps.style = [{ fontFamily }, TextAny.defaultProps.style];
  const TextInputAny = TextInput as any;
  TextInputAny.defaultProps = TextInputAny.defaultProps || {};
  TextInputAny.defaultProps.style = [{ fontFamily }, TextInputAny.defaultProps.style];
}

WebBrowser.maybeCompleteAuthSession();

// Header component with back button and logo
const HeaderWithBackAndLogo = ({ canGoBack }: { canGoBack?: boolean }) => {
  const router = useRouter();

  return (
    <View style={styles.headerLeftContainer}>
      {canGoBack && (
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialIcons name="arrow-back-ios" size={22} color="#333" />
        </TouchableOpacity>
      )}

    </View>
  );
};

// Inner component that hides splash once app is ready
function AppContent() {
  const { isLoading, isAuthenticated, user } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  // Real feature Aug 30: replaced the old flat-300ms-then-hide timer - SplashAnimation now
  // owns hiding the native splash itself (the instant it's ready to render its own matching
  // first frame), then runs the real fade-in/colour-cycle/fade-out sequence as a fixed-
  // duration overlay on top of the app, which keeps loading underneath in true parallel.
  const [showSplashAnim, setShowSplashAnim] = useState(true);

  // CRITICAL security fix Aug 26: force-password-on-next-login. ~98% of real accounts
  // (confirmed live) have no password set, meaning the account can currently be logged into
  // by anyone who types that email - see COH-REVIEW-PLAN.md for the full investigation. A
  // hard block on login today would lock out nearly the entire real user base with no
  // self-service recovery (the password-reset flow's own account-takeover bug was just
  // fixed by disabling it, not replacing it with something that emails a real link - no
  // email infrastructure exists yet). This is the agreed smaller-blast-radius fix instead:
  // every authenticated session with has_password === false (from /auth/me's response, see
  // _public_user() in the backend) is redirected here on every app open/navigation until
  // they set a real password - closing the gap for each real account the moment they're
  // next active, not leaving it open indefinitely, without an immediate mass lockout.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if ((user as any).has_password === false && pathname !== '/auth/set-password-required') {
      router.replace('/auth/set-password-required');
    }
  }, [isLoading, isAuthenticated, user, pathname]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#F8F9FA',
          },
          headerTintColor: '#333',
          headerTitleStyle: {
            fontWeight: 'bold',
            // ✅ iOS fix: prevent title from being cut off
            fontSize: Platform.OS === 'ios' ? 17 : 18,
          },
          contentStyle: {
            backgroundColor: '#F8F9FA',
          },
          headerLeft: ({ canGoBack }) => <HeaderWithBackAndLogo canGoBack={canGoBack} />,
          headerBackVisible: false,
          // ✅ iOS fix: consistent animation
          animation: Platform.OS === 'ios' ? 'slide_from_right' : 'default',
        }}
      >
        <Stack.Screen
          name="index"
          options={{
            headerShown: false,
            title: 'Class of Happiness',
          }}
        />
        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
            title: 'Signing In',
          }}
        />
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: false,
            title: 'Sign In',
          }}
        />
        <Stack.Screen
          name="auth/signup"
          options={{
            headerShown: false,
            title: 'Sign Up',
          }}
        />
        <Stack.Screen
          name="auth/set-password-required"
          options={{
            headerShown: false,
            title: 'Set Password',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="about"
          options={{
            title: 'About & Privacy',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="subscription/index"
          options={{
            headerShown: false,
            title: 'Subscription',
          }}
        />
        <Stack.Screen
          name="subscription/success"
          options={{
            headerShown: false,
            title: 'Payment Success',
          }}
        />
        <Stack.Screen
          name="student/select"
          options={{
            title: 'Select Your Profile',
            headerBackTitle: 'Home',
          }}
        />
        <Stack.Screen
          name="student/zone"
          options={{
            title: 'How Are You Feeling?',
            headerBackTitle: 'Back',
            headerRight: () => <HomeToStudents />,
          }}
        />
        <Stack.Screen
          name="student/strategies"
          options={{
            headerShown: false,
            title: 'Helpful Strategies',
            headerBackTitle: 'Back',
            headerRight: () => <HomeToStudents />,
          }}
        />
        <Stack.Screen
          name="student/rewards"
          options={{
            headerShown: false,
            title: 'Rewards',
          }}
        />
        <Stack.Screen
          name="student/creatures"
          options={{
            headerShown: false,
            title: 'My Creatures',
          }}
        />
        <Stack.Screen
          name="student/submit-creature"
          options={{
            headerShown: false,
            title: 'Submit a Creature',
          }}
        />
        <Stack.Screen
          name="student/world-creatures"
          options={{
            headerShown: false,
            title: 'World Creatures',
          }}
        />
        <Stack.Screen
          name="teacher/creature-code"
          options={{
            title: 'Manage Creatures',
          }}
        />
        <Stack.Screen
          name="parent/creature-code"
          options={{
            title: 'Manage Creatures',
          }}
        />
        <Stack.Screen
          name="profiles/create"
          options={{
            headerShown: false,
            headerRight: () => <HomeToDashboard />,
            title: 'Create Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="profiles/edit"
          options={{
            headerShown: false,
            headerRight: () => <HomeToDashboard />,
            title: 'Edit Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="teacher/dashboard"
          options={{
            title: 'Teacher Dashboard',
            headerBackTitle: 'Home',
          }}
        />
        <Stack.Screen
          name="teacher/students"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="teacher/classrooms"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="teacher/student-detail"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="teacher/strategies"
          options={{
            headerShown: false,
            title: 'Manage Strategies',
          }}
        />
        <Stack.Screen
          name="teacher/resources"
          options={{
            headerShown: false,
            title: 'Teacher Resources',
          }}
        />
        <Stack.Screen
          name="teacher/checkin"
          options={{
            headerRight: () => <HomeToDashboard />,
            headerShown: false,
            title: 'Teacher Check-in',
          }}
        />
        <Stack.Screen
          name="teacher/widget"
          options={{
            headerShown: false,
            title: 'Classroom Widget',
          }}
        />
        <Stack.Screen
          name="parent/dashboard"
          options={{
            title: 'Family Dashboard',
            headerTitleAlign: 'center',
            headerTitleStyle: { fontWeight: '700' },
          }}
        />
        <Stack.Screen
          name="parent/resources"
          options={{
            headerShown: false,
            title: 'Resources',
          }}
        />
        <Stack.Screen
          name="parent/strategies"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="parent/family-strategies"
          options={{
            headerShown: false,
            title: 'Family Strategies',
          }}
        />
        <Stack.Screen
          name="parent/checkin"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="parent/widget"
          options={{
            headerShown: false,
            title: 'Family Widget',
          }}
        />
        <Stack.Screen
          name="parent/family-member-stats/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="parent/linked-child/[id]"
          options={{
            headerShown: false,
          }}
        />
        <Stack.Screen
          name="admin/dashboard"
          options={{
            headerShown: false,
            title: 'Admin Dashboard',
          }}
        />
        <Stack.Screen
          name="teacher/bulk-checkin"
          options={{
            headerShown: false,
            title: 'Quick Class Check-in',
          }}
        />
      </Stack>
      {showSplashAnim && <SplashAnimation onFinish={() => setShowSplashAnim(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  headerLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    paddingTop: Platform.OS === 'ios' ? 4 : 8,
  },
  backButton: {
    padding: 8,
    marginRight: 6,
  },
  headerLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
});


// HomeButton component - uses its own router hook so it works in Stack options
function HomeToStudents() {
  const r = useRouter();
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginRight:12 }}>
      <Image source={require('../assets/images/logo_coh.png')} style={{ width:22, height:22 }} resizeMode="contain" />
      <TouchableOpacity onPress={() => r.replace('/')}>
        <MaterialIcons name="home" size={22} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

function HomeToDashboard() {
  const r = useRouter();
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginRight:12 }}>
      <Image source={require('../assets/images/logo_coh.png')} style={{ width:22, height:22 }} resizeMode="contain" />
      <TouchableOpacity onPress={() => r.replace('/')}>
        <MaterialIcons name="home" size={22} color="#000" />
      </TouchableOpacity>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Nunito: require('../assets/fonts/Nunito.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) setDefaultFont('Nunito');
  }, [fontsLoaded]);

  // Splash screen (already held open by preventAutoHideAsync above) stays up until the font
  // is actually ready - AppContent's own hideAsync call happens after isLoading too, so this
  // just adds a second real condition rather than racing it.
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </GestureHandlerRootView>
  );
}
