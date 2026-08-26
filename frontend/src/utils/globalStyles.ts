/**
 * Global style utilities for cross-platform consistency
 * Import these where needed to ensure iOS/Android/tablet parity
 */
import { useWindowDimensions } from 'react-native';

// Any screen at or above this (in its shorter dimension) is treated as a tablet.
// Real fix Aug 26 (Phase 2): the current iPad mini (6th gen, 2021) is 744pt wide in
// portrait - genuinely narrower than the classic 768 "tablet" convention, since Apple
// redesigned it to a taller aspect ratio. A 768 threshold silently excluded a real,
// current, still-sold device. 700 safely covers it (and every wider iPad) with margin,
// without pulling in any real phone (largest current iPhone is ~430pt in portrait).
export const TABLET_BREAKPOINT = 700;

// Second tier for grid column-count decisions - separates "standard" iPads (mini 744pt,
// 11th-gen/Air 820pt, Pro 11" 834pt) from the one meaningfully wider real device
// (iPad Pro 12.9", 1024pt), which can reasonably fit an extra grid column.
export const LARGE_TABLET_BREAKPOINT = 900;

// Cap for bottom-sheet / centered modals so they don't stretch edge-to-edge on a tablet.
export const MODAL_MAX_WIDTH = 480;

// Reactive - recomputes on rotation and on iPad Split View / Slide Over resize,
// unlike Dimensions.get('window') which only reads the size once at module load.
export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const shortSide = Math.min(width, height);
  const isTablet = shortSide >= TABLET_BREAKPOINT;
  const isLargeTablet = shortSide >= LARGE_TABLET_BREAKPOINT;

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
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

// Percentage width for one card in an N-up flex-wrap grid (gap-based spacing), leaving a
// safety margin so N cards + (N-1) gaps never exceeds 100% and wraps unexpectedly. Matches
// this app's existing convention exactly at 2 columns (100/2 - 3 = 47%, the width already
// used everywhere in the app's phone-only 2-column grids) rather than inventing a new value.
export function gridCardWidth(columns: number): `${number}%` {
  const margin = columns <= 2 ? 3 : 2;
  return `${Math.floor(100 / columns - margin)}%`;
}

// Column count for a grid whose card count naturally grows with data (a creature
// collection, a strategy list, a roster) - genuinely benefits from more columns as the
// screen widens. NOT for a fixed-count selector (e.g. exactly 4 emotion-zone buttons) -
// those should stay a deliberate fixed layout; see useFixedGridWidth below instead.
export function useDataGridColumns(): number {
  const { isTablet, isLargeTablet } = useResponsive();
  if (isLargeTablet) return 4;
  if (isTablet) return 3;
  return 2;
}

// For a FIXED, small item count (e.g. exactly 4 emotion-zone buttons, exactly 4 creature
// evolution-stage photos) - stays as originally laid out on phone, becomes a single row on
// tablet where there's real room for it. Deliberately not a progressive 2/3/4 reflow like
// useDataGridColumns - a fixed 4-item set split across 3 columns leaves an awkward
// orphaned 4th item, so this only ever has two states, not three.
export function useFixedGridColumns(itemCount: number, phoneColumns = 2): number {
  const { isTablet } = useResponsive();
  return isTablet ? itemCount : phoneColumns;
}
