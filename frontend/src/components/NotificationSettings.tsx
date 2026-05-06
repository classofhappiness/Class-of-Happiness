import React, { useEffect, useState } from 'react';
import { View, Text, Switch, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { updateStudentNotifSettings, getStudentNotifSettings } from '../utils/notifications';

const ZONES = ['blue', 'green', 'yellow', 'red'];
const ZONE_EMOJI: Record<string, string> = { blue: '🔵', green: '🟢', yellow: '🟡', red: '🔴' };
const ZONE_LABEL: Record<string, string> = { blue: 'Blue', green: 'Green', yellow: 'Yellow', red: 'Red' };

interface Props {
  student_id: string;
  student_name: string;
  onClose?: () => void;
}

export default function NotificationSettings({ student_id, student_name, onClose }: Props) {
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [helpRequest, setHelpRequest] = useState(true);
  const [zoneAlerts, setZoneAlerts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('session_token').then(tok => {
      if (tok) {
        setToken(tok);
        getStudentNotifSettings(student_id, tok).then(s => {
          setEnabled(s.enabled);
          setHelpRequest(s.help_request !== false);
          setZoneAlerts(s.zone_alerts || []);
        });
      }
    });
  }, [student_id]);

  const toggleZone = (zone: string) => {
    setZoneAlerts(prev =>
      prev.includes(zone) ? prev.filter(z => z !== zone) : [...prev, zone]
    );
  };

  const save = async () => {
    setSaving(true);
    await updateStudentNotifSettings(student_id, token, {
      enabled,
      help_request: helpRequest,
      zone_alerts: zoneAlerts,
    });
    setSaving(false);
    Alert.alert('Saved', `Notification settings updated for ${student_name}.`);
    onClose?.();
  };

  return (
    <View style={st.container}>
      <Text style={st.title}>🔔 Notifications for {student_name}</Text>
      <Text style={st.sub}>You will receive push notifications on your phone.</Text>

      <View style={st.row}>
        <Text style={st.label}>Enable notifications</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: '#5C6BC0' }} />
      </View>

      {enabled && (
        <>
          <View style={st.row}>
            <View style={{ flex: 1 }}>
              <Text style={st.label}>Help requests</Text>
              <Text style={st.desc}>Notify when student taps "Ask for help"</Text>
            </View>
            <Switch value={helpRequest} onValueChange={setHelpRequest} trackColor={{ true: '#5C6BC0' }} />
          </View>

          <Text style={[st.label, { marginTop: 12, marginBottom: 6 }]}>Zone alerts — notify when checks in:</Text>
          <View style={st.zones}>
            {ZONES.map(zone => (
              <TouchableOpacity
                key={zone}
                style={[st.zoneChip, zoneAlerts.includes(zone) && st.zoneChipOn]}
                onPress={() => toggleZone(zone)}
              >
                <Text style={[st.zoneChipTxt, zoneAlerts.includes(zone) && { color: 'white' }]}>
                  {ZONE_EMOJI[zone]} {ZONE_LABEL[zone]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={st.saveBtn} onPress={save} disabled={saving}>
        <Text style={st.saveTxt}>{saving ? 'Saving...' : 'Save Settings'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  container: { padding: 20 },
  title: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 4 },
  sub: { fontSize: 12, color: '#888', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  label: { fontSize: 14, fontWeight: '600', color: '#333' },
  desc: { fontSize: 12, color: '#888', marginTop: 2 },
  zones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  zoneChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#DDD', backgroundColor: 'white' },
  zoneChipOn: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  zoneChipTxt: { fontSize: 13, fontWeight: '600', color: '#555' },
  saveBtn: { backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 20 },
  saveTxt: { color: 'white', fontWeight: '700', fontSize: 15 },
});
