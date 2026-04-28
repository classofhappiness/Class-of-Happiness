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
  Image,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { familyApi, FamilyMember, strategiesApi, Strategy } from '../../src/utils/api';

const getZones = (t: (key: string) => string) => [
  { id: 'blue', name: t('blue_zone')||'Blue Zone', color: '#4A90D9', desc: t('blue_feeling')||'Quiet Energy — Sad, Tired, Bored', face: '😢', emoji: '😢' },
  { id: 'green', name: t('green_zone')||'Green Zone', color: '#4CAF50', desc: t('green_feeling')||'Balanced Energy — Calm, Happy, Focused', face: '😊', emoji: '😊' },
  { id: 'yellow', name: t('yellow_zone')||'Yellow Zone', color: '#FFC107', desc: t('yellow_feeling')||'Fizzing Energy — Worried, Silly, Frustrated', face: '😟', emoji: '😟' },
  { id: 'red', name: t('red_zone')||'Red Zone', color: '#F44336', desc: t('red_feeling')||'Big Energy — Angry, Scared, Overwhelmed', face: '😣', emoji: '😣' },
];

const MAX_COMMENT_LENGTH = 100;

// Research-backed parent strategies per zone

// Child strategies - same as student app (for family members with relationship='child')
const CHILD_STRATEGIES: Record<string, Array<{id:string; name:string; description:string; icon:string}>> = {
  blue: [
    {id:'b1', name:'Gentle Stretch', description:'Move your body slowly and gently', icon:'fitness-center'},
    {id:'b2', name:'Favourite Song', description:'Listen to a calming favourite song', icon:'music-note'},
    {id:'b3', name:'Tell Someone', description:'Share how you feel with a trusted person', icon:'chat'},
    {id:'b4', name:'Slow Breathing', description:'Breathe in slowly, hold, breathe out', icon:'air'},
  ],
  green: [
    {id:'g1', name:'Keep Going!', description:'You are in a great zone — keep it up!', icon:'thumb-up'},
    {id:'g2', name:'Help a Friend', description:'Use your good energy to help someone else', icon:'favorite'},
    {id:'g3', name:'Set a Goal', description:'Plan something you want to achieve today', icon:'lightbulb'},
    {id:'g4', name:'Gratitude', description:'Think of three things you are grateful for', icon:'star'},
  ],
  yellow: [
    {id:'y1', name:'Bubble Breathing', description:'Breathe out slowly like blowing a bubble', icon:'air'},
    {id:'y2', name:'Count to 10', description:'Count slowly from 1 to 10 before reacting', icon:'filter-9-plus'},
    {id:'y3', name:'5 Senses', description:'Name 5 things you can see, hear, feel', icon:'visibility'},
    {id:'y4', name:'Talk About It', description:'Find a safe person to share your feelings', icon:'chat'},
  ],
  red: [
    {id:'r1', name:'Freeze', description:'Stop and hold very still for 10 seconds', icon:'pan-tool'},
    {id:'r2', name:'Big Breaths', description:'Take 3 big deep breaths right now', icon:'air'},
    {id:'r3', name:'Safe Space', description:'Move to a quiet safe place to calm down', icon:'home'},
    {id:'r4', name:'Ask for Help', description:'Tell an adult you need support right now', icon:'support-agent'},
  ],
};

