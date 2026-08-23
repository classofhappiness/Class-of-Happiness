import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';
import { playBonusItemSound, BonusItemCategory } from '../utils/sounds';

// Real feature Aug 23: Bonus Items already unlock progressively (per evolution stage, see
// server.py's CREATURES catalog) - the real gap was that nothing ever celebrated it. This
// is the celebration: shown once, at the moment of unlock (mounted from rewards.tsx right
// where playEvolutionSound() already fires), and reused for tap-to-replay on an
// already-unlocked item in CreatureDetailModal's Bonus Items grid (single item, no
// persistence, just a fun replay - per Jono's explicit simplified scope). Category-level
// animation + sound (4 variants, not 48 per-item ones) - decided scope.

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF73', yellow: '#FFC107', red: '#E05252',
};

export interface CelebrationItem {
  id: string;
  name: string;
  emoji: string;
  category: BonusItemCategory;
}

interface Props {
  visible: boolean;
  items: CelebrationItem[];
  colour: string;
  onClose: () => void;
  autoAdvanceMs?: number;
}

export const BonusItemCelebration: React.FC<Props> = ({ visible, items, colour, onClose, autoAdvanceMs = 2200 }) => {
  const { t } = useApp();
  const [index, setIndex] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const translateAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const color = ZONE_COLORS[colour] || '#5C6BC0';

  const CATEGORY_LABEL: Record<BonusItemCategory, string> = {
    moves: t('new_move_unlocked') || '🎬 New Move!',
    outfits: t('new_outfit_unlocked') || '👗 New Outfit!',
    foods: t('new_food_unlocked') || '🍎 New Food!',
    homes: t('new_home_unlocked') || '🏠 New Home!',
  };

  useEffect(() => {
    if (!visible || items.length === 0) return;
    setIndex(0);
  }, [visible]);

  useEffect(() => {
    if (!visible || items.length === 0) return;
    const item = items[index];
    if (!item) return;
    playBonusItemSound(item.category);
    runAnimationForCategory(item.category);
    const timer = setTimeout(() => {
      if (loopRef.current) loopRef.current.stop();
      if (index < items.length - 1) {
        setIndex(i => i + 1);
      } else {
        onClose();
      }
    }, autoAdvanceMs);
    return () => { clearTimeout(timer); if (loopRef.current) loopRef.current.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index, items.length]);

  const runAnimationForCategory = (category: BonusItemCategory) => {
    scaleAnim.setValue(0);
    translateAnim.setValue(0);
    opacityAnim.setValue(0);
    if (loopRef.current) loopRef.current.stop();

    if (category === 'moves') {
      // Real feature Aug 23: quick impact burst - scale past 1, settle back. Matches
      // Jono's "whip-crack" description - a fast, punchy action, not a slow reveal.
      Animated.timing(opacityAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      Animated.sequence([
        Animated.spring(scaleAnim, { toValue: 1.3, friction: 3, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
      ]).start();
    } else if (category === 'outfits') {
      // Real feature Aug 23: floats/drops on from above with a gentle bounce - matches
      // Jono's "leaves blow past" description, a flourish landing into place.
      translateAnim.setValue(-90);
      Animated.timing(opacityAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
      Animated.spring(translateAnim, { toValue: 0, friction: 5, tension: 40, useNativeDriver: true }).start();
      Animated.timing(scaleAnim, { toValue: 1, duration: 350, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    } else if (category === 'foods') {
      // Real feature Aug 23: squash-stretch bounce, repeated a few times - matches Jono's
      // "munching sound" description, a bite/chomp motion.
      Animated.timing(opacityAnim, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      scaleAnim.setValue(1);
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 180, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.92, duration: 180, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]),
        { iterations: 3 }
      );
      loopRef.current.start();
    } else {
      // homes: slow, cozy fade+scale in - settling into a new home.
      Animated.timing(opacityAnim, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
      Animated.timing(scaleAnim, { toValue: 1, duration: 700, easing: Easing.out(Easing.back(1.2)), useNativeDriver: true }).start();
    }
  };

  if (!visible || items.length === 0) return null;
  const item = items[index];
  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: color + 'E6' }]}>
        <TouchableOpacity style={s.skip} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={s.skipTxt}>{t('skip') || 'Skip'} ✕</Text>
        </TouchableOpacity>
        <Text style={s.categoryLabel}>{CATEGORY_LABEL[item.category]}</Text>
        <Animated.View style={{ opacity: opacityAnim, transform: [{ scale: scaleAnim }, { translateY: translateAnim }] }}>
          <Text style={s.emoji}>{item.emoji}</Text>
        </Animated.View>
        <Text style={s.itemName}>{item.name}</Text>
        {items.length > 1 && (
          <View style={s.dots}>
            {items.map((_, i) => (
              <View key={i} style={[s.dot, { backgroundColor: i <= index ? 'white' : 'rgba(255,255,255,.4)' }]} />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  skip: { position: 'absolute', top: 55, right: 20, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: 'rgba(0,0,0,.25)', borderRadius: 20 },
  skipTxt: { color: 'white', fontWeight: '700', fontSize: 13 },
  categoryLabel: { color: 'white', fontSize: 18, fontWeight: '900', marginBottom: 24, textAlign: 'center' },
  emoji: { fontSize: 100, textAlign: 'center' },
  itemName: { color: 'white', fontSize: 22, fontWeight: '900', marginTop: 20, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8, marginTop: 28 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
