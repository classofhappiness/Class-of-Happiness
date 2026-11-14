// "Where are you based?" - a field that opens a searchable list of countries (names in the app language) with a
// "Prefer not to say" row at the top. value: ISO-2 code, 'none' (prefer not to say) or null (nothing chosen yet).
// Used by the signup screen and Settings. The one-time prompt does NOT use this (it shows CountryList inline instead, so it
// never stacks a second modal on top of its own).
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CountryList, countryDisplay } from './CountryList';

interface Props {
  value: string | null;
  onChange: (value: string) => void;
  language: string;
  t: (key: string) => string;
}

export function CountryPicker({ value, onChange, language, t }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const pick = (v: string) => { onChange(v); setOpen(false); };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button">
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>{countryDisplay(value, language, t)}</Text>
        <MaterialIcons name="arrow-drop-down" size={24} color="#888" />
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top + 12, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('country_label') || 'Country'}</Text>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialIcons name="close" size={24} color="#1A1A2E" />
            </TouchableOpacity>
          </View>
          <CountryList value={value} onPick={pick} language={language} t={t} />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#E4E4E4' },
  fieldText: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  placeholder: { color: '#999' },
  modal: { flex: 1, backgroundColor: 'white', paddingHorizontal: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
});