const PARENT_STRATEGIES: Record<string, Array<{id:string; name:string; description:string; icon:string}>> = {
  blue: [
    {id:'p_b1', name:'Side-by-Side Presence', description:'Sit quietly together without fixing', icon:'people'},
    {id:'p_b2', name:'Warm Drink Together', description:'Make a warm drink and chat gently', icon:'local-cafe'},
    {id:'p_b3', name:'Name It to Tame It', description:'Gently label the feeling out loud', icon:'chat-bubble'},
    {id:'p_b4', name:'Gentle Movement', description:'A slow walk outside together', icon:'directions-walk'},
    {id:'p_b5', name:'Comfort & Closeness', description:'A long warm hug, no words needed', icon:'favorite'},
  ],
  green: [
    {id:'p_g1', name:'Gratitude Round', description:'Share one thing each person is grateful for', icon:'favorite'},
    {id:'p_g2', name:'Strength Spotting', description:'Notice and name a strength you saw today', icon:'star'},
    {id:'p_g3', name:'Creative Time', description:'Draw, cook or build something together', icon:'palette'},
    {id:'p_g4', name:'Family Dance', description:'Put on a song and move together', icon:'music-note'},
    {id:'p_g5', name:'Calm Problem Solving', description:'Plan and solve a challenge together', icon:'lightbulb'},
  ],
  yellow: [
    {id:'p_y1', name:'Box Breathing Together', description:'In 4, hold 4, out 4 — do it together', icon:'air'},
    {id:'p_y2', name:'Validate First', description:'Say "that makes sense" before solving', icon:'volunteer-activism'},
    {id:'p_y3', name:'Body Check-In', description:'Where do you feel this in your body?', icon:'accessibility'},
    {id:'p_y4', name:'Feelings Journal', description:'Write or draw the feeling', icon:'edit'},
    {id:'p_y5', name:'Give Space with Love', description:'5 mins space, then check back warmly', icon:'timer'},
  ],
  red: [
    {id:'p_r1', name:'Stay Calm Yourself', description:'Your calm regulates theirs — breathe first', icon:'self-improvement'},
    {id:'p_r2', name:'Safe Space Together', description:'Move to a quieter place together', icon:'home'},
    {id:'p_r3', name:'Cold Water Reset', description:'Cold water on face reduces heart rate fast', icon:'water'},
    {id:'p_r4', name:'No Teaching Now', description:'Wait for calm before discussing behaviour', icon:'do-not-disturb'},
    {id:'p_r5', name:'Reconnect with Warmth', description:'Hug and soft voice before any correction', icon:'favorite-border'},
  ],
};


export default function FamilyCheckInScreen() {
  const router = useRouter();
  const { memberId, memberName, studentId, relationship } = useLocalSearchParams<{ memberId: string; memberName: string; studentId?: string; relationship?: string }>();
  const memberRelationship = (relationship as string) || 'adult';
  const { t, language, currentStudent, students } = useApp();

  // If checking in a child, redirect to student flow with home location
  React.useEffect(() => {
    if (memberRelationship === 'child' && studentId) {
      // Find the student and set them as current, then go to student select
      router.replace({
        pathname: '/student/select',
        params: { fromHome: 'true', linkedStudentId: studentId, memberName }
      });
    }
  }, [memberRelationship, studentId]);
  
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'zone' | 'strategies'>('zone');
  const [photoUri, setPhotoUri] = useState<string | null>(null);

  useEffect(() => {
    if (selectedZone) {
      fetchStrategies();
    }
  }, [selectedZone]);

  const fetchStrategies = async () => {
    if (!selectedZone) return;
    // Children get student strategies, adults get parent co-regulation strategies
    const isChild = memberRelationship === 'child';
    const strats = isChild
      ? (CHILD_STRATEGIES[selectedZone] || [])
      : (PARENT_STRATEGIES[selectedZone] || []);
    setStrategies(strats as any);
  };

  const handleZoneSelect = (zoneId: string) => {
    setSelectedZone(zoneId);
    setStep('strategies');
  };

  const handleAddPhoto = () => {
    Alert.alert(
      'Add a Photo',
      'Attach a photo to this check-in (optional)',
      [
        {
          text: '📷 Take Photo',
          onPress: async () => {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission needed', 'Please allow camera access in Settings.');
              return;
            }
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
        {
          text: '🖼️ Choose from Library',
          onPress: async () => {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) {
              Alert.alert('Permission needed', 'Please allow photo library access in Settings.');
              return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.6,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
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
          photo_uri: photoUri || undefined,
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
                    { backgroundColor: selectedZone === zone.id ? zone.color : zone.color + 'CC' },
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
                    {strategy.description ? (
                      <Text style={styles.strategyDesc}>{strategy.description}</Text>
                    ) : null}
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

              {/* Photo Attachment */}
              <TouchableOpacity
                style={styles.photoButton}
                onPress={handleAddPhoto}
              >
                <MaterialIcons
                  name={photoUri ? 'photo' : 'add-a-photo'}
                  size={24}
                  color={photoUri ? zoneConfig?.color : '#999'}
                />
                <Text style={[styles.photoButtonText, photoUri && { color: zoneConfig?.color }]}>
                  {photoUri ? '📷 Photo added — tap to change' : '📷 Add a photo (optional)'}
                </Text>
                {photoUri && (
                  <TouchableOpacity onPress={() => setPhotoUri(null)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
                    <MaterialIcons name="close" size={18} color="#999" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
              {photoUri && (
                <Image
                  source={{ uri: photoUri }}
                  style={styles.photoPreview}
                  resizeMode="cover"
                />
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
  strategyDesc: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
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
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  photoButtonText: {
    flex: 1,
    fontSize: 15,
    color: '#999',
  },
  photoPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 16,
  },
});
