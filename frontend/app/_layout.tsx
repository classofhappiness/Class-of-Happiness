import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Image, View, StyleSheet } from 'react-native';
import { AppProvider } from '../src/context/AppContext';

// Small logo component for headers
const HeaderLogo = () => (
  <Image
    source={require('../assets/images/logo_coh.png')}
    style={{ width: 28, height: 28, marginRight: 8 }}
    resizeMode="contain"
  />
);

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
          name="parent/dashboard" 
          options={{ 
            headerShown: false,
            title: 'Parent Dashboard',
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
            title: 'Strategies',
          }} 
        />
        <Stack.Screen 
          name="parent/checkin" 
          options={{ 
            headerShown: false,
            title: 'Check-in',
          }} 
        />
      </Stack>
    </AppProvider>
  );
}
