import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { familyApi, FamilyMember, strategiesApi, Strategy } from '../../src/utils/api';

const getZones = (t: (key: string) => string) => [
  { id: 'blue', name: t('blue_zone')||'Blue Zone', color: '#4A90D9', desc: t('blue_feeling')||'Quiet Energy — Sad, Tired, Bored', face: '😢', emoji: '😢' },
  { id: 'green', name: t('green_zone')||'Green Zone', color: '#4CAF50', desc: t('green_feeling')||'Balanced Energy — Calm, Happy, Focused', face: '😊', emoji: '😊' },
  { id: 'yellow', name: t('yellow_zone')||'Yellow Zone', color: '#FFC107', desc: t('yellow_feeling')||'Fizzing Energy — Worried, Silly, Frustrated', face: '😟', emoji: '😟' },
  { id: 'red', name: t('red_zone')||'Red Zone', color: '#F44336', desc: t('red_feeling')||'Big Energy — Angry, Scared, Overwhelmed', face: '😣', emoji: '😣' },
];

const MAX_COMMENT_LENGTH = 100;

export default function FamilyCheckInScreen() {
  const router = useRouter();
  const { memberId, memberName, studentId } = useLocalSearchParams<{ memberId: string; memberName: string; studentId?: string }>();
  const { t, language } = useApp();
  
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'zone' | 'strategies'>('zone');

  useEffect(() => {
    if (selectedZone) {
      fetchStrategies();
    }
  }, [selectedZone]);

  const fetchStrategies = async () => {
    if (!selectedZone) return;
    try {
      const data = await strategiesApi.getByZone(selectedZone, undefined, language || 'en');
      setStrategies(data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZone(zoneId);
    setStep('strategies');
  };

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies(prev =>
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const handleSubmit = async () => {
    if (!selectedZone) {
      Alert.alert('Oops', 'Please select a zone first');
      return;
    }
    if (!memberId) {
      Alert.alert('Error', 'Family member not found. Please go back and try again.');
      return;
    }
    
    setLoading(true);
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage.getItem('session_token');
      const res = await fetch(`${BACKEND_URL}/api/family/members/${memberId}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          zone: selectedZone,
          helpers_selected: selectedStrategies,
          comment: comment.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Could not save check-in');
      }
      
      // Family/adult check-ins: no creature reward, just go back with a success message
      Alert.alert(
        t('checkin_saved') || 'Check-in Saved! ✅',
        t('checkin_saved_message') || 'Great job checking in today!',
        [{ text: t('done') || 'Done', onPress: () => router.back() }]
      );
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to save check-in';
      // Give a friendlier message if family member not found
      if (errorMessage.toLowerCase().includes('not found')) {
        Alert.alert(
          'Error',
          'This family member could not be found. Please go back and try again.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const zoneConfig = selectedZone ? getZones(t).find(z => z.id === selectedZone) : null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{t('checkin_for')} {memberName}</Text>
            <Text style={styles.headerSubtitle}>
              {step === 'zone' ? t('how_everyone_feeling') : t('choose_helpful_strategies')}
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {step === 'zone' ? (
            /* Zone Selection - aligned with student full-width color cards */
            <View style={styles.zonesStack}>
              {getZones(t).map((zone) => (
                <TouchableOpacity
                  key={zone.id}
                  style={[
                    styles.zoneCard,
                    { backgroundColor: zone.color },
                    selectedZone === zone.id && styles.zoneCardSelected,
                  ]}
                  onPress={() => handleZoneSelect(zone.id)}
                >
                  <Text style={styles.zoneFace}>{zone.face}</Text>
                  <View style={styles.zoneCenter}>
                    <Text style={styles.zoneName}>{zone.name}</Text>
                    <Text style={styles.zoneDesc}>{zone.desc}</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={26} color="rgba(255,255,255,0.85)" />
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            /* Strategies Selection */
            <>
              {/* Selected Emotion Badge */}
              <View style={[styles.selectedZoneBadge, { backgroundColor: zoneConfig?.color }]}>
                <Text style={styles.selectedZoneFace}>{zoneConfig?.face}</Text>
                <Text style={styles.selectedZoneText}>{zoneConfig?.name} Emotions</Text>
                <TouchableOpacity onPress={() => setStep('zone')} style={styles.changeZoneButton}>
                  <Text style={styles.changeZoneText}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* Strategies List */}
              <Text style={styles.sectionTitle}>{t('select_helpful_strategies')}</Text>
              <View style={styles.strategiesGrid}>
                {strategies.map((strategy) => (
                  <TouchableOpacity
                    key={strategy.id}
                    style={[
                      styles.strategyCard,
                      selectedStrategies.includes(strategy.id) && {
                        borderColor: zoneConfig?.color,
                        backgroundColor: zoneConfig?.color + '20',
                      },
                    ]}
                    onPress={() => toggleStrategy(strategy.id)}
                  >
                    <MaterialIcons
                      name={strategy.icon as any || 'star'}
                      size={32}
                      color={selectedStrategies.includes(strategy.id) ? zoneConfig?.color : '#666'}
                    />
                    <Text style={styles.strategyName}>{strategy.name}</Text>
                    {selectedStrategies.includes(strategy.id) && (
                      <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color} style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Comment Section */}
              <TouchableOpacity
                style={styles.commentToggle}
                onPress={() => setShowCommentInput(!showCommentInput)}
              >
                <MaterialIcons
                  name="chat-bubble-outline"
                  size={24}
                  color={showCommentInput || comment ? zoneConfig?.color : '#999'}
                />
                <Text style={[
                  styles.commentToggleText,
                  (showCommentInput || comment) && { color: zoneConfig?.color }
                ]}>
                  {comment ? t('edit_note') : t('add_note_optional')}
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
                    style={[styles.commentInput, { borderColor: zoneConfig?.color }]}
                    placeholder={t('write_short_note')}
                    placeholderTextColor="#999"
                    value={comment}
                    onChangeText={(text) => setComment(text.slice(0, MAX_COMMENT_LENGTH))}
                    maxLength={MAX_COMMENT_LENGTH}
                  />
                  <Text style={styles.commentCounter}>
                    {comment.length}/{MAX_COMMENT_LENGTH}
                  </Text>
                </View>
              )}

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, { backgroundColor: zoneConfig?.color }, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? t('saving') : t('save_checkin')}
                </Text>
              </TouchableOpacity>

              {/* Skip Button */}
              <TouchableOpacity
                style={styles.skipButton}
                onPress={() => {
                  setSelectedStrategies([]);
                  handleSubmit();
                }}
              >
                <Text style={styles.skipButtonText}>{t('skip_strategies')}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  zonesStack: {
    gap: 12,
  },
  zoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
  },
  zoneCardSelected: {
    borderWidth: 4,
    borderColor: 'white',
  },
  zoneFace: {
    fontSize: 40,
    marginRight: 12,
  },
  zoneCenter: {
    flex: 1,
  },
  zoneName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: 'white',
  },
  zoneDesc: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  selectedZoneBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  selectedZoneFace: {
    fontSize: 28,
    marginRight: 12,
  },
  selectedZoneText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: 'white',
  },
  changeZoneButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  changeZoneText: {
    color: 'white',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  strategiesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  strategyCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    position: 'relative',
  },
  strategyName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  checkIcon: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  commentToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  commentToggleText: {
    flex: 1,
    fontSize: 15,
    color: '#666',
  },
  commentInputContainer: {
    marginBottom: 20,
  },
  commentInput: {
    backgroundColor: 'white',
    borderWidth: 2,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
  },
  commentCounter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: 6,
  },
  submitButton: {
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    padding: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#999',
    fontSize: 16,
  },
});
