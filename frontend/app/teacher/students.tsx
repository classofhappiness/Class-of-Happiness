import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Alert,
  TextInput,
  Modal
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { studentsApi } from '../../src/utils/api';

export default function ManageStudentsScreen() {
  const router = useRouter();
  const { students, classrooms, presetAvatars, refreshStudents } = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterClassroom, setFilterClassroom] = useState<string | null>(null);

  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClassroom = !filterClassroom || student.classroom_id === filterClassroom;
    return matchesSearch && matchesClassroom;
  });

  const getClassroomName = (classroomId?: string) => {
    if (!classroomId) return 'No Classroom';
    const classroom = classrooms.find(c => c.id === classroomId);
    return classroom?.name || 'Unknown';
  };

  const handleDeleteStudent = (student: typeof students[0]) => {
    Alert.alert(
      t('delete_student'),
      `Are you sure you want to delete ${student.name}? This will also delete all their zone logs.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await studentsApi.delete(student.id);
              await refreshStudents();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete student.');
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
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
      </View>

      {/* Classroom Filter */}
      {classrooms.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterContainer}
        >
          <TouchableOpacity
            style={[styles.filterChip, !filterClassroom && styles.filterChipActive]}
            onPress={() => setFilterClassroom(null)}
          >
            <Text style={[styles.filterChipText, !filterClassroom && styles.filterChipTextActive]}>
              All
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
        {/* Add Student Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/profiles/create')}
        >
          <MaterialIcons name="person-add" size={24} color="white" />
          <Text style={styles.addButtonText}>{t('add_new_student')}</Text>
        </TouchableOpacity>

        {/* Students List */}
        {filteredStudents.length > 0 ? (
          filteredStudents.map((student) => (
            <View key={student.id} style={styles.studentCard}>
              <TouchableOpacity
                style={styles.studentMain}
                onPress={() => router.push({
                  pathname: '/teacher/student-detail',
                  params: { studentId: student.id }
                })}
              >
                <Avatar
                  type={student.avatar_type}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={56}
                  presetAvatars={presetAvatars}
                />
                <View style={styles.studentInfo}>
                  <Text style={styles.studentName}>{student.name}</Text>
                  <Text style={styles.studentClassroom}>
                    {getClassroomName(student.classroom_id)}
                  </Text>
                </View>
              </TouchableOpacity>
              
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
            </View>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#5C6BC0',
    borderColor: '#5C6BC0',
  },
  filterChipText: {
    fontSize: 14,
    color: '#666',
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
});
