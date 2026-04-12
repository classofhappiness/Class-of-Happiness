import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, Animated, Easing, TouchableOpacity } from 'react-native';
import { useApp } from '../context/AppContext';

const zoneColors: Record<string, string> = {
  blue: '#4FC3F7', green: '#81C784', yellow: '#FFD54F', red: '#FF7043',
};
const zoneBg: Record<string, string> = {
  blue: '#E3F2FD', green: '#E8F5E9', yellow: '#FFFDE7', red: '#FBE9E7',
};

interface CreatureShowcaseProps {
  visible: boolean;
  creature: any;
  stage: number;
  points: number;
  unlockedMoves: string[];
  unlockedOutfits: string[];
  unlockedFoods: string[];
  unlockedHomes: string[];
  onClose: () => void;
}

export const CreatureShowcase: React.FC<CreatureShowcaseProps> = ({
  visible, creature, stage, points, unlockedMoves, unlockedOutfits, unlockedFoods, unlockedHomes, onClose,
}) => {
  const { t } = useApp();
  const [step, setStep] = useState(0);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const labelAnim = useRef(new Animated.Value(0)).current;
  const moveLoop = useRef<any>(null);

  const zone = creature?.zone || creature?.feeling_colour || 'blue';
  const color = zoneColors[zone] || '#4FC3F7';
  const bg = zoneBg[zone] || '#E3F2FD';
  const emoji = creature?.stages?.[stage]?.emoji || '🥚';
  const stageName = creature?.stages?.[stage]?.name || creature?.name || '';
  const stageDesc = creature?.stages?.[stage]?.description || '';

  const moves = (creature?.moves || []).slice(0, 3);
  const outfits = (creature?.outfits || []).slice(0, 3);
  const foods = (creature?.foods || []).slice(0, 3);
  const homes = (creature?.homes || []).slice(0, 3);

  const unlockedMove = moves.filter((m: any) => unlockedMoves.includes(m.id)).slice(-1)[0];
  const unlockedOutfit = outfits.filter((o: any) => unlockedOutfits.includes(o.id)).slice(-1)[0];
  const unlockedFood = foods.filter((f: any) => unlockedFoods.includes(f.id)).slice(-1)[0];
  const unlockedHome = homes.filter((h: any) => unlockedHomes.includes(h.id)).slice(-1)[0];

  const STEPS = [
    { label: `${t('current_friend') || 'Meet'}: ${stageName}!`, sub: stageDesc, itemEmoji: null },
    {
      label: unlockedMove ? `${t('moves') || 'Move'}: ${unlockedMove.name}!` : t('grow_creature_hint') || 'No moves yet!',
      sub: unlockedMove?.description || t('grow_creature_hint') || 'Keep checking in!',
      itemEmoji: unlockedMove?.emoji || '🔒'
    },
    {
      label: unlockedOutfit ? `${t('outfits') || 'Outfit'}: ${unlockedOutfit.name}!` : t('keep_growing') || 'No outfit yet!',
      sub: unlockedOutfit?.description || t('keep_growing') || 'Evolve to unlock!',
      itemEmoji: unlockedOutfit?.emoji || '🔒'
    },
    {
      label: unlockedFood ? `${t('foods') || 'Food'}: ${unlockedFood.name}!` : t('grow_creature_hint') || 'No food yet!',
      sub: unlockedFood?.description || t('grow_creature_hint') || 'Use helpers to unlock!',
      itemEmoji: unlockedFood?.emoji || '🔒'
    },
    {
      label: unlockedHome ? `${t('homes') || 'Home'}: ${unlockedHome.name}!` : t('keep_growing') || 'No home yet!',
      sub: unlockedHome?.description || t('keep_growing') || 'Keep going!',
      itemEmoji: unlockedHome?.emoji || '🔒'
    },
  ];

  const startAnimation = () => {
    if (moveLoop.current) moveLoop.current.stop();
    let anim: any;
    if (zone === 'blue') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 20, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: -20, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]));
    } else if (zone === 'green') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -30, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 350, easing: Easing.bounce, useNativeDriver: true }),
        Animated.delay(300),
      ]));
    } else if (zone === 'yellow') {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(bounceAnim, { toValue: 12, duration: 80, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: -12, duration: 80, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
        Animated.delay(500),
      ]));
    } else {
      anim = Animated.loop(Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -25, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 250, easing: Easing.bounce, useNativeDriver: true }),
        Animated.delay(400),
      ]));
    }
    moveLoop.current = anim;
    anim.start();
  };

  const goToStep = (s: number) => {
    Animated.timing(labelAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(s);
      Animated.timing(labelAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    bounceAnim.setValue(0);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(labelAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]).start(() => startAnimation());

    const timers: any[] = [];
    [1800, 3600, 5400, 7200].forEach((delay, i) => {
      timers.push(setTimeout(() => goToStep(i + 1), delay));
    });
    timers.push(setTimeout(() => {
      if (moveLoop.current) moveLoop.current.stop();
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => onClose());
    }, 9500));

    return () => { timers.forEach(clearTimeout); if (moveLoop.current) moveLoop.current.stop(); };
  }, [visible]);

  if (!visible || !creature) return null;
  const current = STEPS[step] || STEPS[0];
  const isHorizontal = zone === 'blue';

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim, backgroundColor: bg }]}>
        <TouchableOpacity style={styles.skipBtn} onPress={() => { if (moveLoop.current) moveLoop.current.stop(); onClose(); }}>
          <Text style={[styles.skipTxt, { color }]}>{t('skip') || 'Skip'} ✕</Text>
        </TouchableOpacity>
        <View style={styles.dots}>
          {STEPS.map((_, i) => <View key={i} style={[styles.dot, { backgroundColor: i <= step ? color : '#DDD' }]} />)}
        </View>
        <Animated.View style={[styles.content, { transform: [{ scale: scaleAnim }] }]}>
          <View style={styles.emojiStage}>
            {step === 2 && current.itemEmoji && current.itemEmoji !== '🔒' && (
              <Animated.Text style={[styles.itemAbove, { opacity: labelAnim }]}>{current.itemEmoji}</Animated.Text>
            )}
            <Animated.Text style={[styles.bigEmoji, {
              transform: isHorizontal ? [{ translateX: bounceAnim }] : [{ translateY: bounceAnim }]
            }]}>
              {emoji}
            </Animated.Text>
            {step === 1 && current.itemEmoji && current.itemEmoji !== '🔒' && (
              <Animated.Text style={[styles.itemBelow, { opacity: labelAnim }]}>{current.itemEmoji}</Animated.Text>
            )}
            {step === 3 && current.itemEmoji && current.itemEmoji !== '🔒' && (
              <Animated.Text style={[styles.itemFloat, { opacity: labelAnim }]}>{current.itemEmoji}</Animated.Text>
            )}
            {step === 4 && current.itemEmoji && current.itemEmoji !== '🔒' && (
              <Animated.Text style={[styles.itemHome, { opacity: labelAnim }]}>{current.itemEmoji}</Animated.Text>
            )}
          </View>
          <Animated.View style={[styles.labelBox, { opacity: labelAnim, borderColor: color }]}>
            <Text style={[styles.labelTxt, { color }]}>{current.label}</Text>
            <Text style={styles.subTxt}>{current.sub}</Text>
          </Animated.View>
          <View style={[styles.ptsBadge, { backgroundColor: color }]}>
            <Text style={styles.ptsTxt}>⭐ {points} {t('points') || 'points'}</Text>
          </View>
        </Animated.View>
        <TouchableOpacity style={styles.tapArea} onPress={() => {
          if (step < STEPS.length - 1) goToStep(step + 1);
          else { if (moveLoop.current) moveLoop.current.stop(); onClose(); }
        }}>
          <Text style={[styles.tapHint, { color }]}>
            {step < STEPS.length - 1 ? `${t('next') || 'Next'} →` : `${t('done') || 'Done'} ✓`}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  skipBtn: { position: 'absolute', top: 50, right: 20, padding: 10 },
  skipTxt: { fontSize: 16, fontWeight: 'bold' },
  dots: { position: 'absolute', top: 55, flexDirection: 'row', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  content: { alignItems: 'center', width: '100%' },
  emojiStage: { alignItems: 'center', height: 200, justifyContent: 'center', marginBottom: 20 },
  bigEmoji: { fontSize: 110 },
  itemAbove: { fontSize: 48, marginBottom: 8 },
  itemBelow: { fontSize: 48, marginTop: 8 },
  itemFloat: { fontSize: 52, position: 'absolute', right: -10, top: 10 },
  itemHome: { fontSize: 52, position: 'absolute', left: -10, bottom: 0 },
  labelBox: { backgroundColor: 'white', borderRadius: 20, padding: 20, alignItems: 'center', width: '90%', borderWidth: 2, marginBottom: 20 },
  labelTxt: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  subTxt: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
  ptsBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  ptsTxt: { color: 'white', fontWeight: 'bold', fontSize: 16 },
  tapArea: { position: 'absolute', bottom: 50, alignItems: 'center' },
  tapHint: { fontSize: 16, fontWeight: '600' },
});
