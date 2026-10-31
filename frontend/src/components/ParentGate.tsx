import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { EMOTION_COLOURS, EMOTION_LIGHT_COLOURS } from '../constants/emotionColours';

// A simple adult check in front of purchases: one addition a young child is unlikely to do.
// Plain system text, so it follows the Reading font setting. Nothing is stored.
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

  useEffect(() => {
    if (visible) {
      setQ(pick());
      setAnswer('');
      setWrong(false);
    }
  }, [visible]);

  const submit = () => {
    if (parseInt(answer.trim(), 10) === q.a + q.b) {
      onPass();
    } else {
      setWrong(true);
      setAnswer('');
      setQ(pick());
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
            maxLength={3}
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  title: { fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'center', marginBottom: 8 },
  prompt: { fontSize: 16, color: '#444', textAlign: 'center', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 10, padding: 10, fontSize: 18, textAlign: 'center', color: '#333' },
  wrong: { fontSize: 13, color: EMOTION_COLOURS.red, textAlign: 'center', marginTop: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '600', color: '#333' },
});
