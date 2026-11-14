// "Class favourite" row at the top of World Creatures: the creatures children use most (rank, picture, name only - no
// counts). Renders nothing when there is nothing to show; the server already returns an empty list until enough different
// children have used enough creatures. Community creatures are tappable (the screen jumps to them); the four starter
// creatures have no card on that screen, so they are shown but not tappable.
import React from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import type { CreatureFavourite } from '../utils/api';

const COLOURS: Record<string, string> = { green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252' };

interface Props {
  items: CreatureFavourite[];
  onPress: (item: CreatureFavourite) => void;
  t: (key: string) => string;
}

export function ClassFavouritesRow({ items, onPress, t }: Props) {
  if (!items || items.length === 0) return null;
  const ribbon = t('class_favourites_ribbon') || 'Class favourite';
  return (
    <View style={styles.wrap} accessibilityLabel={t('class_favourites_a11y') || 'Creatures children in our community use most'}>
      <View style={styles.ribbon}><Text style={styles.ribbonText}>⭐ {ribbon}</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map(it => {
          const ring = (it.colour && COLOURS[it.colour]) || '#5C6BC0';
          const body = (
            <>
              <View style={[styles.circle, { borderColor: ring }]}>
                {it.thumb_url
                  ? <Image source={{ uri: it.thumb_url }} style={styles.img} resizeMode="contain" />
                  : <Text style={styles.emoji}>{it.emoji || '🦕'}</Text>}
                <View style={styles.rank}><Text style={styles.rankText}>{it.rank}</Text></View>
              </View>
              <Text style={styles.name} numberOfLines={1}>{it.name}</Text>
            </>
          );
          return it.is_default ? (
            <View key={it.creature_id} style={styles.item}>{body}</View>
          ) : (
            <TouchableOpacity key={it.creature_id} style={styles.item} activeOpacity={0.8} onPress={() => onPress(it)} accessibilityRole="button">
              {body}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 8, paddingTop: 6, paddingBottom: 8, backgroundColor: '#F6F3FF', borderRadius: 16 },
  ribbon: { alignSelf: 'flex-start', backgroundColor: '#7C5CBF', borderTopRightRadius: 10, borderBottomRightRadius: 10, paddingHorizontal: 12, paddingVertical: 3, marginBottom: 6 },
  ribbonText: { color: 'white', fontSize: 12, fontWeight: '800' },
  row: { paddingHorizontal: 12, gap: 14 },
  item: { alignItems: 'center', width: 72 },
  circle: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  img: { width: 52, height: 52 },
  emoji: { fontSize: 30 },
  rank: { position: 'absolute', top: -4, left: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#1A1A2E', alignItems: 'center', justifyContent: 'center' },
  rankText: { color: 'white', fontSize: 11, fontWeight: '800' },
  name: { marginTop: 4, fontSize: 11, fontWeight: '700', color: '#333', maxWidth: 72, textAlign: 'center' },
});
