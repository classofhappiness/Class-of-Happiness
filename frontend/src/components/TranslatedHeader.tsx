import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TranslatedHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
  showHome?: boolean;
}

export const TranslatedHeader: React.FC<TranslatedHeaderProps> = ({ 
  title, 
  showBack = true,
  backTo,
  showHome = false,
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
    <View style={[styles.header, { paddingTop: (Platform.OS === "ios" ? insets.top : 12) + 4 }]}>
      <View style={styles.headerContent}>
        <View style={styles.backSlot}>
          {showBack && (
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <View style={styles.rightSlot}>
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          {showHome && (
            <TouchableOpacity onPress={() => router.replace('/')} style={styles.homeButton}>
              <MaterialIcons name="home" size={24} color="#333" />
            </TouchableOpacity>
          )}
        </View>
      </View>
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
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 40,
    justifyContent: 'flex-end',
  },
  backButton: {
    padding: 4,
  },
  homeButton: {
    padding: 4,
  },
  logo: {
    width: 24,
    height: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
    flex: 1,
    textAlign: 'center',
  },
});
