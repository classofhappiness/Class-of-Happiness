// One-time "Where are you based?" prompt for existing parent and teacher accounts with no country. The server decides
// (user.country_prompt_needed, see _country_prompt_needed in server.py) and remembers the answer or the dismissal, so it
// shows once per account. Never shown on the sign-in / password / verify-email screens, nor over any other screen's flow
// until those gates have passed.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CountryList, countryDisplay } from './CountryList';
import { deviceRegion } from '../utils/countryNames';

export function CountryPromptGate() {
  const { user, isAuthenticated, isLoading, language, t, saveCountry } = useApp();
  const pathname = usePathname();
  // Remembers WHICH account the prompt was closed for (a bare boolean would stay true after switching accounts in one session).
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);
  // The country list replaces the prompt body inside this same modal (never a second modal on top).
  const [choosing, setChoosing] = useState(false);

  useEffect(() => { if (value === null) setValue(deviceRegion()); }, []);

  const u: any = user;
  const show = hiddenFor !== u?.user_id && !isLoading && isAuthenticated && !!u && u.country_prompt_needed === true
    && u.has_password !== false && u.email_verified !== false && !pathname.startsWith('/auth');
  if (!show) return null;

  const done = (choice: string) => { setHiddenFor(u.user_id); saveCountry(choice).catch(() => {}); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => (choosing ? setChoosing(false) : done('dismiss'))}>
      <View style={styles.backdrop}>
        {choosing ? (
          <View style={[styles.card, styles.listCard]}>
            <View style={styles.listHeader}>
              <TouchableOpacity style={styles.back} onPress={() => setChoosing(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialIcons name="arrow-back" size={22} color="#1A1A2E" />
              </TouchableOpacity>
              <Text style={styles.title}>{t('country_label') || 'Country'}</Text>
            </View>
            <CountryList value={value} onPick={(v) => { setValue(v); setChoosing(false); }} language={language} t={t} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title}>{t('country_prompt_title') || 'Where are you based?'}</Text>
            <Text style={styles.body}>{t('country_prompt_body') || 'Optional. Your country is used only for anonymous totals and is never shown publicly or to other users.'}</Text>
            <TouchableOpacity style={styles.field} onPress={() => setChoosing(true)} activeOpacity={0.8} accessibilityRole="button">
              <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>{countryDisplay(value, language, t)}</Text>
              <MaterialIcons name="arrow-drop-down" size={24} color="#888" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, !value && styles.saveDisabled]}
              disabled={!value}
              onPress={() => value && done(value)}
            >
              <Text style={styles.saveText}>{t('country_save') || 'Save'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={() => done('none')}>
              <Text style={styles.linkText}>{t('country_prefer_not') || 'Prefer not to say'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.link} onPress={() => done('dismiss')}>
              <Text style={styles.linkText}>{t('country_not_now') || 'Not now'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, gap: 12 },
  listCard: { height: '80%', gap: 0 },
  listHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  back: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: '#E4E4E4' },
  fieldText: { flex: 1, fontSize: 16, color: '#1A1A2E' },
  placeholder: { color: '#999' },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  body: { fontSize: 14, color: '#555', lineHeight: 20 },
  save: { backgroundColor: '#5C6BC0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: 'white', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: '#5C6BC0', fontSize: 14, fontWeight: '600' },
});
