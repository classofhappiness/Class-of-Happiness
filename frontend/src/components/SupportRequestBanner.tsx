import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  SupportRequest, formatSupportRequestStatus, describeSupportRequest, formatSentLine,
  supportRequestsApi,
} from '../utils/api';
import { useSupportRequestsList } from '../utils/supportRequestsPoller';
import { EMOTION_COLOURS } from '../constants/emotionColours';

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

// Real revision Sep 11 (Jono, live device pass): replaces the old "tap the pill, navigate
// to a whole new screen" pattern with an inline expand/collapse card, right on the
// dashboard - fewer pages, less confusion. The separate status screen
// (app/teacher/support-request.tsx's ?viewId= step) stays as the deep-link target for a
// push notification tap or anywhere the dashboard isn't on screen; both read the same
// shared poller so they can never show conflicting state. No message/chat button here yet
// - that's still an unscoped Phase 2 candidate, omitted rather than shipped as a dead tap.
export function SupportRequestBanner({ enabled }: { enabled: boolean }) {
  const list = useSupportRequestsList(enabled);
  const [active, setActive] = useState<Record<string, SupportRequest>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, 'arriving' | 'cancelling' | undefined>>({});
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

  const items = Object.values(active).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  if (!enabled || items.length === 0) return null;

  const toggle = (id: string) => setExpanded((e) => ({ ...e, [id]: !e[id] }));

  const markArrived = async (r: SupportRequest) => {
    setBusy((b) => ({ ...b, [r.id]: 'arriving' }));
    try {
      const updated = await supportRequestsApi.markArrived(r.id);
      setActive((a) => ({ ...a, [r.id]: updated }));
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not update request');
    } finally {
      setBusy((b) => ({ ...b, [r.id]: undefined }));
    }
  };

  const cancelRequest = (r: SupportRequest) => Alert.alert(
    'Cancel request?',
    "This stops the buzzing and closes it - the admin will be told it's no longer needed.",
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Cancel request', style: 'destructive', onPress: async () => {
        setBusy((b) => ({ ...b, [r.id]: 'cancelling' }));
        try {
          const updated = await supportRequestsApi.cancel(r.id);
          setActive((a) => ({ ...a, [r.id]: updated }));
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Could not cancel request');
        } finally {
          setBusy((b) => ({ ...b, [r.id]: undefined }));
        }
      } },
    ]
  );

  return (
    <View>
      {items.map((r) => (
        <RequestCard
          key={r.id}
          request={r}
          expanded={!!expanded[r.id]}
          busy={busy[r.id]}
          onToggle={() => toggle(r.id)}
          onArrived={() => markArrived(r)}
          onCancel={() => cancelRequest(r)}
        />
      ))}
    </View>
  );
}

function RequestCard({ request, expanded, busy, onToggle, onArrived, onCancel }: {
  request: SupportRequest;
  expanded: boolean;
  busy: 'arriving' | 'cancelling' | undefined;
  onToggle: () => void;
  onArrived: () => void;
  onCancel: () => void;
}) {
  const display = formatSupportRequestStatus(request);
  const isOpen = request.status === 'PENDING' || request.status === 'ACKNOWLEDGED';
  const who = request.student_name || request.classroom_name || 'Classroom';
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!display.pulse) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [display.pulse]);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.pill} onPress={onToggle} activeOpacity={0.7}>
        <Animated.View style={[styles.dot, { backgroundColor: display.color, opacity: display.pulse ? pulseAnim : 1 }]} />
        <Text style={styles.text} numberOfLines={1}>Support request · {display.text}</Text>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#999" />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.details}>
          <Text style={styles.detailTitle}>{who}</Text>
          <Text style={styles.detailLine}>{describeSupportRequest(request)}</Text>
          <Text style={styles.detailMeta}>{formatSentLine(request.created_at)}</Text>
          {isOpen && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.arrivedBtn} disabled={!!busy} onPress={onArrived}>
                {busy === 'arriving' ? <ActivityIndicator color="white" /> : <Text style={styles.arrivedBtnText}>Support arrived ✓</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} disabled={!!busy} onPress={onCancel}>
                {busy === 'cancelling' ? <ActivityIndicator color="#999" /> : <Text style={styles.cancelBtnText}>Cancel</Text>}
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Real note Sep 10: no horizontal margin here on purpose - this renders inside the
  // teacher dashboard's ScrollView, which already has 16px horizontal padding on its
  // content container. Adding another 16px here would double-inset it relative to
  // every tile/section around it instead of sitting flush with them.
  card: {
    backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    marginBottom: 12, overflow: 'hidden',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  text: { flex: 1, fontSize: 13, fontWeight: '600', color: '#333' },
  details: {
    paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2,
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
  },
  detailTitle: { fontSize: 14, fontWeight: '700', color: '#333', marginTop: 8 },
  detailLine: { fontSize: 13, color: '#555', marginTop: 2 },
  detailMeta: { fontSize: 11, color: '#999', marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  arrivedBtn: {
    flex: 1, backgroundColor: EMOTION_COLOURS.green, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  arrivedBtnText: { color: 'white', fontWeight: '700', fontSize: 13 },
  cancelBtn: {
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center',
  },
  cancelBtnText: { color: '#999', fontWeight: '600', fontSize: 13, textDecorationLine: 'underline' },
});
