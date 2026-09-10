import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supportRequestsApi, SupportRequest, formatSupportRequestStatus } from '../utils/api';

const POLL_MS = 4000;
const FLASH_MS = 4000; // how long a just-resolved/acknowledged request stays visible before it self-removes

// Real feature Sep 10 (build 27): the teacher-side "Uber-style" pending banner. Minimal
// footprint per Jono's amendment - renders nothing when there's nothing to show, and a
// request that flips away from PENDING is displayed for one brief moment then removed
// for good, rather than lingering as history (that's what Alerts is for). Modelled on
// Uber's own collapsed trip card: one compact inline pill, not an edge-to-edge alert bar.
export function SupportRequestBanner({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<Record<string, SupportRequest>>({});
  const prevStatus = useRef<Record<string, string>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const poll = () => {
      supportRequestsApi.list().then((list) => {
        if (cancelled) return;
        setActive((current) => {
          const next = { ...current };
          list.forEach((r) => {
            const was = prevStatus.current[r.id];
            if (r.status === 'PENDING') {
              next[r.id] = r;
              if (timers.current[r.id]) { clearTimeout(timers.current[r.id]); delete timers.current[r.id]; }
            } else if (was && was !== r.status) {
              // Just transitioned during this session - flash it, then remove for good.
              next[r.id] = r;
              if (timers.current[r.id]) clearTimeout(timers.current[r.id]);
              timers.current[r.id] = setTimeout(() => {
                setActive((a) => { const n = { ...a }; delete n[r.id]; return n; });
                delete timers.current[r.id];
              }, FLASH_MS);
            } else if (current[r.id]) {
              next[r.id] = r; // mid-flash already - keep, timer already running
            }
            prevStatus.current[r.id] = r.status;
          });
          return next;
        });
      }).catch(() => {});
    };

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      Object.values(timers.current).forEach(clearTimeout);
      timers.current = {};
    };
  }, [enabled]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const items = Object.values(active).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const anyPending = items.some((r) => r.status === 'PENDING');

  useEffect(() => {
    if (!anyPending) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anyPending]);

  if (!enabled || items.length === 0) return null;

  const openRequest = (id: string) => router.push(`/teacher/support-request?viewId=${id}` as any);

  if (items.length === 1) {
    const display = formatSupportRequestStatus(items[0]);
    return (
      <TouchableOpacity style={styles.pill} onPress={() => openRequest(items[0].id)} activeOpacity={0.7}>
        <Animated.View style={[styles.dot, { backgroundColor: display.color, opacity: display.pulse ? pulseAnim : 1 }]} />
        <Text style={styles.text} numberOfLines={1}>Support request · {display.text}</Text>
        <MaterialIcons name="chevron-right" size={18} color="#999" />
      </TouchableOpacity>
    );
  }

  const seenCount = items.filter((r) => r.status !== 'PENDING').length;
  const color = anyPending ? formatSupportRequestStatus(items.find((r) => r.status === 'PENDING')!).color
    : formatSupportRequestStatus(items[0]).color;
  return (
    <TouchableOpacity style={styles.pill} onPress={() => openRequest(items[0].id)} activeOpacity={0.7}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity: anyPending ? pulseAnim : 1 }]} />
      <Text style={styles.text} numberOfLines={1}>
        {items.length} support requests{seenCount > 0 ? ` · ${seenCount} seen` : ''}
      </Text>
      <MaterialIcons name="chevron-right" size={18} color="#999" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // Real note Sep 10: no horizontal margin here on purpose - this renders inside the
  // teacher dashboard's ScrollView, which already has 16px horizontal padding on its
  // content container. Adding another 16px here would double-inset it relative to
  // every tile/section around it instead of sitting flush with them.
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingVertical: 10, paddingHorizontal: 14,
    marginBottom: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
});
