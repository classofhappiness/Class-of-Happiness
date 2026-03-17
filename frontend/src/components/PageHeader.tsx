import React from 'react';
import { View, Image, StyleSheet, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PageHeaderProps {
  title?: string;
  showBack?: boolean;
  showLogo?: boolean;
  rightAction?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ 
  title, 
  showBack = true, 
  showLogo = true,
  rightAction 
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.leftSection}>
        {showBack && (
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        )}
        {showLogo && (
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        )}
      </View>
      
      {title && (
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      )}
      
      <View style={styles.rightSection}>
        {rightAction}
      </View>
    </View>
  );
};

// Simple corner logo component for pages that use default Stack header
export const CornerLogo: React.FC = () => {
  return (
    <Image
      source={require('../../assets/images/logo_coh.png')}
      style={cornerStyles.logo}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: '#F8F9FA',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 80,
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  logo: {
    width: 32,
    height: 32,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  rightSection: {
    width: 80,
    alignItems: 'flex-end',
  },
});

const cornerStyles = StyleSheet.create({
  logo: {
    width: 28,
    height: 28,
    marginRight: 8,
  },
});
