import React, { useState, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Modal, Alert, ActivityIndicator, RefreshControl, Switch, useWindowDimensions, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { StrategyIcon } from '../../../src/components/StrategyIcon';
import { SourceChip } from '../../../src/components/SourceChip';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { BarChart } from 'react-native-gifted-charts';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../../src/context/AppContext';
import { useAndroidKeyboardOffset } from '../../../src/utils/useAndroidKeyboardOffset';
import { EMOTION_COLOURS } from '../../../src/constants/emotionColours';
import { linkedChildApi, LinkedChild, FamilyAssignedStrategy, familyApi } from '../../../src/utils/api';
import { EmotionColourLoader } from '../../../src/components/EmotionColourLoader';
import { TranslatedHeader } from '../../../src/components/TranslatedHeader';
import { formatMonthYear as formatMonthYearLabel } from '../../../src/utils/monthLabel';
import { formatShortDateTime } from '../../../src/utils/dateLabel';
import { resolveStrategyName, strategyLabel } from '../../../src/utils/resolveStrategyName';
import { getDownloadUrl } from '../../../src/utils/downloadLink';

const ZONE_COLORS: Record<string, string> = EMOTION_COLOURS;
const ZONE_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  blue:   { color: EMOTION_COLOURS.blue, emoji: '\u{1F622}', label: 'Blue Emotions' },
  green:  { color: EMOTION_COLOURS.green, emoji: '\u{1F60A}', label: 'Green Emotions' },
  yellow: { color: EMOTION_COLOURS.yellow, emoji: '\u{1F630}', label: 'Yellow Emotions' },
  red:    { color: EMOTION_COLOURS.red, emoji: '\u{1F620}', label: 'Red Emotions' },
};
// Real fix Sep 30 (live feedback, item 2): ZONE_CONFIG.label above is a hardcoded English
// dict read with no t() call anywhere on this page (recent check-ins, filter pills, emotion
// distribution, zone comparison chart) - these two helpers translate zone names consistently
// everywhere on the page, reusing the same t() keys already used elsewhere in the app
// (blue_zone/blue_emotions for the long form, blue_short_label for chart/pill labels).
const getZoneLabel = (zone: string, t: (key: string) => string): string =>
  t(`${zone}_zone`) || t(`${zone}_emotions`) || ZONE_CONFIG[zone]?.label || zone;
const getZoneShortLabel = (zone: string, t: (key: string) => string): string =>
  t(`${zone}_short_label`) || (zone.charAt(0).toUpperCase() + zone.slice(1));
// Locale map for Intl date formatting - matches the same fix applied to
// teacher/student-detail.tsx, teacher/dashboard.tsx and teacher/checkin.tsx for the identical
// bug (toLocaleDateString(undefined, ...) follows the DEVICE's OS locale, not the app's own
// in-app language setting).
const LOCALE_FOR_LANG: Record<string,string> = { en:'en-US', pt:'pt-PT', es:'es-ES', fr:'fr-FR', de:'de-DE', it:'it-IT', hi:'hi-IN', zh:'zh-CN', ar:'ar-u-nu-latn-ca-gregory', ru:'ru-RU' };
// Real fix Oct 5 (month-picker capitalisation): Intl's long-month formatting lowercases the
// month name by default for several Latin-script locales (fr/es/it/etc. all do this
// natively, correctly, per their own grammar rules) - capitalised here purely for this
// picker's visual consistency with English. zh/ar/hi have no letter case, so left untouched.
const NO_CASE_LANGS = new Set(['zh', 'ar', 'hi']);
const capitalizeMonth = (label: string, lang: string): string =>
  NO_CASE_LANGS.has(lang) ? label : label.charAt(0).toUpperCase() + label.slice(1);
// Translated calendar day letters - matches teacher/student-detail.tsx's CALENDAR_DAY_LETTERS.
const CALENDAR_DAY_LETTERS: Record<string, string[]> = {
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
  pt: ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sa'],
  es: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'],
  fr: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  it: ['Do', 'Lu', 'Ma', 'Me', 'Gi', 'Ve', 'Sa'],
  hi: ['र', 'सो', 'मं', 'बु', 'गु', 'शु', 'श'],
  zh: ['日', '一', '二', '三', '四', '五', '六'],
  ar: ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'],
  ru: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'],
};

const STRATEGY_ICONS = [
  { id: 'star', name: 'star' }, { id: 'favorite', name: 'favorite' },
  { id: 'self-improvement', name: 'self-improvement' }, { id: 'music-note', name: 'music-note' },
  { id: 'sports-soccer', name: 'sports-soccer' }, { id: 'pets', name: 'pets' },
  { id: 'nature', name: 'nature' }, { id: 'book', name: 'book' },
];

// Full strategy name map — current backend IDs (blue_1 format) + legacy short IDs.
// Kept only as a safety-net fallback for resolveStrategyName() (see
// src/utils/resolveStrategyName.ts) so nothing that used to resolve correctly can start
// showing blank/undefined. Real names now come from t() via that shared resolver.
const STRATEGY_NAMES: Record<string, string> = {
  blue_1:'Gentle Stretch',   blue_2:'Drink Water',        blue_3:'Favourite Song',
  blue_4:'Cosy Spot',        blue_5:'Tell Someone',        blue_6:'Slow Breathing',
  green_1:'Keep Going!',     green_2:'Help a Friend',      green_3:'Try Something New',
  green_4:'Share Your Smile',green_5:'Set a Goal',         green_6:'Gratitude',
  yellow_1:'Bubble Breathing',yellow_2:'Body Shake',       yellow_3:'Count to 10',
  yellow_4:'5 Senses',       yellow_5:'Squeeze & Release', yellow_6:'Talk About It',
  red_1:'Freeze',            red_2:'Big Breaths',          red_3:'Count Backwards',
  red_4:'Safe Space',        red_5:'Ask for Help',         red_6:'Self Hug',
  b1:'Gentle Stretch', b2:'Favourite Song', b3:'Tell Someone', b4:'Slow Breathing',
  g1:'Keep Going!',    g2:'Help a Friend',  g3:'Set a Goal',   g4:'Gratitude',
  y1:'Bubble Breathing',y2:'Count to 10',  y3:'5 Senses',     y4:'Talk About It',
  r1:'Freeze',         r2:'Big Breaths',   r3:'Safe Space',   r4:'Ask for Help',
  p_b1:'Side-by-Side Presence', p_b2:'Warm Drink Ritual',    p_b3:'Name It to Tame It',
  p_b4:'Movement Invitation',   p_b5:'Comfort & Closeness',
  p_g1:'Gratitude Round',       p_g2:'Strength Spotting',    p_g3:'Creative Together',
  p_g4:'Family Dance',          p_g5:'Calm Problem Solving',
  p_y1:'Box Breathing Together',p_y2:'Validate First',       p_y3:'Body Check-In',
  p_y4:'Feelings Journal',      p_y5:'Give Space with Love',
  p_r1:'Stay Calm Yourself',    p_r2:'Safe Space Together',  p_r3:'Cold Water Reset',
  p_r4:'No Teaching Now',       p_r5:'Reconnect with Warmth',
};


const buildZoneCounts = (checkins: any[]) => {
  const c: Record<string, number> = { blue: 0, green: 0, yellow: 0, red: 0 };
  checkins.forEach(ci => { const z = ci.zone || ci.feeling_colour; if (z in c) c[z]++; });
  return c;
};
const buildStrategyCounts = (checkins: any[]) => {
  const c: Record<string, number> = {};
  checkins.forEach(ci => {
    const strats = ci.strategies_selected || ci.helpers_selected || [];
    strats.forEach((s: string) => { c[s] = (c[s] || 0) + 1; });
  });
  return c;
};

