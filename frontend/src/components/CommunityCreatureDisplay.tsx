// Real feature Aug 21: community creatures are photo-based (real uploaded images), unlike the
// 4 default creatures which are emoji/animation-driven (CreatureDisplay). Rather than force one
// component to handle both fundamentally different visual styles, this is a small, separate
// display for whichever community creature is currently a student's active pursuit for a colour.
import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

const EMOTION_COLORS: Record<string, string> = {
  green: '#4CAF73', blue: '#4A90D9', yellow: '#FFC107', red: '#E05252'
};

interface CommunityCreatureDisplayProps {
  name?: string;
  emotionColour?: string;
  stage1_url?: string;
  stage2_url?: string;
  stage3_url?: string;
  stage4_url?: string;
  stage: number;
  size?: 'small' | 'medium' | 'large';
}

export const CommunityCreatureDisplay: React.FC<CommunityCreatureDisplayProps> = ({
  name, emotionColour, stage1_url, stage2_url, stage3_url, stage4_url, stage, size = 'large',
}) => {
  const container = size === 'large' ? 200 : size === 'medium' ? 140 : 80;
  const urls: Record<number, string | undefined> = { 1: stage1_url, 2: stage2_url, 3: stage3_url, 4: stage4_url };
  const imgUrl = urls[Math.max(1, Math.min(stage, 4))] || stage1_url;
  const colour = EMOTION_COLORS[emotionColour || ''] || '#5C6BC0';

  return (
    <View style={styles.wrap}>
      <View style={[styles.imageRing, { width: container, height: container, borderRadius: container / 2, borderColor: colour }]}>
        {imgUrl ? (
          <Image source={{ uri: imgUrl }} style={{ width: container - 16, height: container - 16, borderRadius: (container - 16) / 2 }} />
        ) : null}
      </View>
      {name ? <Text style={styles.name}>{name}</Text> : null}
      <View style={styles.dots}>
        {[1, 2, 3, 4].map(s => (
          <View key={s} style={[styles.dot, { backgroundColor: stage >= s ? colour : '#E5E5E5' }]} />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  imageRing: { borderWidth: 3, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  name: { marginTop: 10, fontSize: 16, fontWeight: '900', color: '#1A1A2E' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 6 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
