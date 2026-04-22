import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { zoneLogsApi, Strategy } from '../../src/utils/api';
import { StrategyCard } from '../../src/components/StrategyCard';
import { CelebrationOverlay } from '../../src/components/CelebrationOverlay';
import { playButtonFeedback, playSelectFeedback, playSuccessSound, preloadSounds } from '../../src/utils/sounds';

const MAX_COMMENT_LENGTH = 100;

const ZONE_COLORS: Record<string, string> = {
  blue: '#5DADE2',
  green: '#58D68D',
  yellow: '#F4D03F',
  red: '#EC7063',
};

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'https://class-of-happiness-production.up.railway.app';

export default function StrategiesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { zone } = useLocalSearchParams<{ zone: string }>();
  const { currentStudent, t, language, translations } = useApp();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customSupportMessage, setCustomSupportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (currentStudent?.id) {
      AsyncStorage.getItem(`support_message_${currentStudent.id}`).then(msg => {
        if (msg) setCustomSupportMessage(msg);
      });
    }
  }, [currentStudent?.id]);
  const [showCelebration, setShowCelebration] = useState(false);
  const [comment, setComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);

  const zoneColor = zone ? ZONE_COLORS[zone] : '#58D68D';

  const getZoneLabel = () => {
    const labels: Record<string, string> = {
      blue: t('blue_feelings') || 'Blue Feelings',
      green: t('green_feelings') || 'Green Feelings',
      yellow: t('yellow_feelings') || 'Yellow Feelings',
      red: t('red_feelings') || 'Red Feelings',
    };
    return zone ? (labels[zone] || zone) : 'Feelings';
  };

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('choose_helpers') || 'Choose your helpers' });
  }, [navigation, language, translations]);

  useEffect(() => {
    preloadSounds();
    fetchStrategies();
  }, [zone, language]);

  const fetchStrategies = async () => {
    if (!zone) return;
    setLoading(true);
    try {
      // Direct fetch to bypass any auth issues - helpers are public
      const url = `${BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=${language || 'en'}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setStrategies(data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
      // Fallback hardcoded strategies
      setStrategies(getFallbackStrategies(zone));
    } finally {
      setLoading(false);
    }
  };

  const getFallbackStrategies = (zone: string): Strategy[] => {
    const defaults: Record<string, Strategy[]> = {
      blue: [
        { id: 'b1', name: 'Gentle Stretch', description: 'Slowly stretch your arms and legs', icon: 'accessibility', zone: 'blue' },
        { id: 'b2', name: 'Favourite Song', description: 'Listen to your favourite song', icon: 'music-note', zone: 'blue' },
        { id: 'b3', name: 'Tell Someone', description: 'Tell a trusted person how you feel', icon: 'chat', zone: 'blue' },
        { id: 'b4', name: 'Slow Breathing', description: 'Take 3 slow, deep breaths', icon: 'air', zone: 'blue' },
      ],
      green: [
        { id: 'g1', name: 'Keep Going!', description: 'You are doing great - keep it up!', icon: 'star', zone: 'green' },
        { id: 'g2', name: 'Help a Friend', description: 'Offer to help someone nearby', icon: 'people', zone: 'green' },
        { id: 'g3', name: 'Set a Goal', description: 'Think of something you want to do today', icon: 'flag', zone: 'green' },
        { id: 'g4', name: 'Gratitude', description: 'Think of one thing you are grateful for', icon: 'favorite', zone: 'green' },
      ],
      yellow: [
        { id: 'y1', name: 'Bubble Breathing', description: 'Breathe in slowly, breathe out like blowing bubbles', icon: 'bubble-chart', zone: 'yellow' },
        { id: 'y2', name: 'Count to 10', description: 'Count slowly from 1 to 10', icon: 'format-list-numbered', zone: 'yellow' },
        { id: 'y3', name: '5 Senses', description: 'Name 5 things you can see around you', icon: 'visibility', zone: 'yellow' },
        { id: 'y4', name: 'Talk About It', description: 'Tell a trusted adult how you are feeling', icon: 'record-voice-over', zone: 'yellow' },
      ],
      red: [
        { id: 'r1', name: 'Freeze', description: 'Stop and freeze your body completely', icon: 'pause-circle-filled', zone: 'red' },
        { id: 'r2', name: 'Big Breaths', description: 'Take 5 very slow, deep breaths', icon: 'air', zone: 'red' },
        { id: 'r3', name: 'Safe Space', description: 'Go to your calm corner', icon: 'king-bed', zone: 'red' },
        { id: 'r4', name: 'Ask for Help', description: 'Tell a trusted adult you need support', icon: 'support-agent', zone: 'red' },
      ],
    };
    return defaults[zone] || [];
  };

  const toggleStrategy = (strategyId: string) => {
    playSelectFeedback();
    setSelectedStrategies(prev =>
      prev.includes(strategyId) ? prev.filter(id => id !== strategyId) : [...prev, strategyId]
    );
  };

  const handleDone = async () => {
    if (!currentStudent || !zone) return;
    playSuccessSound();
    setSaving(true);
    try {
      await zoneLogsApi.create({
        student_id: currentStudent.id,
        zone: zone,
        strategies_selected: selectedStrategies,
        comment: comment.trim() || undefined,
      });
      setShowCelebration(true);
      setTimeout(() => {
        setShowCelebration(false);
        router.replace({ pathname: '/student/rewards', params: { strategiesUsed: selectedStrategies.length.toString(), hasComment: comment.trim() ? 'true' : 'false', zone } });
      }, 1800);
    } catch (error) {
      console.error('Error saving:', error);
      router.replace({ pathname: '/student/rewards', params: { strategiesUsed: '0', hasComment: 'false', zone } });
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!currentStudent || !zone) return;
    playButtonFeedback();
    try {
      await zoneLogsApi.create({ student_id: currentStudent.id, zone, strategies_selected: [] });
    } catch (e) {}
    router.replace({ pathname: '/student/rewards', params: { strategiesUsed: '0', hasComment: 'false', zone } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <CelebrationOverlay
        visible={showCelebration}
        studentName={currentStudent?.name || ''}
        avatarType={currentStudent?.avatar_type || 'preset'}
        avatarPreset={currentStudent?.avatar_preset}
        avatarCustom={currentStudent?.avatar_custom}
        onComplete={() => setShowCelebration(false)}
        translations={{
          well_done: t('well_done') || t('well_done')||'Well Done',
          support_message: customSupportMessage || (() => {
            const GENERIC_MESSAGES = [
              'Well done for owning your emotions! 🌟',
              'Excellent — you are a leader in your life! 👑',
              'Always tell an adult or a trusted friend 💙',
            ];
            return GENERIC_MESSAGES[Math.floor(Date.now() / 1000) % 3];
          })()
        }}
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={[styles.zoneHeader, { backgroundColor: zoneColor + '20', borderColor: zoneColor }]}>
            <View style={[styles.zoneColorDot, { backgroundColor: zoneColor }]} />
            <Text style={[styles.zoneLabel, { color: zoneColor }]}>{getZoneLabel()}</Text>
          </View>
          <Text style={styles.instruction}>
            {zone === 'green' ? t('tap_helpers_green') || 'Tap helpers you would like to try:' : t('tap_helpers_other') || 'Tap to select helpers:'}
          </Text>
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{t('loading_helpers') || 'Loading helpers...'}</Text>
            </View>
          ) : (
            strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                name={strategy.name}
                description={strategy.description}
                icon={strategy.icon}
                customImage={strategy.custom_image}
                imageType={strategy.image_type}
                selected={selectedStrategies.includes(strategy.id)}
                onPress={() => toggleStrategy(strategy.id)}
                zoneColor={zoneColor}
              />
            ))
          )}
          <View style={styles.commentSection}>
            <TouchableOpacity style={styles.commentToggle} onPress={() => { playButtonFeedback(); setShowCommentInput(!showCommentInput); }}>
              <MaterialIcons name="chat-bubble-outline" size={22} color={showCommentInput || comment ? zoneColor : '#999'} />
              <Text style={[styles.commentToggleText, (showCommentInput || comment) && { color: zoneColor }]}>
                {comment ? t('edit') || 'Edit' : t('want_to_say') || 'Want to say something?'}
              </Text>
              <MaterialIcons name={showCommentInput ? 'expand-less' : 'expand-more'} size={22} color="#CCC" />
            </TouchableOpacity>
            {showCommentInput && (
              <View style={styles.commentInputWrapper}>
                <TextInput
                  style={[styles.commentInput, { borderColor: zoneColor }]}
                  placeholder={t('write_sentence') || 'Write one sentence...'}
                  placeholderTextColor="#BBB"
                  value={comment}
                  onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
                  multiline
                />
                <Text style={styles.charCount}>{comment.length}/{MAX_COMMENT_LENGTH}</Text>
              </View>
            )}
          </View>
        </ScrollView>
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip} disabled={saving}>
            <Text style={styles.skipButtonText}>{t('skip') || 'Skip'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.doneButton, { backgroundColor: zoneColor }]} onPress={handleDone} disabled={saving}>
            <Text style={styles.doneButtonText}>
              {saving ? (t('loading') || 'Loading...') : `${t('done') || 'Done'}${selectedStrategies.length > 0 ? ` (${selectedStrategies.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16, paddingBottom: 100 },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2, marginBottom: 14 },
  zoneColorDot: { width: 18, height: 18, borderRadius: 9, marginRight: 10 },
  zoneLabel: { fontSize: 17, fontWeight: 'bold' },
  instruction: { fontSize: 14, color: '#666', marginBottom: 14, fontStyle: 'italic' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#888' },
  commentSection: { marginTop: 14, backgroundColor: 'white', borderRadius: 12, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  commentToggle: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  commentToggleText: { flex: 1, fontSize: 14, color: '#999' },
  commentInputWrapper: { padding: 14, paddingTop: 0 },
  commentInput: { borderWidth: 2, borderRadius: 10, padding: 10, fontSize: 14, color: '#333', minHeight: 70, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#BBB', textAlign: 'right', marginTop: 4 },
  bottomBar: { flexDirection: 'row', padding: 14, gap: 10, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingBottom: 24 },
  skipButton: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 2, borderColor: '#DDD', alignItems: 'center' },
  skipButtonText: { fontSize: 15, color: '#888', fontWeight: '600' },
  doneButton: { flex: 2, padding: 14, borderRadius: 12, alignItems: 'center' },
  doneButtonText: { fontSize: 15, color: 'white', fontWeight: 'bold' },
});
