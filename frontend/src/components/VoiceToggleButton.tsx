import React, { useEffect, useState } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { loadVoiceEnabled, isVoiceEnabled, setVoiceEnabled } from '../utils/voiceClips';

// Quick per-screen mute control for the student check-in flow (colour + helper
// screens). Toggles the same persisted setting shown in Settings - one value,
// two entry points - so muting here also sticks for next time.
export function VoiceToggleButton({ style }: { style?: any }) {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    loadVoiceEnabled().then(setEnabled);
  }, []);

  const toggle = async () => {
    const next = !enabled;
    setEnabled(next);
    await setVoiceEnabled(next);
  };

  return (
    <TouchableOpacity style={[styles.btn, style]} onPress={toggle}>
      <MaterialIcons name={enabled ? 'volume-up' : 'volume-off'} size={20} color="#5C6BC0" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'white', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
});
