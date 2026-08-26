import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
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
import { useDataGridColumns, gridCardWidth } from '../../src/utils/globalStyles';

const getZones = (t: (key: string) => string) => [
  { id: 'blue', name: t('blue_zone')||'Blue Zone', color: '#4A90D9', desc: t('blue_feeling_desc')||'Quiet Energy — Sad, Tired, Bored', face: '😢', emoji: '😢' },
  { id: 'green', name: t('green_zone')||'Green Zone', color: '#4CAF50', desc: t('green_feeling_desc')||'Balanced Energy — Calm, Happy, Focused', face: '😊', emoji: '😊' },
  { id: 'yellow', name: t('yellow_zone')||'Yellow Zone', color: '#FFC107', desc: t('yellow_feeling_desc')||'Fizzing Energy — Worried, Silly, Frustrated', face: '😟', emoji: '😟' },
  { id: 'red', name: t('red_zone')||'Red Zone', color: '#F44336', desc: t('red_feeling_desc')||'Big Energy — Angry, Scared, Overwhelmed', face: '😣', emoji: '😣' },
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
    {id:'r1', name:'Freeze', description:'Stop and hold very still for 10 seconds', icon:'front-hand'},
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
  const gridColumns = useDataGridColumns();
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const [checkedIn, setCheckedIn] = useState(false);
  const { memberId, memberName, studentId, relationship } = useLocalSearchParams<{ memberId: string; memberName: string; studentId?: string; relationship?: string }>();
  const memberRelationship = (relationship as string) || 'adult';
  const { t, language, currentStudent, students } = useApp();

  // If checking in a child, redirect to student flow with home location
  React.useEffect(() => {
    if (memberRelationship === 'child' && studentId) {
      // Find the student and set them as current, then go to student select
      router.replace({
        pathname: '/student/zone',
        params: { fromFamily: 'true', location: 'home', memberName, memberId: studentId, returnTo: 'family' }
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
    const isChild = memberRelationship === 'child';

    if (isChild) {
      // Children always get student strategies
      setStrategies(CHILD_STRATEGIES[selectedZone] as any || []);
      return;
    }

    // Adults: parent strategies + admin-authored parent strategies + any custom family strategies
    const baseStrats = PARENT_STRATEGIES[selectedZone] || [];
    const allNames = new Set(baseStrats.map((s: any) => s.name.toLowerCase()));
    let merged = [...baseStrats];
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const token = await (await import('@react-native-async-storage/async-storage')).default.getItem('session_token');

      // Real fix Aug 18 (A9): superadmin-authored parent strategies were never fetched
      // anywhere - mirrors the pattern teacher/checkin.tsx now uses, filtered by
      // strategy_type=parent so it can't pull in student/teacher content by mistake.
      const adminRes = await fetch(`${BACKEND_URL}/api/admin/teacher-strategies?strategy_type=parent`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (adminRes.ok) {
        const adminStrats = await adminRes.json();
        const adminMapped = (adminStrats || [])
          .filter((s: any) => (s.zone || s.feeling_colour) === selectedZone)
          .map((s: any) => ({
            id: s.id, name: s.name, description: s.description || '',
            icon: s.icon || 'star', zone: s.zone || selectedZone,
          }))
          .filter((s: any) => !allNames.has(s.name.toLowerCase()));
        adminMapped.forEach((s: any) => allNames.add(s.name.toLowerCase()));
        merged = [...merged, ...adminMapped];
      }

      const res = await fetch(`${BACKEND_URL}/api/family/custom-strategies?zone=${selectedZone}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const customStrats = await res.json();
        const customMapped = (customStrats || [])
          .map((s: any) => ({
            id: s.id, name: s.name, description: s.description || '',
            icon: s.icon || 'star', zone: s.zone || selectedZone,
          }))
          .filter((s: any) => !allNames.has(s.name.toLowerCase()));
        merged = [...merged, ...customMapped];
      }
      setStrategies(merged as any);
    } catch {
      setStrategies(merged as any);
    }
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
      Alert.alert('Oops', 'Please select a colour first');
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
      
      // Family/adult check-ins: show success state with wellbeing button
      setCheckedIn(true);
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

  if (checkedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Text style={{ fontSize: 60, marginBottom: 16 }}>✅</Text>
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#333', marginBottom: 8, textAlign: 'center' }}>
            {t('checkin_complete') || 'Check-in saved ✅'}
          </Text>
          <Text style={{ fontSize: 15, color: '#888', textAlign: 'center', marginBottom: 40 }}>
            {memberName}
          </Text>

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C6BC0', borderRadius: 16, padding: 18, gap: 12, width: '100%', marginBottom: 14 }}
            onPress={() => router.push({ pathname: '/parent/my-wellbeing' as any, params: { memberId, memberName } })}
          >
            <Text style={{ fontSize: 24 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>{t('view_my_wellbeing') || 'View My Wellbeing'}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>{t('wellbeing_pin_desc') || 'Private. Just for you.'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            style={{ padding: 16 }}
            onPress={() => router.back()}
          >
            <Text style={{ fontSize: 15, color: '#5C6BC0', fontWeight: '600' }}>{t('done') || 'Done'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { marginTop: 8 }]}>
          <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Image source={require('../../assets/images/logo_coh.png')} style={{ width: 28, height: 28 }} resizeMode="contain" />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>{step === 'zone' ? (t('how_are_you_feeling') || 'How are you feeling?') : (t('choose_helpful_strategies') || 'Choose a Strategy')}</Text>
            <Text style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{t('checkin_for') || 'Check-in for'} {memberName}</Text>
          </View>
          <TouchableOpacity onPress={() => router.replace('/parent/dashboard')} style={{ padding: 6 }}>
            <MaterialIcons name="home" size={22} color="#333" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps='handled'>
          {step === 'zone' ? (
            /* Zone Selection */
            <>
            <View style={{ flexDirection:'row', justifyContent:'center', gap:16, marginBottom:10, flexWrap:'wrap' }}>
              {[
                { color:'#4A90D9', emoji:'😢', label: t('blue_feeling_short')||'Sad / Tired' },
                { color:'#4CAF50', emoji:'😊', label: t('green_feeling_short')||'Happy / Calm' },
                { color:'#FFC107', emoji:'😟', label: t('yellow_feeling_short')||'Worried / Silly' },
                { color:'#F44336', emoji:'😣', label: t('red_feeling_short')||'Angry / Scared' },
              ].map(z => (
                <View key={z.color} style={{ alignItems:'center', gap:2 }}>
                  <Text style={{ fontSize:18 }}>{z.emoji}</Text>
                  <Text style={{ fontSize:9, color:z.color, fontWeight:'600', textAlign:'center', maxWidth:60 }}>{z.label}</Text>
                </View>
              ))}
            </View>
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
            <View style={{ marginTop: 8, padding: 12, backgroundColor: '#F8F9FA', borderRadius: 12 }}>
              <Text style={{ fontSize: 11, color: '#666', lineHeight: 16, textAlign: 'center' }}>
                Research shows that naming our emotional state helps regulate it. Blue = low energy, Green = regulated, Yellow = heightened, Red = dysregulated.
              </Text>
            </View>
            </>
          ) : (
            /* Strategies Selection */
            <>
              {/* Selected Emotion Badge */}
              <View style={[styles.selectedZoneBadge, { backgroundColor: zoneConfig?.color }]}>
                <Text style={styles.selectedZoneFace}>{zoneConfig?.face}</Text>
                <Text style={styles.selectedZoneText}>{zoneConfig?.name} {t('emotions') || 'Emotions'}</Text>
                <TouchableOpacity onPress={() => setStep('zone')} style={styles.changeZoneButton}>
                  <Text style={styles.changeZoneText}>{t('change') || 'Change'}</Text>
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
                      { width: gridCardWidth(gridColumns) },
                      selectedStrategies.includes(strategy.id) && {
                        borderColor: zoneConfig?.color,
                        backgroundColor: zoneConfig?.color + '20',
                      },
                    ]}
                    onPress={() => toggleStrategy(strategy.id)}
                  >
                    <MaterialIcons
                      name={strategy.icon as any || 'star'}
                      size={20}
                      color={selectedStrategies.includes(strategy.id) ? zoneConfig?.color : '#666'}
                    />
                    <Text style={styles.strategyName}>{strategy.name}</Text>
                    {false && strategy.description ? (
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
                    multiline
                    returnKeyType='done'
                    blurOnSubmit
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
  header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
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
    padding: 14,
    borderRadius: 14,
    marginBottom: 8,
  },
  zoneCardSelected: {
    borderWidth: 4,
    borderColor: 'white',
  },
  zoneFace: {
    fontSize: 30,
    marginRight: 10,
  },
  zoneCenter: {
    flex: 1,
  },
  zoneName: {
    fontSize: 17,
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
  strategiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  strategyCard: { backgroundColor: 'white', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 6, alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0', position: 'relative', flexDirection: 'row', gap: 4 },
  strategyDesc: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  strategyName: { fontSize: 11, fontWeight: '600', color: '#333', flex: 1, textAlign: 'left' },
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
