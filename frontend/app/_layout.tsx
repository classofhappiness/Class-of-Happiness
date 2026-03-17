import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider } from '../src/context/AppContext';

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
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            headerShown: false,
            title: 'Zones of Regulation' 
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
      </Stack>
    </AppProvider>
  );
}
