/**
 * Global style utilities for cross-platform consistency
 * Import these where needed to ensure iOS/Android/iPad parity
 */
import { Platform, Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

// Detect iPad
export const isIPad = Platform.OS === 'ios' && Math.min(width, height) >= 768;

// Responsive font size - prevents iOS font scaling breaking layouts
export const fontSize = (size: number): number => {
  if (isIPad) return size * 1.15; // Slightly larger on iPad
  return size;
};

// Responsive spacing
export const spacing = (size: number): number => {
  if (isIPad) return size * 1.2;
  return size;
};

// Safe text props to prevent font scaling issues on iOS
export const safeTextProps = {
  allowFontScaling: false,
};

// Container max width for iPad - prevents content stretching too wide
export const containerStyle = {
  maxWidth: isIPad ? 600 : undefined,
  alignSelf: isIPad ? 'center' as const : undefined,
  width: isIPad ? '100%' as const : undefined,
};
