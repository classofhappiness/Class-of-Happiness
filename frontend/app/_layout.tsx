import React, { useEffect, useState } from 'react';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Platform, TouchableOpacity, Text, TextInput, I18nManager } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { AppProvider, useApp } from '../src/context/AppContext';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SplashAnimation } from '../src/components/SplashAnimation';
import { ColourCycleLogo } from '../src/components/ColourCycleLogo';
import * as Notifications from 'expo-notifications';
import { isIncidentPushData, showIncidentAlert, registerNotifeeForegroundHandler } from '../src/utils/notifeeIncidents';

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
//
// Real fix Aug 29 (build-25 font-coverage item): rewritten to RESET from a fixed base style
// on every call rather than prepending - the original only ever ran once (on font load), so
// prepending was harmless, but it's now called again on every language change (see AppContent
// below), and repeated prepends would have grown the style array forever. fontFamily
// undefined means "don't force one" - Android then falls back to its own system font for
// hi/zh/ar/ru, which actually cover Devanagari/CJK/Arabic/Cyrillic glyphs (Nunito doesn't,
// and unlike iOS's CoreText, Android's fallback for a custom-loaded Typeface isn't reliably
// automatic - confirmed no bundled fallback font exists for these scripts either).
const BASE_TEXT_STYLE = {};
function setDefaultFont(fontFamily: string | undefined) {
  const style = fontFamily ? { fontFamily } : BASE_TEXT_STYLE;
  const TextAny = Text as any;
  TextAny.defaultProps = TextAny.defaultProps || {};
  TextAny.defaultProps.style = style;
  const TextInputAny = TextInput as any;
  TextInputAny.defaultProps = TextInputAny.defaultProps || {};
  TextInputAny.defaultProps.style = style;
}

// Scripts Nunito doesn't cover - see COH-REVIEW-PLAN.md build-25 font-coverage audit.
const NON_LATIN_LANGS = ['hi', 'zh', 'ar', 'ru'];

WebBrowser.maybeCompleteAuthSession();

// Header component with back button and logo
//
// Real fix Sep 14 (Marisa build-26, S04, confirmed against her actual screenshots): the
// top-left back pill and top-right home pill are dark, and the icons inside them were the
// same dark tone as the pill itself (near-invisible) plus slightly off-centre. Icons now
// white for real contrast against the dark fill; switched "arrow-back-ios" (an icon drawn
// with built-in asymmetric padding for sitting next to a text label) to plain "arrow-back",
// which is visually symmetric and centres cleanly with no manual offset needed. The logo
// itself and the phone's own status bar/status island are untouched - not part of this fix.
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
          <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      )}

    </View>
  );
};

