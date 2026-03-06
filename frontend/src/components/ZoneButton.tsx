import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface ZoneButtonProps {
  zone: 'blue' | 'green' | 'yellow' | 'red';
  onPress: () => void;
  selected?: boolean;
  size?: 'small' | 'medium' | 'large';
}

const ZONE_CONFIG = {
  blue: {
    color: '#4A90D9',
    lightColor: '#E3F2FD',
    label: 'Blue Zone',
    description: 'Sad, Tired, Bored',
    icon: 'sentiment-dissatisfied' as const,
  },
  green: {
    color: '#4CAF50',
    lightColor: '#E8F5E9',
    label: 'Green Zone',
    description: 'Calm, Happy, Focused',
    icon: 'sentiment-satisfied' as const,
  },
  yellow: {
    color: '#FFC107',
    lightColor: '#FFF8E1',
    label: 'Yellow Zone',
    description: 'Worried, Frustrated, Silly',
    icon: 'sentiment-neutral' as const,
  },
  red: {
    color: '#F44336',
    lightColor: '#FFEBEE',
    label: 'Red Zone',
    description: 'Angry, Scared, Out of Control',
    icon: 'sentiment-very-dissatisfied' as const,
  },
};

export const ZoneButton: React.FC<ZoneButtonProps> = ({ 
  zone, 
  onPress, 
  selected = false,
  size = 'large' 
}) => {
  const config = ZONE_CONFIG[zone];
  const sizeStyles = SIZE_STYLES[size];

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
      <MaterialIcons 
        name={config.icon} 
        size={sizeStyles.iconSize} 
        color="white" 
      />
      <Text style={[styles.label, sizeStyles.label]}>{config.label}</Text>
      {size !== 'small' && (
        <Text style={[styles.description, sizeStyles.description]}>
          {config.description}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const SIZE_STYLES = {
  small: {
    container: { padding: 12, minWidth: 80 },
    iconSize: 28,
    label: { fontSize: 12 },
    description: { fontSize: 10 },
  },
  medium: {
    container: { padding: 16, minWidth: 140 },
    iconSize: 36,
    label: { fontSize: 16 },
    description: { fontSize: 12 },
  },
  large: {
    container: { padding: 24, minWidth: 160, minHeight: 140 },
    iconSize: 48,
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
  },
  selected: {
    borderWidth: 4,
    borderColor: 'white',
  },
  label: {
    color: 'white',
    fontWeight: 'bold',
    marginTop: 8,
  },
  description: {
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
    textAlign: 'center',
  },
});

export { ZONE_CONFIG };
