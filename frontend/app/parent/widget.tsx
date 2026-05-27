import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, RefreshControl, Dimensions, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { familyApi } from '../../src/utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const ZONE_CONFIG: Record<string, { color: string; emoji: string; bg: string }> = {
  blue:   { color: '#4A90D9', emoji: '😢', bg: '#EBF4FF' },
  green:  { color: '#4CAF50', emoji: '😊', bg: '#E8F5E9' },
  yellow: { color: '#FFC107', emoji: '😰', bg: '#FFFDE7' },
  red:    { color: '#F44336', emoji: '😠', bg: '#FFEBEE' },
};

const ZONE_LABEL: Record<string, Record<string, string>> = {
  en: { blue: 'Blue Emotions', green: 'Green Emotions', yellow: 'Yellow Emotions', red: 'Red Emotions', none: 'No check-in yet' },
  pt: { blue: 'Emoções Azuis', green: 'Emoções Verdes', yellow: 'Emoções Amarelas', red: 'Emoções Vermelhas', none: 'Ainda sem check-in' },
  es: { blue: 'Emociones Azules', green: 'Emociones Verdes', yellow: 'Emociones Amarillas', red: 'Emociones Rojas', none: 'Sin registro aún' },
  fr: { blue: 'Émotions Bleues', green: 'Émotions Vertes', yellow: 'Émotions Jaunes', red: 'Émotions Rouges', none: 'Pas encore de registre' },
  de: { blue: 'Blaue Emotionen', green: 'Grüne Emotionen', yellow: 'Gelbe Emotionen', red: 'Rote Emotionen', none: 'Noch kein Check-in' },
  it: { blue: 'Emozioni Blu', green: 'Emozioni Verdi', yellow: 'Emozioni Gialle', red: 'Emozioni Rosse', none: 'Ancora nessun check-in' },
};

const TIME_AGO: Record<string, Record<string, string>> = {
  en: { just_now: 'Just now', mins: 'mins ago', hours: 'hours ago', days: 'days ago' },
  pt: { just_now: 'Agora mesmo', mins: 'min atrás', hours: 'horas atrás', days: 'dias atrás' },
  es: { just_now: 'Ahora mismo', mins: 'min atrás', hours: 'horas atrás', days: 'días atrás' },
  fr: { just_now: "À l'instant", mins: 'min', hours: 'heures', days: 'jours' },
  de: { just_now: 'Gerade eben', mins: 'Min. zuvor', hours: 'Std. zuvor', days: 'Tage zuvor' },
  it: { just_now: 'Proprio ora', mins: 'min fa', hours: 'ore fa', days: 'giorni fa' },
};

const TITLES: Record<string, string> = {
  en: 'Family Wellbeing', pt: 'Bem-estar Familiar', es: 'Bienestar Familiar',
  fr: 'Bien-être Familial', de: 'Familienwohl', it: 'Benessere Familiare',
};

const HOW_FEELING: Record<string, string> = {
  en: 'How is your family feeling?', pt: 'Como está a tua família?',
  es: '¿Cómo se siente tu familia?', fr: 'Comment se sent ta famille?',
  de: 'Wie geht es deiner Familie?', it: 'Come si sente la tua famiglia?',
};

const NO_MEMBERS: Record<string, string> = {
  en: 'Add family members to see their wellbeing here.',
  pt: 'Adiciona membros da família para ver o seu bem-estar aqui.',
  es: 'Añade miembros de la familia para ver su bienestar aquí.',
  fr: 'Ajoute des membres de la famille pour voir leur bien-être ici.',
  de: 'Füge Familienmitglieder hinzu, um ihr Wohlbefinden hier zu sehen.',
  it: 'Aggiungi membri della famiglia per vedere il loro benessere qui.',
};

function timeAgo(iso: string | null, lang: string): string {
  if (!iso) return TIME_AGO[lang]?.just_now || 'Just now';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const t = TIME_AGO[lang] || TIME_AGO.en;
  if (mins < 2) return t.just_now;
  if (mins < 60) return `${mins} ${t.mins}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ${t.hours}`;
  return `${Math.floor(hours / 24)} ${t.days}`;
}

