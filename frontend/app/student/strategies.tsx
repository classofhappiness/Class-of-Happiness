import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { strategiesApi, zoneLogsApi, Strategy } from '../../src/utils/api';
import { StrategyCard } from '../../src/components/StrategyCard';
import { ZONE_CONFIG } from '../../src/components/ZoneButton';
import { CelebrationOverlay } from '../../src/components/CelebrationOverlay';
import { playButtonFeedback, playSelectFeedback, playSuccessSound, preloadSounds } from '../../src/utils/sounds';

const MAX_COMMENT_LENGTH = 100;

export default function StrategiesScreen() {
  const router = useRouter();
  const { zone } = useLocalSearchParams<{ zone: 'blue' | 'green' | 'yellow' | 'red' }>();
  const { currentStudent, presetAvatars, t, language } = useApp();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [comment, setComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);

  // Get translated zone label
  const getZoneLabel = () => {
    const labels: Record<string, string> = {
      blue: t('blue_zone') || 'Blue Emotions',
      green: t('green_zone') || 'Green Emotions',
      yellow: t('yellow_zone') || 'Yellow Emotions',
      red: t('red_zone') || 'Red Emotions',
    };
    return zone ? labels[zone] : labels.green;
  };

  const zoneConfig = zone ? ZONE_CONFIG[zone] : ZONE_CONFIG.green;

  useEffect(() => {
    preloadSounds(); // Preload sounds
    fetchStrategies();
  }, [zone, currentStudent, language]);

  const fetchStrategies = async () => {
    if (!zone) return;
    try {
      // Fetch strategies including custom ones for this student, with language
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
    playSelectFeedback(); // Play sound when selecting/deselecting
    setSelectedStrategies(prev => 
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const handleDone = async () => {
    if (!currentStudent || !zone) return;
    
    playSuccessSound(); // Play success sound
    setSaving(true);
    try {
      await zoneLogsApi.create({
        student_id: currentStudent.id,
        zone: zone,
        strategies_selected: selectedStrategies,
        comment: comment.trim() || undefined,
      });
      
      // Navigate to rewards screen with points info AND the zone
      router.replace({
        pathname: '/student/rewards',
        params: {
          strategiesUsed: selectedStrategies.length.toString(),
          hasComment: comment.trim() ? 'true' : 'false',
          zone: zone,  // Pass the zone so rewards knows which creature to feed!
        },
      });
    } catch (error) {
      console.error('Error saving zone log:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!currentStudent || !zone) return;
    
    playButtonFeedback(); // Play button sound
    setSaving(true);
    try {
      await zoneLogsApi.create({
        student_id: currentStudent.id,
        zone: zone,
        strategies_selected: [],
      });
      
      // Still go to rewards to show creature, with the zone
      router.replace({
        pathname: '/student/rewards',
        params: {
          strategiesUsed: '0',
          hasComment: 'false',
          zone: zone,  // Pass the zone so rewards knows which creature to feed!
        },
      });
    } catch (error) {
      console.error('Error saving zone log:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    router.replace('/student/rewards');
  };

  if (!zone) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>No zone selected</Text>
      </SafeAreaView>
    );
  }

  // Get current date and time for display
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Celebration Overlay */}
      {currentStudent && (
        <CelebrationOverlay
          visible={showCelebration}
          studentName={currentStudent.name}
          avatarType={currentStudent.avatar_type as 'preset' | 'custom'}
          avatarPreset={currentStudent.avatar_preset}
          avatarCustom={currentStudent.avatar_custom}
          presetAvatars={presetAvatars}
          onComplete={handleCelebrationComplete}
          translations={{
            well_done: t('well_done'),
            support_message: t('support_message'),
          }}
        />
      )}

      {/* Emotion Header */}
      <View style={[styles.header, { backgroundColor: zoneConfig.color }]}>
        <Text style={styles.zoneFace}>{zoneConfig.face}</Text>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{getZoneLabel()}</Text>
          <Text style={styles.headerSubtitle}>
            {zone === 'green' 
              ? t('green_zone_help')
              : t('other_zone_help')}
          </Text>
        </View>
      </View>

      {/* Date/Time Banner */}
      <View style={styles.dateTimeBanner}>
        <MaterialIcons name="schedule" size={18} color="#666" />
        <Text style={styles.dateTimeText}>{dateStr} at {timeStr}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>{t('loading_strategies')}</Text>
        ) : (
          <>
            <Text style={styles.instruction}>
              {zone === 'green' 
                ? t('tap_strategies_green')
                : t('tap_strategies_help')}
            </Text>
            
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                name={strategy.name}
                description={strategy.description}
                icon={strategy.icon}
                customImage={strategy.custom_image}
                imageType={strategy.image_type}
                selected={selectedStrategies.includes(strategy.id)}
                onPress={() => toggleStrategy(strategy.id)}
                zoneColor={zoneConfig.color}
              />
            ))}

            {/* Comment Bubble Section */}
            <View style={styles.commentSection}>
              <TouchableOpacity
                style={styles.commentToggle}
                onPress={() => setShowCommentInput(!showCommentInput)}
              >
                <MaterialIcons 
                  name="chat-bubble-outline" 
                  size={24} 
                  color={showCommentInput || comment ? zoneConfig.color : '#999'} 
                />
                <Text style={[
                  styles.commentToggleText,
                  (showCommentInput || comment) && { color: zoneConfig.color }
                ]}>
                  {comment ? t('edit') : t('want_to_say')}
                </Text>
                <MaterialIcons 
                  name={showCommentInput ? 'expand-less' : 'expand-more'} 
                  size={24} 
                  color="#999" 
                />
              </TouchableOpacity>

              {showCommentInput && (
                <View style={styles.commentInputContainer}>
                  <TextInput
                    style={[styles.commentInput, { borderColor: zoneConfig.color }]}
                    placeholder={t('write_sentence')}
                    placeholderTextColor="#999"
                    value={comment}
                    onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
                    maxLength={MAX_COMMENT_LENGTH}
                    multiline={false}
                    returnKeyType="done"
                  />
                  <Text style={styles.commentCounter}>
                    {comment.length}/{MAX_COMMENT_LENGTH}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={saving}
        >
          <Text style={styles.skipButtonText}>{t('skip')}</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.doneButton, { backgroundColor: zoneConfig.color }]}
          onPress={handleDone}
          disabled={saving}
        >
          <Text style={styles.doneButtonText}>
            {saving ? t('loading') : `${t('done')} ${selectedStrategies.length > 0 ? `(${selectedStrategies.length})` : ''}`}
          </Text>
          <MaterialIcons name="check" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  zoneFace: {
    fontSize: 40,
  },
  headerText: {
    marginLeft: 16,
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  dateTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4FD',
    paddingVertical: 10,
    gap: 8,
  },
  dateTimeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  bottomButtons: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 40,
    gap: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  skipButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  doneButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  commentSection: {
    marginTop: 20,
    marginBottom: 10,
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
  },
  commentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 10,
  },
  commentToggleText: {
    flex: 1,
    fontSize: 15,
    color: '#666',
  },
  commentInputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  commentInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: '#FAFAFA',
  },
  commentCounter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 6,
  },
});
