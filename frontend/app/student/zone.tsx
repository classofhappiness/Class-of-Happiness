import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { ZoneButton } from '../../src/components/ZoneButton';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');
const ZONE_SIZE = (width - 60) / 2 - 8;

export default function ZoneSelectionScreen() {
  const router = useRouter();
  const { currentStudent, presetAvatars } = useApp();

  const handleSelectZone = (zone: 'blue' | 'green' | 'yellow' | 'red') => {
    router.push({
      pathname: '/student/strategies',
      params: { zone },
    });
  };

  if (!currentStudent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Please select a profile first</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Student Greeting */}
        <View style={styles.greeting}>
          <Avatar
            type={currentStudent.avatar_type}
            preset={currentStudent.avatar_preset}
            custom={currentStudent.avatar_custom}
            size={70}
            presetAvatars={presetAvatars}
          />
          <View style={styles.greetingText}>
            <Text style={styles.greetingHi}>Hi, {currentStudent.name}!</Text>
            <Text style={styles.greetingQuestion}>Which zone are you in?</Text>
          </View>
        </View>

        {/* Zone Buttons Grid */}
        <View style={styles.zoneGrid}>
          <View style={styles.zoneRow}>
            <ZoneButton
              zone="blue"
              onPress={() => handleSelectZone('blue')}
              size="large"
            />
            <ZoneButton
              zone="green"
              onPress={() => handleSelectZone('green')}
              size="large"
            />
          </View>
          <View style={styles.zoneRow}>
            <ZoneButton
              zone="yellow"
              onPress={() => handleSelectZone('yellow')}
              size="large"
            />
            <ZoneButton
              zone="red"
              onPress={() => handleSelectZone('red')}
              size="large"
            />
          </View>
        </View>

        <Text style={styles.helpText}>Tap the color that matches how you feel</Text>
      </ScrollView>
    </SafeAreaView>
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
  },
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  greetingText: {
    marginLeft: 16,
  },
  greetingHi: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  greetingQuestion: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  zoneGrid: {
    gap: 16,
  },
  zoneRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  helpText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 24,
  },
});
