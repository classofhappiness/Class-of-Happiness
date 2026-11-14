// The searchable country list (a "Prefer not to say" row first, then every country in the app language), shared by the picker
// modal (signup, Settings) and the one-time prompt, which shows it inline so it never opens a second modal on top of itself.
import React, { useMemo, useState } from 'react';
import { Text, TouchableOpacity, TextInput, FlatList, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { countryFlagEmoji } from '../constants/countries';
import { localizedCountryName, sortedCountries } from '../utils/countryNames';

// Text shown for a value: flag + name, "Prefer not to say", or the placeholder.
export function countryDisplay(value: string | null, language: string, t: (key: string) => string): string {
  if (value === 'none') return t('country_prefer_not') || 'Prefer not to say';
  if (value) return `${countryFlagEmoji(value)}  ${localizedCountryName(value, language)}`;
  return t('country_choose') || 'Choose your country';
}

interface Props {
  value: string | null;
  onPick: (value: string) => void;   // an ISO-2 code, or 'none' for Prefer not to say
  language: string;
  t: (key: string) => string;
}

export function CountryList({ value, onPick, language, t }: Props) {
  const [query, setQuery] = useState('');
  const all = useMemo(() => sortedCountries(language), [language]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter(c => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : all;
  }, [all, query]);
  const preferNot = t('country_prefer_not') || 'Prefer not to say';
  return (
    <>
      <TextInput
        style={styles.search}
        placeholder={t('country_search') || 'Search'}
        placeholderTextColor="#999"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
      />
      <FlatList
        style={styles.list}
        data={shown}
        keyExtractor={c => c.code}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <TouchableOpacity style={styles.row} onPress={() => onPick('none')}>
            <Text style={[styles.rowText, styles.preferNot]}>{preferNot}</Text>
            {value === 'none' && <MaterialIcons name="check" size={20} color="#5C6BC0" />}
          </TouchableOpacity>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => onPick(item.code)}>
            <Text style={styles.flag}>{countryFlagEmoji(item.code)}</Text>
            <Text style={styles.rowText}>{item.name}</Text>
            {value === item.code && <MaterialIcons name="check" size={20} color="#5C6BC0" />}
          </TouchableOpacity>
        )}
      />
    </>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 16, color: '#1A1A2E', marginBottom: 8 },
  list: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E4E4E4' },
  flag: { fontSize: 22, marginRight: 12 },
  rowText: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  preferNot: { fontStyle: 'italic', color: '#555' },
});
