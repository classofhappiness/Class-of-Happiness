import React, { useState, useEffect } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { studentsApi } from '../../src/utils/api';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';

const PRESET_AVATARS = [
  { id: 'cat', emoji: '🐱', nameKey: 'avatar_cat' },
  { id: 'dog', emoji: '🐶', nameKey: 'avatar_dog' },
  { id: 'bear', emoji: '🐻', nameKey: 'avatar_bear' },
  { id: 'bunny', emoji: '🐰', nameKey: 'avatar_bunny' },
  { id: 'lion', emoji: '🦁', nameKey: 'avatar_lion' },
  { id: 'panda', emoji: '🐼', nameKey: 'avatar_panda' },
  { id: 'monkey', emoji: '🐵', nameKey: 'avatar_monkey' },
  { id: 'unicorn', emoji: '🦄', nameKey: 'avatar_unicorn' },
  { id: 'star', emoji: '⭐', nameKey: 'avatar_star' },
  { id: 'rainbow', emoji: '🌈', nameKey: 'avatar_rainbow' },
];

export default function EditProfileScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { refreshStudents, classrooms, students, t } = useApp();
  
  const student = students.find(s => s.id === studentId);
  
  const [name, setName] = useState(student?.name || '');
  const [avatarType, setAvatarType] = useState<'preset' | 'custom'>(student?.avatar_type || 'preset');
  const [selectedPreset, setSelectedPreset] = useState(student?.avatar_preset || 'cat');
  const [customImage, setCustomImage] = useState<string | null>(student?.avatar_custom || null);
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(student?.classroom_id || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (student) {
      setName(student.name);
      setAvatarType(student.avatar_type);
      setSelectedPreset(student.avatar_preset || 'cat');
      setCustomImage(student.avatar_custom || null);
      setSelectedClassroom(student.classroom_id || null);
    }
  }, [student]);

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert(t('permission_needed_title') || 'Permission needed', t('photo_permission_desc') || 'Please allow access to your photos.');
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
      Alert.alert(t('permission_needed_title') || 'Permission needed', t('camera_permission_desc') || 'Please allow access to your camera.');
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
      Alert.alert(t('name_required_title') || 'Name required', t('name_required_profile_msg') || 'Please enter a name for this profile.');
      return;
    }

    if (!studentId) return;

    setSaving(true);
    try {
      await studentsApi.update(studentId, {
        name: name.trim(),
        avatar_type: avatarType,
        avatar_preset: avatarType === 'preset' ? selectedPreset : undefined,
        avatar_custom: avatarType === 'custom' ? customImage || undefined : undefined,
        classroom_id: selectedClassroom,
      });

      // Real fix Sep 24 (item2, second device-log pass): force bypasses refreshStudents' new
      // 30s TTL cache - a student was just edited, the list must reflect it now, not whenever
      // the cache happens to expire.
      await refreshStudents({ force: true });
      Alert.alert(t('profile_updated_title') || 'Profile Updated!', (t('profile_updated_msg') || "{name}'s profile has been updated.").replace('{name}', name), [
        { text: t('ok') || 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      console.error('Error updating profile:', error);
      Alert.alert(t('error') || 'Error', t('update_profile_failed') || 'Failed to update profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      t('delete_student') || 'Delete Profile',
      (t('delete_profile_confirm') || "Are you sure you want to delete {name}'s profile? This will also delete all their check-ins.").replace('{name}', name),
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await studentsApi.delete(studentId!);
              await refreshStudents({ force: true });
              router.back();
            } catch (error) {
              Alert.alert(t('error') || 'Error', t('delete_profile_failed') || 'Failed to delete profile.');
            }
          },
        },
      ]
    );
  };

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('student_not_found') || t('student_not_found') || 'Student not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('edit') || 'Edit'} showHome />
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Name Input */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('name') || 'Name'}</Text>
            <TextInput
              style={styles.nameInput}
              placeholder={t('enter_name_placeholder') || 'Enter name...'}
              value={name}
              onChangeText={setName}
              placeholderTextColor="#999"
              maxLength={30}
            />
          </View>

          {/* Avatar Selection */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t('icon') || t('icon') || 'Avatar'}</Text>
            
            <View style={styles.photoOptions}>
              <TouchableOpacity style={styles.photoButton} onPress={pickImage}>
                <MaterialIcons name="photo-library" size={28} color="#5C6BC0" />
                <Text style={styles.photoButtonText}>{t('upload_photo') || 'Gallery'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
                <MaterialIcons name="camera-alt" size={28} color="#5C6BC0" />
                <Text style={styles.photoButtonText}>{t('change_photo') || 'Camera'}</Text>
              </TouchableOpacity>
            </View>

            {customImage && (
              <TouchableOpacity 
                style={[
                  styles.customPreview,
                  avatarType === 'custom' && styles.selectedPreview
                ]}
                onPress={() => setAvatarType('custom')}
              >
                <Image source={{ uri: customImage }} style={styles.customImage} />
                {/* Real fix Oct 1 (Marisa S25, same gap on the Edit screen as Create): was
                    "Your Photo" - she suggested "Profile Picture" instead. */}
                <Text style={styles.customLabel}>{t('profile_picture_label') || 'Profile Picture'}</Text>
                {avatarType === 'custom' && (
                  <View style={styles.checkBadge}>
                    <MaterialIcons name="check" size={16} color="white" />
                  </View>
                )}
              </TouchableOpacity>
            )}

            <Text style={styles.orText}>{t('or_choose_character') || 'Or choose a character:'}</Text>
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
                  <Text style={styles.avatarName}>{t(avatar.nameKey) || avatar.id}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Classroom Selection */}
          {classrooms.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('classroom') || t('classroom') || 'Classroom'}</Text>
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

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? (t('saving') || 'Saving...') : (t('save_changes') || 'Save Changes')}
            </Text>
          </TouchableOpacity>

          {/* Delete Button */}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
          >
            <MaterialIcons name="delete" size={20} color="#F44336" />
            <Text style={styles.deleteButtonText}>{t('delete_student') || t('delete_student') || 'Delete Profile'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 12,
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#F44336',
  },
});
