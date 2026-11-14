// One-time "Where are you based?" prompt for existing parent and teacher accounts with no country. The server decides
// (user.country_prompt_needed, see _country_prompt_needed in server.py) and remembers the answer or the dismissal, so it
// shows once per account. Never shown on the sign-in / password / verify-email screens, nor over any other screen's flow
// until those gates have passed.
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native';
import { usePathname } from 'expo-router';
import { useApp } from '../context/AppContext';
import { CountryPicker } from './CountryPicker';
import { deviceRegion } from '../utils/countryNames';

export function CountryPromptGate() {
  const { user, isAuthenticated, isLoading, language, t, saveCountry } = useApp();
  const pathname = usePathname();
  // Remembers WHICH account the prompt was closed for (a bare boolean would stay true after switching accounts in one session).
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => { if (value === null) setValue(deviceRegion()); }, []);

  const u: any = user;
  const show = hiddenFor !== u?.user_id && !isLoading && isAuthenticated && !!u && u.country_prompt_needed === true
    && u.has_password !== false && u.email_verified !== false && !pathname.startsWith('/auth');
  if (!show) return null;

  const done = (choice: string) => { setHiddenFor(u.user_id); saveCountry(choice).catch(() => {}); };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => done('dismiss')}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{t('country_prompt_title') || 'Where are you based?'}</Text>
          <Text style={styles.body}>{t('country_prompt_body') || 'Optional. Your country is used only for anonymous totals and is never shown publicly or to other users.'}</Text>
          <CountryPicker value={value} onChange={setValue} language={language} t={t} />
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: 'white', borderRadius: 20, padding: 20, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#1A1A2E' },
  body: { fontSize: 14, color: '#555', lineHeight: 20 },
  save: { backgroundColor: '#5C6BC0', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  saveDisabled: { opacity: 0.45 },
  saveText: { color: 'white', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', paddingVertical: 6 },
  linkText: { color: '#5C6BC0', fontSize: 14, fontWeight: '600' },
});
