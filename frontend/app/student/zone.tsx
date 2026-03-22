import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { ZoneButton } from '../../src/components/ZoneButton';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');

// Colour of Emotion info for kids - simple and friendly
const COLOUR_INFO = {
  blue: {
    color: '#5DADE2',
    emoji: '🔋',
    title: 'Blue Emotions',
    feeling: 'Quiet Energy',
    examples: ['Tired', 'Sad', 'Lonely', 'Need Rest'],
    description: 'Your body is moving slowly. This might mean you are feeling tired, a bit lonely, or just need some rest to recharge.',
  },
  green: {
    color: '#58D68D',
    emoji: '🌊',
    title: 'Green Emotions',
    feeling: 'Balanced Energy',
    examples: ['Calm', 'Happy', 'Focused', 'Ready to Learn'],
    description: 'You are ready to learn, listen, and play fairly. This is the steady state where you feel comfortable and focused.',
  },
  yellow: {
    color: '#F4D03F',
    emoji: '✨',
    title: 'Yellow Emotions',
    feeling: 'Fizzing Energy',
    examples: ['Silly', 'Frustrated', 'Worried', 'Butterflies'],
    description: 'You are starting to lose focus or feeling wobbly. This covers being silly, frustrated, or having butterflies in your stomach.',
  },
  red: {
    color: '#EC7063',
    emoji: '🔥',
    title: 'Red Emotions',
    feeling: 'Fire Energy',
    examples: ['Super-Charged', 'Very Upset', 'Out of Control', 'Explosive'],
    description: 'This is when your body feels like it\'s moving too fast—think of feelings like being super-charged, extremely upset, or out of control.',
  },
};

export default function ColourSelectionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  // Set translated header title
  useLayoutEffect(() => {
    navigation.setOptions({
      title: 'How are you feeling?',
    });
  }, [navigation, language, translations]);

  const handleSelectColour = (colour: 'blue' | 'green' | 'yellow' | 'red') => {
    router.push({
      pathname: '/student/strategies',
      params: { zone: colour },
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
            <Text style={styles.greetingQuestion}>Which colour matches how you feel?</Text>
          </View>
        </View>

        {/* Colour Buttons Grid */}
        <View style={styles.colourGrid}>
          <View style={styles.colourRow}>
            <ZoneButton
              zone="blue"
              onPress={() => handleSelectColour('blue')}
              size="large"
            />
            <ZoneButton
              zone="green"
              onPress={() => handleSelectColour('green')}
              size="large"
            />
          </View>
          <View style={styles.colourRow}>
            <ZoneButton
              zone="yellow"
              onPress={() => handleSelectColour('yellow')}
              size="large"
            />
            <ZoneButton
              zone="red"
              onPress={() => handleSelectColour('red')}
              size="large"
            />
          </View>
        </View>

        <Text style={styles.helpText}>Tap the colour that matches your feeling</Text>

        {/* Help Button - Simple for kids */}
        <TouchableOpacity 
          style={styles.helpButton}
          onPress={() => setShowHelp(true)}
        >
          <MaterialIcons name="help-outline" size={20} color="#5C6BC0" />
          <Text style={styles.helpButtonText}>Need help? Tap here!</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Colour of Emotion Info Modal - Kid Friendly */}
      <Modal
        visible={showHelp}
        transparent
        animationType="slide"
        onRequestClose={() => setShowHelp(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>What do the colours mean?</Text>
              <TouchableOpacity 
                onPress={() => setShowHelp(false)}
                style={styles.closeButton}
              >
                <MaterialIcons name="close" size={28} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView 
              style={styles.colourList} 
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.colourListContent}
            >
              {/* Blue - Low-Battery */}
              <View style={[styles.colourInfoCard, { borderLeftColor: COLOUR_INFO.blue.color }]}>
                <View style={styles.colourInfoHeader}>
                  <Text style={styles.colourEmoji}>{COLOUR_INFO.blue.emoji}</Text>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: COLOUR_INFO.blue.color }]}>
                      {COLOUR_INFO.blue.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{COLOUR_INFO.blue.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {COLOUR_INFO.blue.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: COLOUR_INFO.blue.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: COLOUR_INFO.blue.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{COLOUR_INFO.blue.description}</Text>
              </View>

              {/* Green - Flow */}
              <View style={[styles.colourInfoCard, { borderLeftColor: COLOUR_INFO.green.color }]}>
                <View style={styles.colourInfoHeader}>
                  <Text style={styles.colourEmoji}>{COLOUR_INFO.green.emoji}</Text>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: COLOUR_INFO.green.color }]}>
                      {COLOUR_INFO.green.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{COLOUR_INFO.green.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {COLOUR_INFO.green.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: COLOUR_INFO.green.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: COLOUR_INFO.green.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{COLOUR_INFO.green.description}</Text>
              </View>

              {/* Yellow - Spark */}
              <View style={[styles.colourInfoCard, { borderLeftColor: COLOUR_INFO.yellow.color }]}>
                <View style={styles.colourInfoHeader}>
                  <Text style={styles.colourEmoji}>{COLOUR_INFO.yellow.emoji}</Text>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: COLOUR_INFO.yellow.color }]}>
                      {COLOUR_INFO.yellow.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{COLOUR_INFO.yellow.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {COLOUR_INFO.yellow.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: COLOUR_INFO.yellow.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: COLOUR_INFO.yellow.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{COLOUR_INFO.yellow.description}</Text>
              </View>

              {/* Red - Power */}
              <View style={[styles.colourInfoCard, { borderLeftColor: COLOUR_INFO.red.color }]}>
                <View style={styles.colourInfoHeader}>
                  <Text style={styles.colourEmoji}>{COLOUR_INFO.red.emoji}</Text>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: COLOUR_INFO.red.color }]}>
                      {COLOUR_INFO.red.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{COLOUR_INFO.red.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {COLOUR_INFO.red.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: COLOUR_INFO.red.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: COLOUR_INFO.red.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{COLOUR_INFO.red.description}</Text>
              </View>
            </ScrollView>

            <TouchableOpacity 
              style={styles.gotItButton}
              onPress={() => setShowHelp(false)}
            >
              <Text style={styles.gotItText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    flex: 1,
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
  colourGrid: {
    gap: 16,
  },
  colourRow: {
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
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
  colourList: {
    flexGrow: 0,
  },
  colourListContent: {
    paddingBottom: 10,
  },
  colourInfoCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
  },
  colourInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  colourEmoji: {
    fontSize: 32,
  },
  colourTitleContainer: {
    flex: 1,
  },
  colourTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  colourFeeling: {
    fontSize: 14,
    color: '#666',
    fontStyle: 'italic',
  },
  exampleTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  exampleTag: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
  },
  exampleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  colourDescription: {
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
