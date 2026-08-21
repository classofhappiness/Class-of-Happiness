import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { api } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};
const EMOTION_EMOJI: Record<string, string> = {
  green: '😊', blue: '😔', yellow: '😬', red: '😤'
};

export default function GlobalCreaturesScreen() {
  const { t } = useApp();
  const [creatures, setCreatures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('all');

  const load = async () => {
    try {
      const data = await api.get('/creatures/global');
      setCreatures(data || []);
    } catch (e) {}
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = filter === 'all' ? creatures : creatures.filter(c => c.emotion_colour === filter);

  const renderCreature = ({ item }: { item: any }) => (
    <View style={[styles.card, { borderTopColor: EMOTION_COLORS[item.emotion_colour], borderTopWidth: 3 }]}>
      <Image source={{ uri: item.stage1_url }} style={styles.creatureImg} />
      <View style={styles.cardBody}>
        <Text style={styles.creatureName}>{item.creature_name}</Text>
        <Text style={styles.emotionTag}>
          {EMOTION_EMOJI[item.emotion_colour]} {item.emotion_colour.charAt(0).toUpperCase() + item.emotion_colour.slice(1)} Emotions
        </Text>
        <Text style={styles.creatorInfo}>
          🌍 By {item.student_name} · {item.school_name || 'School'} · {item.country}
        </Text>
        {item.year_group ? <Text style={styles.yearGroup}>Year {item.year_group}</Text> : null}
        <Text style={styles.uses}>
          {item.global_uses > 0 ? `🏆 Used by ${item.global_uses} student${item.global_uses !== 1 ? 's' : ''} worldwide` : '🌱 New creature'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🌍 World Creatures</Text>
        <Text style={styles.subtitle}>Creatures created by students around the world</Text>
      </View>
      <View style={styles.filterRow}>
        {['all','green','blue','yellow','red'].map(f => (
          <TouchableOpacity key={f}
            style={[styles.filterBtn, filter===f && { backgroundColor: f==='all'?'#1A1A2E':EMOTION_COLORS[f] }]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterText, filter===f && { color: f==='yellow'?'#333':'white' }]}>
              {f==='all'?'All':`${EMOTION_EMOJI[f]||''} ${f.charAt(0).toUpperCase()+f.slice(1)}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {loading ? (
        <View style={{ marginTop: 60, alignItems: 'center' }}><EmotionColourLoader visible size={64} /></View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={renderCreature}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No creatures yet — be the first to submit one! 🦕</Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { backgroundColor: '#1A1A2E', padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: '900', color: '#FFD93D' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,.6)', marginTop: 4 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterBtn: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 50, backgroundColor: '#F0F0F0' },
  filterText: { fontSize: 12, fontWeight: '800', color: '#666' },
  list: { padding: 12, paddingBottom: 40 },
  row: { gap: 12, marginBottom: 12 },
  card: { flex: 1, backgroundColor: 'white', borderRadius: 14, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  creatureImg: { width: '100%', aspectRatio: 1, backgroundColor: '#F5F5F5' },
  cardBody: { padding: 10 },
  creatureName: { fontSize: 14, fontWeight: '900', color: '#1A1A2E', marginBottom: 4 },
  emotionTag: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginBottom: 3 },
  creatorInfo: { fontSize: 10, color: '#9CA3AF', marginBottom: 2 },
  yearGroup: { fontSize: 10, color: '#9CA3AF', marginBottom: 4 },
  uses: { fontSize: 11, fontWeight: '700', color: '#4CAF73' },
  empty: { textAlign: 'center', color: '#9CA3AF', fontSize: 15, fontWeight: '700', marginTop: 80, padding: 20 },
});
