import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { ZoneButton } from '../../src/components/ZoneButton';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');
const ZONE_SIZE = (width - 60) / 2 - 8;

// Zone info for kids - simple and friendly
const ZONE_INFO = {
  blue: {
    color: '#5DADE2',
    emoji: '😢',
    title: 'Blue Zone',
    feeling: 'Slow & Low',
    examples: ['Sad', 'Tired', 'Bored', 'Sick'],
    description: 'When your body feels slow and you have low energy. It\'s okay to feel this way sometimes!',
  },
  green: {
    color: '#58D68D',
    emoji: '😊',
    title: 'Green Zone',
    feeling: 'Good to Go!',
    examples: ['Happy', 'Calm', 'Focused', 'Ready to Learn'],
    description: 'When you feel calm, happy, and ready! This is a great place to be for learning.',
  },
  yellow: {
    color: '#F4D03F',
    emoji: '😰',
    title: 'Yellow Zone',
    feeling: 'Getting Wiggly',
    examples: ['Worried', 'Frustrated', 'Excited', 'Silly'],
    description: 'When you start to lose control a little. Your energy is getting higher!',
  },
  red: {
    color: '#EC7063',
    emoji: '😡',
    title: 'Red Zone',
    feeling: 'Out of Control',
    examples: ['Angry', 'Scared', 'Yelling', 'Hitting'],
    description: 'When you have very big feelings and need help to calm down. It\'s okay, everyone feels this way sometimes.',
  },
};

export default function ZoneSelectionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  // Set translated header title - depend on language/translations to trigger updates
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('which_zone'),
    });
  }, [navigation, language, translations]);

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
          <Text style={styles.errorText}>{t('select_profile')}</Text>
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
            <Text style={styles.greetingHi}>{t('hi')}, {currentStudent.name}!</Text>
            <Text style={styles.greetingQuestion}>{t('which_zone')}</Text>
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

        <Text style={styles.helpText}>{t('tap_zone_help')}</Text>

        {/* Help Button - Simple for kids */}
        <TouchableOpacity 
          style={styles.helpButton}
          onPress={() => setShowHelp(true)}
        >
          <MaterialIcons name="help-outline" size={20} color="#5C6BC0" />
          <Text style={styles.helpButtonText}>Need help? Tap here!</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Zone Info Modal - Kid Friendly */}
      <Modal
        visible={showHelp}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHelp(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowHelp(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>What do the colors mean?</Text>
              <TouchableOpacity 
                onPress={() => setShowHelp(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.zoneList} showsVerticalScrollIndicator={false}>
              {Object.entries(ZONE_INFO).map(([zone, info]) => (
                <View key={zone} style={[styles.zoneInfoCard, { borderLeftColor: info.color }]}>
                  <View style={styles.zoneInfoHeader}>
                    <Text style={styles.zoneEmoji}>{info.emoji}</Text>
                    <View>
                      <Text style={[styles.zoneTitle, { color: info.color }]}>{info.title}</Text>
                      <Text style={styles.zoneFeeling}>{info.feeling}</Text>
                    </View>
                  </View>
                  <View style={styles.exampleTags}>
                    {info.examples.map((example, i) => (
                      <View key={i} style={[styles.exampleTag, { backgroundColor: info.color + '20' }]}>
                        <Text style={[styles.exampleText, { color: info.color }]}>{example}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={styles.zoneDescription}>{info.description}</Text>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity 
              style={styles.gotItButton}
              onPress={() => setShowHelp(false)}
            >
              <Text style={styles.gotItText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EAF6',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 16,
    gap: 8,
  },
  helpButtonText: {
    fontSize: 16,
    color: '#5C6BC0',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 24,
    padding: 20,
    width: '100%',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  zoneList: {
    maxHeight: 400,
  },
  zoneInfoCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  zoneInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  zoneEmoji: {
    fontSize: 36,
  },
  zoneTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  zoneFeeling: {
    fontSize: 14,
    color: '#666',
  },
  exampleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  exampleTag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  exampleText: {
    fontSize: 13,
    fontWeight: '500',
  },
  zoneDescription: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
  },
  gotItButton: {
    backgroundColor: '#5C6BC0',
    paddingVertical: 14,
    borderRadius: 30,
    alignItems: 'center',
    marginTop: 16,
  },
  gotItText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
