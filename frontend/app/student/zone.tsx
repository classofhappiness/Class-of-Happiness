import React, { useLayoutEffect, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { ZoneButton } from '../../src/components/ZoneButton';
import { Avatar } from '../../src/components/Avatar';

const { width } = Dimensions.get('window');

// Colour of Emotion info for kids - will use translations
const getColourInfo = (t: (key: string) => string) => ({
  blue: {
    color: '#5DADE2',
    icon: 'battery-charging-full',
    title: t('blue_zone') || 'Blue Emotions',
    feeling: t('blue_feeling') || 'Quiet Energy',
    examples: [t('tired') || 'Tired', t('sad') || 'Sad', t('lonely') || 'Lonely', t('need_rest') || 'Need Rest'],
    description: t('blue_description') || 'Your body is moving slowly. This might mean you are feeling tired, a bit lonely, or just need some rest to recharge.',
  },
  green: {
    color: '#58D68D',
    icon: 'waves',
    title: t('green_zone') || 'Green Emotions',
    feeling: t('green_feeling') || 'Balanced Energy',
    examples: [t('calm') || 'Calm', t('happy') || 'Happy', t('focused') || 'Focused', t('ready_to_learn') || 'Ready to Learn'],
    description: t('green_description') || 'You are ready to learn, listen, and play fairly. This is the steady state where you feel comfortable and focused.',
  },
  yellow: {
    color: '#F4D03F',
    icon: 'flash-on',
    title: t('yellow_zone') || 'Yellow Emotions',
    feeling: t('yellow_feeling') || 'Fizzing Energy',
    examples: [t('silly') || 'Silly', t('frustrated') || 'Frustrated', t('worried') || 'Worried', t('butterflies') || 'Butterflies'],
    description: t('yellow_description') || 'You are starting to lose focus or feeling wobbly. This covers being silly, frustrated, or having butterflies in your stomach.',
  },
  red: {
    color: '#EC7063',
    icon: 'local-fire-department',
    title: t('red_zone') || 'Red Emotions',
    feeling: t('red_feeling') || 'Fire Energy',
    examples: [t('super_charged') || 'Super-Charged', t('very_upset') || 'Very Upset', t('out_of_control') || 'Out of Control', t('explosive') || 'Explosive'],
    description: t('red_description') || 'This is when your body feels like it\'s moving too fast—think of feelings like being super-charged, extremely upset, or out of control.',
  },
});

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
            <Text style={styles.greetingQuestion}>{t('which_zone')}</Text>
          </View>
        </View>

        {/* Colour Buttons Grid */}
        <View style={styles.colourGrid}>
          <View style={styles.colourRow}>
            <ZoneButton
              zone="blue"
              onPress={() => handleSelectColour('blue')}
              size="large"
              translations={translations}
            />
            <ZoneButton
              zone="green"
              onPress={() => handleSelectColour('green')}
              size="large"
              translations={translations}
            />
          </View>
          <View style={styles.colourRow}>
            <ZoneButton
              zone="yellow"
              onPress={() => handleSelectColour('yellow')}
              size="large"
              translations={translations}
            />
            <ZoneButton
              zone="red"
              onPress={() => handleSelectColour('red')}
              size="large"
              translations={translations}
            />
          </View>
        </View>

        <Text style={styles.helpText}>{t('tap_colour') || 'Tap the colour that matches your feeling'}</Text>

        {/* Help Button - Simple for kids */}
        <TouchableOpacity 
          style={styles.helpButton}
          onPress={() => setShowHelp(true)}
        >
          <MaterialIcons name="help-outline" size={20} color="#5C6BC0" />
          <Text style={styles.helpButtonText}>{t('need_help') || 'Need help? Tap here!'}</Text>
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
              <Text style={styles.modalTitle}>{t('what_colours_mean') || 'What do the colours mean?'}</Text>
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
              <View style={[styles.colourInfoCard, { borderLeftColor: getColourInfo(t).blue.color }]}>
                <View style={styles.colourInfoHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: getColourInfo(t).blue.color + '20' }]}>
                    <MaterialIcons name="battery-charging-full" size={28} color={getColourInfo(t).blue.color} />
                  </View>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: getColourInfo(t).blue.color }]}>
                      {getColourInfo(t).blue.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{getColourInfo(t).blue.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {getColourInfo(t).blue.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: getColourInfo(t).blue.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: getColourInfo(t).blue.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{getColourInfo(t).blue.description}</Text>
              </View>

              {/* Green - Flow */}
              <View style={[styles.colourInfoCard, { borderLeftColor: getColourInfo(t).green.color }]}>
                <View style={styles.colourInfoHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: getColourInfo(t).green.color + '20' }]}>
                    <MaterialIcons name="waves" size={28} color={getColourInfo(t).green.color} />
                  </View>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: getColourInfo(t).green.color }]}>
                      {getColourInfo(t).green.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{getColourInfo(t).green.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {getColourInfo(t).green.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: getColourInfo(t).green.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: getColourInfo(t).green.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{getColourInfo(t).green.description}</Text>
              </View>

              {/* Yellow - Spark */}
              <View style={[styles.colourInfoCard, { borderLeftColor: getColourInfo(t).yellow.color }]}>
                <View style={styles.colourInfoHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: getColourInfo(t).yellow.color + '20' }]}>
                    <MaterialIcons name="flash-on" size={28} color={getColourInfo(t).yellow.color} />
                  </View>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: getColourInfo(t).yellow.color }]}>
                      {getColourInfo(t).yellow.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{getColourInfo(t).yellow.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {getColourInfo(t).yellow.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: getColourInfo(t).yellow.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: getColourInfo(t).yellow.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{COLOUR_INFO.yellow.description}</Text>
              </View>

              {/* Red - Power */}
              <View style={[styles.colourInfoCard, { borderLeftColor: getColourInfo(t).red.color }]}>
                <View style={styles.colourInfoHeader}>
                  <View style={[styles.iconContainer, { backgroundColor: getColourInfo(t).red.color + '20' }]}>
                    <MaterialIcons name="local-fire-department" size={28} color={getColourInfo(t).red.color} />
                  </View>
                  <View style={styles.colourTitleContainer}>
                    <Text style={[styles.colourTitle, { color: getColourInfo(t).red.color }]}>
                      {getColourInfo(t).red.title}
                    </Text>
                    <Text style={styles.colourFeeling}>{getColourInfo(t).red.feeling}</Text>
                  </View>
                </View>
                <View style={styles.exampleTags}>
                  {getColourInfo(t).red.examples.map((example, i) => (
                    <View key={i} style={[styles.exampleTag, { backgroundColor: getColourInfo(t).red.color + '25' }]}>
                      <Text style={[styles.exampleText, { color: getColourInfo(t).red.color }]}>{example}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.colourDescription}>{getColourInfo(t).red.description}</Text>
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
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
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
