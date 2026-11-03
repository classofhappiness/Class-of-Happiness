import React, { useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, Linking, StyleSheet } from 'react-native';
import { useApp } from '../src/context/AppContext';
import { OFL_FREDOKA } from '../src/constants/licences';

// Licences & credits. One compact row per font or icon set; the SIL Open Font License text is shown once, behind a toggle.
// The licence texts live in assets/licences/*.txt and are mirrored into src/constants/licences.ts (Metro can't import .txt as a string).
// All the OFL texts are identical apart from the copyright line above them, so the shared text is cut from the Fredoka one.
const OFL_TEXT = OFL_FREDOKA.slice(OFL_FREDOKA.indexOf('SIL OPEN FONT LICENSE Version 1.1'));

const APACHE_NOTICE =
  'Licensed under the Apache License, Version 2.0 (the "License"); you may not use these files except in compliance with the License. ' +
  'You may obtain a copy of the License at https://www.apache.org/licenses/LICENSE-2.0\n\n' +
  'Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, ' +
  'WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.';

const FONTS = [
  { name: 'Nunito', use: 'App text', licence: 'SIL Open Font License 1.1', copyright: 'Copyright 2014 The Nunito Project Authors', source: 'https://github.com/googlefonts/nunito' },
  { name: 'Fredoka', use: 'Home screen titles', licence: 'SIL Open Font License 1.1', copyright: 'Copyright 2016 The Fredoka Project Authors', source: 'https://github.com/hafontia/Fredoka-One' },
  { name: 'OpenDyslexic', use: 'Reading font option', licence: 'SIL Open Font License 1.1', copyright: 'Copyright (c) 2019-07-29, Abbie Gonzalez', source: 'https://abbiecod.es/fonts/opendyslexic', ofl: true },
];

export default function Credits() {
  const { t } = useApp();
  const [showOfl, setShowOfl] = useState(false);
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const source = (url: string) => (
    <Text style={styles.line}>
      {t('credits_source') || 'Source'}: <Text style={styles.link} onPress={() => open(url)}>{url.replace('https://', '')}</Text>
    </Text>
  );
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{t('credits_fonts') || 'Fonts'}</Text>
      {FONTS.map((f) => (
        <View key={f.name} style={styles.row}>
          <Text style={styles.name}>{f.name} <Text style={styles.use}>· {f.use}</Text></Text>
          <Text style={styles.line}>{t('credits_licence') || 'Licence'}: {f.licence}</Text>
          <Text style={styles.line}>{f.name === 'OpenDyslexic' ? (t('credits_opendyslexic_by') || f.copyright) : f.copyright}</Text>
          {source(f.source)}
        </View>
      ))}
      <TouchableOpacity onPress={() => setShowOfl((v) => !v)} accessibilityRole="button">
        <Text style={styles.toggle}>{showOfl ? (t('credits_hide_licence') || 'Hide licence text') : (t('credits_show_licence') || 'Show licence text')}</Text>
      </TouchableOpacity>
      {showOfl && <View style={styles.box}><Text style={styles.licence}>{OFL_TEXT}</Text></View>}

      <Text style={[styles.heading, { marginTop: 18 }]}>{t('credits_icons') || 'Icons'}</Text>
      <View style={styles.row}>
        <Text style={styles.name}>Material Icons <Text style={styles.use}>· Google</Text></Text>
        <Text style={styles.line}>{t('credits_licence') || 'Licence'}: Apache License 2.0</Text>
        <Text style={styles.line}>Copyright Google LLC</Text>
        {source('https://fonts.google.com/icons')}
        <Text style={[styles.licence, { marginTop: 6 }]}>{APACHE_NOTICE}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 16, paddingBottom: 32 },
  heading: { fontSize: 13, fontWeight: '700', color: '#777', textTransform: 'uppercase', marginBottom: 6 },
  row: { backgroundColor: '#FFF', borderRadius: 10, padding: 12, marginBottom: 8 },
  name: { fontSize: 16, fontWeight: '700', color: '#222' },
  use: { fontSize: 13, fontWeight: '400', color: '#777' },
  line: { fontSize: 13, color: '#555', marginTop: 2 },
  link: { color: '#3949AB', textDecorationLine: 'underline' },
  toggle: { fontSize: 14, fontWeight: '600', color: '#3949AB', paddingVertical: 8 },
  box: { backgroundColor: '#FFF', borderRadius: 10, padding: 12 },
  licence: { fontSize: 11, color: '#444', lineHeight: 15 },
});
