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
import { studentsApi } from '../../src/utils/api';

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
  const { refreshStudents, classrooms, t } = useApp();
  const [name, setName] = useState('');
  const [avatarType, setAvatarType] = useState<'preset' | 'custom'>('preset');
  const [selectedPreset, setSelectedPreset] = useState('cat');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const params = useLocalSearchParams<{ classroomId?: string }>();
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(params.classroomId || null);
  const [saving, setSaving] = useState(false);
  const [classJoinCode, setClassJoinCode] = useState('');
  const [joinCodeStatus, setJoinCodeStatus] = useState<'idle'|'checking'|'found'|'invalid'>('idle');
  const [joinedClassName, setJoinedClassName] = useState('');

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

  const handleJoinCodeChange = async (code: string) => {
    const upper = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    setClassJoinCode(upper);
    setJoinCodeStatus('idle');
    setJoinedClassName('');
    if (upper.length === 6) {
      setJoinCodeStatus('checking');
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const res = await fetch(`${BACKEND_URL}/api/classrooms/join/${upper}`);
        if (res.ok) {
          const data = await res.json();
          setJoinCodeStatus('found');
          setJoinedClassName(data.name);
        } else {
          setJoinCodeStatus('invalid');
        }
      } catch {
        setJoinCodeStatus('invalid');
      }
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this profile.');
      return;
    }

    setSaving(true);
    try {
      // Try server-side creation first (works when logged in as teacher/parent)
      await studentsApi.create({
        name: name.trim(),
        avatar_type: avatarType,
        avatar_preset: avatarType === 'preset' ? selectedPreset : undefined,
        avatar_custom: avatarType === 'custom' ? customImage || undefined : undefined,
        classroom_id: selectedClassroom || undefined,
      });
      await refreshStudents();
      // Join classroom if code provided
      if (classJoinCode.length === 6 && joinCodeStatus === 'found') {
        try {
          const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
          const newStudents = await (await import('../../src/utils/api')).studentsApi.getAll();
          const newStudent = newStudents.find((s: any) => s.name === name.trim());
          if (newStudent) {
            await fetch(`${BACKEND_URL}/api/classrooms/join/${classJoinCode}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ student_id: newStudent.id }),
            });
          }
        } catch (e) { console.log('Class join error:', e); }
      }
      Alert.alert('Profile Created!', `${name}'s profile has been created.${joinedClassName ? ` Added to ${joinedClassName}!` : ''}`, [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
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

          {/* Classroom Selection */}
          {classrooms.length > 0 && (
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

          {/* Class Join Code */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🏫 {t('class_code_label') || 'Class Code'}</Text>
            <Text style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>
              {t('class_code_optional') || 'Ask your teacher for your class code (optional)'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
              <TextInput
                style={[styles.nameInput, { flex: 1, fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: '700' }]}
                placeholder="ABC123"
                placeholderTextColor="#CCC"
                value={classJoinCode}
                onChangeText={handleJoinCodeChange}
                maxLength={6}
                autoCapitalize="characters"
              />
            </View>
            {joinCodeStatus === 'checking' && (
              <Text style={{ color: '#888', fontSize: 13, marginTop: 6 }}>🔍 Checking...</Text>
            )}
            {joinCodeStatus === 'found' && (
              <Text style={{ color: '#4CAF50', fontSize: 13, fontWeight: '700', marginTop: 6 }}>
                ✅ {joinedClassName}
              </Text>
            )}
            {joinCodeStatus === 'invalid' && (
              <Text style={{ color: '#F44336', fontSize: 13, marginTop: 6 }}>
                ❌ {t('invalid_class_code') || 'Code not found — check with your teacher'}
              </Text>
            )}
          </View>

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
    right: 8,
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
