import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EMOTION_COLOURS, EMOTION_LIGHT_COLOURS } from '../constants/emotionColours';

// One slim line for adults on the Resources screens, shown only when something in the loaded
// list is locked (the caller passes that fact in). Closing it hides it for 7 days; the
// timestamp lives in AsyncStorage, and every read/write is in try/catch (without storage it
// simply shows each visit). Never placed on a child-facing screen.
const KEY = 'coh.paidBanner.dismissedAt';
const HIDE_MS = 7 * 24 * 60 * 60 * 1000;

export const PaidFeatureBanner: React.FC<{
  visible: boolean;
  t: (k: string) => string;
  onSeePlans: () => void;
}> = ({ visible, t, onSeePlans }) => {
  const [hidden, setHidden] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        const at = raw ? parseInt(raw, 10) : 0;
        if (alive) setHidden(!!at && Date.now() - at < HIDE_MS);
      } catch {
        if (alive) setHidden(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (!visible || hidden !== false) return null;

  const dismiss = async () => {
    setHidden(true);
    try {
      await AsyncStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
  };

  return (
    <View style={styles.bar}>
      <Text style={styles.text} numberOfLines={2}>{t('paid_banner_text') || 'Some activities are part of a paid plan.'}</Text>
      <TouchableOpacity style={styles.btn} onPress={onSeePlans}>
        <Text style={styles.btnText}>{t('see_plans') || 'See Plans'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} accessibilityLabel={t('paid_banner_dismiss') || 'Dismiss'} style={styles.close}>
        <MaterialIcons name="close" size={18} color="#8D6E63" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: EMOTION_LIGHT_COLOURS.yellow,
    borderRadius: 12, paddingVertical: 8, paddingLeft: 12, paddingRight: 6, marginBottom: 12,
  },
  text: { flex: 1, fontSize: 13, color: '#5D4037' },
  btn: { backgroundColor: EMOTION_COLOURS.blue, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  close: { padding: 6 },
});
