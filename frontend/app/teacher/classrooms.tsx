import React, { useState, useLayoutEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { classroomsApi } from '../../src/utils/api';

export default function ManageClassroomsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { classrooms, students, refreshClassrooms, t, language, translations } = useApp();
  const [modalVisible, setModalVisible] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [creating, setCreating] = useState(false);

  // Set translated header title - depend on language/translations to trigger updates
  useLayoutEffect(() => {
    navigation.setOptions({
      title: t('classrooms'),
    });
  }, [navigation, language, translations]);

  const getStudentCount = (classroomId: string) => {
    return students.filter(s => s.classroom_id === classroomId).length;
  };

  const handleCreateClassroom = async () => {
    if (!newClassName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for the classroom.');
      return;
    }

    setCreating(true);
    try {
      await classroomsApi.create({
        name: newClassName.trim(),
        teacher_name: newTeacherName.trim() || undefined,
      });
      await refreshClassrooms();
      setModalVisible(false);
      setNewClassName('');
      setNewTeacherName('');
      Alert.alert('Success', 'Classroom created successfully!');
    } catch (error) {
      Alert.alert('Error', 'Failed to create classroom.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClassroom = (classroom: typeof classrooms[0]) => {
    const studentCount = getStudentCount(classroom.id);
    Alert.alert(
      'Delete Classroom',
      `Are you sure you want to delete "${classroom.name}"?${studentCount > 0 ? ` ${studentCount} student(s) will be moved to "No Classroom".` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await classroomsApi.delete(classroom.id);
              await refreshClassrooms();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete classroom.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Add Classroom Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <MaterialIcons name="add" size={24} color="white" />
          <Text style={styles.addButtonText}>Create New Classroom</Text>
        </TouchableOpacity>

        {/* Classrooms List */}
        {classrooms.length > 0 ? (
          classrooms.map((classroom) => (
            <View key={classroom.id} style={styles.classroomCard}>
              <View style={styles.classroomMain}>
                <View style={styles.classroomIcon}>
                  <MaterialIcons name="school" size={28} color="#5C6BC0" />
                </View>
                <View style={styles.classroomInfo}>
                  <Text style={styles.classroomName}>{classroom.name}</Text>
                  {classroom.teacher_name && (
                    <Text style={styles.teacherName}>
                      Teacher: {classroom.teacher_name}
                    </Text>
                  )}
                  <Text style={styles.studentCount}>
                    {getStudentCount(classroom.id)} student(s)
                  </Text>
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteClassroom(classroom)}
              >
                <MaterialIcons name="delete" size={22} color="#F44336" />
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="school" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No classrooms yet</Text>
            <Text style={styles.emptySubtext}>
              Create a classroom to organize your students
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create Classroom Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Classroom</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Classroom Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Room 101, Grade 3A"
                value={newClassName}
                onChangeText={setNewClassName}
                placeholderTextColor="#999"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Teacher Name (Optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Ms. Johnson"
                value={newTeacherName}
                onChangeText={setNewTeacherName}
                placeholderTextColor="#999"
              />
            </View>

            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreateClassroom}
              disabled={creating}
            >
              <Text style={styles.createButtonText}>
                {creating ? 'Creating...' : 'Create Classroom'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  classroomCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  classroomMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  classroomIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#EDE7F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classroomInfo: {
    flex: 1,
    marginLeft: 12,
  },
  classroomName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  teacherName: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  studentCount: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 8,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#333',
  },
  createButton: {
    backgroundColor: '#5C6BC0',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#B39DDB',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
});
