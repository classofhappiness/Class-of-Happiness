import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
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
  extraActionButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 32,
    height: 32,
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
