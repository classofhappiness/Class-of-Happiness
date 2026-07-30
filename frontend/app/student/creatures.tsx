// screens/CreatureCollectionScreen.tsx
// Shows all creatures a student has unlocked, with locked ones shown greyed out

import React, { useEffect, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Creature {
  id: string;
  name: string;
  emoji: string;
  description?: string;
  unlocked: boolean;
  unlock_condition?: string;
}

export default function CreatureCollectionScreen() {
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t, user } = useApp();
  const studentId = user?.user_id || user?.student_id || '';

  useEffect(() => {
    fetchCreatures();
  }, []);

  const fetchCreatures = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = await AsyncStorage.getItem('authToken') || '';

      // Fetch all creatures
      const allRes = await fetch(`${API_URL}/api/creatures`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const allData = await allRes.json();

      // Fetch this student's unlocked creatures
      const unlockedRes = await fetch(`${API_URL}/api/creatures/student/${studentId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const unlockedData = await unlockedRes.json();

      const unlockedIds = new Set(
        (unlockedData.creatures || []).map((c: Creature) => c.id)
      );

      const merged: Creature[] = (allData.creatures || []).map((c: Creature) => ({
        ...c,
        unlocked: unlockedIds.has(c.id),
      }));

      // Sort: unlocked first, then locked
      merged.sort((a, b) => (b.unlocked ? 1 : 0) - (a.unlocked ? 1 : 0));
      setCreatures(merged);
    } catch (err) {
      console.error('fetchCreatures error:', err);
      setError('Could not load creatures. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderCreature = ({ item }: { item: Creature }) => (
    <View style={[styles.card, !item.unlocked && styles.cardLocked]}>
      <Text style={[styles.emoji, !item.unlocked && styles.emojiLocked]}>
        {item.unlocked ? item.emoji : '❓'}
      </Text>
      <Text style={[styles.name, !item.unlocked && styles.nameLocked]}>
        {item.unlocked ? item.name : '???'}
      </Text>
      {item.unlocked && item.description ? (
        <Text style={styles.description}>{item.description}</Text>
      ) : !item.unlocked && item.unlock_condition ? (
        <Text style={styles.hint}>{item.unlock_condition}</Text>
      ) : null}
    </View>
  );


  const goToSubmit = () => router.push('/student/submit-creature');
  const goToWorld = () => router.push('/student/world-creatures');
  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 0 }}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: '#1A1A2E', borderRadius: 50, padding: 12, alignItems: 'center' }}
          onPress={goToSubmit}>
          <Text style={{ color: '#FFD93D', fontWeight: '900', fontSize: 13 }}>🎨 Submit a Creature</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: '#4CAF73', borderRadius: 50, padding: 12, alignItems: 'center' }}
          onPress={goToWorld}>
          <Text style={{ color: 'white', fontWeight: '900', fontSize: 13 }}>🌍 World Creatures</Text>
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 6 }}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.replace('/student/select')} style={{ padding: 6 }}>
          <MaterialIcons name="home" size={24} color="#333" />
        </TouchableOpacity>
      </View>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🐾 {t('my_creatures') || t('my_creatures') || 'My Creatures'}</Text>
        <View style={styles.backButton} />
      </View>

      {/* Count badge */}
      {!loading && (
        <Text style={styles.countText}>
          {creatures.filter(c => c.unlocked).length} / {creatures.length}{' '}
          {t('unlocked') || 'unlocked'}
        </Text>
      )}

      {loading ? (
        <ActivityIndicator size="large" color="#6C63FF" style={styles.loader} />
      ) : error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchCreatures} style={styles.retryButton}>
            <Text style={styles.retryText}>{t('try_again') || 'Try Again'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
  
      <FlatList
          data={creatures}
          keyExtractor={item => item.id}
          renderItem={renderCreature}
          numColumns={2}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6FF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
  },
  backText: {
    fontSize: 24,
    color: '#6C63FF',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D2D44',
    textAlign: 'center',
  },
  countText: {
    textAlign: 'center',
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 12,
    paddingBottom: 40,
  },
  card: {
    flex: 1,
    margin: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardLocked: {
    backgroundColor: '#F0F0F0',
    opacity: 0.7,
  },
  emoji: {
    fontSize: 48,
    marginBottom: 8,
  },
  emojiLocked: {
    opacity: 0.4,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2D2D44',
    textAlign: 'center',
  },
  nameLocked: {
    color: '#AAAAAA',
  },
  description: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginTop: 4,
  },
  hint: {
    fontSize: 11,
    color: '#AAA',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  loader: {
    marginTop: 80,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  errorText: {
    fontSize: 16,
    color: '#E05C5C',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#6C63FF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  retryText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
