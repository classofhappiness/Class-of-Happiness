import React, { useLayoutEffect, useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Dimensions, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';

const { width } = Dimensions.get('window');

const getColourInfo = (t: (key: string) => string) => ({
  blue: {
    color: '#5DADE2',
    emoji: '😔',
    title: t('blue_feelings') || 'Blue Feelings',
    feeling: t('blue_feeling') || 'Quiet Energy',
    words: [
      { label: t('tired') || 'Tired', emoji: '😴' },
      { label: t('sad') || 'Sad', emoji: '😢' },
      { label: t('bored') || 'Bored', emoji: '😑' },
      { label: t('lonely') || 'Lonely', emoji: '🥺' },
    ],
    description: t('blue_description') || 'Your body is moving slowly. You might feel tired, sad or need some rest.',
  },
  green: {
    color: '#58D68D',
    emoji: '😊',
    title: t('green_feelings') || 'Green Feelings',
    feeling: t('green_feeling') || 'Balanced Energy',
    words: [
      { label: t('calm') || 'Calm', emoji: '😌' },
      { label: t('happy') || 'Happy', emoji: '😄' },
      { label: t('focused') || 'Focused', emoji: '🎯' },
      { label: t('ready_to_learn') || 'Ready', emoji: '🌟' },
    ],
    description: t('green_description') || 'You feel calm, happy and ready. This is a great feeling!',
  },
  yellow: {
    color: '#F4D03F',
    emoji: '😬',
    title: t('yellow_feelings') || 'Yellow Feelings',
    feeling: t('yellow_feeling') || 'Fizzing Energy',
    words: [
      { label: t('silly') || 'Silly', emoji: '🤪' },
      { label: t('nervous') || 'Nervous', emoji: '😰' },
      { label: t('frustrated') || 'Frustrated', emoji: '😤' },
      { label: t('worried') || 'Worried', emoji: '😟' },
    ],
    description: t('yellow_description') || 'You are starting to feel wobbly. You might feel silly, nervous or frustrated.',
  },
  red: {
    color: '#EC7063',
    emoji: '🤯',
    title: t('red_feelings') || 'Red Feelings',
    feeling: t('red_feeling') || 'Big Energy',
    words: [
      { label: t('angry') || 'Angry', emoji: '😡' },
      { label: t('very_upset') || 'Very Upset', emoji: '😭' },
      { label: t('out_of_control') || 'Wild', emoji: '🌪️' },
      { label: t('super_charged') || 'Hyper', emoji: '⚡' },
    ],
    description: t('red_description') || 'Your body has big feelings right now. You might feel angry or out of control.',
  },
});

export default function ColourSelectionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => { preloadSounds(); }, []);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('how_are_you_feeling') || 'How are you feeling?' });
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
      <View style={styles.content}>
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <Avatar
            type={currentStudent.avatar_type}
            preset={currentStudent.avatar_preset}
            custom={currentStudent.avatar_custom}
            size={40}
            presetAvatars={presetAvatars}
          />
          <View style={styles.greetingText}>
            <Text style={styles.greetingHi}>{t('hi') || 'Hi'}, {currentStudent.name}! 👋</Text>
            <Text style={styles.greetingSub}>{t('tap_colour_help') || 'How are you feeling today?'}</Text>
          </View>
        </View>

        {/* 2x2 Colour Grid */}
        <View style={styles.zonesGrid}>
          {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => {
            const info = colourInfo[zone];
            return (
              <TouchableOpacity
                key={zone}
                style={[styles.zoneCard, { backgroundColor: info.color }]}
                onPress={() => handleZoneSelect(zone)}
                activeOpacity={0.85}
              >
                {/* Left side: title and feeling */}
                <View style={styles.zoneLeft}>
                  <Text style={styles.zoneEmoji}>{info.emoji}</Text>
                  <Text style={styles.zoneTitle}>{info.title}</Text>
                  <Text style={styles.zoneFeeling}>{info.feeling}</Text>
                </View>
                {/* Right side: emoji words */}
                <View style={styles.zoneRight}>
                  {info.words.map((w, i) => (
                    <View key={i} style={styles.wordChip}>
                      <Text style={styles.wordEmoji}>{w.emoji}</Text>
                      <Text style={styles.wordLabel}>{w.label}</Text>
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Help button */}
        <TouchableOpacity
          style={styles.helpButton}
          onPress={() => { playButtonFeedback(); setShowHelp(true); }}
        >
          <MaterialIcons name="help-outline" size={16} color="#5C6BC0" />
          <Text style={styles.helpButtonText}>{t('need_help') || 'Need help? Tap here!'}</Text>
        </TouchableOpacity>
      </View>

      {/* Help Modal */}
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
                    <Text style={[styles.helpCardTitle, { color: info.color }]}>{info.emoji} {info.title}</Text>
                    <Text style={styles.helpCardDesc}>{info.description}</Text>
                    <View style={styles.helpWordsRow}>
                      {info.words.map((w, i) => (
                        <View key={i} style={[styles.helpWordChip, { backgroundColor: info.color + '25' }]}>
                          <Text style={styles.helpWordEmoji}>{w.emoji}</Text>
                          <Text style={[styles.helpWordLabel, { color: info.color }]}>{w.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowHelp(false)}>
              <Text style={styles.modalCloseText}>{t('done') || 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const CARD_HEIGHT = (Dimensions.get('window').height - 280) / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { flex: 1, padding: 10 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 14, marginBottom: 8, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  greetingText: { flex: 1, marginLeft: 10 },
  greetingHi: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  greetingSub: { fontSize: 12, color: '#888', marginTop: 1 },
  zonesGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneCard: { width: (width - 28) / 2, height: CARD_HEIGHT, borderRadius: 18, padding: 10, flexDirection: 'row', elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 },
  zoneLeft: { flex: 1, justifyContent: 'center' },
  zoneEmoji: { fontSize: 24, marginBottom: 4 },
  zoneTitle: { fontSize: 13, fontWeight: 'bold', color: 'white', marginBottom: 2 },
  zoneFeeling: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  zoneRight: { width: 80, justifyContent: 'center', gap: 4 },
  wordChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 8, paddingHorizontal: 4, paddingVertical: 2, gap: 3 },
  wordEmoji: { fontSize: 12 },
  wordLabel: { fontSize: 9, color: 'white', fontWeight: '600', flexShrink: 1 },
  helpButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, padding: 8, backgroundColor: 'white', borderRadius: 12 },
  helpButtonText: { fontSize: 12, color: '#5C6BC0', fontWeight: '600' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 18, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  modalScroll: { padding: 14 },
  helpCard: { backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4 },
  helpCardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  helpCardDesc: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 8 },
  helpWordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  helpWordChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  helpWordEmoji: { fontSize: 14 },
  helpWordLabel: { fontSize: 11, fontWeight: '600' },
  modalClose: { margin: 14, backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, alignItems: 'center' },
  modalCloseText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
