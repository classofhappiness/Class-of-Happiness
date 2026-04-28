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
  Pressable
} from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { studentsApi } from '../../src/utils/api';

export default function ManageStudentsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { students, classrooms, presetAvatars, refreshStudents, t, language, translations } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassroom, setFilterClassroom] = useState<string | null>(null);
  const [showLinkedOnly, setShowLinkedOnly] = useState(false);
  
  // Bulk selection state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [showClassroomPicker, setShowClassroomPicker] = useState(false);

  // Set translated header title - depend on language/translations to trigger updates
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false,
      title: t('students'),
    });
  }, [navigation, language, translations]);

  const filteredStudents = students
    .filter(student => {
      const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesClassroom = !filterClassroom || student.classroom_id === filterClassroom;
      const matchesLinked = !showLinkedOnly || (student as any).is_linked;
      return matchesSearch && matchesClassroom && matchesLinked;
    })
    .sort((a, b) => {
      // Linked students first
      const aLinked = (a as any).is_linked ? 1 : 0;
      const bLinked = (b as any).is_linked ? 1 : 0;
      return bLinked - aLinked;
    });

  const getClassroomName = (classroomId?: string) => {
    if (!classroomId) return t('no_classroom') || 'No Classroom';
    const classroom = classrooms.find(c => c.id === classroomId);
    return classroom?.name || 'Unknown';
  };

  const handleDeleteStudent = (student: typeof students[0]) => {
    Alert.alert(
      t('delete_student'),
      `Are you sure you want to delete ${student.name}? This will also delete all their data.`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await studentsApi.delete(student.id);
              await refreshStudents();
            } catch (error) {
              Alert.alert(t('error') || 'Error', 'Failed to delete student.');
            }
          },
        },
      ]
    );
  };

  // Toggle selection mode
  const toggleSelectionMode = () => {
    if (selectionMode) {
      setSelectedStudents(new Set());
    }
    setSelectionMode(!selectionMode);
  };

  // Toggle individual student selection
  const toggleStudentSelection = (studentId: string) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  // Select all visible students
  const selectAll = () => {
    const newSelection = new Set(filteredStudents.map(s => s.id));
    setSelectedStudents(newSelection);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedStudents(new Set());
  };

  // Bulk assign classroom
  const bulkAssignClassroom = async (classroomId: string | null) => {
    if (selectedStudents.size === 0) return;
    
    try {
      const updates = Array.from(selectedStudents).map(studentId => 
        studentsApi.update(studentId, { classroom_id: classroomId || undefined })
      );
      await Promise.all(updates);
      await refreshStudents();
      setShowClassroomPicker(false);
      setSelectedStudents(new Set());
      setSelectionMode(false);
      Alert.alert(
        t('success') || 'Success', 
        `${selectedStudents.size} student(s) updated successfully!`
      );
    } catch (error) {
      Alert.alert(t('error') || 'Error', 'Failed to update students.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={{padding:4}}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.pageHeaderTitle}>{t('students') || 'Students'}</Text>
        <View style={{width:32}} />
      </View>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={24} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder={t('search_students')}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <MaterialIcons name="close" size={24} color="#999" />
          </TouchableOpacity>
        )}
        
        {/* Bulk Selection Toggle */}
        <TouchableOpacity 
          style={[styles.selectModeBtn, selectionMode && styles.selectModeBtnActive]}
          onPress={toggleSelectionMode}
        >
          <MaterialIcons 
            name={selectionMode ? "close" : "checklist"} 
            size={22} 
            color={selectionMode ? "#fff" : "#5C6BC0"} 
          />
        </TouchableOpacity>
      </View>

      {/* Bulk Selection Bar */}
      {selectionMode && (
        <View style={styles.bulkBar}>
          <View style={styles.bulkBarLeft}>
            <TouchableOpacity onPress={selectedStudents.size === filteredStudents.length ? deselectAll : selectAll}>
              <Text style={styles.bulkBarLink}>
                {selectedStudents.size === filteredStudents.length ? t('deselect_all') || 'Deselect All' : t('select_all') || 'Select All'}
              </Text>
            </TouchableOpacity>
            <Text style={styles.bulkBarCount}>
              {selectedStudents.size} {t('selected') || 'selected'}
            </Text>
          </View>
          
          {selectedStudents.size > 0 && (
            <TouchableOpacity 
              style={styles.bulkAssignBtn}
              onPress={() => setShowClassroomPicker(true)}
            >
              <MaterialIcons name="school" size={18} color="white" />
              <Text style={styles.bulkAssignText}>{t('assign_classroom') || 'Assign Classroom'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Classroom Filter */}
      {classrooms.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          <TouchableOpacity
            style={[styles.filterChip, !filterClassroom && !showLinkedOnly && styles.filterChipActive]}
            onPress={() => { setFilterClassroom(null); setShowLinkedOnly(false); }}
          >
            <Text style={[styles.filterChipText, !filterClassroom && !showLinkedOnly && styles.filterChipTextActive]}>
              {t('all') || 'All'}
            </Text>
          </TouchableOpacity>
          {classrooms.map(classroom => (
            <TouchableOpacity
              key={classroom.id}
              style={[
                styles.filterChip,
                filterClassroom === classroom.id && styles.filterChipActive
              ]}
              onPress={() => setFilterClassroom(classroom.id)}
            >
              <Text style={[
                styles.filterChipText,
                filterClassroom === classroom.id && styles.filterChipTextActive
              ]}>
                {classroom.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Add Student Button - only when not in selection mode */}
        {!selectionMode && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push({ pathname: '/profiles/create', params: { classroomId: filterClassroom || '' } })}
          >
            <MaterialIcons name="person-add" size={24} color="white" />
            <Text style={styles.addButtonText}>{t('add_new_student')}</Text>
          </TouchableOpacity>
        )}

        {/* Students List */}
        {/* Linked Students quick tab */}
        <TouchableOpacity
          style={[
            styles.filterChip,
            showLinkedOnly && styles.filterChipActive,
            { margin: 8, marginTop: 0, alignSelf: 'flex-start' }
          ]}
          onPress={() => { setShowLinkedOnly(!showLinkedOnly); setFilterClassroom(null); }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="link" size={14} color={showLinkedOnly ? 'white' : '#5C6BC0'} />
            <Text style={[styles.filterChipText, showLinkedOnly && styles.filterChipTextActive]}>
              Linked Students ({students.filter((s: any) => s.is_linked).length})
            </Text>
          </View>
        </TouchableOpacity>

        {filteredStudents.length > 0 ? (
          filteredStudents.map((student) => (
            <Pressable 
              key={student.id} 
              style={[
                styles.studentCard,
                selectionMode && selectedStudents.has(student.id) && styles.studentCardSelected
              ]}
              onPress={() => {
                if (selectionMode) {
                  toggleStudentSelection(student.id);
                } else {
                  router.push({
                    pathname: '/teacher/student-detail',
                    params: { studentId: student.id }
                  });
                }
              }}
              onLongPress={() => {
                if (!selectionMode) {
                  setSelectionMode(true);
                  toggleStudentSelection(student.id);
                }
              }}
            >
              {/* Selection Checkbox */}
              {selectionMode && (
                <TouchableOpacity 
                  style={styles.checkbox}
                  onPress={() => toggleStudentSelection(student.id)}
                >
                  <MaterialIcons 
                    name={selectedStudents.has(student.id) ? "check-box" : "check-box-outline-blank"} 
                    size={24} 
                    color={selectedStudents.has(student.id) ? "#5C6BC0" : "#999"} 
                  />
                </TouchableOpacity>
              )}
              
              <View style={styles.studentMain}>
                <Avatar
                  type={student.avatar_type}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={56}
                  presetAvatars={presetAvatars}
                />
                <View style={styles.studentInfo}>
                  <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    {(student as any).is_linked && (
                      <Text style={{fontSize:10}}>🔗</Text>
                    )}
                  </View>
                  <Text style={styles.studentClassroom}>
                    {getClassroomName(student.classroom_id)}
                  </Text>
                </View>
              </View>
              
              {!selectionMode && (
                <View style={styles.studentActions}>
                  <TouchableOpacity
                    style={styles.actionIcon}
                    onPress={() => router.push({
                      pathname: '/profiles/edit',
                      params: { studentId: student.id }
                    })}
                  >
                    <MaterialIcons name="edit" size={22} color="#5C6BC0" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionIcon}
                    onPress={() => handleDeleteStudent(student)}
                  >
                    <MaterialIcons name="delete" size={22} color="#F44336" />
                  </TouchableOpacity>
                </View>
              )}
            </Pressable>
          ))
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="people-outline" size={64} color="#CCC" />
            <Text style={styles.emptyText}>
              {searchQuery ? t('no_students_found') : t('no_students_yet')}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? t('try_different_search') : t('add_first_student')}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Classroom Picker Modal */}
      <Modal
        visible={showClassroomPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowClassroomPicker(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('assign_classroom') || 'Assign Classroom'}</Text>
              <TouchableOpacity onPress={() => setShowClassroomPicker(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalSubtitle}>
              {t('select_classroom_for') || 'Select classroom for'} {selectedStudents.size} {t('students') || 'student(s)'}
            </Text>
            
            <ScrollView style={styles.classroomList}>
              {/* No Classroom Option */}
              <TouchableOpacity
                style={styles.classroomOption}
                onPress={() => bulkAssignClassroom(null)}
              >
                <MaterialIcons name="do-not-disturb" size={24} color="#999" />
                <Text style={styles.classroomOptionText}>{t('no_classroom') || 'No Classroom'}</Text>
              </TouchableOpacity>
              
              {classrooms.map(classroom => (
                <TouchableOpacity
                  key={classroom.id}
                  style={styles.classroomOption}
                  onPress={() => bulkAssignClassroom(classroom.id)}
                >
                  <MaterialIcons name="school" size={24} color="#5C6BC0" />
                  <Text style={styles.classroomOptionText}>{classroom.name}</Text>
                </TouchableOpacity>
              ))}
              
              {classrooms.length === 0 && (
                <View style={styles.noClassrooms}>
                  <Text style={styles.noClassroomsText}>
                    {t('no_classrooms_yet') || 'No classrooms yet. Create one first!'}
                  </Text>
                  <TouchableOpacity
                    style={styles.createClassroomBtn}
                    onPress={() => {
                      setShowClassroomPicker(false);
                      router.push('/teacher/classrooms');
                    }}
                  >
                    <Text style={styles.createClassroomText}>{t('create_classroom') || 'Create Classroom'}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 16, backgroundColor: "#F8F9FA" },
  pageHeaderTitle: { flex: 1, fontSize: 17, fontWeight: "bold", color: "#333", textAlign: "center" },
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#333',
  },
  selectModeBtn: {
    padding: 8,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#E8EAF6',
  },
  selectModeBtnActive: {
    backgroundColor: '#5C6BC0',
  },
  bulkBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E8EAF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
  },
  bulkBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bulkBarLink: {
    color: '#5C6BC0',
    fontWeight: '600',
    fontSize: 14,
  },
  bulkBarCount: {
    color: '#666',
    fontSize: 14,
  },
  bulkAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  bulkAssignText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 13,
  },
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: { flexDirection: 'row', flexWrap: 'nowrap', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    minWidth: 60,
    flexShrink: 0,
  },
  filterChipActive: {
    backgroundColor: '#5C6BC0',
    borderColor: '#5C6BC0',
  },
  filterChipText: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
  filterChipTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingTop: 8,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  studentCardSelected: {
    borderColor: '#5C6BC0',
    backgroundColor: '#F3F4F8',
  },
  checkbox: {
    marginRight: 8,
  },
  studentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentInfo: {
    flex: 1,
    marginLeft: 12,
  },
  studentName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  studentClassroom: {
    fontSize: 14,
    color: '#888',
    marginTop: 2,
  },
  studentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
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
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  classroomList: {
    maxHeight: 300,
  },
  classroomOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#F8F9FA',
    gap: 12,
  },
  classroomOptionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  noClassrooms: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noClassroomsText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  createClassroomBtn: {
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  createClassroomText: {
    color: 'white',
    fontWeight: '600',
  },
});

// Appended styles fix
