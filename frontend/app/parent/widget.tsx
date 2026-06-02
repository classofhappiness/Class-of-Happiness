import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, RefreshControl, Dimensions
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { familyApi } from '../../src/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const INDIGO = '#5C6BC0';
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_EMOJI: Record<string,string> = { blue:'😢', green:'😊', yellow:'😰', red:'😠' };
const PRESET_EMOJI: Record<string,string> = {
  cat:'🐱', dog:'🐶', bear:'🐻', bunny:'🐰', lion:'🦁',
  panda:'🐼', monkey:'🐵', unicorn:'🦄', star:'⭐', rainbow:'🌈',
};

export default function ParentWidgetScreen() {
  const router = useRouter();
  const { t, language, presetAvatars } = useApp();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [logs, setLogs] = useState<Record<string,any>>({});
  const [alerts, setAlerts] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const membersData = await familyApi.getMembers();
      setMembers(membersData || []);

      // Latest log per member
      const logsMap: Record<string,any> = {};
      await Promise.allSettled((membersData || []).map(async (m: any) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/family/zone-logs/${m.id}?days=1`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) logsMap[m.id] = data[0];
          }
        } catch {}
      }));
      setLogs(logsMap);

      // Alerts
      try {
        const alertRes = await fetch(`${BACKEND_URL}/api/notifications/alerts`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (alertRes.ok) {
          const aData = await alertRes.json();
          setAlerts(Array.isArray(aData) ? aData.filter((a:any) => !a.resolved) : []);
        }
      } catch {}
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const timeAgo = (iso: string) => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 2) return t('just_now') || 'Just now';
    if (mins < 60) return `${mins}m ${t('minutes_ago') || 'ago'}`;
    if (mins < 1440) return `${Math.floor(mins/60)}h ${t('hours_ago') || 'ago'}`;
    return `${Math.floor(mins/1440)}d ${t('days_ago') || 'ago'}`;
  };

  // Zone distribution
  const children = members.filter(m => m.relationship === 'child');
  const adults = members.filter(m => m.relationship !== 'child');
  const checkedInToday = members.filter(m => {
    const log = logs[m.id];
    return log && (Date.now() - new Date(log.timestamp).getTime()) < 24 * 3600000;
  }).length;

  const zoneDist: Record<string,number> = { green:0, yellow:0, blue:0, red:0 };
  members.forEach(m => {
    const z = logs[m.id]?.zone || logs[m.id]?.feeling_colour;
    if (z && zoneDist[z] !== undefined) zoneDist[z]++;
  });

  const MemberCard = ({ member }: { member: any }) => {
    const log = logs[member.id];
    const zone = log?.zone || log?.feeling_colour;
    const color = zone ? ZONE_COLORS[zone] : '#E0E0E0';
    const emoji = zone ? ZONE_EMOJI[zone] : '😶';
    const isChild = member.relationship === 'child';
    const hasAlert = alerts.some(a => a.family_member_id === member.id);

    return (
      <TouchableOpacity
        style={[st.memberCard, zone && { borderColor: color, backgroundColor: color + '08' }]}
        onPress={() => {
          if (member.relationship === 'child') {
            router.push({
              pathname: '/student/zone',
              params: { fromFamily: 'true', location: 'home', memberName: member.name, memberId: member.id, returnTo: 'family' }
            });
          } else {
            router.push({
              pathname: '/parent/checkin',
              params: { memberId: member.id, memberName: member.name, memberRelationship: member.relationship }
            });
          }
        }}
        activeOpacity={0.75}>
        {hasAlert && (
          <View style={st.alertDot}>
            <MaterialIcons name="priority-high" size={10} color="white" />
          </View>
        )}
        <View style={[st.avatarCircle, { backgroundColor: isChild ? '#F4433620' : '#5C6BC020', borderColor: isChild ? '#F44336' : INDIGO }]}>
          <Text style={{ fontSize: 24 }}>
            {member.avatar_type === 'custom' && member.avatar_custom && member.avatar_custom.startsWith('http')
              ? '📷'
              : presetAvatars?.find((a: any) => a.id === member.avatar_preset)?.emoji 
                || PRESET_EMOJI[member.avatar_preset] 
                || PRESET_EMOJI[(member.avatar_preset||'').toLowerCase()]
                || (isChild ? '👧' : '😊')}
          </Text>
        </View>
        <Text style={st.memberName} numberOfLines={1}>{member.name}</Text>
        <Text style={{ fontSize: 28, marginTop: 2 }}>{emoji}</Text>
        {zone ? (
          <Text style={[st.memberZone, { color }]}>{timeAgo(log.timestamp)}</Text>
        ) : (
          <Text style={st.notChecked}>{t('tap_to_check_in') || 'Tap to check in'}</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
          <MaterialIcons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={st.headerTitle}>😊 {t('family_widget') || 'Family Widget'}</Text>
          <Text style={st.headerSub}>{checkedInToday}/{members.length} {t('check_ins') || 'checked in today'}</Text>
        </View>
        {alerts.length > 0 && (
          <View style={st.alertBadge}>
            <Text style={st.alertBadgeText}>{alerts.length}</Text>
            <MaterialIcons name="notifications-active" size={16} color="white" />
          </View>
        )}
        <TouchableOpacity onPress={onRefresh} style={{ padding: 8 }}>
          <MaterialIcons name="refresh" size={22} color={INDIGO} />
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={INDIGO} />}
        contentContainerStyle={{ paddingBottom: 40 }}>

        {loading ? (
          <ActivityIndicator size="large" color={INDIGO} style={{ marginTop: 60 }} />
        ) : members.length === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 48 }}>👨‍👩‍👧</Text>
            <Text style={st.emptyText}>{t('add_family_to_track') || 'Add family members to track wellbeing'}</Text>
            <TouchableOpacity style={st.addBtn} onPress={() => router.push('/parent/dashboard')}>
              <Text style={st.addBtnText}>{t('add_family_member') || 'Add Family Member'}</Text>
            </TouchableOpacity>
          </View>
        ) : (<>

          {/* Emotion distribution bar */}
          {checkedInToday > 0 && (
            <View style={st.distCard}>
              <Text style={st.sectionTitle}>{t('family_emotional_status') || 'Family Emotional Status'}</Text>
              <View style={st.distBar}>
                {(['green','yellow','blue','red'] as const).map(z => {
                  const pct = members.length > 0 ? (zoneDist[z] / members.length) * 100 : 0;
                  return pct > 0 ? (
                    <View key={z} style={{ width: `${pct}%` as any, height: '100%', backgroundColor: ZONE_COLORS[z] }} />
                  ) : null;
                })}
              </View>
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {(['green','yellow','blue','red'] as const).map(z => zoneDist[z] > 0 ? (
                  <View key={z} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text>{ZONE_EMOJI[z]}</Text>
                    <Text style={{ fontSize: 12, color: ZONE_COLORS[z], fontWeight: '700' }}>{zoneDist[z]}</Text>
                  </View>
                ) : null)}
                {members.length - checkedInToday > 0 && (
                  <Text style={{ fontSize: 11, color: '#AAA', marginLeft: 'auto' as any }}>
                    {members.length - checkedInToday} {t('no_checkin_yet') || 'not checked in'}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Alerts */}
          {alerts.length > 0 && (
            <View style={[st.distCard, { borderLeftWidth: 4, borderLeftColor: '#F44336' }]}>
              <Text style={[st.sectionTitle, { color: '#F44336' }]}>
                🚨 {alerts.length} {t('request_support') || 'Support Request'}{alerts.length > 1 ? 's' : ''}
              </Text>
              <TouchableOpacity onPress={() => router.push('/parent/alerts')} style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: '#F44336', fontWeight: '700' }}>
                  {t('view_my_wellbeing') || 'View alerts'} →
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Children */}
          {children.length > 0 && (
            <View style={{ padding: 16 }}>
              <Text style={st.sectionTitle}>👧 {t('family') || 'Children'}</Text>
              <View style={st.grid}>
                {children.map(m => <MemberCard key={m.id} member={m} />)}
              </View>
            </View>
          )}

          {/* Adults */}
          {adults.length > 0 && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              <Text style={st.sectionTitle}>😊 {t('my_strategies') || 'Adults'}</Text>
              <View style={st.grid}>
                {adults.map(m => <MemberCard key={m.id} member={m} />)}
              </View>
            </View>
          )}

          {/* Go to dashboard */}
          <TouchableOpacity style={st.dashBtn} onPress={() => router.push('/parent/dashboard')}>
            <MaterialIcons name="dashboard" size={18} color={INDIGO} />
            <Text style={st.dashBtnText}>{t('family_dashboard') || 'Open Family Dashboard'}</Text>
            <MaterialIcons name="chevron-right" size={18} color={INDIGO} />
          </TouchableOpacity>

          {/* COH branding */}
          <Text style={st.copyright}>😊 Class of Happiness · classofhappiness.com · © {new Date().getFullYear()}</Text>

        </>)}
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_W = (width - 56) / 3;

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 8 },
  headerTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  headerSub: { fontSize: 11, color: '#888', marginTop: 1 },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F44336', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  alertBadgeText: { color: 'white', fontSize: 12, fontWeight: '700' },
  distCard: { margin: 16, backgroundColor: 'white', borderRadius: 14, padding: 14, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 8 },
  distBar: { height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: '#F0F0F0', flexDirection: 'row' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  memberCard: { width: CARD_W, backgroundColor: 'white', borderRadius: 14, padding: 10, alignItems: 'center', gap: 4, borderWidth: 2, borderColor: '#E8E8E8', elevation: 1 },
  alertDot: { position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: 9, backgroundColor: '#F44336', alignItems: 'center', justifyContent: 'center' },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  memberName: { fontSize: 11, fontWeight: '700', color: '#333', textAlign: 'center' },
  memberZone: { fontSize: 9, fontWeight: '600', textAlign: 'center' },
  notChecked: { fontSize: 9, color: '#BBB', textAlign: 'center' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 16 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center' },
  addBtn: { backgroundColor: INDIGO, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  addBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  dashBtn: { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: 'white', borderRadius: 14, padding: 14, gap: 10, elevation: 1 },
  dashBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: INDIGO },
  copyright: { textAlign: 'center', fontSize: 10, color: '#CCC', marginTop: 4, marginBottom: 20 },
});
