import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';

const { width } = Dimensions.get('window');

export default function HomeScreen() {
  const router = useRouter();
  const { loading } = useApp();

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Zones of Regulation</Text>
          <Text style={styles.subtitle}>How are you feeling today?</Text>
        </View>

        {/* Zone Preview */}
        <View style={styles.zonePreview}>
          <View style={[styles.zoneDot, { backgroundColor: '#4A90D9' }]} />
          <View style={[styles.zoneDot, { backgroundColor: '#4CAF50' }]} />
          <View style={[styles.zoneDot, { backgroundColor: '#FFC107' }]} />
          <View style={[styles.zoneDot, { backgroundColor: '#F44336' }]} />
        </View>

        {/* Role Selection */}
        <View style={styles.roleContainer}>
          <Text style={styles.roleTitle}>I am a...</Text>
          
          <TouchableOpacity
            style={[styles.roleButton, styles.studentButton]}
            onPress={() => router.push('/student/select')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="child-care" size={48} color="white" />
            <Text style={styles.roleButtonText}>Student</Text>
            <Text style={styles.roleButtonSubtext}>Check in with my feelings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.teacherButton]}
            onPress={() => router.push('/teacher/dashboard')}
            activeOpacity={0.8}
          >
            <MaterialIcons name="school" size={48} color="white" />
            <Text style={styles.roleButtonText}>Teacher</Text>
            <Text style={styles.roleButtonSubtext}>View student progress</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 18,
    color: '#666',
  },
  header: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginTop: 8,
  },
  zonePreview: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 32,
  },
  zoneDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  roleContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  roleTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  roleButton: {
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    marginVertical: 12,
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
    backgroundColor: '#5C6BC0',
  },
  roleButtonText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 12,
  },
  roleButtonSubtext: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
});