// Inner component that hides splash once app is ready
function AppContent() {
  const { isLoading, isAuthenticated, user, language } = useApp();
  const router = useRouter();
  const pathname = usePathname();

  // Real fix Aug 29 (build-25): AppContent is inside AppProvider, so it's the first place
  // with real access to `language` - RootLayout below (where fonts first load) sits outside
  // the provider and only ever sees the font-ready signal, not the language. This re-runs on
  // every language change (not just once at startup) because `language` is in the effect's
  // dependency array - confirmed AppContext.Provider's value object is rebuilt every render
  // and includes both `language` and `translations`, so every screen calling useApp() (42/45
  // screens directly; the other 2 are thin wrappers around a component that itself calls
  // useApp()) re-renders and picks up the current defaultProps the moment language changes -
  // no separate "force remount" step needed.
  useEffect(() => {
    if (Platform.OS === 'android' && NON_LATIN_LANGS.includes(language)) {
      setDefaultFont(undefined);
    } else {
      setDefaultFont('Nunito');
    }
  }, [language]);
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

  // Real product fix Sep 12: registration email verification - same shape as the
  // has_password gate just above. Every existing account defaults email_verified=true (see
  // _public_user's backend docstring), so this only ever fires for a NEW email/password
  // signup that hasn't confirmed its code yet.
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) return;
    if ((user as any).email_verified === false && pathname !== '/auth/verify-email-required') {
      router.replace('/auth/verify-email-required' as any);
    }
  }, [isLoading, isAuthenticated, user, pathname]);

  // Real feature Sep 11 (build 27, Phase 1 completion - the notifee incident-ring work):
  // Notifications.addNotificationReceivedListener only fires while the app is in the
  // FOREGROUND - this is deliberately the first, simplest case to get right and the one
  // Jono's device ring-test should check first (see notifeeIncidents.ts's own top-of-file
  // note on what's confirmed vs. not for a backgrounded/killed app). A normal (non-
  // incident) push is left alone here - expo-notifications' own setNotificationHandler
  // already shows those; this only intercepts the specific incident shape and hands it to
  // notifee for the full-screen/looping treatment instead.
  // Real bug fix Sep 18 (live-test: tapping a real incident notification opened the app
  // but never navigated to Support Requests). Root cause, confirmed via a full read of
  // every notification-handling code path: neither this file nor notifeeIncidents.ts had
  // ANY navigation logic at all - addNotificationReceivedListener only fires on RECEIPT
  // (foreground only) and never on tap; notifee's own onForegroundEvent PRESS handler only
  // cancelled the notification. The one API that actually handles a tap regardless of
  // foreground/background/killed state - addNotificationResponseReceivedListener - was
  // simply never registered. Routes by the CURRENT logged-in user's role (not guessed from
  // the payload), matching where each role's own Support Requests view actually lives:
  // teacher sent it (support-request.tsx already supports ?viewId= to jump straight to a
  // specific request's status); school_admin/admin/superadmin receive it (admin/dashboard's
  // support_requests tab, now deep-linkable via ?tab= - see that screen's own fix).
  const navigateToSupportRequest = (requestId: string) => {
    if (!requestId) return;
    const role = user?.role;
    if (role === 'teacher') {
      router.push(`/teacher/support-request?viewId=${requestId}` as any);
    } else if (role === 'school_admin' || role === 'admin' || role === 'superadmin') {
      // Real feature Sep 18 (Jono's explicit call): fromIncident=1 skips admin/dashboard's
      // own local admin-code re-entry screen for this one deep-link, urgency outweighing
      // that local factor - see that screen's own matching comment for exactly what this
      // does and doesn't affect (server-side auth is untouched either way).
      router.push('/admin/dashboard?tab=support_requests&fromIncident=1' as any);
    }
    // Other roles (parent, student, kiosk) are never a support_request recipient/sender
    // today - no destination to send them to, so no-op rather than a wrong guess.
  };

  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((event) => {
      const data = event.request.content.data as Record<string, any> | undefined;
      if (isIncidentPushData(data)) {
        showIncidentAlert({
          requestId: String(data?.id || ''),
          title: event.request.content.title || '🚨 Incident',
          body: event.request.content.body || 'An incident needs immediate attention.',
        });
      }
    });
    // Real addition Sep 18: THE actual tap handler - fires on a genuine user tap on any
    // support_request push (standard buzz or incident alike), independent of whether the
    // app was foregrounded, backgrounded, or killed when it arrived - unlike
    // addNotificationReceivedListener above, which only ever covers receipt while
    // foregrounded.
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (data?.type === 'support_request' && data?.id) {
        navigateToSupportRequest(String(data.id));
      }
    });
    const unsubscribeForeground = registerNotifeeForegroundHandler(navigateToSupportRequest);
    return () => {
      sub.remove();
      responseSub.remove();
      unsubscribeForeground();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // Real bug fix Sep 18 (live-test, immediately after the tap-navigation fix above):
  // tapping a notification that COLD-LAUNCHES a fully killed app doesn't navigate either -
  // confirmed live (Jono's dev-client had been killed while the phone was locked; unlocking
  // restarted it, and the tap that triggered that restart went nowhere). This is a real,
  // documented expo-notifications gap, not a mistake in the fix above:
  // addNotificationResponseReceivedListener only catches responses that occur AFTER it's
  // registered - a tap that launches the app from fully killed happens before any JS has
  // booted, so that listener structurally cannot see it. getLastNotificationResponseAsync()
  // is Expo's own answer to exactly this - the response that caused THIS launch, checked
  // once on startup. Deliberately only clears it after a successful navigate (role
  // resolved to a real destination) - if `user` isn't loaded yet on the very first check,
  // this effect re-runs once `user?.role` settles and gets the same cached response again,
  // rather than racing app startup and silently dropping a real cold-launch tap.
  useEffect(() => {
    if (!user?.role) return;
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as Record<string, any> | undefined;
      if (data?.type === 'support_request' && data?.id) {
        navigateToSupportRequest(String(data.id));
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#F8F9FA',
          },
          headerTintColor: '#333',
          // Real fix Sep 15 (Marisa build-26 round 2, Group A): native-stack defaults
          // headerTitleAlign to 'left' on Android (iOS already centers) - only
          // parent/dashboard had this set individually, so every other native-header screen
          // (Settings included) rendered its title crammed left, right next to the header
          // button, reading as "misaligned" once that button became a larger black circle.
          // Set once, globally, instead of per-screen.
          headerTitleAlign: 'center',
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
          // RTL: a new screen should still slide in from the reading-start edge -
          // when I18nManager.isRTL is true (Arabic, once phase 2 activates it),
          // that's the right edge, so the transition flips too.
          animation: Platform.OS === 'ios' ? (I18nManager.isRTL ? 'slide_from_left' : 'slide_from_right') : 'default',
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
          name="auth/verify-email-required"
          options={{
            headerShown: false,
            title: 'Verify Email',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="settings"
          options={{
            title: 'Settings',
            headerBackTitle: 'Back',
            headerRight: () => <HomeToDashboard />,
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
            headerShown: false,
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
            title: 'Create Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="profiles/edit"
          options={{
            headerShown: false,
            title: 'Edit Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="teacher/dashboard"
          options={{
            headerShown: false,
            title: 'Teacher Dashboard',
            headerBackTitle: 'Home',
          }}
        />
        <Stack.Screen
          name="teacher/alerts"
          options={{
            headerShown: false,
            title: 'Student Alerts',
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
            headerTitleStyle: { fontWeight: '700' },
            headerRight: () => <HomeToDashboard />,
          }}
        />
        <Stack.Screen
          name="parent/alerts"
          options={{
            headerShown: false,
            title: 'Family Alerts',
          }}
        />
        <Stack.Screen
          name="parent/my-wellbeing"
          options={{
            headerShown: false,
            title: 'My Wellbeing',
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
        <Stack.Screen
          name="teacher/support-request"
          options={{
            headerShown: false,
            title: 'Support Request',
          }}
        />
        <Stack.Screen
          name="kiosk/index"
          options={{
            headerShown: false,
            title: 'Kiosk',
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
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 6,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 30,
    height: 30,
    marginRight: 8,
  },
  // Real fix Sep 15 (Marisa build-26 round 2, Group A): was 32x32 - a different size from
  // backButton's 36x36, so back and home read as two different-sized buttons despite being
  // the same visual pattern. Unified to match.
  headerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
});


// HomeButton component - uses its own router hook so it works in Stack options
//
// Real fix Sep 14 (Marisa build-26, S04, confirmed against her actual screenshots) - see
// HeaderWithBackAndLogo's note above. Home icon sits in a dark pill matching the back button.
// Real fix Sep 15 (Marisa build-26 round 2, Group A): logo was a plain 22x22 image, visually
// tiny next to a 36x36 button circle - enlarged to 32x32 (contain-fit, so it doesn't distort)
// to actually read as comparable weight next to the button beside it, per her explicit ask.
// Real fix Sep 18 (Marisa design feedback - reverted same day): back to the original,
// non-inverted logo art, no black circle backing (see TranslatedHeader's matching comment
// for the full rationale) - keeps the 48.4px size (134.5%) reached during that detour.
function HomeToStudents() {
  const r = useRouter();
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginRight:12 }}>
      <ColourCycleLogo size={48.4} loop />
      <TouchableOpacity onPress={() => r.replace('/')} style={styles.headerCircle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialIcons name="home" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

function HomeToDashboard() {
  const r = useRouter();
  return (
    <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginRight:12 }}>
      <ColourCycleLogo size={48.4} loop />
      <TouchableOpacity onPress={() => r.replace('/')} style={styles.headerCircle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <MaterialIcons name="home" size={20} color="#FFFFFF" />
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
