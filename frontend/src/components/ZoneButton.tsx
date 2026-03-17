import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';

interface ZoneButtonProps {
  zone: 'blue' | 'green' | 'yellow' | 'red';
  onPress: () => void;
  selected?: boolean;
  size?: 'small' | 'medium' | 'large';
  translations?: {
    blue_zone?: string;
    green_zone?: string;
    yellow_zone?: string;
    red_zone?: string;
    blue_desc?: string;
    green_desc?: string;
    yellow_desc?: string;
    red_desc?: string;
  };
}

// Unique emoji-style faces - different from standard emoji
const ZONE_FACES = {
  blue: '😔', // Pensive face - unique sad look
  green: '😊', // Smiling face with smiling eyes
  yellow: '😬', // Grimacing face - anxious/nervous
  red: '🤯', // Exploding head - overwhelmed
};

const ZONE_CONFIG = {
  blue: {
    color: '#4A90D9',
    lightColor: '#E3F2FD',
    label: 'Blue Zone',
    description: 'Sad, Tired, Bored',
    face: ZONE_FACES.blue,
  },
  green: {
    color: '#4CAF50',
    lightColor: '#E8F5E9',
    label: 'Green Zone',
    description: 'Calm, Happy, Focused',
    face: ZONE_FACES.green,
  },
  yellow: {
    color: '#FFC107',
    lightColor: '#FFF8E1',
    label: 'Yellow Zone',
    description: 'Worried, Frustrated, Silly',
    face: ZONE_FACES.yellow,
  },
  red: {
    color: '#F44336',
    lightColor: '#FFEBEE',
    label: 'Red Zone',
    description: 'Angry, Scared, Out of Control',
    face: ZONE_FACES.red,
  },
};

export const ZoneButton: React.FC<ZoneButtonProps> = ({ 
  zone, 
  onPress, 
  selected = false,
  size = 'large',
  translations
}) => {
  const config = ZONE_CONFIG[zone];
  const sizeStyles = SIZE_STYLES[size];
  
  // Use translations if provided
  const label = translations?.[`${zone}_zone` as keyof typeof translations] || config.label;
  const description = translations?.[`${zone}_desc` as keyof typeof translations] || config.description;

  return (
    <TouchableOpacity
      style={[
        styles.container,
        { backgroundColor: config.color },
        sizeStyles.container,
        selected && styles.selected,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.face, sizeStyles.face]}>{config.face}</Text>
      <Text style={[styles.label, sizeStyles.label]}>{label}</Text>
      {size !== 'small' && (
        <Text style={[styles.description, sizeStyles.description]}>
          {description}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const SIZE_STYLES = {
  small: {
    container: { padding: 12, minWidth: 80 },
    face: { fontSize: 24 },
    label: { fontSize: 12 },
    description: { fontSize: 10 },
  },
  medium: {
    container: { padding: 16, minWidth: 140 },
    face: { fontSize: 32 },
    label: { fontSize: 16 },
    description: { fontSize: 12 },
  },
  large: {
    container: { padding: 24, minWidth: 160, minHeight: 140 },
    face: { fontSize: 40 },
    label: { fontSize: 20 },
    description: { fontSize: 14 },
  },
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    flex: 1,
  },
  selected: {
    borderWidth: 4,
    borderColor: 'white',
  },
  face: {
    marginBottom: 4,
  },
  label: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 4,
  },
  description: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
});

export { ZONE_CONFIG, ZONE_FACES };
