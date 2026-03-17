import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'splash';
  style?: any;
}

export const Logo: React.FC<LogoProps> = ({ size = 'medium', style }) => {
  const dimensions = SIZE_MAP[size];
  
  return (
    <View style={[styles.container, style]}>
      <Image
        source={require('../../assets/images/logo_coh.png')}
        style={[styles.logo, { width: dimensions.width, height: dimensions.height }]}
        resizeMode="contain"
      />
    </View>
  );
};

const SIZE_MAP = {
  small: { width: 40, height: 40 },
  medium: { width: 120, height: 120 },
  large: { width: 200, height: 200 },
  splash: { width: 280, height: 280 },
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    // dimensions set dynamically
  },
});

// Corner logo component for other pages
export const CornerLogo: React.FC = () => {
  return (
    <View style={cornerStyles.container}>
      <Image
        source={require('../../assets/images/logo_coh.png')}
        style={cornerStyles.logo}
        resizeMode="contain"
      />
    </View>
  );
};

const cornerStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 8,
    left: 12,
    zIndex: 100,
  },
  logo: {
    width: 36,
    height: 36,
  },
});
