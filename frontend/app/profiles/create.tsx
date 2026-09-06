import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TextInput, 
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useNavigation } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { studentsApi, familyApi } from '../../src/utils/api';

const PRESET_AVATARS = [
  { id: 'cat', emoji: '🐱', name: 'Cat' },
  { id: 'dog', emoji: '🐶', name: 'Dog' },
  { id: 'bear', emoji: '🐻', name: 'Bear' },
  { id: 'bunny', emoji: '🐰', name: 'Bunny' },
  { id: 'lion', emoji: '🦁', name: 'Lion' },
  { id: 'panda', emoji: '🐼', name: 'Panda' },
  { id: 'monkey', emoji: '🐵', name: 'Monkey' },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn' },
  { id: 'star', emoji: '⭐', name: 'Star' },
];

export default function CreateProfileScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  React.useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { refreshStudents, classrooms, t, user } = useApp();
  // Jono's decision (Sep 6): gate by ACTIVE role, Google Classroom/ClassDojo convention -
  // a teacher-tier account sees only the classroom dropdown (they assign directly). The
  // dropdown was already accidentally teacher-only in practice (GET /classrooms 403s for
  // non-teacher roles, so `classrooms` was just always empty) - this makes it a deliberate
  // check instead of a side effect. A parent-facing Class Code field (link after the fact)
  // was also built and gated the other way, then hidden again in build 26 once the crash
  // audit found it was wired to a path that always 403'd for parent role - see the Class
  // Join Code comment below and COH-REVIEW-PLAN.md.
  const isTeacherRole = user?.role === 'teacher' || user?.role === 'school_admin' || user?.role === 'superadmin';
  const [name, setName] = useState('');
  const [avatarType, setAvatarType] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState('cat');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const params = useLocalSearchParams<{ classroomId?: string }>();
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(params.classroomId || null);
  const [saving, setSaving] = useState(false);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCustomImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setAvatarType('custom');
    }
  };

  const takePhoto = async () => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'Please allow access to your camera.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCustomImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setAvatarType('custom');
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this profile.');
      return;
    }

    setSaving(true);
    try {
      // Real fix (build 26, Sep 6): POST /students is teacher/school_admin/superadmin-only
      // server-side (a deliberate Aug 26 security hardening, staying as-is per Jono's
      // explicit call) - it always 403'd for parent role, silently falling into the
      // AsyncStorage-only local fallback below with no indication the profile never reached
      // the server. Parent role now goes through the real, working path instead:
      // POST /family/members already auto-creates a real students row (+ student_rewards)
      // for relationship:"child" and scopes it to the parent's own family - the exact same
      // server-side flow parent/dashboard.tsx's "Add Family Member" modal uses. Teacher role
      // is unaffected, still creates directly via studentsApi.create().
      if (isTeacherRole) {
        await studentsApi.create({
          name: name.trim(),
          avatar_type: avatarType,
          avatar_preset: avatarType === 'preset' ? selectedPreset : undefined,
          avatar_custom: avatarType === 'custom' ? customImage || undefined : undefined,
          classroom_id: selectedClassroom || undefined,
        });
      } else {
        await familyApi.createMember({
          name: name.trim(),
          relationship: 'child',
          avatar_type: avatarType,
          avatar_preset: avatarType === 'preset' ? selectedPreset : undefined,
          avatar_custom: avatarType === 'custom' ? customImage || undefined : undefined,
        });
      }
      await refreshStudents();
      Alert.alert('Profile Created!', `${name}'s profile has been created.`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error: any) {
      // Free-tier limit hit — show the real upgrade prompt instead of silently falling back
      // to local-only storage (that fallback exists for a different purpose: letting kids use
      // the app without any teacher account at all, e.g. guest/home use — it should never mask
      // a real, intentional limit with a fake "success" message)
      const msg = error?.message || '';
      if (msg.startsWith('free_tier_limit|')) {
        Alert.alert('Free Plan Limit Reached', msg.split('|')[1] || 'Upgrade to add more students.', [
          { text: 'Not Now', style: 'cancel' },
          { text: 'See Plans', onPress: () => router.push('/subscription') },
        ]);
        return;
      }
      // Fallback: save locally so student flow works without a teacher account
      // This covers children using the app directly (guest/home use)
      console.log('[CreateProfile] API failed, saving locally:', error);
      try {
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const existing = await AsyncStorage.getItem('local_students');
        const students = existing ? JSON.parse(existing) : [];
        const newStudent = {
          id: `local_${Date.now()}`,
          name: name.trim(),
          avatar_type: avatarType,
          avatar_preset: avatarType === 'preset' ? selectedPreset : 'cat',
          avatar_custom: avatarType === 'custom' ? customImage : null,
          classroom_id: selectedClassroom || null,
          created_at: new Date().toISOString(),
          is_local: true,
        };
        students.push(newStudent);
        await AsyncStorage.setItem('local_students', JSON.stringify(students));
        await refreshStudents();
        Alert.alert('Profile Created!', `${name}'s profile has been created.`, [
          { text: 'OK', onPress: () => router.back() }
        ]);
      } catch (localError) {
        console.error('Error saving profile locally:', localError);
        Alert.alert('Error', 'Failed to create profile. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 'bold', color: '#333' }}>Add Profile</Text>
        <View style={{ width: 36 }} />
      </View>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Name Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name</Text>
            <TextInput
              style={styles.nameInput}
              placeholder="Enter name..."
              value={name}
              onChangeText={setName}
              placeholderTextColor="#999"
              maxLength={30}
            />
          </View>

          {/* Avatar Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('choose_icon') || 'Choose an Avatar'}</Text>
            
            {/* Custom Photo Options */}
            <View style={styles.photoOptions}>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <MaterialIcons name="photo-library" size={28} color="#5C6BC0" />
                <Text style={styles.photoButtonText}>{t('upload_photo') || t('upload_photo') || 'Gallery'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                <MaterialIcons name="camera-alt" size={28} color="#5C6BC0" />
                <Text style={styles.photoButtonText}>{t('change_photo') || t('change_photo') || 'Camera'}</Text>
              </TouchableOpacity>
            </View>

            {/* Custom Image Preview */}
            {customImage && (
              <TouchableOpacity 
                style={[
                  styles.customPreview,
                  avatarType === 'custom' && styles.selectedPreview
                ]}
                onPress={() => setAvatarType('custom')}
              >
                <Image source={{ uri: customImage }} style={styles.customImage} />
                <Text style={styles.customLabel}>{t('photo') || t('photo') || 'Your Photo'}</Text>
                {avatarType === 'custom' && (
                  <View style={styles.checkBadge}>
                    <MaterialIcons name="check" size={16} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            )}

            {/* Preset Avatars */}
            <Text style={styles.orText}>Or choose a character:</Text>
            <View style={styles.avatarGrid}>
              {PRESET_AVATARS.map((avatar) => (
                <TouchableOpacity
                  key={avatar.id}
                  style={[
                    styles.avatarOption,
                    avatarType === 'preset' && selectedPreset === avatar.id && styles.selectedAvatar
                  ]}
                  onPress={() => {
                    setAvatarType('preset');
                    setSelectedPreset(avatar.id);
                  }}
                >
                  <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
                  <Text style={styles.avatarName}>{avatar.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Classroom Selection - teacher-tier accounts only */}
          {isTeacherRole && classrooms.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📚 Assign to Classroom</Text>
              <View style={styles.classroomList}>
                <TouchableOpacity
                  style={[
                    styles.classroomOption,
                    !selectedClassroom && styles.selectedClassroom
                  ]}
                  onPress={() => setSelectedClassroom(null)}
                >
                  <Text style={styles.classroomText}>{t('no_classroom') || t('no_classroom') || 'No Classroom'}</Text>
                </TouchableOpacity>
                {classrooms.map((classroom) => (
                  <TouchableOpacity
                    key={classroom.id}
                    style={[
                      styles.classroomOption,
                      selectedClassroom === classroom.id && styles.selectedClassroom
                    ]}
                    onPress={() => setSelectedClassroom(classroom.id)}
                  >
                    <Text style={styles.classroomText}>{classroom.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Class Join Code - HIDDEN, build 26 (Sep 6), per Jono's explicit call: this field
              was wired to POST /api/classrooms/join/{code} against a student created via
              POST /students, which always 403's for parent role (the only role this field
              ever showed for) - a field wired to a dead path must not ship. Returns in build
              27 once the new class-code endpoint (validates + creates + links the student in
              one transaction) lands - see COH-REVIEW-PLAN.md. */}

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? 'Creating...' : 'Create Profile'}
            </Text>
          </TouchableOpacity>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  nameInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  photoOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoButton: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#5C6BC0',
  },
  photoButtonText: {
    fontSize: 14,
    color: '#5C6BC0',
    marginTop: 4,
    fontWeight: '500',
  },
  customPreview: {
    alignItems: 'center',
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedPreview: {
    borderColor: '#4CAF50',
    borderWidth: 3,
  },
  customImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  customLabel: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    end: 8,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  avatarOption: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    width: 80,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedAvatar: {
    borderColor: '#4CAF50',
    borderWidth: 3,
    backgroundColor: '#E8F5E9',
  },
  avatarEmoji: {
    fontSize: 32,
  },
  avatarName: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  classroomList: {
    gap: 8,
  },
  classroomOption: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  selectedClassroom: {
    borderColor: '#5C6BC0',
    backgroundColor: '#EDE7F6',
  },
  classroomText: {
    fontSize: 16,
    color: '#333',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonDisabled: {
    backgroundColor: '#A5D6A7',
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});
