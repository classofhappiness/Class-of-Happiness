// Real feature Sep 26 (item 21c): a small reusable admin-PIN re-confirmation step for a
// sensitive action the user is already authenticated for (unlike the full lock-screen PIN,
// which gates entering the admin dashboard at all). No cross-platform equivalent of iOS-only
// Alert.prompt existed anywhere in this app, so this wraps the same SecureField the lock
// screen itself uses in a small modal instead of inventing a second input pattern.
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { SecureField } from './SecureField';
import { useAndroidKeyboardOffset } from '../utils/useAndroidKeyboardOffset';

interface PinConfirmModalProps {
  visible: boolean;
  title: string;
  message?: string;
  pinLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  wrongPinLabel: string;
  onCancel: () => void;
  // Resolve true if the PIN was valid (caller does its own /admin/verify call with the
  // pin) - the modal only owns pin entry/error display, never the verification itself, so
  // each caller can use its own request helper (apiCall vs. raw fetch).
  onSubmit: (pin: string) => Promise<boolean>;
}

export function PinConfirmModal({
  visible, title, message, pinLabel, confirmLabel, cancelLabel, wrongPinLabel, onCancel, onSubmit,
}: PinConfirmModalProps) {
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);
  const androidKeyboardOffset = useAndroidKeyboardOffset();

  const reset = () => { setPin(''); setSubmitting(false); setError(false); };
  const handleCancel = () => { reset(); onCancel(); };
  const handleConfirm = async () => {
    if (!pin.trim()) return;
    setSubmitting(true);
    setError(false);
    try {
      const ok = await onSubmit(pin.trim());
      if (ok) {
        reset();
      } else {
        setSubmitting(false);
        setError(true);
      }
    } catch {
      setSubmitting(false);
      setError(true);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.card, Platform.OS === 'android' && { marginBottom: androidKeyboardOffset }]}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <SecureField
            variant="code"
            containerStyle={styles.field}
            placeholder={pinLabel}
            keyboardType="number-pad"
            maxLength={6}
            value={pin}
            onChangeText={(v) => { setPin(v); setError(false); }}
            autoFocus
          />
          {error && <Text style={styles.errorText}>{wrongPinLabel}</Text>}
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.btnGrey]} onPress={handleCancel} disabled={submitting}>
              <Text style={styles.btnGreyText}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, (!pin.trim() || submitting) && { opacity: 0.6 }]}
              onPress={handleConfirm}
              disabled={!pin.trim() || submitting}
            >
              {submitting ? <ActivityIndicator color="white" size="small" /> : <Text style={styles.btnPrimaryText}>{confirmLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 22, width: '100%', maxWidth: 360 },
  title: { fontSize: 16, fontWeight: '800', color: '#1A1A2E', textAlign: 'center', marginBottom: 6 },
  message: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 14 },
  field: { marginBottom: 6 },
  errorText: { fontSize: 12, color: '#D32F2F', textAlign: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  btnGrey: { backgroundColor: '#F0F0F0' },
  btnGreyText: { color: '#555', fontWeight: '700', fontSize: 14 },
  btnPrimary: { backgroundColor: '#5C6BC0' },
  btnPrimaryText: { color: 'white', fontWeight: '800', fontSize: 14 },
});
