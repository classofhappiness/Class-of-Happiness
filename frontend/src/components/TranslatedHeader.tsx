import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ColourCycleLogo } from './ColourCycleLogo';

interface TranslatedHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
  showHome?: boolean;
  // Real addition Aug 16: for multi-step screens (like Submit a Creature) where
  // "back" means a previous internal step, not a different route.
  onBackPress?: () => void;
  // Real addition Sep 10 (build 27): a single icon-only button left of the logo, for a
  // screen-specific action (currently just the teacher dashboard's Support Request
  // shortcut). Generic on purpose - this is a shared header used by many screens, so the
  // feature-specific gating (toggle check, icon choice, route) stays in the caller.
  extraAction?: { icon: keyof typeof MaterialIcons.glyphMap; onPress: () => void; color?: string; accessibilityLabel?: string };
}

export const TranslatedHeader: React.FC<TranslatedHeaderProps> = ({
  title,
  showBack = true,
  backTo,
  showHome = false,
  onBackPress,
  extraAction,
}) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else if (backTo) {
      router.replace(backTo as any);
    } else {
      router.back();
    }
  };

  return (
    // Real fix Sep 16 (live-test bug, high priority: header rendering over the Android status
    // bar on every screen using TranslatedHeader): Android was hardcoded to a flat 12px
    // regardless of the device's actual status bar height, while iOS correctly used
    // insets.top. Modern Android devices (hole-punch cameras, tall status bars) commonly have
    // a real inset well above that, so the header content rendered partly underneath the
    // clock/battery/signal icons. Now uses insets.top on both platforms, matching iOS's
    // already-correct behaviour.
    // This IS safe here, not a double-inset regression - confirmed by checking every screen
    // that renders TranslatedHeader: the 3 screens with NO SafeAreaView at all (creatures,
    // world-creatures, submit-creature) obviously need this. The 3 that import SafeAreaView
    // from plain 'react-native' (family-strategies, support-request, classrooms) get a
    // component that's iOS-only and a complete no-op on Android, so those were *also*
    // effectively unprotected on Android despite looking safe. The 3 that import the real,
    // cross-platform SafeAreaView from 'react-native-safe-area-context' with default (all)
    // edges (select, parent/alerts, student/strategies) DID already apply a real Android top
    // inset via that SafeAreaView - those three had their edges prop updated alongside this
    // fix (edges={['left','right','bottom']}) to stop double-applying it, matching the
    // pattern teacher/alerts.tsx and teacher/dashboard.tsx already established.
    <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
      <View style={styles.headerContent}>
        <View style={styles.backSlot}>
          {showBack && (
            // Real fix Sep 15 (Marisa build-26 round 2, Group A): standardized to match the
            // native-header back/home buttons elsewhere in the app (S04's black circle
            // treatment) - this component previously had plain, background-less icons, one
            // of the inconsistencies she flagged sweeping every TranslatedHeader screen.
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          )}
        </View>
        {/* Real fix Sep 15 (Marisa build-26, S09): a longer title ("How to make your
            creature") truncated with an ellipsis at fixed fontSize 17 - this shared header is
            used by dozens of screens with titles of very different lengths, so rather than a
            per-screen special case, adjustsFontSizeToFit lets any title that doesn't fit
            shrink down to fill the space instead of clipping; short titles are unaffected
            since they already fit at the full size. minimumFontScale floors how far it can
            shrink so an extreme case still stays legible rather than shrinking to nothing. */}
        <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
        <View style={styles.rightSlot}>
          {extraAction && (
            <TouchableOpacity
              onPress={extraAction.onPress}
              style={styles.extraActionButton}
              accessibilityLabel={extraAction.accessibilityLabel}
            >
              <MaterialIcons name={extraAction.icon} size={26} color={extraAction.color || '#333'} />
            </TouchableOpacity>
          )}
          {/* Real fix Sep 18: black ring at the exact back/home button size and colour
              (#1A1A2E, 36x36), matching the header-consistency work already done. Originally
              shipped with a white disc backing (the logo art's outline/wordmark are black,
              invisible directly on a black circle) - superseded same day by a real inverted
              asset (see ColourCycleLogo's CYCLE_PHASES_INVERTED): a Pillow flood-fill script
              flips the near-black ring/wordmark to white while leaving the coloured blob
              untouched, so the logo now sits directly on #1A1A2E, no disc needed. Displayed
              at 48.4px (134.5% of the 36px ring) - the geometric maximum where the ring's own
              outer edge (measured directly from the source art: 211.3px of a 620px canvas)
              still clears the ring's inside edge by a real 1.5px margin, clipped by the
              ring's own overflow:hidden exactly like this render was verified against.
              Colour-cycling animation reuses ColourCycleLogo (extracted from
              SplashAnimation's own S01 fix) so this is genuinely the same tuned animation,
              looping, not a second separately-tuned one. */}
          <View style={styles.logoRing}>
            <ColourCycleLogo size={48.4} loop variant="inverted" />
          </View>
          {showHome && (
            <TouchableOpacity onPress={() => router.replace('/')} style={styles.homeButton}>
              <MaterialIcons name="home" size={20} color="#FFFFFF" />
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
    width: 44,
    alignItems: 'flex-start',
  },
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 44,
    justifyContent: 'flex-end',
  },
  // Real fix Sep 15 (Marisa build-26 round 2, Group A): standardized to the same 36x36 black
  // circle used by the native-header back/home buttons (_layout.tsx) - was a plain, no-
  // background 24px icon before. backSlot/rightSlot widths above bumped from 40 to 44 to
  // actually fit this size with a little breathing room either side.
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraActionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Real fix Sep 18: matches backButton/homeButton exactly (36x36, #1A1A2E). overflow:
  // hidden is load-bearing now - the inverted logo renders at 48.4px (134.5%, see usage
  // comment above), deliberately larger than this circle, and this is what clips it back
  // down to a circle instead of a square overflowing the header row.
  logoRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1A2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
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
