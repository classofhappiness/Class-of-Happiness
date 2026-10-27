import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

// The Settings "section title + tappable card row + chevron, content below when open" pattern,
// extracted from the Language card so Language and Reading font share one implementation.
// Controlled (the parent owns `expanded`), no animation, no persistence - exactly what the
// Language card always did. The look is a copy of settings.tsx's section/settingItem styles.
interface Props {
  sectionTitle: string;
  label: string;
  value?: string;
  leading?: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const CollapsibleCard: React.FC<Props> = ({ sectionTitle, label, value, leading, expanded, onToggle, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{sectionTitle}</Text>
    <TouchableOpacity
      style={styles.settingItem}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.settingLeft}>
        {leading}
        <View style={leading ? styles.settingText : styles.settingTextNoLeading}>
          {value !== undefined ? (
            <>
              <Text style={styles.settingLabel}>{label}</Text>
              <Text style={styles.settingValue}>{value}</Text>
            </>
          ) : (
            <Text style={styles.settingValueOnly}>{label}</Text>
          )}
        </View>
      </View>
      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={24} color="#CCC" />
    </TouchableOpacity>
    {expanded && children}
  </View>
);

const styles = StyleSheet.create({
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: '#888', marginBottom: 8, marginLeft: 4, textTransform: 'uppercase' },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  settingLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  settingText: { marginLeft: 12, flex: 1 },
  settingTextNoLeading: { flex: 1 },
  settingLabel: { fontSize: 14, color: '#888' },
  settingValue: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 2 },
  settingValueOnly: { fontSize: 16, fontWeight: '600', color: '#333' },
});
