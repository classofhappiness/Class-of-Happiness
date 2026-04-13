import React, { useLayoutEffect, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Dimensions, TouchableOpacity, Modal } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { ZoneButton } from '../../src/components/FeelingsButton';
import { Avatar } from '../../src/components/Avatar';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';

const { width } = Dimensions.get('window');

// Colour info uses t() function for translations
const getColourInfo = (t: (key: string) => string) => ({
  blue: {
    color: '#5DADE2',
    icon: 'battery-charging-full',
    title: t('blue_feelings') || 'Blue Feelings',
    feeling: t('blue_feeling') || 'Quiet Energy',
    examples: [t('tired') || 'Tired', t('sad') || 'Sad', t('lonely') || 'Lonely', t('need_rest') || 'Need Rest'],
    description: t('blue_description') || 'Your body is moving slowly. You might feel tired, a bit sad, or need some rest.',
  },
  green: {
    color: '#58D68D',
    icon: 'waves',
    title: t('green_feelings') || 'Green Feelings',
    feeling: t('green_feeling') || 'Balanced Energy',
    examples: [t('calm') || 'Calm', t('happy') || 'Happy', t('focused') || 'Focused', t('ready_to_learn') || 'Ready to Learn'],
    description: t('green_description') || 'You feel calm, happy and ready. This is a great feeling!',
  },
  yellow: {
    color: '#F4D03F',
    icon: 'flash-on',
    title: t('yellow_feelings') || 'Yellow Feelings',
    feeling: t('yellow_feeling') || 'Fizzing Energy',
    examples: [t('silly') || 'Silly', t('frustrated') || 'Frustrated', t('worried') || 'Worried', t('butterflies') || 'Butterflies'],
    description: t('yellow_description') || 'You are starting to feel wobbly. You might feel silly, worried or frustrated.',
  },
  red: {
    color: '#EC7063',
    icon: 'local-fire-department',
    title: t('red_feelings') || 'Red Feelings',
    feeling: t('red_feeling') || 'Big Energy',
    examples: [t('super_charged') || 'Super-Charged', t('very_upset') || 'Very Upset', t('out_of_control') || 'Out of Control', t('explosive') || 'Explosive'],
    description: t('red_description') || 'Your body has big feelings right now. You might feel very upset or out of control.',
  },
});

export default function ColourSelectionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    preloadSounds();
  }, []);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('how_are_you_feeling') || 'How are you feeling?',
    });
  }, [navigation, language, translations]);

  const colourInfo = getColourInfo(t);

  const handleZoneSelect = (zone: 'blue' | 'green' | 'yellow' | 'red') => {
    playSelectFeedback();
    router.push(`/student/strategies?zone=${zone}`);
  };

  if (!currentStudent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('select_profile') || 'Select Your Profile'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Student greeting */}
        <View style={styles.greetingRow}>
          <Avatar
            type={currentStudent.avatar_type}
            preset={currentStudent.avatar_preset}
            custom={currentStudent.avatar_custom}
            size={48}
            presetAvatars={presetAvatars}
          />
          <View style={styles.greetingText}>
            <Text style={styles.greetingHi}>{t('hi') || 'Hi'}, {currentStudent.name}!</Text>
            <Text style={styles.greetingSub}>{t('tap_colour_help') || 'Tap the colour that matches how you feel'}</Text>
          </View>
        </View>

        {/* Colour buttons */}
        <View style={styles.zonesGrid}>
          {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => {
            const info = colourInfo[zone];
            return (
              <TouchableOpacity
                key={zone}
                style={[styles.zoneCard, { backgroundColor: info.color }]}
                onPress={() => handleZoneSelect(zone)}
                activeOpacity={0.8}
              >
                <Text style={styles.zoneTitle}>{info.title}</Text>
                <Text style={styles.zoneFeeling}>{info.feeling}</Text>
                <View style={styles.examplesRow}>
                  {info.examples.slice(0, 2).map((ex, i) => (
                    <View key={i} style={styles.exampleChip}>
                      <Text style={styles.exampleText}>{ex}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Need help button */}
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => { playButtonFeedback(); setShowHelp(true); }}
        >
          <MaterialIcons name="help-outline" size={20} color="#5C6BC0" />
          <Text style={styles.helpButtonText}>{t('need_help') || 'Need help? Tap here!'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Help modal */}
      <Modal visible={showHelp} transparent animationType="slide" onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('what_colours_mean') || 'What do the colours mean?'}</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => {
                const info = colourInfo[zone];
                return (
                  <View key={zone} style={[styles.helpCard, { borderLeftColor: info.color }]}>
                    <Text style={[styles.helpCardTitle, { color: info.color }]}>{info.title}</Text>
                    <Text style={styles.helpCardFeeling}>{info.feeling}</Text>
                    <Text style={styles.helpCardDesc}>{info.description}</Text>
                    <View style={styles.examplesWrap}>
                      {info.examples.map((ex, i) => (
                        <View key={i} style={[styles.exampleChipModal, { backgroundColor: info.color + '30' }]}>
                          <Text style={[styles.exampleTextModal, { color: info.color }]}>{ex}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => { playButtonFeedback(); setShowHelp(false); }}
            >
              <Text style={styles.modalCloseText}>{t('done') || 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, backgroundColor: 'white', padding: 14, borderRadius: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  greetingText: { flex: 1, marginLeft: 12 },
  greetingHi: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  greetingSub: { fontSize: 13, color: '#666', marginTop: 2 },
  zonesGrid: { gap: 12 },
  zoneCard: { borderRadius: 20, padding: 18, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  zoneTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  zoneFeeling: { fontSize: 14, color: 'rgba(255,255,255,0.9)', marginBottom: 10 },
  examplesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  exampleChip: { backgroundColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  exampleText: { fontSize: 12, color: 'white', fontWeight: '600' },
  helpButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 20, padding: 14, backgroundColor: 'white', borderRadius: 14, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  helpButtonText: { fontSize: 15, color: '#5C6BC0', fontWeight: '600' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 18, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalScroll: { padding: 16 },
  helpCard: { backgroundColor: '#FAFAFA', borderRadius: 14, padding: 14, marginBottom: 12, borderLeftWidth: 4 },
  helpCardTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 2 },
  helpCardFeeling: { fontSize: 13, color: '#888', marginBottom: 6, fontStyle: 'italic' },
  helpCardDesc: { fontSize: 13, color: '#555', lineHeight: 20, marginBottom: 8 },
  examplesWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  exampleChipModal: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  exampleTextModal: { fontSize: 12, fontWeight: '600' },
  modalClose: { margin: 16, backgroundColor: '#5C6BC0', borderRadius: 14, padding: 14, alignItems: 'center' },
  modalCloseText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
