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
  Platform,
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { classroomsApi, studentsApi } from '../../src/utils/api';

const ZONE_COLORS = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

const BULK_STRATEGIES = {
  blue: [
    { id: 'b1', name: 'Gentle Stretch', icon: 'accessibility' },
    { id: 'b2', name: 'Favourite Song', icon: 'music-note' },
    { id: 'b3', name: 'Tell Someone', icon: 'chat' },
    { id: 'b4', name: 'Slow Breathing', icon: 'air' },
  ],
  green: [
    { id: 'g1', name: 'Keep Going!', icon: 'star' },
    { id: 'g2', name: 'Help a Friend', icon: 'people' },
    { id: 'g3', name: 'Set a Goal', icon: 'flag' },
    { id: 'g4', name: 'Gratitude', icon: 'favorite' },
  ],
  yellow: [
    { id: 'y1', name: 'Bubble Breathing', icon: 'bubble-chart' },
    { id: 'y2', name: 'Count to 10', icon: 'format-list-numbered' },
    { id: 'y3', name: '5 Senses', icon: 'visibility' },
    { id: 'y4', name: 'Talk About It', icon: 'record-voice-over' },
  ],
  red: [
    { id: 'r1', name: 'Safe Space', icon: 'home' },
    { id: 'r2', name: 'Deep Breaths', icon: 'air' },
    { id: 'r3', name: 'Squeeze Something', icon: 'back-hand' },
    { id: 'r4', name: 'Walk Away Calmly', icon: 'directions-walk' },
  ],
};

