import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, View, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { AppProvider } from '../src/context/AppContext';

// Warm up browser and allow completing auth sessions
WebBrowser.maybeCompleteAuthSession();

// Small logo component for headers with safe area padding
const HeaderLogo = () => {
  const insets = useSafeAreaInsets();
  return (
    <Image
      source={require('../assets/images/logo_coh.png')}
      style={{ width: 28, height: 28, marginLeft: 8 }}
      resizeMode="contain"
    />
  );
};

export default function RootLayout() {
  return (
    <AppProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#F8F9FA',
          },
          headerTintColor: '#333',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
          contentStyle: {
            backgroundColor: '#F8F9FA',
          },
          headerLeft: () => <HeaderLogo />,
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
            title: 'Class of Happiness' 
          }} 
        />
        <Stack.Screen 
          name="auth/callback" 
          options={{ 
            headerShown: false,
            title: 'Signing In' 
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
          name="subscription/index" 
          options={{ 
            headerShown: false,
            title: 'Subscription' 
          }} 
        />
        <Stack.Screen 
          name="subscription/success" 
          options={{ 
            headerShown: false,
            title: 'Payment Success' 
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
          name="parent/dashboard" 
          options={{ 
            title: 'Family Dashboard',
            headerBackTitle: 'Home',
          }} 
        />
        <Stack.Screen 
          name="parent/resources" 
          options={{ 
            title: 'Resources',
            headerBackTitle: 'Dashboard',
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
          name="parent/checkin" 
          options={{ 
            title: 'Check-in',
            headerBackTitle: 'Dashboard',
          }} 
        />
      </Stack>
    </AppProvider>
  );
}
