import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendHelpRequest, sendZoneAlert, sendParentMessage, shieldEmoji } from '../../src/utils/notifications';
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
  const { zone, location, fromFamily } = useLocalSearchParams<{ zone: string; location?: string; fromFamily?: string }>();
  const checkInLocation = (location as string) || 'school';
  const { currentStudent, t, language, translations } = useApp();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [helpRequested, setHelpRequested] = useState<Set<string>>(new Set()); // strategy ids
  const [shieldJustAwarded, setShieldJustAwarded] = useState(false);
  const [parentMessageVisible, setParentMessageVisible] = useState(false);
  const [parentMessage, setParentMessage] = useState('');
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
    navigation.setOptions({ headerShown: false });
  }, [navigation, language, translations]);

  useEffect(() => {
    preloadSounds();
    fetchStrategies();
  }, [zone, language]);

  const fetchStrategies = async () => {
    if (!zone) return;
    setLoading(true);
    try {
      // Fetch generic helpers
      const url = `${BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=${language || 'en'}`;
      const response = await fetch(url);
      let genericStrats: Strategy[] = [];
      if (response.ok) {
        genericStrats = await response.json();
      } else {
        genericStrats = getFallbackStrategies(zone);
      }

      // Fetch custom strategies (teacher-added) and shared family strategies
      let customStrats: Strategy[] = [];
      if (currentStudent?.id) {
        try {
          const token = await AsyncStorage.getItem('session_token');

          // Teacher custom strategies
          const customRes = await fetch(
            `${BACKEND_URL}/api/custom-strategies?student_id=${currentStudent.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (customRes.ok) {
            const customData = await customRes.json();
            const teacherStrats = (Array.isArray(customData) ? customData : [])
              .filter((s: any) => (s.feeling_colour || s.zone) === zone)
              .map((s: any) => ({
                id: s.id,
                name: s.name,
                description: s.description || '',
                icon: s.icon || 'star',
                zone: s.feeling_colour || s.zone || zone,
                is_custom: true,
              }));
            customStrats = [...customStrats, ...teacherStrats];
          }

          // Family/parent shared strategies
          const sharedRes = await fetch(
            `${BACKEND_URL}/api/strategies/shared/${currentStudent.id}`,
            { headers: { 'Authorization': `Bearer ${token}` } }
          );
          if (sharedRes.ok) {
            const sharedData = await sharedRes.json();
            const familyStrats = (Array.isArray(sharedData) ? sharedData : [])
              .filter((s: any) => (s.feeling_colour || s.zone) === zone)
              .map((s: any) => ({
                id: s.id + '_family',
                name: s.name,
                description: s.description || '',
                icon: s.icon || 'favorite',
                zone: s.feeling_colour || s.zone || zone,
                is_custom: true,
              }));
            customStrats = [...customStrats, ...familyStrats];
          }
        } catch { /* custom strategies optional */ }
      }

      // Merge: generic first, then custom (no duplicates by name)
      const genericNames = new Set(genericStrats.map((s: Strategy) => s.name.toLowerCase()));
      const uniqueCustom = customStrats.filter((s: any) => !genericNames.has(s.name.toLowerCase()));
      setStrategies([...genericStrats, ...uniqueCustom]);
    } catch (error) {
      console.error('Error fetching strategies:', error);
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

  const handleHelpRequest = async (strategyId: string, strategyName: string) => {
    if (!currentStudent) return;
    setHelpRequested(prev => new Set([...prev, strategyId]));
    const result = await sendHelpRequest({
      student_id: currentStudent.id,
      strategy_id: strategyId,
      strategy_name: strategyName,
      zone: zone || '',
      context: checkInLocation === 'home' ? 'home' : 'school', // school → teacher only, home → family only
    });
    if (result.shield_awarded) {
      setShieldJustAwarded(true);
      setTimeout(() => setShieldJustAwarded(false), 3000);
    }
  };

  const handleParentMessage = async () => {
    if (!currentStudent || !parentMessage.trim()) return;
    await sendParentMessage({
      student_id: currentStudent.id,
      message: parentMessage.trim(),
      zone: zone || '',
    });
    setParentMessageVisible(false);
    setParentMessage('');
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
        logged_by: checkInLocation === 'home' ? 'parent' : 'student',
      });
      // Fire zone alert silently (teacher/parent notified if they enabled it)
      if (currentStudent?.id && zone) {
        sendZoneAlert({
          student_id: currentStudent.id,
          zone,
          context: checkInLocation === 'home' ? 'home' : 'school',
        }).catch(() => {});
      }
      setShowCelebration(true);
      setTimeout(() => {
        setShowCelebration(false);
        router.replace({ pathname: '/student/rewards', params: { strategiesUsed: selectedStrategies.length.toString(), hasComment: comment.trim() ? 'true' : 'false', zone, fromFamily: fromFamily || '' } });
      }, 1800);
    } catch (error) {
      console.error('Error saving:', error);
      router.replace({ pathname: '/student/rewards', params: { strategiesUsed: '0', hasComment: 'false', zone, fromFamily: fromFamily || '' } });
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
    router.replace({ pathname: '/student/rewards', params: { strategiesUsed: '0', hasComment: 'false', zone, fromFamily: fromFamily || '' } });
  };

  return (
    <SafeAreaView style={styles.container}>
      <TranslatedHeader title={t('choose_helpers') || 'Choose Helpers'} />
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
          {shieldJustAwarded && (
            <View style={{ backgroundColor: '#FFF8E1', borderRadius: 12, padding: 10, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 20 }}>🛡️</Text>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#F57F17' }}>Brave Shield earned! You asked for help.</Text>
            </View>
          )}
          {loading ? (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{t('loading_helpers') || 'Loading helpers...'}</Text>
            </View>
          ) : (
            strategies.map((strategy) => (
              <View key={strategy.id} style={{ position: 'relative' }}>
                <StrategyCard
                  name={strategy.name}
                  description={strategy.description}
                  icon={strategy.icon}
                  customImage={strategy.custom_image}
                  imageType={strategy.image_type}
                  selected={selectedStrategies.includes(strategy.id)}
                  onPress={() => toggleStrategy(strategy.id)}
                  zoneColor={zoneColor}
                />
                {/* Help request button — calm hand icon */}
                <TouchableOpacity
                  style={[
                    styles.helpBtn,
                    helpRequested.has(strategy.id) && styles.helpBtnDone,
                  ]}
                  onPress={() => handleHelpRequest(strategy.id, strategy.name)}
                  disabled={helpRequested.has(strategy.id)}
                >
                  <MaterialIcons
                    name={helpRequested.has(strategy.id) ? 'check-circle' : 'pan-tool'}
                    size={18}
                    color={helpRequested === strategy.id ? '#4CAF50' : '#5C6BC0'}
                  />
                </TouchableOpacity>
              </View>
            ))
          )}
          {/* Help request explanation */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingVertical: 8, gap: 8 }}>
            <MaterialIcons name="pan-tool" size={16} color="#5C6BC0" />
            <Text style={{ fontSize: 12, color: '#888', flex: 1, fontStyle: 'italic' }}>
              {t('help_request_hint') || 'Tap the hand icon on any helper to ask your teacher or parent for support.'}
            </Text>
          </View>

          {/* 💌 Message to parent — only shown in home/family context */}
          {checkInLocation === 'home' && (
          <TouchableOpacity
            style={styles.parentMsgToggle}
            onPress={() => setParentMessageVisible(!parentMessageVisible)}
          >
            <Text style={{ fontSize: 16 }}>💌</Text>
            <Text style={styles.parentMsgLabel}>{t('message_parent') || 'Send message to parent'}</Text>
            <MaterialIcons name={parentMessageVisible ? 'expand-less' : 'expand-more'} size={20} color="#CCC" />
          </TouchableOpacity>
          )}
          {parentMessageVisible && checkInLocation === 'home' && (
            <View style={styles.parentMsgBox}>
              <TextInput
                style={[styles.commentInput, { borderColor: '#5C6BC0', marginBottom: 8 }]}
                placeholder={t('message_parent_placeholder') || 'Tell your parent how you feel...'}
                placeholderTextColor="#BBB"
                value={parentMessage}
                onChangeText={setParentMessage}
                multiline
                maxLength={200}
              />
              <TouchableOpacity
                style={{ backgroundColor: '#5C6BC0', borderRadius: 10, padding: 10, alignItems: 'center' }}
                onPress={handleParentMessage}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>{t('send') || 'Send'} 💌</Text>
              </TouchableOpacity>
            </View>
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
  scrollContent: { padding: 8, paddingBottom: 8 },
  zoneHeader: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 2, marginBottom: 8 },
  zoneColorDot: { width: 18, height: 18, borderRadius: 9, marginRight: 10 },
  zoneLabel: { fontSize: 15, fontWeight: 'bold' },
  instruction: { fontSize: 11, color: '#666', marginBottom: 8, fontStyle: 'italic' },
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
  helpBtn: { position: 'absolute', right: 10, top: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#5C6BC0', alignItems: 'center', justifyContent: 'center', zIndex: 10, shadowColor: '#5C6BC0', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  helpBtnDone: { backgroundColor: '#E8F5E9', borderColor: '#4CAF50' },
  helpBtnTxt: { fontSize: 14 },
  parentMsgToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, backgroundColor: '#E8EAF6', borderRadius: 12, marginTop: 10, marginBottom: 4 },
  parentMsgLabel: { flex: 1, fontSize: 14, color: '#5C6BC0', fontWeight: '600' },
  parentMsgBox: { backgroundColor: 'white', borderRadius: 12, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#E8EAF6' },
});
