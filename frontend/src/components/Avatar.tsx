import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

interface AvatarProps {
  type: 'preset' | 'custom';
  preset?: string;
  custom?: string;
  size?: number;
  presetAvatars?: { id: string; emoji: string }[];
}

const AVATAR_EMOJIS: Record<string, string> = {
  cat: '🐱',
  dog: '🐶',
  bear: '🐻',
  bunny: '🐰',
  lion: '🦁',
  panda: '🐼',
  monkey: '🐵',
  unicorn: '🦄',
  star: '⭐',
  rainbow: '🌈',
};

export const Avatar: React.FC<AvatarProps> = ({ 
  type, 
  preset, 
  custom, 
  size = 60,
  presetAvatars 
}) => {
  if (type === 'custom' && custom) {
    return (
      <Image
        source={{ uri: custom.startsWith('data:') ? custom : `data:image/jpeg;base64,${custom}` }}
        style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      />
    );
  }

  // Find emoji from presetAvatars or fallback to static map
  let emoji = AVATAR_EMOJIS[preset || 'cat'] || '😊';
  if (presetAvatars) {
    const found = presetAvatars.find(a => a.id === preset);
    if (found) emoji = found.emoji;
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.emoji, { fontSize: size * 0.5 }]}>{emoji}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E8F4FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    backgroundColor: '#E8F4FD',
  },
  emoji: {
    textAlign: 'center',
  },
});
