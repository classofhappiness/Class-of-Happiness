import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EMOTION_COLOURS, EMOTION_LIGHT_COLOURS } from '../constants/emotionColours';

// A simple adult check in front of purchases: one addition a young child is unlikely to do.
// Plain system text, so it follows the Reading font setting. Nothing is stored.
//
// Fixed Oct 31 (device test, build 1.4.0): correct answers were refused on phones whose keyboard types non-Latin
// digits (Arabic-Indic, Devanagari, full-width ...) - parseInt() of those is NaN, so every answer looked wrong.
// The answer is now read digit by digit across those scripts. Also: the card sits in the upper part of the screen so
// the number pad can no longer cover the Continue button, and a wrong answer keeps the SAME question (a new one only
// after three misses) instead of swapping the numbers under the person's thumb.
const MAX_MISSES = 3;
const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0xff10];   // Arabic-Indic, Persian, Devanagari, full-width
export function readNumber(raw: string): number | null {
  let out = '';
  for (const ch of raw) {
    const cp = ch.codePointAt(0) as number;
    if (cp >= 0x30 && cp <= 0x39) { out += ch; continue; }
    const z = DIGIT_ZEROS.find((zero) => cp >= zero && cp <= zero + 9);
    if (z !== undefined) out += String(cp - z);
  }
  return out ? parseInt(out, 10) : null;
}
const pick = () => ({ a: 23 + Math.floor(Math.random() * 46), b: 17 + Math.floor(Math.random() * 33) });

export const ParentGate: React.FC<{
  visible: boolean;
  t: (k: string) => string;
  onPass: () => void;
  onCancel: () => void;
}> = ({ visible, t, onPass, onCancel }) => {
  const [q, setQ] = useState(pick);
  const [answer, setAnswer] = useState('');
  const [wrong, setWrong] = useState(false);
  const [misses, setMisses] = useState(0);

  useEffect(() => {
    if (visible) {
      setQ(pick());
      setAnswer('');
      setWrong(false);
      setMisses(0);
    }
  }, [visible]);

  const submit = () => {
    if (readNumber(answer) === q.a + q.b) {
      onPass();
    } else {
      setWrong(true);
      setAnswer('');
      const n = misses + 1;
      if (n >= MAX_MISSES) { setQ(pick()); setMisses(0); } else setMisses(n);
    }
  };

  const prompt = (t('parent_gate_prompt') || 'To continue, please answer: {a} + {b} = ?')
    .split('{a}').join(String(q.a))
    .split('{b}').join(String(q.b));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('parent_gate_title') || 'For grown-ups'}</Text>
          <Text style={styles.prompt}>{prompt}</Text>
          <TextInput
            style={styles.input}
            value={answer}
            onChangeText={(v) => { setAnswer(v); setWrong(false); }}
            keyboardType="number-pad"
            maxLength={6}
            returnKeyType="done"
            autoFocus
            onSubmitEditing={submit}
          />
          {wrong && <Text style={styles.wrong}>{t('parent_gate_wrong') || "That's not right. Please try again."}</Text>}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: EMOTION_LIGHT_COLOURS.blue }]} onPress={onCancel}>
              <Text style={styles.btnText}>{t('cancel') || 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: EMOTION_COLOURS.blue }]} onPress={submit}>
              <Text style={[styles.btnText, { color: '#fff' }]}>{t('continue') || 'Continue'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', paddingTop: '18%', paddingHorizontal: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 8 },
  prompt: { fontSize: 16, color: '#444', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 10, fontSize: 18, textAlign: 'center', color: '#333' },
  wrong: { fontSize: 13, color: EMOTION_COLOURS.red, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#333' },
});
