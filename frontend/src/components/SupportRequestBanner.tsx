import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { supportRequestsApi, SupportRequest, formatSupportRequestStatus } from '../utils/api';

// POLL_MS deliberately shorter than FLASH_MS: with them equal, a flip detected right at
// the edge of a poll cycle could show for close to 0ms of its own flash window instead of
// a real "brief moment." At 2s polling, the worst-case detection lag still leaves ~2s of
// the 4s window visible.
const POLL_MS = 2000;
const FLASH_MS = 4000; // how long a just-resolved/acknowledged request stays visible before it self-removes

// Flip moment for a non-pending row, taken from the server's own timestamps rather than
// "did this client happen to witness the transition between two polls" - a ref-based
// witnessed-transition approach broke the first time the app was backgrounded, the
// dashboard wasn't focused, or Fast Refresh remounted the component at the wrong moment:
// the very next poll would see the row already ACKNOWLEDGED with no known prior state,
// and silently show nothing at all (confirmed live - Jono saw the pending pill vanish
// with no green flash). Using acknowledged_at/responded_at directly is correct regardless
// of mount timing: a flip within the last FLASH_MS shows (for its remaining window, not a
// fresh 4s), anything older correctly stays hidden - "brief moment" is real, not luck.
function flipTimestamp(r: SupportRequest): number | null {
  const iso = r.status === 'RESOLVED' ? (r.responded_at || r.acknowledged_at) : r.acknowledged_at;
  return iso ? new Date(iso).getTime() : null;
}

// Real feature Sep 10 (build 27): the teacher-side "Uber-style" pending banner. Minimal
// footprint per Jono's amendment - renders nothing when there's nothing to show, and a
// request that flips away from PENDING is displayed for one brief moment then removed
// for good, rather than lingering as history (that's what Alerts is for). Modelled on
// Uber's own collapsed trip card: one compact inline pill, not an edge-to-edge alert bar.
export function SupportRequestBanner({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [active, setActive] = useState<Record<string, SupportRequest>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const scheduleRemoval = (id: string, msRemaining: number) => {
      if (timers.current[id]) clearTimeout(timers.current[id]);
      timers.current[id] = setTimeout(() => {
        setActive((a) => { const n = { ...a }; delete n[id]; return n; });
        delete timers.current[id];
      }, Math.max(0, msRemaining));
    };

    const poll = () => {
      supportRequestsApi.list().then((list) => {
        if (cancelled) return;
        const now = Date.now();
        const next: Record<string, SupportRequest> = {};
        list.forEach((r) => {
          if (r.status === 'PENDING') {
            next[r.id] = r;
            if (timers.current[r.id]) { clearTimeout(timers.current[r.id]); delete timers.current[r.id]; }
            return;
          }
          const flipAt = flipTimestamp(r);
          if (flipAt === null) return;
          const msRemaining = flipAt + FLASH_MS - now;
          if (msRemaining <= 0) return; // flipped more than FLASH_MS ago - stays hidden, no lingering
          next[r.id] = r;
          scheduleRemoval(r.id, msRemaining);
        });
        setActive(next);
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