export default function ManageClassroomsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { classrooms, students, refreshClassrooms, refreshStudents, t, language, translations } = useApp();

  // Create classroom modal
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newTeacherName, setNewTeacherName] = useState('');
  const [creating, setCreating] = useState(false);

  // Edit classroom modal
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<any>(null);

  // Bulk strategy modal
  const [strategyModalVisible, setStrategyModalVisible] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>('blue');
  const [selectedStrategy, setSelectedStrategy] = useState<any>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [addingStrategy, setAddingStrategy] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: t('classrooms') });
  }, [navigation, language, translations]);

  const getClassroomStudents = (classroomId: string) =>
    students.filter(s => s.classroom_id === classroomId);

  const getUnassignedStudents = () =>
    students.filter(s => !s.classroom_id);

  const handleCreateClassroom = async () => {
    if (!newClassName.trim()) {
      Alert.alert('Name Required', 'Please enter a classroom name.');
      return;
    }
    setCreating(true);
    try {
      await classroomsApi.create({ name: newClassName.trim(), teacher_name: newTeacherName.trim() || undefined });
      await refreshClassrooms();
      setCreateModalVisible(false);
      setNewClassName('');
      setNewTeacherName('');
    } catch {
      Alert.alert('Error', 'Failed to create classroom.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClassroom = (classroom: any) => {
    const count = getClassroomStudents(classroom.id).length;
    Alert.alert(
      'Delete Classroom',
      `Delete "${classroom.name}"?${count > 0 ? ` ${count} student(s) will be unassigned.` : ''}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await classroomsApi.delete(classroom.id);
              await refreshClassrooms();
            } catch {
              Alert.alert('Error', 'Failed to delete classroom.');
            }
          },
        },
      ]
    );
  };

  const handleMoveStudent = async (studentId: string, classroomId: string | null) => {
    try {
      await studentsApi.update(studentId, { classroom_id: classroomId || undefined });
      await refreshStudents();
    } catch {
      Alert.alert('Error', 'Failed to update student.');
    }
  };

  const handleBulkAddStrategy = async () => {
    if (!selectedStrategy || selectedStudentIds.size === 0) {
      Alert.alert('Select strategy and at least one student');
      return;
    }
    setAddingStrategy(true);
    try {
      // Add strategy to each selected student
      await Promise.all(
        Array.from(selectedStudentIds).map(studentId =>
          fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/helpers/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: studentId,
              name: selectedStrategy.name,
              description: `Added by teacher for ${selectedZone} zone`,
              feeling_colour: selectedZone,
              icon: selectedStrategy.icon,
              is_shared: false,
            }),
          })
        )
      );
      Alert.alert('✅ Done!', `"${selectedStrategy.name}" added to ${selectedStudentIds.size} student(s).`);
      setStrategyModalVisible(false);
      setSelectedStrategy(null);
      setSelectedStudentIds(new Set());
    } catch {
      Alert.alert('Error', 'Failed to add strategy to some students.');
    } finally {
      setAddingStrategy(false);
    }
  };

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const classroomStudents = editingClassroom ? getClassroomStudents(editingClassroom.id) : [];
  const unassigned = getUnassignedStudents();
  const strategyStudents = editingClassroom ? getClassroomStudents(editingClassroom.id) : students;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Create Button */}
        <TouchableOpacity style={styles.addButton} onPress={() => setCreateModalVisible(true)}>
          <MaterialIcons name="add" size={24} color="white" />
          <Text style={styles.addButtonText}>Create New Classroom</Text>
        </TouchableOpacity>

        {/* Classrooms List */}
        {classrooms.length > 0 ? classrooms.map((classroom) => {
          const count = getClassroomStudents(classroom.id).length;
          return (
            <View key={classroom.id} style={styles.classroomCard}>
              <View style={styles.classroomIcon}>
                <MaterialIcons name="school" size={28} color="#5C6BC0" />
              </View>
              <View style={styles.classroomInfo}>
                <Text style={styles.classroomName}>{classroom.name}</Text>
                {classroom.teacher_name && (
                  <Text style={styles.teacherName}>{classroom.teacher_name}</Text>
                )}
                <Text style={styles.studentCount}>{count} student{count !== 1 ? 's' : ''}</Text>
              </View>
              <View style={styles.cardActions}>
                {/* Bulk check-in - quick B/G/Y/R */}
                <TouchableOpacity
                  style={[styles.iconButton, styles.bulkCheckinBtn]}
                  onPress={() => router.push({
                    pathname: '/teacher/bulk-checkin',
                    params: { classroomId: classroom.id, classroomName: classroom.name }
                  })}
                >
                  <MaterialIcons name="how-to-reg" size={22} color="white" />
                </TouchableOpacity>
                {/* Edit / manage students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setEditModalVisible(true); }}
                >
                  <MaterialIcons name="edit" size={22} color="#5C6BC0" />
                </TouchableOpacity>
                {/* Add strategy to all students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setStrategyModalVisible(true); }}
                >
                  <MaterialIcons name="lightbulb" size={22} color="#FFC107" />
                </TouchableOpacity>
                {/* Delete */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => handleDeleteClassroom(classroom)}
                >
                  <MaterialIcons name="delete" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>
            </View>
          );
        }) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="school" size={64} color="#CCC" />
            <Text style={styles.emptyText}>No classrooms yet</Text>
            <Text style={styles.emptySubtext}>Create a classroom to organise your students</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Create Classroom Modal ── */}
      <Modal visible={createModalVisible} animationType="slide" transparent onRequestClose={() => setCreateModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Classroom</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>Classroom Name *</Text>
            <TextInput style={styles.input} placeholder="e.g. Room 3A" value={newClassName} onChangeText={setNewClassName} />
            <Text style={styles.inputLabel}>Teacher Name (optional)</Text>
            <TextInput style={styles.input} placeholder="e.g. Ms Johnson" value={newTeacherName} onChangeText={setNewTeacherName} />
            <TouchableOpacity
              style={[styles.createButton, creating && styles.createButtonDisabled]}
              onPress={handleCreateClassroom}
              disabled={creating}
            >
              <Text style={styles.createButtonText}>{creating ? 'Creating...' : 'Create Classroom'}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Edit Classroom / Manage Students Modal ── */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✏️ {editingClassroom?.name}</Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Current students */}
              <Text style={styles.sectionLabel}>Students in this class ({classroomStudents.length})</Text>
              {classroomStudents.length === 0 && (
                <Text style={styles.emptySubtext}>No students yet — add from below</Text>
              )}
              {classroomStudents.map(s => (
                <View key={s.id} style={styles.studentRow}>
                  <Text style={styles.studentRowName}>{s.name}</Text>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleMoveStudent(s.id, null)}
                  >
                    <MaterialIcons name="remove-circle" size={22} color="#F44336" />
                  </TouchableOpacity>
                </View>
              ))}

              {/* Unassigned students */}
              {unassigned.length > 0 && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Add existing students</Text>
                  {unassigned.map(s => (
                    <View key={s.id} style={styles.studentRow}>
                      <Text style={styles.studentRowName}>{s.name}</Text>
                      <TouchableOpacity
                        style={styles.addStudentButton}
                        onPress={() => handleMoveStudent(s.id, editingClassroom?.id)}
                      >
                        <MaterialIcons name="add-circle" size={22} color="#4CAF50" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}

              {/* Create new student */}
              <TouchableOpacity
                style={styles.newStudentButton}
                onPress={() => {
                  setEditModalVisible(false);
                  router.push({ pathname: '/profiles/create', params: { classroomId: editingClassroom?.id } });
                }}
              >
                <MaterialIcons name="person-add" size={20} color="white" />
                <Text style={styles.newStudentText}>Create New Student</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Bulk Strategy Modal ── */}
      <Modal visible={strategyModalVisible} animationType="slide" transparent onRequestClose={() => setStrategyModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💡 Add Strategy to Students</Text>
              <TouchableOpacity onPress={() => setStrategyModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Zone selector */}
              <Text style={styles.sectionLabel}>Select Zone</Text>
              <View style={styles.zoneRow}>
                {(['blue', 'green', 'yellow', 'red'] as const).map(z => (
                  <TouchableOpacity
                    key={z}
                    style={[styles.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: selectedZone === z ? 1 : 0.4 }]}
                    onPress={() => { setSelectedZone(z); setSelectedStrategy(null); }}
                  >
                    <Text style={styles.zoneChipText}>{z}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Strategy selector */}
              <Text style={styles.sectionLabel}>Select Strategy</Text>
              {BULK_STRATEGIES[selectedZone as keyof typeof BULK_STRATEGIES].map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.strategyOption, selectedStrategy?.id === s.id && { borderColor: ZONE_COLORS[selectedZone as keyof typeof ZONE_COLORS], borderWidth: 2 }]}
                  onPress={() => setSelectedStrategy(s)}
                >
                  <MaterialIcons name={s.icon as any} size={20} color={ZONE_COLORS[selectedZone as keyof typeof ZONE_COLORS]} />
                  <Text style={styles.strategyOptionText}>{s.name}</Text>
                  {selectedStrategy?.id === s.id && <MaterialIcons name="check-circle" size={20} color={ZONE_COLORS[selectedZone as keyof typeof ZONE_COLORS]} />}
                </TouchableOpacity>
              ))}

              {/* Student selector */}
              <Text style={styles.sectionLabel}>Select Students ({selectedStudentIds.size} selected)</Text>
              <TouchableOpacity
                style={styles.selectAllButton}
                onPress={() => {
                  if (selectedStudentIds.size === strategyStudents.length) {
                    setSelectedStudentIds(new Set());
                  } else {
                    setSelectedStudentIds(new Set(strategyStudents.map(s => s.id)));
                  }
                }}
              >
                <Text style={styles.selectAllText}>
                  {selectedStudentIds.size === strategyStudents.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
              {strategyStudents.map(s => (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.studentRow, selectedStudentIds.has(s.id) && styles.studentRowSelected]}
                  onPress={() => toggleStudentSelection(s.id)}
                >
                  <Text style={styles.studentRowName}>{s.name}</Text>
                  <MaterialIcons
                    name={selectedStudentIds.has(s.id) ? 'check-box' : 'check-box-outline-blank'}
                    size={22}
                    color={selectedStudentIds.has(s.id) ? '#4CAF50' : '#CCC'}
                  />
                </TouchableOpacity>
              ))}

              <TouchableOpacity
                style={[styles.createButton, addingStrategy && styles.createButtonDisabled]}
                onPress={handleBulkAddStrategy}
                disabled={addingStrategy}
              >
                <Text style={styles.createButtonText}>
                  {addingStrategy ? 'Adding...' : `Add to ${selectedStudentIds.size} Student(s)`}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { padding: 16 },
  addButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#5C6BC0', borderRadius: 12, padding: 16, marginBottom: 20, gap: 8 },
  addButtonText: { fontSize: 16, fontWeight: '600', color: 'white' },
  classroomCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  classroomIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#EDE7F6', alignItems: 'center', justifyContent: 'center' },
  classroomInfo: { flex: 1, marginLeft: 12 },
  classroomName: { fontSize: 18, fontWeight: '600', color: '#333' },
  teacherName: { fontSize: 14, color: '#666', marginTop: 2 },
  studentCount: { fontSize: 12, color: '#888', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 4 },
  iconButton: { padding: 6 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#999', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#AAA', marginTop: 8, textAlign: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', flex: 1 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 16, fontSize: 16, color: '#333', marginBottom: 16 },
  createButton: { backgroundColor: '#5C6BC0', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  createButtonDisabled: { backgroundColor: '#B39DDB' },
  createButtonText: { fontSize: 16, fontWeight: 'bold', color: 'white' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  studentRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12, marginBottom: 8 },
  studentRowSelected: { backgroundColor: '#E8F5E9' },
  studentRowName: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
  removeButton: { padding: 4 },
  addStudentButton: { padding: 4 },
  newStudentButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#4CAF50', borderRadius: 12, padding: 14, marginTop: 16, gap: 8 },
  newStudentText: { color: 'white', fontWeight: '600', fontSize: 15 },
  zoneRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  zoneChip: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  zoneChipText: { color: 'white', fontWeight: '600', fontSize: 13, textTransform: 'capitalize' },
  strategyOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  strategyOptionText: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  selectAllButton: { alignSelf: 'flex-end', marginBottom: 8 },
  selectAllText: { fontSize: 13, color: '#5C6BC0', fontWeight: '600' },
  bulkCheckinBtn: { backgroundColor: '#4CAF50', borderRadius: 8, padding: 6 },
});