type ChildType = 'school_linked' | 'family_member' | null;

export default function LinkedChildDetailScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useApp();
  // Real fix Sep 22 (device report, 3rd report - traced live via parent/dashboard.tsx's
  // own onPress handler for a school-linked child's stats button: it routes here, to
  // /parent/linked-child/[id], not student/strategies.tsx or parent/checkin.tsx, which is
  // why those two earlier fixes never touched this screen at all. This screen's check-in
  // Comment field had ZERO keyboard-avoidance of any kind - not broken, just never
  // present. Same Android edge-to-edge/adjustResize gap as the other two screens - see
  // useAndroidKeyboardOffset's own comment.
  const androidKeyboardOffset = useAndroidKeyboardOffset();

  const [child,          setChild]          = useState<any | null>(null);
  const [childType,      setChildType]      = useState<ChildType>(null);
  const [familyMemberId, setFamilyMemberId] = useState<string | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [allCheckIns,    setAllCheckIns]    = useState<any[]>([]);
  const [homeCheckIns,   setHomeCheckIns]   = useState<any[]>([]);
  const [schoolCheckIns, setSchoolCheckIns] = useState<any[]>([]);
  const [schoolStrats,   setSchoolStrats]   = useState<any[]>([]);
  // Real feature Aug 26 (item 3): the backend has returned sharing_disabled on this response
  // since it was first scaffolded, but nothing here ever read it - an empty school section
  // looked identical to "no school data yet" and "the teacher paused sharing". Now shown
  // explicitly so it isn't mistaken for either of those.
  const [schoolSharingPaused, setSchoolSharingPaused] = useState(false);
  const [familyStrats,   setFamilyStrats]   = useState<FamilyAssignedStrategy[]>([]);
  const [homeSharingEnabled, setHomeSharingEnabled] = useState(false);
  // Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved): family-level toggle,
  // default ON - applies to every child (school-linked or family), unlike Home Sharing above
  // which is school-linked-children-only.
  const [shopEnabled, setShopEnabled] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 14 | 30>(7);

  const [secEmoDistrib,     setSecEmoDistrib]     = useState(false);
  const [secEmoCompare,     setSecEmoCompare]     = useState(false);
  const [secMostUsed,       setSecMostUsed]       = useState(false);
  const [secRecentCheckins, setSecRecentCheckins] = useState(false);
  const [secCalendar,       setSecCalendar]       = useState(false);
  const [secStrategies,     setSecStrategies]     = useState(false);
  const [secPdfReport,      setSecPdfReport]      = useState(false);
  const [downloadingMonth, setDownloadingMonth] = useState<string|null>(null);

  const [activeDistTab, setActiveDistTab] = useState<'combined' | 'home' | 'school'>('combined');
  const [activeTab,     setActiveTab]     = useState<'combined' | 'home' | 'school'>('combined');
  const [activeZone,    setActiveZone]    = useState<string | null>(null);

  const [showCheckIn,  setShowCheckIn]  = useState(false);
  const [selectedZone, setSelectedZone] = useState('');
  const [comment,      setComment]      = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [showAddStrat, setShowAddStrat] = useState(false);
  const [newStrat, setNewStrat] = useState({
    name: '', description: '', zone: 'green', icon: 'star', shareWithTeacher: false,
  });

  const downloadReport = async (monthStr: string) => {
    if (!id) return;
    setDownloadingMonth(monthStr);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const [yearStr, monthNum] = monthStr.split('-');
      const studentId = child?.student_id || id;
      const lang = await AsyncStorage.getItem('app_language') || 'en';
      const dlPath = `/reports/pdf/student/${studentId}/month/${yearStr}/${parseInt(monthNum)}`;
      const plainUrl = `${BACKEND_URL}/api${dlPath}?lang=${lang}`;
      // fix51: the pre-check uses the Authorization header, the browser gets a short-lived signed link (not the session token)
      const checkRes = await fetch(plainUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!checkRes.ok) {
        let detail = '';
        try { detail = (await checkRes.json())?.detail || ''; } catch (e) { console.error('[parent/linked-child/[id]:152]', e); }
        if (detail.startsWith('free_tier_limit|')) {
          Alert.alert(t('free_plan_limit_title') || 'Free Plan Limit Reached', detail.split('|')[1] || (t('upgrade_unlimited_reports') || 'Upgrade for unlimited reports.'), [
            { text: t('not_now') || 'Not Now', style: 'cancel' },
            { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
          ]);
        } else {
          Alert.alert(t('error') || 'Error', t('cannot_generate_pdf') || 'Cannot generate PDF');
        }
        return;
      }
      const fullUrl = await getDownloadUrl(dlPath, { lang }, () => `${plainUrl}&token=${token}`);
      await Linking.openURL(fullUrl);
    } catch (error: any) {
      Alert.alert(t('download_error') || 'Download Error', error.message || (t('could_not_download_report') || 'Could not download report'));
    } finally {
      setDownloadingMonth(null);
    }
  };

  const fetchData = useCallback(async () => {
    if (!id) return;
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    const token = await AsyncStorage.getItem('session_token');
    const headers = { 'Authorization': `Bearer ${token}` };
    try {
      const linkedChildren = await linkedChildApi.getAll();
      const linkedChild = linkedChildren.find((c: any) => c.id === id);
      if (linkedChild) {
        setChild(linkedChild);
        setChildType('school_linked');
        setHomeSharingEnabled(linkedChild.home_sharing_enabled);
        setShopEnabled(linkedChild.shop_enabled !== false);
        const [allData, homeData, schoolData] = await Promise.all([
          linkedChildApi.getAllCheckIns(id, selectedPeriod),
          linkedChildApi.getHomeCheckIns(id, selectedPeriod),
          linkedChildApi.getSchoolCheckIns(id, selectedPeriod),
        ]);
        setAllCheckIns(Array.isArray(allData) ? allData : []);
        setHomeCheckIns(Array.isArray(homeData) ? homeData : []);
        setSchoolCheckIns(Array.isArray(schoolData?.checkins) ? schoolData.checkins : []);
        setSchoolSharingPaused(!!schoolData?.sharing_disabled);
        const [schoolStratData, familyStratData] = await Promise.all([
          linkedChildApi.getSchoolStrategies(id),
          linkedChildApi.getFamilyStrategies(id),
        ]);
        if (schoolStratData?.sharing_disabled) setSchoolSharingPaused(true);
        // Oct 11: the generic /api/helpers colour lists are gone. Only what is meaningful is listed: strategies from
        // school (shared teacher-made ones + the school's own student strategies) and from home. `strategies` is
        // the unified list; an older backend only has custom_strategies.
        setSchoolStrats(Array.isArray(schoolStratData?.strategies)
          ? schoolStratData.strategies
          : [...(schoolStratData?.custom_strategies || []), ...(schoolStratData?.school_strategies || [])]);
        setFamilyStrats(familyStratData || []);
      } else {
        const membersRes = await fetch(`${BACKEND_URL}/api/family/members`, { headers });
        if (!membersRes.ok) { setLoading(false); setRefreshing(false); return; }
        const members = await membersRes.json();
        const fm = members.find((m: any) => m.student_id === id || m.id === id);
        if (!fm) { setLoading(false); setRefreshing(false); return; }
        const memberId = fm.id;
        setFamilyMemberId(memberId);
        setChildType('family_member');
        setChild({ id, name: fm.name, avatar_type: fm.avatar_type, avatar_preset: fm.avatar_preset,
          avatar_custom: fm.avatar_custom, home_sharing_enabled: true, is_linked_from_school: false });
        // Real fix Sep 15 (B1, "Class of Happiness Shop", Jono-approved): confirmed live
        // that 6 of 18 parent accounts have ONLY this child type - this toggle needs to work
        // here too, not just for school-linked children.
        setShopEnabled(fm.shop_enabled !== false);
        const [checkinsRes, zoneLogsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/family/members/${memberId}/checkins?days=${selectedPeriod}`, { headers }),
          fetch(`${BACKEND_URL}/api/family/zone-logs/${memberId}?days=${selectedPeriod}`, { headers }),
        ]);
        const checkinsData = checkinsRes.ok ? await checkinsRes.json() : [];
        const zoneLogsData = zoneLogsRes.ok ? await zoneLogsRes.json() : [];
        const combined = [...(Array.isArray(checkinsData) ? checkinsData : []),
                          ...(Array.isArray(zoneLogsData) ? zoneLogsData : [])];
        const seen = new Set();
        const deduped = combined.filter((c: any) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
        setAllCheckIns(deduped); setHomeCheckIns(deduped); setSchoolCheckIns([]);
        const stratRes = await fetch(`${BACKEND_URL}/api/family/custom-strategies?member_id=${memberId}`, { headers });
        const stratData = stratRes.ok ? await stratRes.json() : [];
        setFamilyStrats(stratData.map((s: any) => ({
          id: s.id, strategy_name: s.name || s.strategy_name,
          strategy_description: s.description || s.strategy_description,
          zone: s.zone, icon: s.icon, share_with_teacher: false,
        })));
        setSchoolStrats([]);
      }
    } catch (err) { console.error('LinkedChild fetchData error:', err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [id, selectedPeriod, language]);

  useEffect(() => { fetchData(); }, [fetchData]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const handleCheckIn = async () => {
    if (!selectedZone || !id) return;
    setSubmitting(true);
    try {
      if (childType === 'school_linked') {
        await linkedChildApi.createCheckIn(id, { zone: selectedZone, strategies_selected: [], comment: comment.trim() || undefined });
      } else if (childType === 'family_member' && familyMemberId) {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        await fetch(`${BACKEND_URL}/api/family/members/${familyMemberId}/checkin`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ zone: selectedZone, strategies_selected: [], comment: comment.trim() || undefined }),
        });
      }
      Alert.alert(t('success') || 'Success', t('check_in_saved_excl') || 'Check-in saved!');
      setShowCheckIn(false); setSelectedZone(''); setComment('');
      fetchData();
    } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleAddStrat = async () => {
    if (!newStrat.name.trim() || !id) return;
    try {
      if (childType === 'school_linked') {
        await linkedChildApi.createFamilyStrategy(id, {
          strategy_name: newStrat.name, strategy_description: newStrat.description,
          zone: newStrat.zone, icon: newStrat.icon, share_with_teacher: newStrat.shareWithTeacher,
        });
      } else if (childType === 'family_member' && familyMemberId) {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        await fetch(`${BACKEND_URL}/api/family/custom-strategies`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newStrat.name, description: newStrat.description,
            zone: newStrat.zone, icon: newStrat.icon, member_id: familyMemberId }),
        });
      }
      Alert.alert(t('success') || 'Success', t('strategy_added_excl') || 'Strategy added!');
      setShowAddStrat(false);
      setNewStrat({ name: '', description: '', zone: 'green', icon: 'star', shareWithTeacher: false });
      fetchData();
    } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
  };

  const handleToggleShare = async (stratId: string) => {
    if (!id || childType !== 'school_linked') return;
    try {
      const r = await linkedChildApi.toggleStrategySharing(id, stratId);
      Alert.alert(t('updated_title') || 'Updated', r.share_with_teacher ? (t('strategy_now_shared_teacher') || 'Now shared with teacher') : (t('strategy_no_longer_shared') || 'No longer shared'));
      fetchData();
    } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
  };

  const handleToggleHomeSharing = async () => {
    if (!id || childType !== 'school_linked') return;
    try { const r = await linkedChildApi.toggleHomeSharing(id); setHomeSharingEnabled(r.home_sharing_enabled); }
    catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
  };

  // Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved): family-level toggle -
  // covers BOTH child types, unlike Home Sharing above which is school-linked-only. Confirmed
  // live (2026-09-15) that 6 of 18 parent accounts have ONLY a family_member-type child, all
  // 6 already with a real student_id - not a small edge case, so this needed real coverage,
  // not just the school-linked (parent_links) path.
  const handleToggleShop = async () => {
    try {
      if (childType === 'school_linked' && id) {
        const r = await linkedChildApi.toggleShop(id);
        setShopEnabled(r.shop_enabled);
      } else if (childType === 'family_member' && familyMemberId) {
        const r = await familyApi.toggleShop(familyMemberId);
        setShopEnabled(r.shop_enabled);
      }
    } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
  };

  const getDistCheckins = () =>
    activeDistTab === 'home' ? homeCheckIns : activeDistTab === 'school' ? schoolCheckIns : allCheckIns;
  const getRecentCheckins = () => {
    const base = activeTab === 'home' ? homeCheckIns : activeTab === 'school' ? schoolCheckIns : allCheckIns;
    return activeZone ? base.filter((c: any) => (c.zone || c.feeling_colour) === activeZone) : base;
  };

  const zoneCounts    = buildZoneCounts(allCheckIns);
  const stratCounts   = buildStrategyCounts(allCheckIns);
  const totalCheckins = allCheckIns.length;
  const dashLocale = LOCALE_FOR_LANG[language] || 'en-US';
  const barData = (['blue','green','yellow','red'] as const).map(z => ({
    value: zoneCounts[z] || 0, frontColor: ZONE_COLORS[z], label: getZoneShortLabel(z, t),
  }));
  const formatDate = (d: string) =>
    formatShortDateTime(d, language, { twoDigitHour: true });

  if (loading) return (
    <SafeAreaView style={s.container}><View style={s.center}>
      <EmotionColourLoader visible size={64} /><Text style={s.loadingText}>{t('loading') || 'Loading...'}</Text>
    </View></SafeAreaView>
  );
  if (!child) return (
    <SafeAreaView style={s.container}><View style={s.center}>
      <MaterialIcons name="error" size={48} color="#F44336" />
      <Text style={s.errorText}>{t('child_not_found') || t('child_not_found') || 'Child not found'}</Text>
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}><Text style={s.backBtnText}>{t('go_back') || t('go_back') || 'Go Back'}</Text></TouchableOpacity>
    </View></SafeAreaView>
  );

  const isFamilyChild = childType === 'family_member';

  return (
    // Real fix Sep 19 (header/nav remainder): converted to the shared TranslatedHeader - the
    // conditional "Family" tag that blocked this is now its titleBadge prop. No home button:
    // this screen is exactly one step from parent/dashboard (traced Sep 18), so back already
    // gets there, per the app-wide rule. edges omit 'top' because TranslatedHeader applies
    // the top inset itself (same fix as parent/family-member-stats/[id]).
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <TranslatedHeader title={child.name} titleBadge={isFamilyChild ? (t('family') || 'Family') : undefined} />

      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C6BC0" colors={['#5C6BC0']} />}>

        <View style={s.childCard}>
          <View style={s.childAvatar}><Text style={{ fontSize: 28 }}>{'\u{1F467}'}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.childName}>{child.name}</Text>
            <Text style={s.childSub}>{isFamilyChild ? (t('family_member_label') || 'Family Member') : (child.classroom_name || (t('children_school') || 'School Linked'))}</Text>
          </View>
          <TouchableOpacity style={s.checkInBtn} onPress={() => setShowCheckIn(true)}>
            <MaterialIcons name="add-circle" size={20} color="#fff" />
            <Text style={s.checkInBtnText}>{t('check_in') || 'Check In'}</Text>
          </TouchableOpacity>
        </View>

        {!isFamilyChild && (
          <View style={s.card}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={[s.cardTitle, { color: homeSharingEnabled ? '#2E7D32' : '#E65100' }]}>
                  {homeSharingEnabled ? `\u2705 ${t('sharing_active') || 'Sharing Active'}` : `\u23F8 ${t('sharing_paused') || 'Sharing Paused'}`}
                </Text>
                <Text style={s.cardSub}>
                  {homeSharingEnabled ? (t('teacher_can_see_home_checkins') || 'Teacher can see home check-ins') : (t('teacher_cannot_see_home_data') || 'Teacher cannot see home data')}
                </Text>
              </View>
              <Switch value={homeSharingEnabled} onValueChange={handleToggleHomeSharing}
                trackColor={{ false: '#FFE0B2', true: '#C8E6C9' }}
                thumbColor={homeSharingEnabled ? '#4CAF50' : '#FF9800'} />
            </View>
          </View>
        )}

        {/* Real feature Sep 15 (B1, "Class of Happiness Shop", Jono-approved): family-level
            toggle - a one-line nudge toward talking with the child about it, not a silent
            restriction, per Jono's explicit design note. Shown for BOTH child types (unlike
            Home Sharing above) - see handleToggleShop's note on why that coverage matters. */}
        <View style={s.card}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={[s.cardTitle, { color: '#333' }]}>
                {t('shop_title') || '🛍️ Class of Happiness Shop'}
              </Text>
              <Text style={s.cardSub}>
                {(shopEnabled
                  ? (t('shop_toggle_desc_on') || '{name} can earn and spend points on rewards in the Shop.')
                  : (t('shop_toggle_desc_off') || 'Turns off Shop rewards for {name} - worth talking to them about why.')
                ).replace('{name}', child.name)}
              </Text>
            </View>
            <Switch value={shopEnabled} onValueChange={handleToggleShop}
              trackColor={{ false: '#E0E0E0', true: '#C8E6C9' }}
              thumbColor={shopEnabled ? '#4CAF50' : '#9E9E9E'} />
          </View>
        </View>

        <View style={s.periodRow}>
          {([1, 7, 14, 30] as const).map(d => (
            <TouchableOpacity key={d} style={[s.periodBtn, selectedPeriod === d && s.periodBtnActive]} onPress={() => setSelectedPeriod(d)}>
              <Text style={[s.periodBtnText, selectedPeriod === d && s.periodBtnTextActive]}>
                {d === 1 ? t('today') || 'Today' : d === 7 ? t('days_7') || '7 Days' : d === 14 ? t('fortnight') || '2 Weeks' : t('days_30') || '30 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {schoolSharingPaused && (
          <View style={{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor:'#FFF8E1', borderRadius:10, padding:12, marginBottom:12, borderWidth:1, borderColor:'#FFE082' }}>
            <MaterialIcons name="pause-circle-filled" size={20} color="#F57C00" />
            <Text style={{ flex:1, fontSize:12, color:'#7A5A00', lineHeight:17 }}>
              {t('school_sharing_paused_notice') || "This student's teacher has paused sharing school data with you. Home data below is unaffected."}
            </Text>
          </View>
        )}

        <View style={s.statsRow}>
          <View style={s.statCard}><Text style={s.statVal}>{totalCheckins}</Text><Text style={s.statLbl}>{t('wellbeing_total') || t('wellbeing_total') || 'Total'}</Text></View>
          <View style={s.statCard}><Text style={[s.statVal,{color:EMOTION_COLOURS.green}]}>{zoneCounts.green||0}</Text><Text style={s.statLbl}>{t('steady') || t('steady') || 'Positive'}</Text></View>
          {!isFamilyChild && <>
            <View style={s.statCard}><Text style={s.statVal}>{homeCheckIns.length}</Text><Text style={s.statLbl}>{'\u{1F3E0}'} {t('home') || 'Home'}</Text></View>
            <View style={s.statCard}><Text style={s.statVal}>{schoolCheckIns.length}</Text><Text style={s.statLbl}>{'\u{1F3EB}'} {t('school') || 'School'}</Text></View>
          </>}
          <View style={s.statCard}><Text style={s.statVal}>{Object.keys(stratCounts).length}</Text><Text style={s.statLbl}>{t('strategy_btn') || t('strategy_btn') || 'Strategies'}</Text></View>
        </View>

        {/* Real fix Sep 23 (device report): Recent Check-ins moved to be the FIRST section
            on this page (was 4th) - matching the same reorder on teacher/student-detail.tsx
            and family-member-stats/[id].tsx, per Jono's explicit ask that individual-person
            pages share one consistent section order. This page's own extra sections (home/
            school tabs, sharing toggles) are the one legitimate exception for a linked
            child and stay as they are; only the shared sections' relative order changed. */}
        {/* RECENT CHECK-INS */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecRecentCheckins(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="history" size={17} color="#5C6BC0" /><Text style={s.sectionTitle}>{t('recent_checkins') || 'Recent Check-ins'}</Text></View>
            <MaterialIcons name={secRecentCheckins ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secRecentCheckins && (<>
            {!isFamilyChild && (
              <View style={[s.tabRow,{marginTop:8}]}>
                {(['combined','home','school'] as const).map(tab => (
                  <TouchableOpacity key={tab} style={[s.tab,activeTab===tab&&s.tabActive]} onPress={() => setActiveTab(tab)}>
                    <MaterialIcons name={tab==='combined'?'merge-type':tab==='home'?'home':'school'} size={14} color={activeTab===tab?'#fff':'#666'} />
                    <Text style={[s.tabText,activeTab===tab&&s.tabTextActive]}>{tab==='combined'?(t('all')||'All'):tab==='home'?(t('home')||'Home'):(t('school')||'School')}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginVertical:8}}
              contentContainerStyle={{flexDirection:'row',gap:6,paddingHorizontal:2}}>
              {[{id:null,label:t('all')||'All',color:'#5C6BC0'},{id:'blue',label:`\u{1F622} ${getZoneShortLabel('blue',t)}`,color:EMOTION_COLOURS.blue},
                {id:'green',label:`\u{1F60A} ${getZoneShortLabel('green',t)}`,color:EMOTION_COLOURS.green},{id:'yellow',label:`\u{1F630} ${getZoneShortLabel('yellow',t)}`,color:EMOTION_COLOURS.yellow},
                {id:'red',label:`\u{1F620} ${getZoneShortLabel('red',t)}`,color:EMOTION_COLOURS.red}].map(z => (
                <TouchableOpacity key={z.id||'all'} style={[s.pill,activeZone===z.id&&{backgroundColor:z.color,borderColor:z.color}]}
                  onPress={() => setActiveZone(z.id)}>
                  <Text style={[s.pillText,activeZone===z.id&&{color:'white'}]}>{z.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {(() => {
              const list = isFamilyChild
                ? (activeZone ? allCheckIns.filter((c:any)=>(c.zone||c.feeling_colour)===activeZone) : allCheckIns)
                : getRecentCheckins();
              return list.length === 0 ? <Text style={s.empty}>{t('no_checkins_this_view') || 'No check-ins for this view'}</Text>
                : list.slice(0,15).map((ci:any,i:number) => {
                    const zone = ci.zone||ci.feeling_colour||'green';
                    const isHome = ci.location==='home'||ci.logged_by==='parent'||ci.logged_by==='family';
                    const zEmoji: Record<string,string> = {blue:'\u{1F622}',green:'\u{1F60A}',yellow:'\u{1F630}',red:'\u{1F620}'};
                    return (
                      <View key={ci.id||i} style={s.ciRow}>
                        <View style={[s.ciCircle,{backgroundColor:ZONE_COLORS[zone]||'#999'}]}>
                          <Text>{zEmoji[zone]||'\u{1F60A}'}</Text>
                        </View>
                        <View style={{flex:1,marginLeft:10}}>
                          <Text style={s.ciZone}>{getZoneLabel(zone, t)}</Text>
                          <Text style={s.ciTime}>{formatDate(ci.timestamp||ci.created_at)}</Text>
                          {(ci.strategies_selected?.length>0 || ci.helpers_selected?.length>0) && <Text style={s.ciStrats}>{(ci.strategies_selected || ci.helpers_selected || []).map((sid: string) => strategyLabel(sid, t, STRATEGY_NAMES)).join(', ')}</Text>}
                          {ci.comment && <Text style={s.ciComment}>"{ci.comment}"</Text>}
                        </View>
                        {/* Round 3 (Sep 5): this badge already existed but was gated behind
                            !isFamilyChild, hiding it exactly for a genuinely school-linked
                            child (e.g. Matilda) viewed via the family-member path - the case
                            where home vs school actually varies per check-in and the icon is
                            most useful. Now always shows. */}
                        <View style={[s.sourceBadge,{backgroundColor:isHome?'#E8F5E9':'#E3F2FD'}]}>
                          <MaterialIcons name={isHome?'home':'school'} size={13} color={isHome?'#4CAF50':'#2196F3'} />
                        </View>
                      </View>
                    );
                  });
            })()}
          </>)}
        </View>

        {/* EMOTION DISTRIBUTION */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecEmoDistrib(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="donut-large" size={17} color="#5C6BC0" /><Text style={s.sectionTitle}>{t('emotion_distribution') || t('emotion_distribution') || 'Emotion Distribution'}</Text></View>
            <MaterialIcons name={secEmoDistrib ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secEmoDistrib && (<>
            {!isFamilyChild && (
              <View style={[s.tabRow,{marginTop:10}]}>
                {(['combined','home','school'] as const).map(tab => (
                  <TouchableOpacity key={tab} style={[s.tab, activeDistTab===tab && s.tabActive]} onPress={() => setActiveDistTab(tab)}>
                    <Text style={[s.tabText, activeDistTab===tab && s.tabTextActive]}>
                      {tab==='combined'?(t('all')||'All'):tab==='home'?`\u{1F3E0} ${t('home')||'Home'}`:`\u{1F3EB} ${t('school')||'School'}`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {(() => {
              const checkins = isFamilyChild ? allCheckIns : getDistCheckins();
              const counts   = buildZoneCounts(checkins);
              const total    = Object.values(counts).reduce((a,b) => a+b, 0);
              return (
                <View style={{gap:10,marginTop:12}}>
                  {(['green','blue','yellow','red'] as const).map(zone => {
                    const pct = total > 0 ? Math.round((counts[zone]/total)*100) : 0;
                    return (
                      <View key={zone} style={{flexDirection:'row',alignItems:'center',gap:8}}>
                        <View style={[s.dot,{backgroundColor:ZONE_COLORS[zone]}]} />
                        <Text style={s.zoneLabel}>{getZoneShortLabel(zone, t)}</Text>
                        <View style={s.barBg}><View style={[s.barFill,{width:`${pct}%` as any,backgroundColor:ZONE_COLORS[zone]}]} /></View>
                        <Text style={s.pctText}>{pct}%</Text>
                        <Text style={s.countText}>({counts[zone]})</Text>
                      </View>
                    );
                  })}
                  {total===0 && <Text style={s.empty}>{t('no_checkins_this_view') || 'No check-ins for this view'}</Text>}
                </View>
              );
            })()}
          </>)}
        </View>

        {/* EMOTION COMPARISON */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecEmoCompare(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="bar-chart" size={17} color="#5C6BC0" /><Text style={s.sectionTitle}>{t('zone_comparison') || 'Emotion Comparison'}</Text></View>
            <MaterialIcons name={secEmoCompare ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secEmoCompare && (totalCheckins > 0 ? (
            <View style={{alignItems:'center',marginTop:12}}>
              <BarChart data={barData} barWidth={42} spacing={18} roundedTop roundedBottom
                xAxisThickness={0} yAxisThickness={0} yAxisTextStyle={{color:'#666',fontSize:11}}
                noOfSections={4} maxValue={Math.max(1,...Object.values(zoneCounts).map(Number))+1}
                isAnimated barBorderRadius={6} width={width-100} />
            </View>
          ) : <Text style={[s.empty,{marginTop:10}]}>{t('no_data_period') || 'No data for this period'}</Text>)}
        </View>

        {/* MOST USED STRATEGIES */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecMostUsed(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="star" size={17} color="#FFC107" /><Text style={s.sectionTitle}>{t('most_used_strategies') || 'Most Used Strategies'}</Text></View>
            <MaterialIcons name={secMostUsed ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secMostUsed && (Object.keys(stratCounts).length > 0
            ? Object.entries(stratCounts).sort(([,a],[,b]) => (b as number)-(a as number)).map(([stratId,count]) => {
                const zc = stratId.startsWith('blue')?EMOTION_COLOURS.blue:stratId.startsWith('green')?EMOTION_COLOURS.green:
                           stratId.startsWith('yellow')?EMOTION_COLOURS.yellow:stratId.startsWith('red')?EMOTION_COLOURS.red:
                           stratId.startsWith('b')?EMOTION_COLOURS.blue:stratId.startsWith('g')?EMOTION_COLOURS.green:
                           stratId.startsWith('y')?EMOTION_COLOURS.yellow:stratId.startsWith('r')?EMOTION_COLOURS.red:'#999';
                return (
                  <View key={stratId} style={s.stratRow}>
                    <View style={[s.stratDot,{backgroundColor:zc}]} />
                    <Text style={s.stratName}>{strategyLabel(stratId, t, STRATEGY_NAMES)}</Text>
                    <View style={s.stratCount}><Text style={s.stratCountText}>{count as number}x</Text></View>
                  </View>
                );
              })
            : <Text style={[s.empty,{marginTop:8}]}>{t('no_data_period') || 'No strategies yet'}</Text>
          )}
        </View>

        {/* CHECK-IN CALENDAR */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecCalendar(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="calendar-today" size={17} color="#5C6BC0" /><Text style={s.sectionTitle}>{t('checkin_calendar') || 'Check-in Calendar'}</Text></View>
            <MaterialIcons name={secCalendar ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secCalendar && (() => {
            const grouped: Record<string,any[]> = {};
            allCheckIns.forEach((ci:any) => {
              const d = (ci.timestamp||ci.created_at||'').split('T')[0];
              if (d) { if (!grouped[d]) grouped[d]=[]; grouped[d].push(ci); }
            });
            const dates = Object.keys(grouped).sort().slice(-14);
            if (!dates.length) return <Text style={[s.empty,{marginTop:8}]}>{t('no_checkin_data_yet') || 'No check-in data yet'}</Text>;
            return (<>
              <View style={s.calGrid}>
                {dates.map(date => {
                  const dayLogs = grouped[date];
                  const d       = new Date(date);
                  const dayName = (CALENDAR_DAY_LETTERS[language] || CALENDAR_DAY_LETTERS.en)[d.getDay()];
                  const dayNum  = d.getDate();
                  const homeN   = isFamilyChild ? dayLogs.length
                    : dayLogs.filter((l:any)=>l.location==='home'||l.logged_by==='parent'||l.logged_by==='family').length;
                  const schoolN = isFamilyChild ? 0 : dayLogs.length - homeN;
                  const zcnts: Record<string,number> = {};
                  dayLogs.forEach((l:any) => { const z=l.zone||l.feeling_colour; if(z) zcnts[z]=(zcnts[z]||0)+1; });
                  const dom = Object.entries(zcnts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'green';
                  return (
                    <View key={date} style={s.calDay}>
                      <Text style={s.calDayName}>{dayName}</Text>
                      <View style={[s.calCircle,{backgroundColor:ZONE_COLORS[dom]||EMOTION_COLOURS.green}]}>
                        <Text style={s.calDayNum}>{dayNum}</Text>
                      </View>
                      <View style={{flexDirection:'row',gap:2,marginTop:2}}>
                        {schoolN>0 && <View style={[s.calBadge,{backgroundColor:'#5C6BC0'}]}><Text style={s.calBadgeText}>S</Text></View>}
                        {homeN>0   && <View style={[s.calBadge,{backgroundColor:'#4CAF50'}]}><Text style={s.calBadgeText}>H</Text></View>}
                      </View>
                    </View>
                  );
                })}
              </View>
              <View style={{flexDirection:'row',gap:16,marginTop:8,justifyContent:'center'}}>
                {!isFamilyChild && <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                  <View style={[s.dot,{backgroundColor:'#5C6BC0'}]}/><Text style={s.legend}>{t('legend_school_short') || 'S = School'}</Text>
                </View>}
                <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                  <View style={[s.dot,{backgroundColor:'#4CAF50'}]}/><Text style={s.legend}>{t('legend_home_short') || 'H = Home'}</Text>
                </View>
              </View>
            </>);
          })()}
        </View>

        {/* STRATEGIES */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecStrategies(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}><MaterialIcons name="lightbulb" size={17} color="#FFC107" /><Text style={s.sectionTitle}>{t('strategy_btn') || t('strategy_btn') || 'Strategies'}</Text></View>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
              <TouchableOpacity style={s.addBtn} onPress={() => setShowAddStrat(true)}>
                <MaterialIcons name="add" size={15} color="#fff" /><Text style={s.addBtnText}>Add</Text>
              </TouchableOpacity>
              <MaterialIcons name={secStrategies?'expand-less':'expand-more'} size={20} color="#666" />
            </View>
          </TouchableOpacity>
          {secStrategies && (<>
            {!isFamilyChild && (<>
              <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:6,marginTop:4}}>
                <MaterialIcons name="school" size={15} color="#3F51B5" />
                <Text style={[s.stratSubtitle,{marginBottom:0,marginTop:0}]}>{t('strategies_from_school') || 'From school'}</Text>
              </View>
              {schoolSharingPaused
                ? <Text style={s.empty}>{t('school_strategies_paused') || 'School sharing is paused, so school strategies are hidden.'}</Text>
                : schoolStrats.length===0
                  ? <Text style={s.empty}>{t('no_school_strategies_shared') || 'No school strategies shared yet'}</Text>
                  : schoolStrats.map((st:any,i:number) => {
                      const col = ZONE_COLORS[st.feeling_colour || st.zone] || '#5C6BC0';
                      return (
                        <View key={st.id||i} style={s.stratCard}>
                          <View style={{width:34,height:34,borderRadius:17,backgroundColor:col,alignItems:'center',justifyContent:'center'}}>
                            <StrategyIcon icon={st.icon || 'star'} size={20} color="white" />
                          </View>
                          <View style={{flex:1,marginLeft:10}}>
                            <Text style={s.stratName}>{st.name||strategyLabel(st.id||'', t, STRATEGY_NAMES)}</Text>
                            {st.description?<Text style={s.stratDesc}>{st.description}</Text>:null}
                            <SourceChip source="school" />
                          </View>
                        </View>
                      );
                    })}
            </>)}
            <View style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:6,marginTop:10}}>
              <MaterialIcons name="home" size={15} color="#2E7D32" />
              <Text style={[s.stratSubtitle,{marginBottom:0,marginTop:0}]}>{isFamilyChild?(t('strategy_btn') || 'Strategies'):(t('strategies_from_home') || 'From home')}</Text>
            </View>
            {familyStrats.length===0
              ? <Text style={s.empty}>{t('add_strategies_for_home') || 'Add your own strategies for home'}</Text>
              : familyStrats.map((st:any) => (
                <View key={st.id} style={s.stratCard}>
                  <View style={{width:34,height:34,borderRadius:17,backgroundColor:ZONE_COLORS[st.zone||st.feeling_colour]||'#4CAF50',alignItems:'center',justifyContent:'center'}}>
                    <StrategyIcon icon={st.icon || 'star'} size={20} color="white" />
                  </View>
                  <View style={{flex:1,marginLeft:10}}>
                    <Text style={s.stratName}>{st.strategy_name}</Text>
                    {st.strategy_description?<Text style={s.stratDesc}>{st.strategy_description}</Text>:null}
                    <SourceChip source="home" />
                  </View>
                  {!isFamilyChild && (
                    <TouchableOpacity style={[s.visBtn,st.share_with_teacher&&s.visBtnActive]} onPress={()=>handleToggleShare(st.id)}>
                      <MaterialIcons name={st.share_with_teacher?'visibility':'visibility-off'} size={15} color={st.share_with_teacher?'#fff':'#666'} />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            }
          </>)}
        </View>

        {/* DOWNLOAD PDF */}
        <View style={s.section}>
          <TouchableOpacity onPress={() => setSecPdfReport(e => !e)} style={s.sectionHeader}>
            <View style={s.sectionHeaderLeft}>
              <MaterialIcons name="picture-as-pdf" size={17} color="#E53935" />
              <Text style={s.sectionTitle}>{t('download_monthly_reports') || 'Download Monthly Reports'}</Text>
            </View>
            <MaterialIcons name={secPdfReport ? 'expand-less' : 'expand-more'} size={20} color="#666" />
          </TouchableOpacity>
          {secPdfReport && (() => {
            const months: string[] = [];
            const now = new Date();
            for (let i = 0; i < 6; i++) {
              const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
              months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            }
            return (
              <View style={{ gap: 8, marginTop: 12 }}>
                <Text style={[s.empty, { paddingVertical: 4, textAlign: 'left', color: '#666' }]}>
                  {t('select_month_pdf') || 'Select a month to download a PDF report'}
                </Text>
                {months.map(m => {
                  const [y, mo] = m.split('-');
                  const label = formatMonthYearLabel(parseInt(y), parseInt(mo), language);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF3F3', borderRadius: 10, padding: 12, gap: 10, borderWidth: 1, borderColor: '#FFCDD2' }}
                      onPress={() => downloadReport(m)}
                      disabled={downloadingMonth === m}
                    >
                      <MaterialIcons name="picture-as-pdf" size={20} color="#E53935" />
                      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#333' }}>{label}</Text>
                      {downloadingMonth === m
                        ? <ActivityIndicator size="small" color="#E53935" />
                        : <MaterialIcons name="download" size={18} color="#E53935" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}
        </View>

        <View style={{height:40}} />
      </ScrollView>

      {/* CHECK-IN MODAL */}
      <Modal visible={showCheckIn} animationType="slide" transparent onRequestClose={()=>setShowCheckIn(false)}>
        {/* Real fix Sep 22 (device report, 3rd report): this Modal renders in its own
            native layer, so an OUTER KeyboardAvoidingView (there wasn't one anyway) couldn't
            reach it regardless - it has to wrap content INSIDE the Modal itself. behavior=
            'padding' on iOS pushes this flex-end-aligned overlay's sheet up automatically
            (real native behaviour, works fine there); Android gets the same explicit
            paddingBottom approach as the other two screens, since this app's
            edgeToEdgeEnabled:true breaks the native resize signal 'height'/undefined would
            otherwise lean on - see useAndroidKeyboardOffset's own comment. */}
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.sheet, Platform.OS === 'android' && { marginBottom: androidKeyboardOffset }]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Check-in - {child.name}</Text>
            <TouchableOpacity onPress={()=>setShowCheckIn(false)}><MaterialIcons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView style={s.sheetScroll}>
            <Text style={s.inputLabel}>How is {child.name} feeling?</Text>
            <View style={s.zoneGrid}>
              {Object.entries(ZONE_CONFIG).map(([zone,cfg]:[string,any]) => (
                <TouchableOpacity key={zone} style={[s.zoneOpt,{borderColor:cfg.color},selectedZone===zone&&{backgroundColor:cfg.color}]}
                  onPress={()=>setSelectedZone(zone)}>
                  <Text style={{fontSize:24}}>{cfg.emoji}</Text>
                  <Text style={[s.zoneOptLabel,selectedZone===zone&&{color:'#fff'}]}>{getZoneLabel(zone, t)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.inputLabel}>{t('comment_optional_label') || 'Comment (optional)'}</Text>
            <TextInput style={s.textarea} value={comment} onChangeText={setComment} placeholder={t('add_comment_placeholder') || 'Add a comment...'} multiline maxLength={100} />
          </ScrollView>
          <View style={s.sheetActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowCheckIn(false)}><Text style={s.cancelBtnText}>{t('go_back') || t('go_back') || 'Cancel'}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn,!selectedZone&&{opacity:0.5}]} onPress={handleCheckIn} disabled={!selectedZone||submitting}>
              {submitting?<ActivityIndicator size="small" color="#fff"/>:<Text style={s.submitBtnText}>{t('save_checkin') || 'Save Check-in'}</Text>}
            </TouchableOpacity>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ADD STRATEGY MODAL */}
      <Modal visible={showAddStrat} animationType="slide" transparent onRequestClose={()=>setShowAddStrat(false)}>
        {/* Real fix Sep 22 (device report): same gap as the check-in modal above, same fix -
            see that Modal's own comment. */}
        <KeyboardAvoidingView
          style={s.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[s.sheet, Platform.OS === 'android' && { marginBottom: androidKeyboardOffset }]}>
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{t('add_strategy') || 'Add Strategy'}</Text>
            <TouchableOpacity onPress={()=>setShowAddStrat(false)}><MaterialIcons name="close" size={24} color="#666" /></TouchableOpacity>
          </View>
          <ScrollView style={s.sheetScroll}>
            <Text style={s.inputLabel}>{(t('strategy_name') || 'Strategy Name') + ' *'}</Text>
            <TextInput style={s.input} value={newStrat.name} onChangeText={v=>setNewStrat({...newStrat,name:v})} placeholder={t('strategy_name_ph') || 'e.g. Deep breathing'} />
            <Text style={s.inputLabel}>{t('description_label') || t('description_label') || 'Description'}</Text>
            <TextInput style={[s.input,s.textarea]} value={newStrat.description} onChangeText={v=>setNewStrat({...newStrat,description:v})} placeholder={t('strategy_description_ph') || 'How to use this...'} multiline />
            <Text style={s.inputLabel}>{t('zone_label') || 'Emotion'}</Text>
            <View style={s.zoneGrid}>
              {Object.entries(ZONE_CONFIG).map(([zone,cfg]:[string,any]) => (
                <TouchableOpacity key={zone} style={[s.zoneOpt,{borderColor:cfg.color},newStrat.zone===zone&&{backgroundColor:cfg.color}]}
                  onPress={()=>setNewStrat({...newStrat,zone})}>
                  <Text style={{fontSize:22}}>{cfg.emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={s.inputLabel}>{t('strategy_icon_label') || 'Icon'}</Text>
            <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>
              {STRATEGY_ICONS.map(ic=>(
                <TouchableOpacity key={ic.id} style={[s.iconOpt,newStrat.icon===ic.id&&{backgroundColor:'#4CAF50'}]}
                  onPress={()=>setNewStrat({...newStrat,icon:ic.id})}>
                  <MaterialIcons name={ic.name as any} size={22} color={newStrat.icon===ic.id?'#fff':'#666'} />
                </TouchableOpacity>
              ))}
            </View>
            {!isFamilyChild && (
              <View style={{flexDirection:'row',alignItems:'center',backgroundColor:'#F8F9FA',borderRadius:12,padding:14,marginTop:12}}>
                <View style={{flex:1}}>
                  <Text style={s.stratName}>{t('share_with_teacher') || t('share_with_teacher') || 'Share with Teacher'}</Text>
                  <Text style={s.stratDesc}>{t('teacher_can_see_strategy') || 'Teacher can see this'}</Text>
                </View>
                <Switch value={newStrat.shareWithTeacher} onValueChange={v=>setNewStrat({...newStrat,shareWithTeacher:v})}
                  trackColor={{false:'#ddd',true:'#81C784'}} thumbColor={newStrat.shareWithTeacher?'#4CAF50':'#999'} />
              </View>
            )}
          </ScrollView>
          <View style={s.sheetActions}>
            <TouchableOpacity style={s.cancelBtn} onPress={()=>setShowAddStrat(false)}><Text style={s.cancelBtnText}>{t('go_back') || t('go_back') || 'Cancel'}</Text></TouchableOpacity>
            <TouchableOpacity style={[s.submitBtn,!newStrat.name.trim()&&{opacity:0.5}]} onPress={handleAddStrat} disabled={!newStrat.name.trim()}>
              <Text style={s.submitBtnText}>{t('add_strategy') || 'Add Strategy'}</Text>
            </TouchableOpacity>
          </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}


const s = StyleSheet.create({
  container:           { flex:1, backgroundColor:'#F5F5F5' },
  scroll:              { flex:1 },
  center:              { flex:1, justifyContent:'center', alignItems:'center' },
  loadingText:         { marginTop:12, fontSize:15, color:'#666' },
  errorText:           { marginTop:12, fontSize:15, color:'#666', textAlign:'center' },
  backBtn:             { marginTop:16, padding:12, backgroundColor:'#4CAF50', borderRadius:8 },
  backBtnText:         { color:'#fff', fontWeight:'600' },
  childCard:          { flexDirection:'row', alignItems:'center', backgroundColor:'#fff', margin:16, marginBottom:8, padding:14, borderRadius:14 },
  childAvatar:         { width:52, height:52, borderRadius:26, backgroundColor:'#E8F5E9', justifyContent:'center', alignItems:'center' },
  childName:           { fontSize:16, fontWeight:'700', color:'#333' },
  childSub:            { fontSize:12, color:'#666', marginTop:3 },
  checkInBtn:          { flexDirection:'row', alignItems:'center', backgroundColor:'#4CAF50', paddingHorizontal:12, paddingVertical:8, borderRadius:18, gap:5 },
  checkInBtnText:      { color:'#fff', fontWeight:'600', fontSize:13 },
  card:                { backgroundColor:'#fff', marginHorizontal:16, marginBottom:8, padding:14, borderRadius:12 },
  cardTitle:           { fontSize:13, fontWeight:'700' },
  cardSub:             { fontSize:11, color:'#666', marginTop:3 },
  periodRow:           { flexDirection:'row', gap:6, paddingHorizontal:16, paddingBottom:8 },
  periodBtn:           { flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor:'#F0F0F0' },
  periodBtnActive:     { backgroundColor:'#5C6BC0' },
  periodBtnText:       { fontSize:12, color:'#666' },
  periodBtnTextActive: { color:'#fff', fontWeight:'600' },
  statsRow:            { flexDirection:'row', gap:8, paddingHorizontal:16, paddingBottom:8 },
  statCard:            { flex:1, backgroundColor:'#fff', borderRadius:10, padding:10, alignItems:'center' },
  statVal:             { fontSize:18, fontWeight:'700', color:'#333' },
  statLbl:             { fontSize:9, color:'#888', marginTop:2, textAlign:'center' },
  section:             { backgroundColor:'#fff', borderRadius:12, marginHorizontal:16, marginBottom:8, padding:12 },
  sectionHeader:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  sectionHeaderLeft:   { flexDirection:'row', alignItems:'center', gap:8 },
  sectionTitle:        { fontSize:13, fontWeight:'700', color:'#333' },
  tabRow:              { flexDirection:'row', backgroundColor:'#F5F5F5', borderRadius:10, padding:3, gap:2 },
  tab:                 { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', paddingVertical:8, borderRadius:8, gap:4 },
  tabActive:           { backgroundColor:'#fff' },
  tabText:             { fontSize:12, color:'#555' },
  tabTextActive:       { color:'#333', fontWeight:'600' },
  dot:                 { width:10, height:10, borderRadius:5 },
  zoneLabel:           { fontSize:12, color:'#333', width:48 },
  barBg:               { flex:1, height:10, backgroundColor:'#F0F0F0', borderRadius:5, overflow:'hidden' },
  barFill:             { height:10, borderRadius:5 },
  pctText:             { fontSize:12, fontWeight:'600', color:'#333', width:34, textAlign:'right' },
  countText:           { fontSize:10, color:'#888', width:28 },
  stratRow:            { flexDirection:'row', alignItems:'center', paddingVertical:10, borderBottomWidth:1, borderBottomColor:'#F0F0F0' },
  stratDot:            { width:10, height:10, borderRadius:5, marginRight:8 },
  stratName:           { flex:1, fontSize:13, color:'#333' },
  stratCount:          { backgroundColor:'#FFF8E1', paddingHorizontal:8, paddingVertical:3, borderRadius:10 },
  stratCountText:      { fontSize:12, fontWeight:'600', color:'#F9A825' },
  stratSubtitle:       { fontSize:11, fontWeight:'600', color:'#888', marginBottom:6, marginTop:4 },
  stratCard:           { flexDirection:'row', alignItems:'center', backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginBottom:6 },
  stratDesc:           { fontSize:11, color:'#888', marginTop:2 },
  zonePill:            { paddingHorizontal:7, paddingVertical:3, borderRadius:8 },
  visBtn:              { width:32, height:32, borderRadius:16, backgroundColor:'#eee', justifyContent:'center', alignItems:'center' },
  visBtnActive:        { backgroundColor:'#4CAF50' },
  addBtn:              { flexDirection:'row', alignItems:'center', backgroundColor:'#4CAF50', paddingHorizontal:9, paddingVertical:5, borderRadius:12, gap:3 },
  addBtnText:          { color:'#fff', fontSize:11, fontWeight:'600' },
  pill:                { paddingHorizontal:12, paddingVertical:6, borderRadius:18, backgroundColor:'#F0F0F0', borderWidth:1, borderColor:'#E0E0E0' },
  pillText:            { fontSize:12, fontWeight:'600', color:'#666' },
  ciRow:               { flexDirection:'row', alignItems:'center', backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginBottom:6 },
  ciCircle:            { width:40, height:40, borderRadius:20, justifyContent:'center', alignItems:'center' },
  ciZone:              { fontSize:13, fontWeight:'600', color:'#333' },
  ciTime:              { fontSize:11, color:'#999', marginTop:2 },
  ciStrats:            { fontSize:11, color:'#666', marginTop:3 },
  ciComment:           { fontSize:11, color:'#5C6BC0', fontStyle:'italic', marginTop:3 },
  sourceBadge:         { width:26, height:26, borderRadius:13, justifyContent:'center', alignItems:'center' },
  calGrid:             { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  calDay:              { alignItems:'center', width:38 },
  calDayName:          { fontSize:9, color:'#888', marginBottom:3 },
  calCircle:           { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  calDayNum:           { fontSize:11, fontWeight:'700', color:'white' },
  calBadge:            { width:12, height:12, borderRadius:6, alignItems:'center', justifyContent:'center' },
  calBadgeText:        { fontSize:7, color:'white', fontWeight:'700' },
  legend:              { fontSize:11, color:'#666' },
  overlay:             { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end', alignItems:'center' },
  sheet:               { backgroundColor:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'85%', width:'100%', maxWidth:480 },
  sheetHeader:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderBottomColor:'#eee' },
  sheetTitle:          { fontSize:17, fontWeight:'700', color:'#333' },
  sheetScroll:         { padding:16, maxHeight:420 },
  sheetActions:        { flexDirection:'row', padding:16, gap:12, borderTopWidth:1, borderTopColor:'#eee' },
  inputLabel:          { fontSize:13, fontWeight:'600', color:'#333', marginBottom:8, marginTop:12 },
  input:               { backgroundColor:'#F5F5F5', borderRadius:8, padding:12, fontSize:15, color:'#333' },
  textarea:            { height:80, textAlignVertical:'top', color:'#333' },
  zoneGrid:            { flexDirection:'row', gap:8, flexWrap:'wrap' },
  zoneOpt:             { flex:1, minWidth:70, alignItems:'center', padding:10, borderRadius:12, borderWidth:2 },
  zoneOptLabel:        { fontSize:10, marginTop:4, color:'#333' },
  iconOpt:             { width:44, height:44, borderRadius:22, backgroundColor:'#F5F5F5', justifyContent:'center', alignItems:'center' },
  cancelBtn:           { flex:1, paddingVertical:14, borderRadius:8, backgroundColor:'#F5F5F5', alignItems:'center' },
  cancelBtnText:       { fontSize:15, color:'#666', fontWeight:'600' },
  submitBtn:           { flex:1, paddingVertical:14, borderRadius:8, backgroundColor:'#4CAF50', alignItems:'center' },
  submitBtnText:       { fontSize:15, color:'#fff', fontWeight:'600' },
  empty:               { textAlign:'center', color:'#999', paddingVertical:16, fontSize:13 },
});
