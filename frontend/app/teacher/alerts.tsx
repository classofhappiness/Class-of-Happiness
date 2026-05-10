import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAlerts, resolveAlert } from '../../src/utils/notifications';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_EMOJI: Record<string, string> = {
  blue: '🔵', green: '🟢', yellow: '🟡', red: '🔴',
};
const TYPE_LABELS: Record<string, string> = {
  help_request: 'Help Request',
  zone_alert: 'Zone Alert',
  parent_message: 'Message to Parent',
};

export default function AlertsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { t } = useApp();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [token, setToken] = useState('');

  const load = useCallback(async () => {
    const tok = await AsyncStorage.getItem('session_token') || '';
    setToken(tok);
    console.log('[Alerts] token present:', !!tok, 'length:', tok.length);
    const data = await getAlerts(tok);
    console.log('[Alerts] data received:', JSON.stringify(data?.length), Array.isArray(data));
    setAlerts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleResolve = async (alert_id: string) => {
    Alert.alert('Mark as Resolved', 'Are you sure you want to mark this alert as resolved?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resolve', style: 'destructive', onPress: async () => {
        await resolveAlert(alert_id, token);
        setAlerts(prev => prev.map(a => a.id === alert_id ? { ...a, resolved: true } : a));
      }},
    ]);
  };

  const unresolved = alerts.filter(a => !a.resolved);
  const resolved = alerts.filter(a => a.resolved);

  return (
    <SafeAreaView style={st.container}>
      <TranslatedHeader title={t('alerts') || 'Student Alerts'} />

      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <Text style={st.empty}>Loading...</Text>
        ) : unresolved.length === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 40 }}>✅</Text>
            <Text style={st.empty}>No pending alerts</Text>
          </View>
        ) : null}

        {unresolved.map(alert => (
          <View key={alert.id} style={[st.card, { borderLeftColor: ZONE_COLORS[alert.zone] || '#5C6BC0' }]}>
            <View style={st.cardTop}>
              <Text style={st.zone}>{ZONE_EMOJI[alert.zone] || '💙'} {alert.student_name}</Text>
              {alert.classroom_name && <Text style={{ fontSize:11, color:'#888', marginTop:2 }}>📍 {alert.classroom_name}</Text>}
              {alert.strategy_name && <Text style={{ fontSize:11, color:'#5C6BC0', marginTop:2 }}>🎯 Strategy: {alert.strategy_name}</Text>}
              {alert.created_at && <Text style={{ fontSize:10, color:'#BBB', marginTop:2 }}>🕐 {new Date(alert.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · {new Date(alert.created_at).toLocaleDateString()}</Text>}
              <Text style={st.type}>{TYPE_LABELS[alert.alert_type] || alert.alert_type}</Text>
            </View>
            {alert.strategy_name ? (
              <Text style={st.strategy}>Strategy: {alert.strategy_name}</Text>
            ) : null}
            {alert.message ? (
              <Text style={st.message}>"{alert.message}"</Text>
            ) : null}
            <View style={st.cardBottom}>
              <Text style={st.time}>{new Date(alert.created_at).toLocaleString()}</Text>
              <TouchableOpacity style={st.resolveBtn} onPress={() => handleResolve(alert.id)}>
                <Text style={st.resolveTxt}>Mark resolved</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {resolved.length > 0 && (
          <>
            <Text style={st.sectionLabel}>Resolved</Text>
            {resolved.slice(0, 5).map(alert => (
              <View key={alert.id} style={[st.card, st.cardResolved]}>
                <View style={st.cardTop}>
                  <Text style={[st.zone, { color: '#999' }]}>{ZONE_EMOJI[alert.zone] || '💙'} {alert.student_name}</Text>
                  <Text style={st.type}>{TYPE_LABELS[alert.alert_type] || alert.alert_type}</Text>
                </View>
                {alert.message ? <Text style={[st.message, { color: '#AAA' }]}>"{alert.message}"</Text> : null}
                <Text style={st.time}>{new Date(alert.created_at).toLocaleString()}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  title: { fontSize: 17, fontWeight: '700', color: '#333' },
  card: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardResolved: { opacity: 0.5, borderLeftColor: '#CCC' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  zone: { fontSize: 15, fontWeight: '700', color: '#333' },
  type: { fontSize: 11, color: '#5C6BC0', fontWeight: '600', backgroundColor: '#E8EAF6', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  strategy: { fontSize: 13, color: '#555', marginBottom: 4 },
  message: { fontSize: 13, color: '#333', fontStyle: 'italic', marginBottom: 6 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { fontSize: 11, color: '#999' },
  resolveBtn: { backgroundColor: '#E8F5E9', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8 },
  resolveTxt: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  sectionLabel: { fontSize: 12, color: '#999', fontWeight: '600', marginTop: 16, marginBottom: 8, textTransform: 'uppercase' },
  emptyBox: { alignItems: 'center', paddingTop: 60, gap: 12 },
  empty: { fontSize: 15, color: '#999', textAlign: 'center', marginTop: 8 },
});
