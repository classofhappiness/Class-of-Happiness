import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { CollapsibleCard } from './CollapsibleCard';
import { useApp } from '../context/AppContext';
import { Step, isDyslexicSupported, letterCapEm, WORD_MAX_EM } from '../utils/readingStore';

// Settings > "Reading font": OpenDyslexic toggle, letter spacing and word spacing steppers, and a
// live preview. All of it is device-local and off by default. The font/spacing is applied to the
// whole app by src/utils/installReadingText.tsx; this component is only the controls.
interface Props {
  languages: { code: string; name: string }[];
}

const STEPS: Step[] = [0, 1, 2, 3];

export const ReadingFontSettings: React.FC<Props> = ({ languages }) => {
  const { t, language, reading } = useApp();
  // Collapsed every time Settings opens; purely view state, nothing is stored.
  const [expanded, setExpanded] = useState(false);
  const supported = reading.dyslexicSupported;
  const works = languages.filter((l) => isDyslexicSupported(l.code)).map((l) => l.name).join(', ');
  const normal = languages.filter((l) => !isDyslexicSupported(l.code)).map((l) => l.name).join(', ');

  const stepLabels = [
    t('spacing_off') || 'Off',
    t('spacing_small') || 'Small',
    t('spacing_medium') || 'Medium',
    t('spacing_large') || 'Large',
  ];
  // Caps are shown so the limit is never a surprise: WCAG 1.4.12 text spacing values.
  const letterCap = letterCapEm(reading.dyslexic && supported);

  const Stepper = ({ label, value, onChange, capNote }: { label: string; value: Step; onChange: (s: Step) => void; capNote: string }) => (
    <View style={styles.stepperBlock}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperRow} accessibilityRole="radiogroup">
        {STEPS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.stepBtn, value === s && styles.stepBtnActive]}
            onPress={() => onChange(s)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === s }}
            accessibilityLabel={`${label}: ${stepLabels[s]}`}
          >
            <Text style={[styles.stepText, value === s && styles.stepTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {stepLabels[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.capNote}>{capNote}</Text>
    </View>
  );

  return (
    <CollapsibleCard
      sectionTitle={t('reading_font') || 'Reading font'}
      label={t('reading_font') || 'Reading font'}
      expanded={expanded}
      onToggle={() => setExpanded((e) => !e)}
    >
      <View style={styles.card}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>{t('opendyslexic_font') || 'OpenDyslexic font'}</Text>
          <Switch
            value={reading.dyslexic && supported}
            onValueChange={reading.setDyslexic}
            disabled={!supported}
            trackColor={{ false: '#ddd', true: '#81C784' }}
            thumbColor={reading.dyslexic && supported ? '#4CAF50' : '#999'}
          />
        </View>
        <Text style={styles.helper}>
          {t('opendyslexic_helper') || 'An alternative font some people find easier to read. Research has not shown it helps everyone.'}
        </Text>
        {!supported && (
          <Text style={styles.unsupportedNote}>
            {t('opendyslexic_unsupported') || 'This font is not available in the current language. The normal font is used.'}
          </Text>
        )}
        <Text style={styles.listHeading}>{t('works_with_font') || 'Works with this font:'}</Text>
        <Text style={styles.listText}>{works}</Text>
        <Text style={styles.listHeading}>{t('uses_normal_font') || 'Uses the normal font:'}</Text>
        <Text style={styles.listText}>{normal}</Text>

        <Stepper
          label={t('letter_spacing') || 'Letter spacing'}
          value={reading.letterStep}
          onChange={reading.setLetterStep}
          capNote={(t('spacing_max') || 'Largest step: {em}em').replace('{em}', String(letterCap))}
        />
        <Stepper
          label={t('word_spacing') || 'Word spacing'}
          value={reading.wordStep}
          onChange={reading.setWordStep}
          capNote={(t('spacing_max') || 'Largest step: {em}em').replace('{em}', String(WORD_MAX_EM))}
        />

        <Text style={styles.previewLabel}>{t('reading_preview_label') || 'Preview'}</Text>
        <View style={styles.preview}>
          <Text style={styles.previewText}>
            {t('reading_preview_sentence') || 'The quick brown fox jumps over the lazy dog. Feelings come and go like weather.'}
          </Text>
        </View>
      </View>
    </CollapsibleCard>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toggleLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: '#333' },
  helper: { fontSize: 13, color: '#666', marginTop: 8, lineHeight: 18 },
  unsupportedNote: { fontSize: 13, color: '#B26A00', marginTop: 8, lineHeight: 18 },
  listHeading: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 12 },
  listText: { fontSize: 13, color: '#666', marginTop: 2, lineHeight: 18 },
  stepperBlock: { marginTop: 18 },
  stepperLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  stepperRow: { flexDirection: 'row', gap: 6 },
  stepBtn: { flex: 1, minHeight: 40, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  stepBtnActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  stepText: { fontSize: 13, color: '#333' },
  stepTextActive: { color: '#FFF', fontWeight: '700' },
  capNote: { fontSize: 11, color: '#999', marginTop: 4 },
  previewLabel: { fontSize: 13, fontWeight: '700', color: '#333', marginTop: 18 },
  preview: { marginTop: 6, backgroundColor: '#F8F9FA', borderRadius: 8, padding: 12 },
  previewText: { fontSize: 16, color: '#222', lineHeight: 28 },
});
