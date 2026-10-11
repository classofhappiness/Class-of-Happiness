import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { StrategyIcon } from './StrategyIcon';
import { useApp } from '../context/AppContext';

interface StrategyCardProps {
  name: string;
  description: string;
  icon: string;
  imageType?: string;
  customImage?: string;
  selected?: boolean;
  onPress: () => void;
  zoneColor: string;
  /** Oct 11: where the strategy is used: only home, only school, or shared both ways (small icon, tinted in the emotion colour). */
  origin?: 'home' | 'school' | 'both';
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
  origin,
}) => {
  const { t } = useApp();
  const originLabel = origin === 'home' ? (t('origin_home_label') || 'Used at home') : origin === 'school' ? (t('origin_school_label') || 'Used at school') : (t('origin_both_label') || 'Shared between home and school');
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
          <StrategyIcon icon={icon} size={22} color="white" />
        )}
      </View>
      <View style={styles.textContainer}>
        <Text
          style={styles.name}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {name}
        </Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {!!origin && (
        <View accessible accessibilityRole="image" accessibilityLabel={originLabel}
          style={[styles.originBadge, { backgroundColor: `${zoneColor}33`, borderColor: zoneColor }]}>
          <MaterialIcons name={origin === 'home' ? 'home' : origin === 'school' ? 'school' : 'sync'} size={15} color="#444" />
        </View>
      )}
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
    padding: 10,
    marginVertical: 3,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  textContainer: {
    flex: 1,
    marginLeft: 10,
  },
  name: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  description: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  originBadge: { width: 26, height: 26, borderRadius: 13, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  checkmark: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
