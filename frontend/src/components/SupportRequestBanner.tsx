import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { SupportRequest, formatSupportRequestStatus } from '../utils/api';
import { useSupportRequestsList } from '../utils/supportRequestsPoller';

const FLASH_MS = 4000; // how long a just-RESOLVED request stays visible before it self-removes

// Real revision Sep 11 (Jono's lifecycle spec): PENDING and ACKNOWLEDGED both now persist
// indefinitely - "Seen — on the way" is a real waiting state, not a 4s toast, and stays
// until the request actually resolves (teacher taps "Support arrived", or admin responds).
// Only RESOLVED gets the brief flash-then-vanish, using the server's own timestamp so it's
// correct regardless of when this component happened to be mounted (a ref-based
// witnessed-transition approach broke exactly that way - confirmed live). arrived_at wins
// over responded_at as the flip moment when both exist - a teacher tapping "arrived" after
// the admin already replied is the TRUE close, not whatever the admin said earlier.
function flipTimestamp(r: SupportRequest): number | null {
  const iso = r.arrived_at || r.responded_at || r.cancelled_at || r.acknowledged_at;
  return iso ? new Date(iso).getTime() : null;
}

// Real feature Sep 10 (build 27): the teacher-side "Uber-style" pending banner. Minimal
// footprint per Jono's amendment - renders nothing when there's nothing to show. Modelled
// on Uber's own collapsed trip card: one compact inline pill, not an edge-to-edge alert bar.
export function SupportRequestBanner({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const list = useSupportRequestsList(enabled);
  const [active, setActive] = useState<Record<string, SupportRequest>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Real fix Sep 11 (stop-ship): this used to run its own setInterval + fetch. Now purely
  // derives from the one shared poller (supportRequestsPoller.ts) - see that file for why.
  useEffect(() => {
    const now = Date.now();
    const next: Record<string, SupportRequest> = {};
    list.forEach((r) => {
      if (r.status === 'SUPERSEDED') return; // never shown - focus jumps straight to the incident that superseded it
      if (r.status === 'PENDING' || r.status === 'ACKNOWLEDGED') {
        next[r.id] = r; // persist until the request actually resolves
        if (timers.current[r.id]) { clearTimeout(timers.current[r.id]); delete timers.current[r.id]; }
        return;
      }
      // RESOLVED or CANCELLED - brief flash, then gone for good
      const flipAt = flipTimestamp(r);
      if (flipAt === null) return;
      const msRemaining = flipAt + FLASH_MS - now;
      if (msRemaining <= 0) return; // flipped more than FLASH_MS ago - stays hidden, no lingering
      next[r.id] = r;
      if (timers.current[r.id]) clearTimeout(timers.current[r.id]);
      timers.current[r.id] = setTimeout(() => {
        setActive((a) => { const n = { ...a }; delete n[r.id]; return n; });
        delete timers.current[r.id];
      }, msRemaining);
    });
    setActive(next);
  }, [list]);

  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

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
