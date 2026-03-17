import React, { useLayoutEffect, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { CreatureCollection } from '../../src/components/CreatureCollection';
import { rewardsApi, StudentCollection } from '../../src/utils/api';

export default function StudentSelectScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { students, presetAvatars, setCurrentStudent, refreshStudents, t, language, translations } = useApp();
  const [showCollection, setShowCollection] = useState(false);
  const [collectionData, setCollectionData] = useState<StudentCollection | null>(null);
  const [selectedStudentForCollection, setSelectedStudentForCollection] = useState<string | null>(null);

  // Hide default header and use custom translated header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  const handleSelectStudent = (student: typeof students[0]) => {
    setCurrentStudent(student);
    router.push('/student/zone');
  };

  const handleViewCreatures = async (studentId: string) => {
    try {
      const collection = await rewardsApi.getCollection(studentId);
      setCollectionData(collection);
      setSelectedStudentForCollection(studentId);
      setShowCollection(true);
    } catch (error) {
      console.error('Error fetching collection:', error);
    }
  };

  const handleCreateProfile = () => {
    router.push('/profiles/create');
  };

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('select_profile')} backTo="/" />
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.instruction}>{t('tap_to_check_in')}</Text>

        <View style={styles.studentsGrid}>
          {students.map((student) => (
            <View key={student.id} style={styles.studentCard}>
              <TouchableOpacity
                style={styles.studentMain}
                onPress={() => handleSelectStudent(student)}
                activeOpacity={0.7}
              >
                <Avatar
                  type={student.avatar_type}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={80}
                  presetAvatars={presetAvatars}
                />
                <Text style={styles.studentName} numberOfLines={1}>
                  {student.name}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.creaturesButton}
                onPress={() => handleViewCreatures(student.id)}
              >
                <Text style={styles.creaturesButtonText}>🐾 My Creatures</Text>
              </TouchableOpacity>
            </View>
          ))}

          {/* Add New Profile Button */}
          <TouchableOpacity
            style={[styles.studentCard, styles.addCard]}
            onPress={handleCreateProfile}
            activeOpacity={0.7}
          >
            <View style={styles.addIconContainer}>
              <MaterialIcons name="add" size={40} color="#4CAF50" />
            </View>
            <Text style={styles.addText}>{t('add_profile')}</Text>
          </TouchableOpacity>
        </View>

        {students.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="person-add" size={64} color="#CCC" />
            <Text style={styles.emptyText}>{t('no_profiles_yet')}</Text>
            <Text style={styles.emptySubtext}>{t('create_first_profile')}</Text>
          </View>
        )}
      </ScrollView>

      {/* Creature Collection Modal */}
      {collectionData && (
        <CreatureCollection
          visible={showCollection}
          collectedCreatures={collectionData.collected_creatures}
          currentCreature={collectionData.current_creature}
          currentStage={collectionData.current_stage}
          totalCreatures={collectionData.total_creatures}
          onClose={() => setShowCollection(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  instruction: {
    fontSize: 20,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  studentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 16,
  },
  studentCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    width: 140,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  studentMain: {
    alignItems: 'center',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  creaturesButton: {
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
  },
  creaturesButtonText: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  addCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    backgroundColor: '#F1F8F1',
  },
  addIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 8,
  },
});