export default function ParentWidgetScreen() {
  const router = useRouter();
  const { user, t, language } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<any[]>([]);
  const [logs, setLogs] = useState<Record<string, any>>({});

  const lang = language || 'en';
  const labels = ZONE_LABEL[lang] || ZONE_LABEL.en;

  const loadData = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const membersData = await familyApi.getMembers();
      setMembers(membersData || []);

      // Fetch last check-in per member
      const logsMap: Record<string, any> = {};
      await Promise.allSettled(membersData.map(async (m: any) => {
        try {
          const res = await fetch(`${BACKEND_URL}/api/family/zone-logs?family_member_id=${m.id}&limit=1`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.length > 0) logsMap[m.id] = data[0];
          }
        } catch {}
      }));
      setLogs(logsMap);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const overallZone = (() => {
    const zones = members.map(m => logs[m.id]?.zone || logs[m.id]?.feeling_colour).filter(Boolean);
    if (zones.includes('red')) return 'red';
    if (zones.includes('yellow')) return 'yellow';
    if (zones.includes('blue')) return 'blue';
    if (zones.includes('green')) return 'green';
    return null;
  })();

  const headerBg = overallZone ? ZONE_CONFIG[overallZone].bg : '#F8F9FA';
  const headerColor = overallZone ? ZONE_CONFIG[overallZone].color : '#5C6BC0';

  return (
    <SafeAreaView style={[st.container, { backgroundColor: headerBg }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={headerColor} />}
        contentContainerStyle={st.scroll}>

        {/* Header */}
        <View style={[st.header, { backgroundColor: headerColor }]}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <MaterialIcons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>{TITLES[lang] || TITLES.en}</Text>
            <Text style={st.headerSub}>{HOW_FEELING[lang] || HOW_FEELING.en}</Text>
          </View>
          {overallZone && (
            <Text style={{ fontSize: 36 }}>{ZONE_CONFIG[overallZone].emoji}</Text>
          )}
        </View>

        {loading ? (
          <ActivityIndicator color={headerColor} size="large" style={{ marginTop: 60 }} />
        ) : members.length === 0 ? (
          <View style={st.emptyBox}>
            <Text style={{ fontSize: 48 }}>👨‍👩‍👧</Text>
            <Text style={st.emptyText}>{NO_MEMBERS[lang] || NO_MEMBERS.en}</Text>
            <TouchableOpacity style={[st.addBtn, { backgroundColor: headerColor }]} onPress={() => router.push('/parent/dashboard')}>
              <MaterialIcons name="add" size={18} color="white" />
              <Text style={st.addBtnText}>{t('add_family_member') || 'Add Family Member'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={st.grid}>
            {members.map(member => {
              const log = logs[member.id];
              const zone = log?.zone || log?.feeling_colour || null;
              const cfg = zone ? ZONE_CONFIG[zone] : null;
              const isChild = member.relationship === 'child';
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[st.card, cfg ? { borderColor: cfg.color, backgroundColor: cfg.bg } : st.cardEmpty]}
                  onPress={() => router.push('/parent/dashboard')}>
                  {/* Avatar circle */}
                  <View style={[st.avatar, { backgroundColor: cfg?.color || '#E0E0E0', borderColor: isChild ? '#F44336' : '#5C6BC0' }]}>
                    <Text style={st.avatarText}>{member.name?.[0]?.toUpperCase() || '?'}</Text>
                  </View>
                  <Text style={st.memberName} numberOfLines={1}>{member.name}</Text>
                  {cfg ? (
                    <>
                      <Text style={{ fontSize: 32, marginTop: 4 }}>{cfg.emoji}</Text>
                      <Text style={[st.zoneLabel, { color: cfg.color }]}>{labels[zone] || zone}</Text>
                      <Text style={st.timeAgo}>{timeAgo(log?.timestamp || log?.created_at, lang)}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontSize: 28, marginTop: 4 }}>😶</Text>
                      <Text style={[st.zoneLabel, { color: '#BBB' }]}>{labels.none}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Quick check-in button */}
        {members.length > 0 && (
          <TouchableOpacity
            style={[st.checkinBtn, { backgroundColor: headerColor }]}
            onPress={() => router.push('/parent/checkin')}>
            <MaterialIcons name="favorite" size={20} color="white" />
            <Text style={st.checkinBtnText}>{t('checkin_btn') || 'Check In'}</Text>
          </TouchableOpacity>
        )}

        {/* Legend */}
        <View style={st.legend}>
          {(['green','yellow','blue','red'] as const).map(z => (
            <View key={z} style={st.legendItem}>
              <View style={[st.legendDot, { backgroundColor: ZONE_CONFIG[z].color }]} />
              <Text style={st.legendText}>{labels[z]}</Text>
            </View>
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 16, paddingBottom: 20, gap: 12 },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: 'white' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 12, justifyContent: 'center' },
  card: { width: (width - 48) / 2, backgroundColor: 'white', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 2, borderColor: '#E0E0E0', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  cardEmpty: { borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  avatar: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 3, marginBottom: 6 },
  avatarText: { color: 'white', fontSize: 20, fontWeight: '800' },
  memberName: { fontSize: 14, fontWeight: '700', color: '#333', textAlign: 'center' },
  zoneLabel: { fontSize: 11, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  timeAgo: { fontSize: 10, color: '#AAA', marginTop: 2 },
  emptyBox: { alignItems: 'center', padding: 40, gap: 12 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', lineHeight: 20 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 8 },
  addBtnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  checkinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 20, marginTop: 8, padding: 16, borderRadius: 14 },
  checkinBtnText: { color: 'white', fontWeight: '700', fontSize: 16 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, padding: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 11, color: '#666' },
});
