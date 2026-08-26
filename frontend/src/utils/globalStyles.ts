/**
 * Global style utilities for cross-platform consistency
 * Import these where needed to ensure iOS/Android/tablet parity
 */
import { useWindowDimensions } from 'react-native';

// Any screen at or above this (in its shorter dimension) is treated as a tablet.
// Covers iPad mini (~744pt) and up. Portrait-only app, so width is what matters in practice.
export const TABLET_BREAKPOINT = 768;

// Cap for bottom-sheet / centered modals so they don't stretch edge-to-edge on a tablet.
export const MODAL_MAX_WIDTH = 480;

// Reactive - recomputes on rotation and on iPad Split View / Slide Over resize,
// unlike Dimensions.get('window') which only reads the size once at module load.
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= TABLET_BREAKPOINT;

  return {
    width,
    height,
    isTablet,
    fontSize: (size: number): number => (isTablet ? size * 1.15 : size),
    spacing: (size: number): number => (isTablet ? size * 1.2 : size),
    // Spread onto a modal's outer style array: [styles.modalContent, isTablet && modalCapStyle]
    modalCapStyle: {
      width: '100%' as const,
      maxWidth: MODAL_MAX_WIDTH,
      alignSelf: 'center' as const,
    },
    // General content container max width for tablet - prevents content stretching too wide
    containerStyle: {
      maxWidth: isTablet ? 600 : undefined,
      alignSelf: isTablet ? ('center' as const) : undefined,
      width: isTablet ? ('100%' as const) : undefined,
    },
  };
}

// Safe text props to prevent font scaling issues on iOS
export const safeTextProps = {
  allowFontScaling: false,
};
