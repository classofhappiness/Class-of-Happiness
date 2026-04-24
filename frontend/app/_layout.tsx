import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, View, StyleSheet, Platform, TouchableOpacity, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as SplashScreen from 'expo-splash-screen';
import { AppProvider, useApp } from '../src/context/AppContext';

// Keep splash screen visible until app is ready
SplashScreen.preventAutoHideAsync().catch(() => {});

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
      <Image
        source={require('../assets/images/logo_coh.png')}
        style={styles.headerLogo}
        resizeMode="contain"
      />
    </View>
  );
};

// Inner component that hides splash once app is ready
function AppContent() {
  const { isLoading } = useApp();

  useEffect(() => {
    if (!isLoading) {
      // Small delay so the first screen renders before splash hides
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(() => {});
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

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
          }}
        />
        <Stack.Screen
          name="student/strategies"
          options={{
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
          name="profiles/create"
          options={{
            title: 'Create Profile',
            headerBackTitle: 'Back',
          }}
        />
        <Stack.Screen
          name="profiles/edit"
          options={{
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
            title: 'Manage Students',
            headerBackTitle: 'Dashboard',
          }}
        />
        <Stack.Screen
          name="teacher/classrooms"
          options={{
            title: 'Manage Classrooms',
            headerBackTitle: 'Dashboard',
          }}
        />
        <Stack.Screen
          name="teacher/student-detail"
          options={{
            title: 'Student Details',
            headerBackTitle: 'Back',
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
            headerBackTitle: 'Home',
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
            title: "My Family's Strategies",
            headerBackTitle: 'Dashboard',
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
            title: 'Check-in',
            headerBackTitle: 'Dashboard',
          }}
        />
        <Stack.Screen
          name="parent/linked-child/[id]"
          options={{
            title: 'Child Details',
            headerBackTitle: 'Dashboard',
          }}
        />
        <Stack.Screen
          name="admin/dashboard"
          options={{
            headerShown: false,
            title: 'Admin Dashboard',
          }}
        />
      </Stack>
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
  },
});

export default function RootLayout() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
