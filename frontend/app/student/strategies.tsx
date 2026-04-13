import React, { useState, useEffect, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { strategiesApi, zoneLogsApi, rewardsApi, Strategy } from '../../src/utils/api';
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

export default function StrategiesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { zone } = useLocalSearchParams<{ zone: 'blue' | 'green' | 'yellow' | 'red' }>();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
    return zone ? labels[zone] : labels.green;
  };

  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('choose_helpers') || 'Choose your helpers',
    });
  }, [navigation, language, translations]);

  useEffect(() => {
    preloadSounds();
    fetchStrategies();
  }, [zone, currentStudent, language]);

  const fetchStrategies = async () => {
    if (!zone) return;
    setLoading(true);
    try {
      const data = currentStudent
        ? await strategiesApi.getForStudent(currentStudent.id, zone, language)
        : await strategiesApi.getByZone(zone, undefined, language);
      setStrategies(data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStrategy = (strategyId: string) => {
    playSelectFeedback();
    setSelectedStrategies(prev =>
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const handleSave = async () => {
    if (saving) return;
    playSuccessSound();
    setSaving(true);

    try {
      if (currentStudent && zone) {
        // Log zone check-in
        await zoneLogsApi.create({
          student_id: currentStudent.id,
          zone: zone,
          feeling_colour: zone,
          strategies_selected: selectedStrategies,
          helpers_selected: selectedStrategies,
          comment: comment || undefined,
          location: 'school',
        });

        // Add points
        await rewardsApi.addPoints(currentStudent.id, {
          points_type: 'checkin',
          strategy_count: selectedStrategies.length,
          feeling_colour: zone,
        });
      }

      setShowCelebration(true);
      setTimeout(() => {
        setShowCelebration(false);
        router.push(`/student/rewards?zone=${zone}&strategies=${selectedStrategies.join(',')}`);
      }, 1800);
    } catch (error) {
      console.error('Error saving:', error);
      router.push(`/student/rewards?zone=${zone}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    playButtonFeedback();
    router.push(`/student/rewards?zone=${zone}`);
  };

  return (
    <SafeAreaView style={styles.container}>
      <CelebrationOverlay visible={showCelebration} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

          {/* Zone header */}
          <View style={[styles.zoneHeader, { backgroundColor: zoneColor + '20', borderColor: zoneColor }]}>
            <View style={[styles.zoneColorDot, { backgroundColor: zoneColor }]} />
            <Text style={[styles.zoneLabel, { color: zoneColor }]}>{getZoneLabel()}</Text>
          </View>

          {/* Instruction */}
          <Text style={styles.instruction}>
            {zone === 'green'
              ? t('tap_helpers_green') || 'Tap any helpers you would like to try:'
              : t('tap_helpers_other') || 'Tap to select helpers that might help:'}
          </Text>

          {/* Strategies list */}
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

          {/* Comment section */}
          <View style={styles.commentSection}>
            <TouchableOpacity
              style={styles.commentToggle}
              onPress={() => { playButtonFeedback(); setShowCommentInput(!showCommentInput); }}
            >
              <MaterialIcons
                name="chat-bubble-outline"
                size={24}
                color={showCommentInput || comment ? zoneColor : '#999'}
              />
              <Text style={[styles.commentToggleText, (showCommentInput || comment) && { color: zoneColor }]}>
                {comment ? t('edit') || 'Edit' : t('want_to_say') || 'Want to say something?'}
              </Text>
              <MaterialIcons
                name={showCommentInput ? 'expand-less' : 'expand-more'}
                size={24}
                color="#CCC"
              />
            </TouchableOpacity>

            {showCommentInput && (
              <View style={styles.commentInputWrapper}>
                <TextInput
                  style={[styles.commentInput, { borderColor: zoneColor }]}
                  placeholder={t('write_sentence') || 'Write one sentence about how you feel...'}
                  placeholderTextColor="#BBB"
                  value={comment}
                  onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
                  multiline
                  maxLength={MAX_COMMENT_LENGTH}
                />
                <Text style={styles.charCount}>{comment.length}/{MAX_COMMENT_LENGTH}</Text>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Bottom buttons */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
            <Text style={styles.skipButtonText}>{t('skip') || 'Skip'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.doneButton, { backgroundColor: zoneColor }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.doneButtonText}>
              {saving ? t('loading') || 'Loading...' : `${t('done') || 'Done'} ${selectedStrategies.length > 0 ? `(${selectedStrategies.length})` : ''}`}
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
  zoneHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 14, borderWidth: 2, marginBottom: 16 },
  zoneColorDot: { width: 20, height: 20, borderRadius: 10, marginRight: 10 },
  zoneLabel: { fontSize: 18, fontWeight: 'bold' },
  instruction: { fontSize: 15, color: '#666', marginBottom: 16, fontStyle: 'italic' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { fontSize: 16, color: '#888' },
  commentSection: { marginTop: 16, backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  commentToggle: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  commentToggleText: { flex: 1, fontSize: 15, color: '#999' },
  commentInputWrapper: { padding: 14, paddingTop: 0 },
  commentInput: { borderWidth: 2, borderRadius: 10, padding: 12, fontSize: 15, color: '#333', minHeight: 80, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: '#BBB', textAlign: 'right', marginTop: 4 },
  bottomBar: { flexDirection: 'row', padding: 16, gap: 12, backgroundColor: 'white', borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  skipButton: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: '#DDD', alignItems: 'center' },
  skipButtonText: { fontSize: 16, color: '#888', fontWeight: '600' },
  doneButton: { flex: 2, padding: 14, borderRadius: 14, alignItems: 'center' },
  doneButtonText: { fontSize: 16, color: 'white', fontWeight: 'bold' },
});
