import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface StrategyCardProps {
  name: string;
  description: string;
  icon: string;
  imageType?: string;
  customImage?: string;
  selected?: boolean;
  onPress: () => void;
  zoneColor: string;
}

export const StrategyCard: React.FC<StrategyCardProps> = ({
  name,
  description,
  icon,
  imageType = 'icon',
  customImage,
  selected = false,
  onPress,
  zoneColor,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.container,
        selected && { borderColor: zoneColor, borderWidth: 3, backgroundColor: `${zoneColor}15` },
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.iconContainer, { backgroundColor: zoneColor }]}>
        {imageType === 'custom' && customImage ? (
          <Image 
            source={{ uri: customImage }} 
            style={styles.customImage}
            resizeMode="cover"
          />
        ) : (
          <MaterialIcons name={icon as any} size={32} color="white" />
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {selected && (
        <View style={[styles.checkmark, { backgroundColor: zoneColor }]}>
          <MaterialIcons name="check" size={20} color="white" />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginVertical: 6,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
