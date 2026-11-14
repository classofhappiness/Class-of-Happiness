// "Where are you based?" - a field that opens a searchable list of countries (names in the app language) with a
// "Prefer not to say" row at the top. value: ISO-2 code, 'none' (prefer not to say) or null (nothing chosen yet).
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, TextInput, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { countryFlagEmoji } from '../constants/countries';
import { localizedCountryName, sortedCountries } from '../utils/countryNames';

interface Props {
  value: string | null;
  onChange: (value: string) => void;
  language: string;
  t: (key: string) => string;
}

export function CountryPicker({ value, onChange, language, t }: Props) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const all = useMemo(() => sortedCountries(language), [language]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : all;
  }, [all, query]);
  const preferNot = t('country_prefer_not') || 'Prefer not to say';

  const label = value === 'none' ? preferNot
    : value ? `${countryFlagEmoji(value)}  ${localizedCountryName(value, language)}`
    : (t('country_choose') || 'Choose your country');

  const pick = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <>
      <TouchableOpacity style={styles.field} onPress={() => setOpen(true)} activeOpacity={0.8} accessibilityRole="button">
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>{label}</Text>
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
          <TextInput
            style={styles.search}
            placeholder={t('country_search') || 'Search'}
            placeholderTextColor="#999"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
          <FlatList
            data={shown}
            keyExtractor={c => c.code}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <TouchableOpacity style={styles.row} onPress={() => pick('none')}>
                <Text style={[styles.rowText, styles.preferNot]}>{preferNot}</Text>
                {value === 'none' && <MaterialIcons name="check" size={20} color="#5C6BC0" />}
              </TouchableOpacity>
            }
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.row} onPress={() => pick(item.code)}>
                <Text style={styles.flag}>{countryFlagEmoji(item.code)}</Text>
                <Text style={styles.rowText}>{item.name}</Text>
                {value === item.code && <MaterialIcons name="check" size={20} color="#5C6BC0" />}
              </TouchableOpacity>
            )}
          />
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
  search: { backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#1A1A2E', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E4E4' },
  flag: { fontSize: 22, marginRight: 12 },
  rowText: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  preferNot: { fontStyle: 'italic', color: '#555' },
});
