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
  // Real addition Sep 19: a small pill shown right after the title (e.g. parent/linked-child's
  // "Family" tag). Optional and absent everywhere else, in which case the title renders exactly
  // as before - this is what kept that screen from being converted to this shared header.
  titleBadge?: string;
  // Real addition Sep 19 (header/nav remainder - the screens that kept hand-rolled headers
  // because a plain string title couldn't hold their content). All optional and additive:
  // a screen passing none of them renders exactly as before.
  //   subtitle      - small second line under the title (e.g. "Check-in for Maya")
  //   titleContent  - replaces the title text entirely, centred (e.g. a student's avatar+name+class)
  //   rightContent  - rendered at the start of the right cluster, before the logo (e.g. a Support pill)
  //   homeTo        - where the home button goes; defaults to '/' (screens that used to send the
  //                   user straight to their own role dashboard keep doing so)
  subtitle?: string;
  titleContent?: React.ReactNode;
  rightContent?: React.ReactNode;
  homeTo?: string;
}

export const TranslatedHeader: React.FC<TranslatedHeaderProps> = ({
  title,
  showBack = true,
  backTo,
  showHome = false,
  onBackPress,
  extraAction,
  titleBadge,
  subtitle,
  titleContent,
  rightContent,
  homeTo,
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
        {titleContent ? (
          <View style={styles.titleStack}>{titleContent}</View>
        ) : subtitle ? (
          <View style={styles.titleStack}>
            <Text style={[styles.title, styles.titleBesideBadge]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        ) : titleBadge ? (
          <View style={styles.titleWithBadge}>
            <Text style={[styles.title, styles.titleBesideBadge]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
            <View style={styles.titleBadge}><Text style={styles.titleBadgeText}>{titleBadge}</Text></View>
          </View>
        ) : (
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{title}</Text>
        )}
        <View style={styles.rightSlot}>
          {rightContent}
          {extraAction && (
            <TouchableOpacity
              onPress={extraAction.onPress}
              style={styles.extraActionButton}
              accessibilityLabel={extraAction.accessibilityLabel}
            >
              <MaterialIcons name={extraAction.icon} size={26} color={extraAction.color || '#333'} />
            </TouchableOpacity>
          )}
          {/* Real fix Sep 18 (Marisa design feedback - reverted same day): went through a
              black-circle-backed treatment (white disc, then a real inverted asset) and
              back out again per Marisa's call - the black ring read as visually heavier
              than intended and didn't match the logo's own natural presentation elsewhere
              in the app. Back to the original, non-inverted art (its own natural black ring
              + wordmark) directly on the header's plain background, no circle/backing of
              any kind - but KEEPING the 48.4px size (134.5% of the old 36px ring) reached
              during that detour, since that's a real, kept improvement: legibly bigger,
              "CLASS of Happiness" actually reads now. Colour-cycling animation reuses
              ColourCycleLogo (extracted from SplashAnimation's own S01 fix) so this is
              genuinely the same tuned animation, looping, not a second separately-tuned one. */}
          <ColourCycleLogo size={48.4} loop />
          {showHome && (
            <TouchableOpacity onPress={() => router.replace((homeTo || '/') as any)} style={styles.homeButton}>
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
  // Real fix Sep 18 (Marisa design feedback - spacing pass): was 6px, standardized to 8px
  // to match the other 3 places this same back/logo/home cluster appears (_layout.tsx's
  // HomeToStudents/HomeToDashboard, teacher/checkin.tsx's restyled-in-place header) -
  // visually verified against the real logo art at 48.4px (composited render, not just
  // matched by number): the logo asset itself has ~8px of built-in transparent padding on
  // each side even at this larger size (its circular composition leaves the canvas corners
  // empty), so 8px of explicit gap here reads as generously - not excessively - spaced next
  // to the two solid 36px back/home circles, which have no such padding of their own.
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    flexShrink: 1,
    flex: 1,
    textAlign: 'center',
  },
  // titleBadge layout: the title hugs its text (flex 0, still shrinkable) instead of filling
  // the row, so the pill sits right beside it; the pair is centred as a group.
  titleWithBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  titleBesideBadge: {
    flex: 0,
    flexShrink: 1,
  },
  // subtitle / titleContent: a centred column that owns the middle slot, like title does.
  titleStack: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 11,
    color: '#888',
    marginTop: 1,
    textAlign: 'center',
  },
  titleBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  titleBadgeText: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '700',
  },
});
