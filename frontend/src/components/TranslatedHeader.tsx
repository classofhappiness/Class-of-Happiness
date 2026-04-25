import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TranslatedHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
}

export const TranslatedHeader: React.FC<TranslatedHeaderProps> = ({ 
  title, 
  showBack = true,
  backTo 
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (backTo) {
      router.replace(backTo as any);
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: Platform.OS === "ios" ? insets.top : 8 }]}>
      <View style={styles.headerContent}>
        <View style={styles.backSlot}>
          {showBack && (
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.centerGroup}>
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        <View style={styles.backSlot} />
      </View>
      <View style={styles.yellowBar} />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: '#F8F9FA',
    paddingBottom: 0,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 6,
  },
  backSlot: {
    width: 40,
    alignItems: 'flex-start',
  },
  backButton: {
    padding: 4,
  },
  centerGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  logo: {
    width: 26,
    height: 26,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
  },
  yellowBar: {
    height: 4,
    backgroundColor: '#FFC107',
    marginHorizontal: -12,
    marginTop: 4,
  },
});
