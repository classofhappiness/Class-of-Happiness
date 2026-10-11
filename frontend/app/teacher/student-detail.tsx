import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet,
  ScrollView, 
  TouchableOpacity,
  Image,
  useWindowDimensions,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  Share,
  Platform,
  Animated,
  TextInput,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import * as FileSystem from 'expo-file-system';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { analyticsApi, zoneLogsApi, ZoneLog, strategiesApi, Strategy, reportsApi, teacherApi, teacherHomeDataApi, describeSupportRequest } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { formatMonthYear as formatMonthYearLabel } from '../../src/utils/monthLabel';
import { formatShortDate, formatShortDateTime, formatTime as formatTimeLabel } from '../../src/utils/dateLabel';
import { StrategyIcon } from '../../src/components/StrategyIcon';
import { SourceChip, strategySource } from '../../src/components/SourceChip';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { resolveStrategyName, strategyLabel, loadLocalCustomStrategyNames } from '../../src/utils/resolveStrategyName';
import { getDownloadUrl } from '../../src/utils/downloadLink';

// Complete strategy name lookup - matches student/strategies.tsx fallback IDs.
// Kept only as a safety-net fallback for resolveStrategyName() (see
// src/utils/resolveStrategyName.ts) so nothing that used to resolve correctly can start
// showing blank/undefined. Real names now come from t() via that shared resolver.
const STRATEGY_NAME_MAP: Record<string, string> = {
  // Blue zone
  b1: 'Gentle Stretch', b2: 'Favourite Song', b3: 'Tell Someone', b4: 'Slow Breathing',
  // Green zone  
  g1: 'Keep Going!', g2: 'Help a Friend', g3: 'Set a Goal', g4: 'Gratitude',
  // Yellow zone
  y1: 'Bubble Breathing', y2: 'Count to 10', y3: '5 Senses', y4: 'Talk About It',
  // Red zone
  r1: 'Freeze', r2: 'Big Breaths', r3: 'Safe Space', r4: 'Ask for Help',
  // Parent strategies
  p_b1: 'Side-by-Side Presence', p_b2: 'Warm Drink Ritual', p_b3: 'Name It to Tame It',
  p_b4: 'Movement Invitation', p_b5: 'Comfort & Closeness',
  p_g1: 'Gratitude Round', p_g2: 'Strength Spotting', p_g3: 'Creative Together',
  p_g4: 'Family Dance', p_g5: 'Calm Problem Solving',
  p_y1: 'Box Breathing Together', p_y2: 'Validate First', p_y3: 'Body Check-In',
  p_y4: 'Feelings Journal', p_y5: 'Give Space with Love',
  p_r1: 'Stay Calm Yourself', p_r2: 'Safe Space Together', p_r3: 'Cold Water Reset',
  p_r4: 'No Teaching Now', p_r5: 'Reconnect with Warmth',
};

// Real fix Sep 30 (live feedback, item 4): maps the app's 10 supported language codes to a
// real BCP-47 locale for Intl/date formatting (toLocaleDateString/toLocaleTimeString), so
// dates on this screen follow the teacher's selected app language instead of always English.
const LOCALE_FOR_LANG: Record<string, string> = {
  en: 'en-US', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR', de: 'de-DE',
  it: 'it-IT', hi: 'hi-IN', zh: 'zh-CN', ar: 'ar-u-nu-latn-ca-gregory', ru: 'ru-RU',
};
// Real fix Oct 5 (month-picker capitalisation): Intl's long-month formatting lowercases the
// month name by default for several Latin-script locales (fr/es/it/etc. all do this
// natively, correctly, per their own grammar rules) - capitalised here purely for this
// picker's visual consistency with English. zh/ar/hi have no letter case, so left untouched.
const NO_CASE_LANGS = new Set(['zh', 'ar', 'hi']);
const capitalizeMonth = (label: string, lang: string): string =>
  NO_CASE_LANGS.has(lang) ? label : label.charAt(0).toUpperCase() + label.slice(1);

// Real fix Sep 30 (live feedback, item 4): the calendar grid used to hardcode English
// single-letter day abbreviations ('Su','Mo',...) regardless of app language. These are the
// translated equivalents, kept to a single letter/short form per language to match the
// original grid's compact layout.
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

const ZONE_COLORS = EMOTION_COLOURS;

// Use translations for zone labels
const getZoneLabel = (zone: string, t: (key: string) => string) => {
  const labels: Record<string, string> = {
    blue: t('blue_zone') || t('blue_emotions') || 'Blue Emotions',
    green: t('green_zone') || t('green_emotions') || 'Green Emotions',
    yellow: t('yellow_zone') || t('yellow_emotions') || 'Yellow Emotions',
    red: t('red_zone') || t('red_emotions') || 'Red Emotions',
  };
  return labels[zone] || zone;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export default function StudentDetailScreen() {
  const { width } = useWindowDimensions();
  const router = useRouter();
  const [secEmoDistrib, setSecEmoDistrib] = React.useState(false);
  const [secEmoCompare, setSecEmoCompare] = React.useState(false);
  // Real fix Sep 23 (device report): the "Zone Distribution (combined)" section further
  // down this page ("Emotion Distribution - Linked Student", tabbed combined/school/home)
  // was reusing this SAME secEmoDistrib state as the earlier, unrelated "Emotion
  // Distribution" pie chart section - tapping either one toggled both simultaneously.
  // Separate state so each expands independently, matching every other section on this
  // page.
  const [secEmoDistribLinked, setSecEmoDistribLinked] = React.useState(false);
  const [secMonthlyReport, setSecMonthlyReport] = React.useState(false);
  const [secMostUsed, setSecMostUsed] = React.useState(false);
  const [secRecentCheckins, setSecRecentCheckins] = React.useState(false);
  const [secCalendar, setSecCalendar] = React.useState(false);
  const [secStrategies, setSecStrategies] = React.useState(false);
  const [creatureEmoji, setCreatureEmoji] = React.useState('🥚');
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { students, presetAvatars, classrooms, t, language, lastCheckinMutationAt, user } = useApp();
  
  const student = students.find(s => s.id === studentId);

  // Real fix Sep 23 (device report - "student not found" flash before the real page
  // loads): AppContext's refreshStudents() runs as background, non-blocking "Step 4" data
  // AFTER isLoading has already flipped false (deliberately, per its own comment - it's
  // non-critical data), wrapped in its own extra 100ms setTimeout on top. Navigating
  // straight here (teacher dashboard -> a student's card) can genuinely land before that
  // resolves, so `students` is still [] the instant this screen first renders - `student`
  // above comes back undefined not because the id is wrong, but because the list hasn't
  // arrived yet. Settles true either the moment `students` actually has something in it
  // (real signal, not a fixed guess) or after a short grace window as a safety net for the
  // rare genuinely-empty-roster case, so the hard "not found" error below only ever shows
  // once the data had a real chance to arrive - matching this app's existing settle-window
  // precedent (zone.tsx's audio-ready timeout) rather than trusting a length-0 snapshot.
  const [studentsSettled, setStudentsSettled] = useState(students.length > 0);
  useEffect(() => {
    if (students.length > 0) { setStudentsSettled(true); return; }
    const timer = setTimeout(() => setStudentsSettled(true), 2000);
    return () => clearTimeout(timer);
  }, [students.length]);

  const [selectedPeriod, setSelectedPeriod] = useState<1 | 7 | 14 | 30>(7);
  const [analytics, setAnalytics] = useState<any>(null);
  const [logs, setLogs] = useState<ZoneLog[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [availableMonths, setAvailableMonths] = useState<string[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [combinedLogs, setCombinedLogs] = useState<any[]>([]);
  const [allStrategies, setAllStrategies] = useState<{school: any[]; family: any[]}>({school: [], family: []});
  // Oct 11: the viewing teacher's own on-device strategies, so a check-in that used one shows its name (custom_<timestamp> ids)
  const [localCustomNames, setLocalCustomNames] = useState<Record<string, string>>({});
  useEffect(() => { loadLocalCustomStrategyNames((user as any)?.user_id).then(setLocalCustomNames); }, [(user as any)?.user_id]);
  const [showAddStrategyModal, setShowAddStrategyModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({name:'', description:'', zone:'green', icon:'star', shareWithParent: false});
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [activeDataTab, setActiveDataTab] = useState<'school'|'home'|'combined'>('combined');
  const [showLinkCodeModal, setShowLinkCodeModal] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  // Home data states
  const [homeData, setHomeData] = useState<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    total_home_checkins: number;
  } | null>(null);
  const [sharingStatus, setSharingStatus] = useState<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    parent_name: string | null;
    link_count: number;
    school_sharing_enabled: boolean;
  } | null>(null);
  // Oct 10: why the data sections may be empty. 'forbidden' = the zone-logs call said this teacher is
  // not authorised for the student; 'network' = it failed for any other reason. null = it loaded.
  const [loadError, setLoadError] = useState<'forbidden' | 'network' | null>(null);
  const [showHomeDataTab, setShowHomeDataTab] = useState(false);
  const [secHomeCheckins, setSecHomeCheckins] = useState(false);
  const [secHomeSharing, setSecHomeSharing] = useState(false);
  const [togglingSchoolSharing, setTogglingSchoolSharing] = useState(false);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);

  // Tooltip fade animation states
  const [activeTooltip, setActiveTooltip] = useState<'strategies' | 'family' | null>('strategies');
  const tooltipOpacity = useRef(new Animated.Value(1)).current;

  // Show tooltips one at a time, then hide all.
  useEffect(() => {
    const firstTimer = setTimeout(() => {
      Animated.timing(tooltipOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setActiveTooltip('family');
        tooltipOpacity.setValue(1);
      });
    }, 2600);
    const secondTimer = setTimeout(() => {
      Animated.timing(tooltipOpacity, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setActiveTooltip(null);
      });
    }, 5200);
    return () => {
      clearTimeout(firstTimer);
      clearTimeout(secondTimer);
    };
  }, [tooltipOpacity]);

  // Page-load restructure (Oct 10, report-oct10 section 4). Data is split by what it depends on:
  //  - period-dependent (analytics, zone-logs, combined-checkins, home-data): fetchPeriodData
  //  - per-student only (sharing-status, available-months, custom-strategies, all-strategies):
  //    fetchStaticData (also starts the language-dependent helpers fetch)
  //  - language-dependent (/api/helpers?lang=, server returns translated names): fetchHelpers
  // Period change -> fetchPeriodData only. Language change -> fetchHelpers only (the server
  // returns translated text, so it can't be re-mapped client-side). Student change / pull-to-
  // refresh / check-in mutation -> everything (fetchData). Counter refs drop stale responses.
  const periodRef = useRef<number>(selectedPeriod);
  periodRef.current = selectedPeriod;
  const languageRef = useRef<string>(language || 'en');
  languageRef.current = language || 'en';
  const periodReqRef = useRef(0);
  const staticReqRef = useRef(0);
  const helpersReqRef = useRef(0);
  const customHelpersRef = useRef<any[]>([]);
  const statusPromiseRef = useRef<Promise<any> | null>(null);

  const fetchHelpers = async (): Promise<any[]> => {
    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    // lang is real (see Sep 27 fix): /api/helpers is fully localized in all 10 languages.
    // Custom/school/family strategies are user-authored text and are left as-is.
    const results = await Promise.all(['blue', 'green', 'yellow', 'red'].map(zone =>
      fetch(`${BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=${languageRef.current}`)
        .then(r => r.json()).catch(() => [])
    ));
    return results.flat();
  };

  const buildStrategies = (helpers: any[]) => ([
    ...helpers.map((h: any) => ({ ...h, id: h.id || h.helper_id, source: 'school' })),
    ...customHelpersRef.current.map((h: any) => ({ ...h, source: 'custom', name: h.name || h.helper_name })),
  ]);

  const helpersRawRef = useRef<any[]>([]);

  const refetchHelpersOnly = async () => {
    if (!studentId) return;
    const req = ++helpersReqRef.current;
    try {
      const helpers = await fetchHelpers();
      if (req !== helpersReqRef.current) return;
      helpersRawRef.current = helpers;
      setStrategies(buildStrategies(helpers) as any);
    } catch (e) {
      console.log('Helpers fetch error:', e);
    }
  };

  const fetchStaticData = async () => {
    if (!studentId) return;
    const req = ++staticReqRef.current;
    const helpersReq = ++helpersReqRef.current;
    const isStale = () => req !== staticReqRef.current;

    const statusPromise = teacherHomeDataApi.getSharingStatus(studentId).catch(() => null);
    statusPromiseRef.current = statusPromise;

    const customPromise = (async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const token = await AsyncStorage.getItem('session_token');
        const res = await fetch(`${BACKEND_URL}/api/custom-strategies?student_id=${studentId}`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        return res.ok ? await res.json() : [];
      } catch { return []; }
    })();
    const helpersPromise = fetchHelpers().catch(() => [] as any[]);
    const allStratsPromise = teacherHomeDataApi.getAllStrategies(studentId)
      .then(value => ({ ok: true as const, value }), reason => ({ ok: false as const, reason }));
    const monthsPromise = reportsApi.getAvailableMonths(studentId).catch(() => []);

    const tasks: Promise<any>[] = [
      statusPromise.then(s => { if (!isStale() && s) setSharingStatus(s); }),
      monthsPromise.then(m => { if (!isStale()) setAvailableMonths(m); }),
      Promise.all([customPromise, helpersPromise]).then(([custom, helpers]) => {
        if (isStale()) return;
        customHelpersRef.current = custom;
        if (helpersReq === helpersReqRef.current) {
          helpersRawRef.current = helpers;
          setStrategies(buildStrategies(helpers) as any);
        }
      }),
      Promise.all([customPromise, allStratsPromise]).then(([custom, res]) => {
        if (isStale()) return;
        if (res.ok) {
          const schoolStrats = (res.value.school_strategies || []).map((s: any) => ({ ...s, source: s.source === 'home' ? 'home' : 'school' }));
          const familyStrats = (res.value.family_strategies || []).map((s: any) => ({
            ...s, name: s.name || s.strategy_name, description: s.description || s.strategy_description, source: 'home',
          }));
          setAllStrategies({ school: [...schoolStrats, ...custom], family: familyStrats });
        } else {
          console.log('All strategies:', res.reason);
          setAllStrategies({ school: custom, family: [] });
        }
      }),
    ];
    await Promise.allSettled(tasks);
  };

  const fetchPeriodData = async () => {
    if (!studentId) return;
    const req = ++periodReqRef.current;
    const days = periodRef.current;
    const isStale = () => req !== periodReqRef.current;
    // home-data is the only call gated on link status; it chains off sharing-status while the
    // other period calls run in parallel (nothing waits on the slowest).
    const statusPromise = statusPromiseRef.current || teacherHomeDataApi.getSharingStatus(studentId).catch(() => null);
    if (!statusPromiseRef.current) statusPromiseRef.current = statusPromise;

    const failures: any[] = [];
    const tasks: Promise<any>[] = [
      // Oct 11: analytics, zone-logs and combined-checkins all count toward loadError, so a partial
      // failure is never shown as "No check-ins yet". 403 is read from the HTTP status, not the text.
      analyticsApi.getStudent(studentId, days)
        .then(d => { if (!isStale()) setAnalytics(d); })
        .catch(e => { failures.push(e); throw e; }),
      zoneLogsApi.getByStudent(studentId, days)
        .then(d => { if (!isStale()) setLogs(d); })
        .catch(e => { failures.push(e); throw e; }), // still reported by the allSettled loop below
      teacherHomeDataApi.getCombinedCheckins(studentId, days)
        .then(d => { if (!isStale()) setCombinedLogs(d); })
        .catch(e => { failures.push(e); console.log('Combined checkins:', e); }),
      statusPromise.then(async s => {
        if (!s || !s.is_linked_to_parent) return;
        try {
          const d = await teacherHomeDataApi.getStudentHomeData(studentId, days);
          if (!isStale() && d) setHomeData(d);
        } catch (e) { console.log('Could not fetch home data:', e); }
      }),
    ];
    const results = await Promise.allSettled(tasks);
    results.forEach(r => { if (r.status === 'rejected') console.error('Error fetching data:', r.reason); });
    if (!isStale()) {
      setLoadError(failures.length === 0 ? null : failures.some(e => e?.status === 403) ? 'forbidden' : 'network');
    }
  };

  // Full load: per-student + period data together (student change, pull-to-refresh, mutation).
  const fetchData = async () => {
    if (!studentId) return;
    const statics = fetchStaticData(); // sets statusPromiseRef synchronously
    await Promise.all([statics, fetchPeriodData()]);
  };

  const didLoadStudentRef = useRef<string | undefined>(undefined);
  // Student change: everything.
  useEffect(() => {
    didLoadStudentRef.current = studentId;
    fetchData();
  }, [studentId]);

  // Period change: only period-dependent data (skipped on the initial/student-change run above).
  const lastPeriodRef = useRef(selectedPeriod);
  useEffect(() => {
    if (lastPeriodRef.current === selectedPeriod) return;
    lastPeriodRef.current = selectedPeriod;
    fetchPeriodData();
  }, [selectedPeriod]);

  // Language change: only the localized /api/helpers fetch.
  const lastLanguageRef = useRef(language);
  useEffect(() => {
    if (lastLanguageRef.current === language) return;
    lastLanguageRef.current = language;
    refetchHelpersOnly();
  }, [language]);

  // Real fix Sep 25 (item3, fourth device-log pass - same pattern as parent/dashboard.tsx's
  // fix, checked here per the explicit ask): fetchData only ever ran on studentId/
  // selectedPeriod changing - a check-in on this same student, written from a completely
  // separate screen, never invalidated this screen's already-fetched logs/analytics for
  // whichever period was selected at the time. On focus, if AppContext's
  // lastCheckinMutationAt is newer than the last mutation this screen has already reacted
  // to, force a real refetch; otherwise a no-op, not a blanket refetch-on-every-focus.
  // Starts at the CURRENT value: a check-in saved before this screen opened is already covered by the
  // mount load (effect on [studentId]), so the first focus must not load a second time. A check-in saved
  // while this screen exists still raises lastCheckinMutationAt above the ref and reloads on focus.
  const lastCheckinMutationAtRef = useRef(lastCheckinMutationAt);
  useFocusEffect(
    React.useCallback(() => {
      if (lastCheckinMutationAt > lastCheckinMutationAtRef.current) {
        lastCheckinMutationAtRef.current = lastCheckinMutationAt;
        fetchData();
      }
    }, [lastCheckinMutationAt])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const getClassroomName = (classroomId?: string | null) => {
    if (!classroomId) return 'No Classroom';
    const classroom = classrooms.find(c => c.id === classroomId);
    return classroom?.name || 'Unknown';
  };

  const getStrategyName = (strategyId: string) => {
    if (!strategyId) return '';
    // Check loaded strategies (real DB-authored strategies, keyed by their real id/UUID —
    // takes priority since these are the actual name the teacher/school/family chose)
    const strategy = strategies.find((s: any) => s.id === strategyId || s.name === strategyId);
    if (strategy?.name) return strategy.name;
    // Check allStrategies
    const schoolStrat = allStrategies.school.find((s: any) => s.id === strategyId);
    if (schoolStrat?.name) return schoolStrat.name;
    const familyStrat = allStrategies.family.find((s: any) => s.id === strategyId);
    if (familyStrat?.name || familyStrat?.strategy_name) return familyStrat.name || familyStrat.strategy_name;
    // Translated / legacy-code lookup (see src/utils/resolveStrategyName.ts). Oct 11: never returns the raw id;
    // an unresolvable id gets a translated neutral label ("Custom strategy" / "Strategy").
    return strategyLabel(strategyId, t, STRATEGY_NAME_MAP, localCustomNames);
  };

  // Real fix Sep 30 (live feedback, item 4): both formatters were hardcoded to 'en-US',
  // so "Recent Check-ins" always showed the weekday/date in English regardless of the
  // teacher's selected app language. LOCALE_FOR_LANG maps each of the 10 supported app
  // language codes to a real BCP-47 locale so Intl/date formatting matches the app's
  // actual language everywhere this screen shows a date or time.
  const localeCode = LOCALE_FOR_LANG[language] || 'en-US';

  // Oct 10: linked to a parent, home sharing off, and nothing at all to show -> say "nothing shared yet"
  // instead of the plain "no check-ins" (the parent may well have home check-ins that are private).
  const nothingShared = !!sharingStatus?.is_linked_to_parent && !sharingStatus.home_sharing_enabled
    && logs.length === 0 && combinedLogs.length === 0;

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return formatShortDate(date, language, { weekday: 'short' });
  };

  // Real fix Oct 5 (time-format consistency): hour12:true forced a 12-hour AM/PM clock even
  // for locales (fr-FR, pt-PT, etc.) whose own convention is 24-hour - confirmed live via
  // Intl that forcing it produced "2:30 PM" in French, not the normal "14:30". Omitting
  // hour12 lets each locale's own default convention apply, matching the pattern already
  // used correctly elsewhere on this screen (formatDate above) and in the other screens
  // that never set hour12 at all.
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return formatTimeLabel(date, language);
  };

  const downloadReport = async (monthStr: string) => {
    if (!studentId) return;
    setDownloadingMonth(monthStr);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const [yearStr, monthNum] = monthStr.split('-');
      // Pass language preference in URL
      const lang = await AsyncStorage.getItem('app_language') || 'en';
      const dlPath = `/reports/pdf/student/${studentId}/month/${yearStr}/${parseInt(monthNum)}`;
      const plainUrl = `${BACKEND_URL}/api${dlPath}?lang=${lang}`;
      // fix51: pre-check with the Authorization header; the browser gets a short-lived signed link
      const checkRes = await fetch(plainUrl, { headers: { Authorization: `Bearer ${token}` } });
      if (!checkRes.ok) {
        let detail = '';
        try { detail = (await checkRes.json())?.detail || ''; } catch (e) { console.error('[teacher/student-detail:366]', e); }
        if (detail.startsWith('free_tier_limit|')) {
          Alert.alert(t('free_plan_limit_title') || 'Free Plan Limit Reached', detail.split('|')[1] || t('upgrade_unlimited_reports') || 'Upgrade for unlimited reports.', [
            { text: t('not_now') || 'Not Now', style: 'cancel' },
            { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
          ]);
        } else {
          Alert.alert(t('error') || 'Error', t('pdf_no_data_month') || 'Cannot generate PDF - no data may exist for this month yet');
        }
        return;
      }
      const fullUrl = await getDownloadUrl(dlPath, { lang }, () => `${plainUrl}&token=${token}`);
      await Linking.openURL(fullUrl);
    } catch (error: any) {
      Alert.alert(t('download_error') || 'Download Error', error.message || t('please_try_again') || 'Could not download report');
    } finally {
      setDownloadingMonth(null);
    }
  };

  // Real fix Sep 30 (live feedback, item 4 + PDF question): this used to always read from
  // the hardcoded English MONTH_NAMES array. Using Intl's own long-month formatting with the
  // same localeCode used elsewhere on this screen makes it follow the app's selected
  // language, matching the fix applied to formatDate/formatTime above.
  const formatMonthYear = (monthStr: string) => {
    const [year, month] = monthStr.split('-').map(Number);
    return formatMonthYearLabel(year, month, language);
  };

  if (!student && !studentsSettled) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
        </View>
      </SafeAreaView>
    );
  }

  if (!student) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('student_not_found')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pieData = analytics ? [
    { value: analytics.zone_counts.blue || 0, color: ZONE_COLORS.blue, text: t('blue_short_label') || 'Blue' },
    { value: analytics.zone_counts.green || 0, color: ZONE_COLORS.green, text: t('green_short_label') || 'Green' },
    { value: analytics.zone_counts.yellow || 0, color: ZONE_COLORS.yellow, text: t('yellow_short_label') || 'Yellow' },
    { value: analytics.zone_counts.red || 0, color: ZONE_COLORS.red, text: t('red_short_label') || 'Red' },
  ].filter(d => d.value > 0) : [];

  const barData = analytics ? [
    { value: analytics.zone_counts.blue || 0, frontColor: ZONE_COLORS.blue, label: t('blue_short_label') || 'Blue' },
    { value: analytics.zone_counts.green || 0, frontColor: ZONE_COLORS.green, label: t('green_short_label') || 'Green' },
    { value: analytics.zone_counts.yellow || 0, frontColor: ZONE_COLORS.yellow, label: t('yellow_short_label') || 'Yellow' },
    { value: analytics.zone_counts.red || 0, frontColor: ZONE_COLORS.red, label: t('red_short_label') || 'Red' },
  ] : [];

  return (
    // Real fix Sep 19 (header/nav remainder): now the shared TranslatedHeader - the student's
    // avatar+name+classroom identity block goes in its titleContent slot, and showHome goes
    // to the landing page ('/'). edges omit 'top' because
    // TranslatedHeader applies the top inset itself (this SafeAreaView is the cross-platform
    // one, so leaving the default edges would double the top gap - same fix as
    // parent/family-member-stats/[id]).
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <TranslatedHeader
        title={student.name}
        showHome
        titleContent={
          <>
            <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
              {student.avatar_type === 'custom' && student.avatar_custom ? (
                <Image source={{ uri: student.avatar_custom }} style={{ width:28, height:28, borderRadius:14 }} />
              ) : (
                <Text style={{fontSize:20}}>{presetAvatars?.find((a:any)=>a.id===student.avatar_preset)?.emoji || '👤'}</Text>
              )}
              <Text style={{ fontSize: 15, fontWeight: '700', color: '#333' }} numberOfLines={1}>{student.name}</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#888' }} numberOfLines={1}>{getClassroomName(student.classroom_id)}</Text>
          </>
        }
      />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C6BC0" colors={['#5C6BC0']} />
        }
      >
        {/* Student Header — ultra compact */}
        <View style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 }}>
          {/* Action buttons only — name/class in top nav */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1 }]}
            onPress={() => router.push({
              pathname: '/profiles/edit',
              params: { studentId: student.id }
            })}
          >
            <MaterialIcons name="edit" size={20} color="#5C6BC0" />
            <Text style={styles.iconBtnLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('edit') || 'Edit'}</Text>
          </TouchableOpacity>
          
          {/* Strategies Button with Tooltip */}
          <View style={[styles.tooltipContainer, { flex: 1 }]}>
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 1 }]}
              onPress={() => router.push({ pathname: '/teacher/strategies', params: { studentId: student.id } })}
            >
              <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
              <Text style={styles.iconBtnLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('strategies') || 'Helpful Strategies'}</Text>
            </TouchableOpacity>

          </View>
          
          {/* Family Button with Tooltip */}
          <View style={[styles.tooltipContainer, { flex: 1 }]}>
            <TouchableOpacity
              style={[styles.actionBtn, { flex: 1 }]}
              onPress={() => setShowLinkCodeModal(true)}
            >
              <MaterialIcons name="family-restroom" size={20} color="#4A90D9" />
              <Text style={styles.iconBtnLabel} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('school_home_link') || 'School Home Link'}</Text>
            </TouchableOpacity>

          </View>
          </View>{/* end row 2 */}
        </View>

        {/* Oct 10: shown once above the data sections when the check-in list could not be loaded, so an
            empty page is never mistaken for "no check-ins". Pull to refresh retries (clears on success). */}
        {loadError && (
          <View style={{ marginHorizontal: 12, marginVertical: 6, padding: 12, borderRadius: 10, backgroundColor: loadError === 'forbidden' ? '#FFF3E0' : '#FDECEA', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <MaterialIcons name={loadError === 'forbidden' ? 'lock' : 'cloud-off'} size={20} color={loadError === 'forbidden' ? '#E65100' : '#C62828'} />
            <Text style={{ flex: 1, fontSize: 13, color: '#444' }}>
              {loadError === 'forbidden'
                ? (t('no_access_student_data') || "You don't have access to this student's data.")
                : (t('load_failed_pull_refresh') || "Couldn't load. Pull to refresh.")}
            </Text>
          </View>
        )}

        {/* Period Selector */}
        <View style={{ flexDirection:'row', gap:6, paddingHorizontal:12, paddingVertical:6 }}>
          {[1, 7, 14, 30].map((days) => (
            <TouchableOpacity
              key={days}
              style={[
                styles.periodButton,
                selectedPeriod === days && styles.periodButtonActive
              ]}
              onPress={() => setSelectedPeriod(days as 1 | 7 | 14 | 30)}
            >
              <Text style={[
                styles.periodButtonText,
                selectedPeriod === days && styles.periodButtonTextActive
              ]}>
                {days === 1 ? t('today') || 'Today' : days === 7 ? t('days_7') || '7 Days' : days === 14 ? t('days_14') || '2 Weeks' : t('days_30') || '30 Days'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* Stats Summary */}
        <View style={{ flexDirection:'row', gap:6, paddingHorizontal:12, paddingBottom:6 }}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{analytics?.total_logs || 0}</Text>
            <Text style={styles.statLabel}>{t('check_ins') || 'Check-ins'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: ZONE_COLORS.green }]}>
              {analytics?.zone_counts.green || 0}
            </Text>
            <Text style={styles.statLabel}>{t('green_emotions') || 'Green Emotions'}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {Object.keys(analytics?.strategy_counts || {}).length}
            </Text>
            <Text style={styles.statLabel}>{t('strategy_btn') || t('strategy_btn') || 'Strategies'}</Text>
          </View>
        </View>

        {/* Real fix Sep 23 (device report): Recent Check-ins moved to be the FIRST section
            on this page (was 5th, after Emotion Distribution/Comparison/Download Reports/
            Most Used Strategies) - same reorder applied to family-member-stats/[id].tsx and
            parent/linked-child/[id].tsx, the two parent-side equivalents. Rest of the order
            is unchanged. */}
        {/* Recent Logs */}
        <View style={styles.logsSection}>
          <TouchableOpacity onPress={() => setSecRecentCheckins(e => !e)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                <MaterialIcons name="history" size={18} color="#5C6BC0"/>
                <Text style={styles.sectionTitle}>{t('recent_checkins') || 'Recent Check-ins'}</Text>
              </View>
              <MaterialIcons name={secRecentCheckins ? 'expand-less' : 'expand-more'} size={20} color="#666" />
            </TouchableOpacity>
          {secRecentCheckins && (logs.length > 0 ? (
            logs.slice(0, 15).map((log) => (
              <View key={log.id} style={styles.logItem}>
                <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                  <Text style={styles.logZoneText}>
                    {log.zone==='green'?'😊':log.zone==='blue'?'😔':log.zone==='yellow'?'😟':'😣'}
                  </Text>
                </View>
                <View style={styles.logDetails}>
                  <View style={{flexDirection:'row', alignItems:'center', gap:5}}>
                    <Text style={styles.logZoneName}>{getZoneLabel(log.zone, t)}</Text>
                    {/* Item 2 (Sep 11), school/home distinction so staff see where a
                        linked student's check-in happened - same 🏫/🏠 convention as the
                        Combined Calendar view below. Teacher/admin-only, never shown to
                        parents. */}
                    <Text style={{fontSize:12}}>{log.logged_by === 'parent' ? '🏠' : '🏫'}</Text>
                  </View>
                  <Text style={styles.logTime}>
                    {`${formatDate(log.timestamp)} ${t('date_time_at') || 'at'} ${formatTime(log.timestamp)}`}
                  </Text>
                  {log.support_request_type && (
                    <View style={styles.logStrategies}>
                      <MaterialIcons name="campaign" size={14} color="#FF7043" />
                      <Text style={[styles.logStrategiesText, {color:'#FF7043', fontWeight:'700'}]}>
                        {t('school_support_request') || 'School Support Request'} - {describeSupportRequest({ request_type: log.support_request_type } as any, t)}
                      </Text>
                    </View>
                  )}
                  {log.strategies_selected.length > 0 && (
                    <View style={styles.logStrategies}>
                      <MaterialIcons name="lightbulb" size={14} color="#FFC107" />
                      <Text style={styles.logStrategiesText}>
                        {log.strategies_selected.map(s => getStrategyName(s)).join(', ')}
                      </Text>
                    </View>
                  )}
                  {log.comment && (
                    <View style={styles.logComment}>
                      <MaterialIcons name="chat-bubble" size={14} color="#5C6BC0" />
                      <Text style={styles.logCommentText}>"{log.comment}"</Text>
                    </View>
                  )}
                </View>
              </View>
            ))
          ) : loadError ? null : (
            <View style={styles.emptyLogs}>
              <MaterialIcons name="history" size={48} color="#CCC" />
              <Text style={styles.emptyLogsText}>{nothingShared
                ? (t('nothing_shared_yet') || 'Nothing shared yet. Home check-ins appear here when the parent chooses to share them.')
                : (t('no_checkins') || 'No check-ins yet')}</Text>
            </View>
          ))}
        </View>

        {/* Emotion Distribution */}
        <View style={styles.chartSection}>
          <TouchableOpacity onPress={() => setSecEmoDistrib(e=>!e)} style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
            <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
              <MaterialIcons name="donut-large" size={18} color="#5C6BC0"/>
              <Text style={styles.sectionTitle}>{t('emotion_distribution') || 'Emotion Distribution'}</Text>
            </View>
            <MaterialIcons name={secEmoDistrib?'expand-less':'expand-more'} size={20} color="#666"/>
          </TouchableOpacity>
          {secEmoDistrib && (pieData.length > 0 ? (
            <View style={styles.chartRow}>
              <PieChart
                data={pieData}
                donut
                radius={60}
                innerRadius={35}
                centerLabelComponent={() => (
                  <Text style={styles.pieCenter}>{analytics?.total_logs}</Text>
                )}
              />
              <View style={styles.legendContainer}>
                {pieData.map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText}>{item.text}: {item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : loadError ? null : (
            <View style={styles.emptyChart}>
              <Text style={styles.emptyChartText}>{nothingShared
                ? (t('nothing_shared_yet') || 'Nothing shared yet. Home check-ins appear here when the parent chooses to share them.')
                : t('no_data_period')}</Text>
            </View>
          ))}
        </View>

        {/* Bar Chart */}
        {analytics && analytics.total_logs > 0 && (
          <View style={styles.chartSection}>
            <TouchableOpacity onPress={() => setSecEmoCompare(e => !e)}
                style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <MaterialIcons name="bar-chart" size={18} color="#5C6BC0"/>
                  <Text style={styles.sectionTitle}>{t('zone_comparison') || 'Emotion Comparison'}</Text>
                </View>
                <MaterialIcons name={secEmoCompare ? 'expand-less' : 'expand-more'} size={20} color="#666" />
              </TouchableOpacity>
            {secEmoCompare && <View style={styles.barChartContainer}>
              <BarChart
                data={barData}
                barWidth={40}
                spacing={20}
                roundedTop
                roundedBottom
                xAxisThickness={0}
                yAxisThickness={0}
                yAxisTextStyle={{ color: '#666', fontSize: 11 }}
                noOfSections={4}
                maxValue={Math.max(1, ...Object.values(analytics.zone_counts || {}).map(v => Number(v))) + 1}
                isAnimated
                barBorderRadius={6}
                width={width - 100}
              />
            </View>}
          </View>
        )}

        {/* Top Strategies */}
        {analytics && Object.keys(analytics.strategy_counts || {}).length > 0 && (
          <View style={styles.strategiesSection}>
            <TouchableOpacity onPress={() => setSecMostUsed(e => !e)}
                style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <MaterialIcons name="star" size={18} color="#FFC107"/>
                  <Text style={styles.sectionTitle}>{t('most_used_strategies') || 'Most Used Strategies'}</Text>
                </View>
                <MaterialIcons name={secMostUsed ? 'expand-less' : 'expand-more'} size={20} color="#666" />
              </TouchableOpacity>
            {secMostUsed && Object.entries(analytics.strategy_counts)
              .sort(([,a],[,b]) => (b as number) - (a as number))
              .map(([strategyId, count]) => {
                // Determine zone colour from strategy ID prefix
                const zoneColour = strategyId.startsWith('b') ? EMOTION_COLOURS.blue
                  : strategyId.startsWith('g') ? EMOTION_COLOURS.green
                  : strategyId.startsWith('y') ? EMOTION_COLOURS.yellow
                  : strategyId.startsWith('r') ? EMOTION_COLOURS.red
                  : strategyId.startsWith('p_b') ? EMOTION_COLOURS.blue
                  : strategyId.startsWith('p_g') ? EMOTION_COLOURS.green
                  : strategyId.startsWith('p_y') ? EMOTION_COLOURS.yellow
                  : strategyId.startsWith('p_r') ? EMOTION_COLOURS.red
                  : '#999';
                return (
                  <View key={strategyId} style={styles.strategyItem}>
                    <View style={[styles.strategyZoneCircle, { backgroundColor: zoneColour }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.strategyName}>{getStrategyName(strategyId)}</Text>
                      {(() => { const row = strategies.find((x: any) => x.id === strategyId) || allStrategies.school.find((x: any) => x.id === strategyId) || allStrategies.family.find((x: any) => x.id === strategyId); return row && ((row as any).source || (row as any).creator_role || (row as any).created_by_role || allStrategies.family.includes(row)) ? <View style={{ marginLeft: 12 }}><SourceChip source={allStrategies.family.includes(row) ? 'home' : strategySource(row)} /></View> : null; })()}
                    </View>
                    <View style={styles.strategyCount}>
                      <Text style={styles.strategyCountText}>{count as number}x</Text>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* ── Combined Calendar View ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.calendarSection}>
            <TouchableOpacity onPress={() => setSecCalendar(e => !e)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <MaterialIcons name="calendar-today" size={20} color="#5C6BC0" />
                <Text style={styles.sectionTitle}>{t('checkin_calendar') || 'Check-in Calendar'}</Text>
              </View>
              <MaterialIcons name={secCalendar ? 'expand-less' : 'expand-more'} size={20} color="#666" />
            </TouchableOpacity>
            {secCalendar && (<><View style={styles.calendarGrid}>
              {(() => {
                // Group by date
                const grouped: Record<string, any[]> = {};
                combinedLogs.forEach(log => {
                  const date = log.timestamp?.split('T')[0] || '';
                  if (!grouped[date]) grouped[date] = [];
                  grouped[date].push(log);
                });
                const dates = Object.keys(grouped).sort().slice(-14); // last 14 days with data
                return dates.map(date => {
                  const dayLogs = grouped[date];
                  const d = new Date(date);
                  const dayName = (CALENDAR_DAY_LETTERS[language] || CALENDAR_DAY_LETTERS.en)[d.getDay()];
                  const dayNum = d.getDate();
                  const homeCount = dayLogs.filter(l => l.source === 'home').length;
                  const schoolCount = dayLogs.filter(l => l.source === 'school').length;
                  // dominant zone
                  const zones = dayLogs.map(l => l.zone);
                  const zoneCounts: Record<string,number> = {};
                  zones.forEach(z => { zoneCounts[z] = (zoneCounts[z]||0)+1; });
                  const dominant = Object.entries(zoneCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'green';
                  const ZONE_COLORS_MAP: Record<string,string> = EMOTION_COLOURS;
                  return (
                    <View key={date} style={styles.calendarDay}>
                      <Text style={styles.calendarDayName}>{dayName}</Text>
                      <View style={[styles.calendarDayCircle, {backgroundColor: ZONE_COLORS_MAP[dominant]}]}>
                        <Text style={styles.calendarDayNum}>{dayNum}</Text>
                      </View>
                      <View style={styles.calendarBadges}>
                        {schoolCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#5C6BC0'}]}><Text style={styles.calendarBadgeText}>S</Text></View>}
                        {homeCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#4CAF50'}]}><Text style={styles.calendarBadgeText}>H</Text></View>}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#5C6BC0'}]}/><Text style={styles.legendText}>{t('school_legend') || 'S = School'}</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#4CAF50'}]}/><Text style={styles.legendText}>{t('home_legend') || 'H = Home'}</Text></View>
            </View></>)}
          </View>
        )}

        {/* ── Zone Distribution (combined) ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.zoneDistSection}>
            <TouchableOpacity onPress={() => setSecEmoDistribLinked(e=>!e)}
              style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                <MaterialIcons name="pie-chart" size={20} color="#5C6BC0" />
                <Text style={styles.sectionTitle}>{t('emotion_distribution') || 'Emotion Distribution - Linked Student'}</Text>
              </View>
              <MaterialIcons name={secEmoDistribLinked ? 'expand-less' : 'expand-more'} size={20} color="#666" />
            </TouchableOpacity>
            {secEmoDistribLinked && (<>
            {/* Data source tabs */}
            <View style={styles.dataTabRow}>
              {(['combined','school','home'] as const).map(tab => (
                <TouchableOpacity key={tab}
                  style={[styles.dataTab, activeDataTab === tab && styles.dataTabActive]}
                  onPress={() => setActiveDataTab(tab)}>
                  <Text style={[styles.dataTabText, activeDataTab === tab && styles.dataTabTextActive]}>
                    {tab === 'combined' ? (t('all') || 'All') : tab === 'school' ? '🏫 ' + (t('school') || 'School') : '🏠 ' + (t('home') || 'Home')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(() => {
              const filtered = activeDataTab === 'combined' ? combinedLogs
                : activeDataTab === 'school' ? combinedLogs.filter(l => l.source === 'school')
                : combinedLogs.filter(l => l.source === 'home');
              const counts: Record<string,number> = {blue:0,green:0,yellow:0,red:0};
              filtered.forEach(l => { if (l.zone in counts) counts[l.zone]++; });
              const total = Object.values(counts).reduce((a,b)=>a+b,0);
              const ZONE_COLORS_MAP: Record<string,string> = EMOTION_COLOURS;
              const ZONE_NAMES: Record<string,string> = {blue:'Blue',green:'Green',yellow:'Yellow',red:'Red'};
              return (
                <View style={styles.zoneDistBars}>
                  {(['green','blue','yellow','red'] as const).map(zone => {
                    const pct = total > 0 ? Math.round((counts[zone]/total)*100) : 0;
                    return (
                      <View key={zone} style={styles.zoneDistRow}>
                        <View style={[styles.zoneDistDot, {backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        <Text style={styles.zoneDistLabel}>{ZONE_NAMES[zone]}</Text>
                        <View style={styles.zoneDistBarBg}>
                          <View style={[styles.zoneDistBar, {width: `${pct}%` as any, backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        </View>
                        <Text style={styles.zoneDistPct}>{pct}%</Text>
                        <Text style={styles.zoneDistCount}>({counts[zone]})</Text>
                      </View>
                    );
                  })}
                  {total === 0 && <Text style={styles.emptyText}>{t('no_checkins_this_view') || 'No check-ins for this view'}</Text>}
                </View>
              );
            })()}
            </>)}
          </View>
        )}

        {/* ── Add Strategy Modal ── */}
        <Modal visible={showAddStrategyModal} transparent animationType="slide" onRequestClose={() => setShowAddStrategyModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('add_strategy') || 'Add Strategy'}</Text>
                <TouchableOpacity onPress={() => setShowAddStrategyModal(false)} style={styles.modalCloseButton}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{maxHeight:400}}>
                <Text style={styles.inputLabel}>{t('strategy_name_required_label') || 'Strategy Name *'}</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStrategy.name}
                  onChangeText={(v: string) => setNewStrategy({...newStrategy, name: v})}
                  placeholder={t('strategy_example') || 'e.g. Deep breathing, Take a walk...'}
                  placeholderTextColor="#AAA"
                />
                <Text style={styles.inputLabel}>{t('description_label') || 'Description'}</Text>
                <TextInput
                  style={[styles.textInput, {height:60, textAlignVertical:'top'}]}
                  value={newStrategy.description}
                  onChangeText={(v: string) => setNewStrategy({...newStrategy, description: v})}
                  placeholder={t('how_to_use') || 'How to use this strategy...'}
                  placeholderTextColor="#AAA"
                  multiline
                />
                <Text style={styles.inputLabel}>{t('zone_label') || 'Emotion'}</Text>
                <View style={{flexDirection:'row', gap:8, marginBottom:16}}>
                  {(['blue','green','yellow','red'] as const).map(zone => (
                    <TouchableOpacity key={zone}
                      style={{flex:1, paddingVertical:10, borderRadius:8, alignItems:'center',
                        backgroundColor: newStrategy.zone === zone ? ZONE_COLORS[zone] : '#F0F0F0'}}
                      onPress={() => setNewStrategy({...newStrategy, zone})}>
                      <Text style={{fontSize:12, fontWeight:'600', color: newStrategy.zone === zone ? 'white' : '#666'}}>
                        {t(`${zone}_short_label`) || (zone.charAt(0).toUpperCase() + zone.slice(1))}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{flexDirection:'row', alignItems:'center', gap:8, padding:12,
                    backgroundColor: newStrategy.shareWithParent ? '#E8F5E9' : '#F5F5F5',
                    borderRadius:10, marginBottom:16}}
                  onPress={() => setNewStrategy({...newStrategy, shareWithParent: !newStrategy.shareWithParent})}>
                  <MaterialIcons name={newStrategy.shareWithParent ? 'check-box' : 'check-box-outline-blank'} size={22} color={newStrategy.shareWithParent ? '#4CAF50' : '#999'} />
                  <View>
                    <Text style={{fontSize:14, fontWeight:'600', color:'#333'}}>{t('share_with_home') || t('share_with_home') || 'Share with home'}</Text>
                    <Text style={{fontSize:11, color:'#888'}}>{t('share_with_home_desc') || 'Parent will see this strategy'}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#5C6BC0', borderRadius:12, padding:16, alignItems:'center',
                    opacity: savingStrategy ? 0.6 : 1}}
                  onPress={async () => {
                    if (!newStrategy.name.trim()) { Alert.alert(t('name_required') || 'Name required'); return; }
                    setSavingStrategy(true);
                    try {
                      await teacherHomeDataApi.addStrategy(studentId!, {
                        name: newStrategy.name.trim(),
                        description: newStrategy.description.trim(),
                        zone: newStrategy.zone,
                        icon: 'star',
                        share_with_parent: newStrategy.shareWithParent,
                      });
                      const strats = await teacherHomeDataApi.getAllStrategies(studentId!).catch(() => ({school_strategies:[], family_strategies:[]}));
                      setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      setShowAddStrategyModal(false);
                      setNewStrategy({name:'', description:'', zone:'green', icon:'star', shareWithParent:false});
                    } catch (e: any) { Alert.alert(t('error') || 'Error', e.message); }
                    finally { setSavingStrategy(false); }
                  }}
                  disabled={savingStrategy}>
                  <Text style={{color:'white', fontSize:16, fontWeight:'600'}}>
                    {savingStrategy ? (t('saving') || 'Saving...') : (t('add') || 'Add')}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Home Data Section (if parent has enabled sharing) */}
        {sharingStatus?.is_linked_to_parent && (
          <View style={styles.homeDataSection}>
            {/* Real fix Sep 23 (device report, 2nd pass): marginBottom used to be
                conditionally 10 while expanded - no sibling section's toggle row carries
                any margin of its own in either state (e.g. "Emotion Distribution"'s
                TouchableOpacity above has none; its content's own top spacing, or here the
                container's own padding, is what separates header from content). Dropped so
                this row matches every sibling's toggle row exactly. */}
            <TouchableOpacity onPress={() => setSecHomeSharing(e => !e)} style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
              <View style={styles.homeDataHeader}>
                {/* Real fix Sep 23 (device report, 2nd pass): was size 24 - every sibling
                    section's own header icon (donut-large, history, star, picture-as-pdf) is
                    18, adding a few more px of height to this row alone. */}
                <MaterialIcons name="home" size={18} color="#4CAF50" />
                <Text style={styles.sectionTitle}>{t('home_data') || 'Home Data'}</Text>
              </View>
              <MaterialIcons name={secHomeSharing ? 'expand-less' : 'expand-more'} size={20} color="#666" />
            </TouchableOpacity>
          {secHomeSharing && <>
            <Text style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
              {sharingStatus.home_sharing_enabled
                ? `✅ Parent sharing on · ${sharingStatus.school_sharing_enabled ? '✅ School sharing on' : '⏸ School sharing off'}`
                : `⏸ Parent sharing off · ${sharingStatus.school_sharing_enabled ? '✅ School sharing on' : '⏸ School sharing off'}`}
            </Text>
            {/* Sharing consent - Mutual Consent or Paused */}
            <View style={{
              borderRadius: 12, padding: 14, marginBottom: 12,
              backgroundColor: sharingStatus.home_sharing_enabled ? '#E8F5E9' : '#FFF8E1',
              borderWidth: 1.5,
              borderColor: sharingStatus.home_sharing_enabled ? '#4CAF50' : '#FF9800',
            }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons
                  name={sharingStatus.home_sharing_enabled ? 'verified' : 'pause-circle-filled'}
                  size={22}
                  color={sharingStatus.home_sharing_enabled ? '#4CAF50' : '#FF9800'}
                />
                <Text style={{ fontSize: 14, fontWeight: '700',
                  color: sharingStatus.home_sharing_enabled ? '#2E7D32' : '#E65100' }}>
                  {sharingStatus.home_sharing_enabled
                    ? (t('mutual_consent') || 'Mutual Consent Active')
                    : (t('sharing_paused') || 'Sharing Paused')}
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: '#666', marginTop: 6, lineHeight: 16 }}>
                {sharingStatus.home_sharing_enabled
                  ? t('data_shared_desc') || 'Student emotional wellbeing data is being shared between school and home.'
                  : t('sharing_paused_desc') || 'Parent has not enabled home sharing. Home check-in data is not visible.'}
              </Text>
              {/* Real feature Aug 26 (item 3): was a UI stopgap - called a POST endpoint that
                  never existed on the backend (silent 404), and was only ever shown when
                  home_sharing_enabled happened to be true, an unrelated condition. Now calls
                  the real toggle endpoint, confirms before pausing (this affects what a real
                  parent can see), and isn't gated on the other toggle's state. */}
              <TouchableOpacity
                disabled={togglingSchoolSharing}
                onPress={() => {
                  const turningOff = sharingStatus.school_sharing_enabled;
                  Alert.alert(
                    turningOff ? (t('pause_school_sharing_title') || 'Pause sharing with parent?') : (t('resume_school_sharing_title') || 'Resume sharing with parent?'),
                    turningOff
                      ? (t('pause_school_sharing_desc') || "The linked parent won't be able to see new or existing school check-ins or teacher-assigned strategies while paused. Nothing is deleted - resuming restores full visibility instantly.")
                      : (t('resume_school_sharing_desc') || 'The linked parent will be able to see this student\'s school check-ins and teacher-assigned strategies again.'),
                    [
                      { text: t('cancel') || 'Cancel', style: 'cancel' },
                      {
                        text: turningOff ? (t('pause_school_sharing_confirm') || 'Pause Sharing') : (t('resume_school_sharing_confirm') || 'Resume Sharing'),
                        style: turningOff ? 'destructive' : 'default',
                        onPress: async () => {
                          setTogglingSchoolSharing(true);
                          try {
                            // Real fix Sep 22 (device report): was a raw fetch() referencing
                            // a BACKEND_URL that was never in scope in this onPress closure
                            // (two OTHER local BACKEND_URL consts exist elsewhere in this
                            // file, in unrelated functions) - every press threw a
                            // ReferenceError here, always caught by the catch{} below and
                            // shown as this generic alert. teacherHomeDataApi.toggleSchoolSharing
                            // uses the same apiRequest() every other call in this file already
                            // does, which resolves the backend URL correctly and throws a
                            // real Error with the backend's own detail message on failure.
                            const data = await teacherHomeDataApi.toggleSchoolSharing(studentId);
                            setSharingStatus((prev: any) => prev ? { ...prev, school_sharing_enabled: data.school_sharing_enabled } : prev);
                          } catch (e: any) {
                            Alert.alert(t('error') || 'Error', e?.message || (t('toggle_school_sharing_error') || 'Could not update sharing. Please try again.'));
                          } finally {
                            setTogglingSchoolSharing(false);
                          }
                        },
                      },
                    ]
                  );
                }}
                style={{ flexDirection:'row', alignItems:'center', gap:8, marginTop:10, backgroundColor: sharingStatus.school_sharing_enabled ? '#FFEBEE' : '#E8F5E9', borderRadius:8, padding:10, opacity: togglingSchoolSharing ? 0.6 : 1 }}>
                <MaterialIcons name={sharingStatus.school_sharing_enabled ? 'pause-circle-filled' : 'play-circle-filled'} size={18} color={sharingStatus.school_sharing_enabled ? '#F44336' : '#4CAF50'} />
                <Text style={{ fontSize:12, fontWeight:'600', color: sharingStatus.school_sharing_enabled ? '#F44336' : '#4CAF50' }}>
                  {sharingStatus.school_sharing_enabled ? (t('pause_sharing_with_parent') || 'Pause sharing with parent') : (t('resume_sharing_with_parent') || 'Resume sharing with parent')}
                </Text>
              </TouchableOpacity>
            </View>
            
            {sharingStatus.home_sharing_enabled && homeData ? (
              <>
                {/* Home Check-ins */}
                {(homeData.home_checkins || []).length > 0 && (
                  <View style={styles.homeCheckinsContainer}>
                    <TouchableOpacity onPress={() => setSecHomeCheckins(e => !e)}
                      style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                      <Text style={styles.homeSubtitle}>{t('home_checkins') || 'Home Check-ins'}</Text>
                      <MaterialIcons name={secHomeCheckins?'expand-less':'expand-more'} size={18} color="#888" />
                    </TouchableOpacity>
                    {secHomeCheckins && (homeData.home_checkins || []).slice(0, 5).map((checkin: any, index: number) => (
                      <View key={`checkin_${checkin.id || index}`} style={styles.homeCheckinItem}>
                        <View style={[styles.homeCheckinZone, { backgroundColor: ZONE_COLORS[checkin.zone as keyof typeof ZONE_COLORS] || '#999' }]}>
                          <Text style={styles.homeCheckinEmoji}>
                            {checkin.zone === 'blue' ? '😢' : checkin.zone === 'green' ? '😊' : checkin.zone === 'yellow' ? '😰' : '😠'}
                          </Text>
                        </View>
                        <View style={styles.homeCheckinDetails}>
                          <Text style={styles.homeCheckinZoneLabel}>{getZoneLabel(checkin.zone, t)}</Text>
                          <Text style={styles.homeCheckinTime}>
                            {formatShortDateTime(checkin.timestamp, language, { twoDigitHour: true })}
                          </Text>
                          {(checkin.helpers_selected || checkin.strategies_selected || []).length > 0 && (
                            <Text style={{ fontSize:10, color:'#5C6BC0', marginTop:2 }}>
                              💡 {(checkin.helpers_selected || checkin.strategies_selected).slice(0,2).map((s:string)=>getStrategyName(s)).join(', ')}
                            </Text>
                          )}
                        </View>
                        <View style={styles.homeBadge}>
                          <MaterialIcons name="home" size={12} color="#4CAF50" />
                        </View>
                      </View>
                    ))}
                  </View>
                )}
                
                {/* Oct 11: the duplicate Family Strategies list was removed; the lightbulb Helpful strategies page is the single place (School/Home chips). */}
                {(homeData.home_checkins || []).length === 0 && (
                  <View style={styles.noHomeData}>
                    <MaterialIcons name="info" size={32} color="#CCC" />
                    <Text style={styles.noHomeDataText}>{t('no_home_data_yet') || 'No home data yet'}</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.sharingNotEnabled}>
                <MaterialIcons name="lock" size={32} color="#CCC" />
                <Text style={styles.sharingNotEnabledText}>
                  {t('parent_sharing_disabled') || 'Parent has not enabled home data sharing'}
                </Text>
                <Text style={styles.sharingNotEnabledHint}>
                  {t('parent_sharing_hint') || 'The parent can enable sharing from their dashboard'}
                </Text>
              </View>
            )}
          </>}
          </View>
        )}

        {/* Real fix Sep 23 (device report): Download Monthly Reports moved to be the LAST
            section on this page (was 3rd, before Most Used Strategies/Check-in Calendar) -
            matching where it already sits on both parent-side equivalents
            (family-member-stats/[id].tsx and linked-child/[id].tsx), per Jono's ask that
            individual-person pages share one consistent section order. */}
        {/* Download Reports Section */}
        {availableMonths.length > 0 && (
          <View style={styles.reportsSection}>
            <TouchableOpacity onPress={() => setSecMonthlyReport(e => !e)}
                style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <View style={{flexDirection:'row',alignItems:'center',gap:8}}>
                  <MaterialIcons name="picture-as-pdf" size={18} color="#E53935"/>
                  <Text style={styles.sectionTitle}>{t('download_monthly_reports') || 'Download Monthly Reports'}</Text>
                </View>
                <MaterialIcons name={secMonthlyReport ? 'expand-less' : 'expand-more'} size={20} color="#666" />
              </TouchableOpacity>
            {secMonthlyReport && (<><Text style={styles.reportsSubtitle}>
              {t('select_month_pdf') || 'Select a month to download a PDF report'}
            </Text>
            <TouchableOpacity
              style={styles.downloadButton}
              onPress={() => setShowReportModal(true)}
            >
              <MaterialIcons name="picture-as-pdf" size={24} color="white" />
              <Text style={styles.downloadButtonText}>{t('download_report')}</Text>
            </TouchableOpacity></>)}
          </View>
        )}
      </ScrollView>

      {/* Report Month Selection Modal */}
      <Modal
        visible={showReportModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowReportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('select_month') || 'Select Month'}</Text>
              <TouchableOpacity
                onPress={() => setShowReportModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.monthsList}>
              {availableMonths.map((monthStr) => (
                <TouchableOpacity
                  key={monthStr}
                  style={styles.monthItem}
                  onPress={() => downloadReport(monthStr)}
                  disabled={downloadingMonth === monthStr}
                >
                  <MaterialIcons name="calendar-today" size={20} color="#5C6BC0" />
                  <Text style={styles.monthItemText}>{formatMonthYear(monthStr)}</Text>
                  {downloadingMonth === monthStr
                    ? <ActivityIndicator size="small" color="#4CAF50" />
                    : <MaterialIcons name="download" size={20} color="#4CAF50" />}
                </TouchableOpacity>
              ))}
              
              {availableMonths.length === 0 && (
                <View style={styles.noMonthsContainer}>
                  <Text style={styles.noMonthsText}>{t('no_data_yet') || 'No data yet'}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Parent Link Code Modal */}
      <Modal
        visible={showLinkCodeModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowLinkCodeModal(false);
          setLinkCode(null);
          setDisclaimerAccepted(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{t('share_student_tracking') || "Share Student's Emotion Tracking"}</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowLinkCodeModal(false);
                  setLinkCode(null);
                  setDisclaimerAccepted(false);
                }}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <View style={styles.linkCodeContent}>
              {/* Already Linked State */}
              {sharingStatus?.is_linked_to_parent ? (
                <View style={styles.linkedStateContainer}>
                  <MaterialIcons name="link" size={64} color="#4CAF50" />
                  <Text style={styles.linkedStateTitle}>{t('student_linked') || 'Student is Linked'}</Text>
                  <Text style={styles.linkedStateDesc}>
                    {t('student_linked_desc') || 'This student is connected to a parent account. The parent can view check-ins from home.'}
                  </Text>
                  
                  <View style={styles.sharingStatusRow}>
                    <MaterialIcons 
                      name={sharingStatus.home_sharing_enabled ? 'visibility' : 'visibility-off'} 
                      size={20} 
                      color={sharingStatus.home_sharing_enabled ? '#4CAF50' : '#999'} 
                    />
                    <Text style={styles.sharingStatusText}>
                      {sharingStatus.home_sharing_enabled 
                        ? (t('home_sharing_on') || 'Home data sharing is ON') 
                        : (t('home_sharing_off') || 'Home data sharing is OFF')
                      }
                    </Text>
                  </View>
                  
                  <TouchableOpacity
                    style={styles.unlinkStudentButton}
                    onPress={() => {
                      Alert.alert(
                        t('unlink_student') || 'Unlink Student',
                        t('confirm_unlink_student') || 'Are you sure you want to unlink this student from the parent? They will need a new code to reconnect.',
                        [
                          { text: t('cancel') || 'Cancel', style: 'cancel' },
                          {
                            text: t('unlink') || 'Unlink',
                            style: 'destructive',
                            onPress: async () => {
                              try {
                                await teacherApi.unlinkStudent(student.id);
                                Alert.alert(t('success') || 'Success', t('student_unlinked') || 'Student has been unlinked from parent. They will need a new code to reconnect.');
                                setShowLinkCodeModal(false);
                                setSharingStatus({ is_linked_to_parent: false, home_sharing_enabled: false, school_sharing_enabled: false, parent_name: null, link_count: 0 });
                                setHomeData(null);
                                setLinkCode(null);
                                setShowLinkCodeModal(false);
                                // Refresh sharing status
                                const newStatus = await teacherHomeDataApi.getSharingStatus(student.id);
                                setSharingStatus(newStatus);
                              } catch (error: any) {
                                Alert.alert(t('error') || 'Error', error.message || 'Failed to unlink');
                              }
                            },
                          },
                        ]
                      );
                    }}
                  >
                    <MaterialIcons name="link-off" size={20} color="#F44336" />
                    <Text style={styles.unlinkStudentButtonText}>{t('unlink_student') || 'Unlink Student'}</Text>
                  </TouchableOpacity>
                </View>
              ) : !disclaimerAccepted ? (
                // Disclaimer step
                <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={true}>
                  <Text style={styles.disclaimerTitle}>{t('sharing_disclaimer_title') || 'Consent to Share Access'}</Text>
                  <Text style={styles.disclaimerText}>{t('sharing_disclaimer_text')}</Text>
                  <View style={[styles.disclaimerButtons, { flexDirection: 'column', alignItems: 'center' }]}>
                    <TouchableOpacity
                      style={[styles.generateCodeButton, { alignSelf: 'stretch' }]}
                      onPress={() => setDisclaimerAccepted(true)}
                    >
                      <Text style={styles.generateCodeButtonText}>{t('i_agree_and_continue') || 'I Agree & Continue'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.generateCodeButton, { backgroundColor: '#999', alignSelf: 'center', marginTop: 10, minWidth: 160 }]}
                      onPress={() => { setShowLinkCodeModal(false); setDisclaimerAccepted(false); }}
                    >
                      <Text style={styles.generateCodeButtonText}>{t('cancel') || 'Cancel'}</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              ) : !linkCode ? (
                <>
                  <MaterialIcons name="family-restroom" size={64} color="#4A90D9" />
                  <Text style={styles.linkCodeDescription}>
                    {(t('generate_parent_code_intro') || "Generate a code for the parent/caregiver. They will enter this code in the Parent section of the app to view {name}'s emotion check-ins at home.").replace('{name}', student.name)}
                  </Text>
                  <TouchableOpacity
                    style={[styles.generateCodeButton, generatingCode && styles.generateCodeButtonDisabled]}
                    onPress={async () => {
                      setGeneratingCode(true);
                      try {
                        const result = await teacherApi.generateLinkCode(student.id);
                        setLinkCode(result.link_code);
                      } catch (error: any) {
                        console.error('Generate link code error:', error);
                        // Show more helpful error message
                        let errorMessage = t('failed_generate_link_code') || 'Failed to generate link code.';
                        if (error.message?.includes('Not authenticated') || error.message?.includes('401')) {
                          errorMessage = t('session_expired_relogin_teacher') || 'Your session has expired. Please go back, log out from Settings, and log back in as a Teacher.';
                        } else if (error.message?.includes('teacher') || error.message?.includes('403')) {
                          errorMessage = t('only_teachers_generate_codes') || 'Only teachers can generate parent link codes. Please make sure you selected "Teacher" when you logged in.';
                        } else {
                          errorMessage = error.message || t('try_again_short') || 'Please try again.';
                        }
                        Alert.alert(t('error') || 'Error', errorMessage);
                      } finally {
                        setGeneratingCode(false);
                      }
                    }}
                    disabled={generatingCode}
                  >
                    <MaterialIcons name="vpn-key" size={24} color="white" />
                    <Text style={styles.generateCodeButtonText}>
                      {generatingCode ? (t('generating') || 'Generating...') : (t('generate_parent_code') || 'Generate Parent Code')}
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={64} color="#4CAF50" />
                  <Text style={styles.linkCodeLabel}>{t('parent_link_code') || 'Parent Link Code:'}</Text>
                  <Text style={styles.linkCodeValue}>{linkCode}</Text>
                  <Text style={styles.linkCodeNote}>
                    {t('access_expires_30_days') || 'Access expires in 30 days'}. {t('share_code_instructions') || 'Share it with the parent so they can link their account.'}
                  </Text>
                  <TouchableOpacity
                    style={styles.shareCodeButton}
                    onPress={() => {
                      Share.share({
                        message: `Link code for ${student.name} in Class of Happiness app: ${linkCode}\n\nUse this code in the Parent section to connect your account. Access expires in 30 days.`,
                      });
                    }}
                  >
                    <MaterialIcons name="share" size={24} color="white" />
                    <Text style={styles.shareCodeButtonText}>{t('share_code') || 'Share Code'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: { padding:8, paddingBottom:40 },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 18,
    color: '#999',
  },
  studentHeader: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:6 },
  studentInfo: { flex: 1, marginLeft: 12, marginRight: 4 },
  studentName: { fontSize: 17, fontWeight: '700', color: '#333' },
  studentClassroom: { fontSize: 13, color: '#666', marginTop: 2, flexShrink: 1 },
  iconBtnLabel: { fontSize: 9, color: "#5C6BC0", marginTop: 2, fontWeight: "600", textAlign: "center" },
  editButton: {
    padding: 8,
    backgroundColor: '#EDE7F6',
    borderRadius: 8,
  },
  actionBtn: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 4, borderRadius: 10, backgroundColor: '#F5F5F5' },
  strategiesButton: {
    padding: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    marginLeft: 8,
  },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  periodButton: { flex:1, paddingVertical:5, borderRadius:8, alignItems:'center', backgroundColor:'#F5F5F5' },
  periodButtonActive: {
    backgroundColor: '#5C6BC0',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#666',
  },
  periodButtonTextActive: {
    color: 'white',
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: { flex:1, backgroundColor:'white', borderRadius:10, padding:8, alignItems:'center' },
  statValue: { fontSize:18, fontWeight:'700', color:'#333' },
  statLabel: { fontSize:10, color:'#888', marginTop:2, textAlign:'center' },
  chartSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  pieCenter: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  legendContainer: {
    marginLeft: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
    color: '#666',
  },
  barChartContainer: {
    alignItems: 'center',
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyChartText: {
    fontSize: 14,
    color: '#999',
  },
  strategiesSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },
  strategyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  strategyName: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  strategyZoneCircle: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    flexShrink: 0,
  },
  strategyCount: {
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  strategyCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F9A825',
  },
  logsSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },
  logItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  logZone: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logZoneText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  logDetails: {
    flex: 1,
    marginLeft: 12,
  },
  logZoneName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  logTime: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  logStrategies: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  logStrategiesText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
    flex: 1,
  },
  logComment: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    backgroundColor: '#F0F4FF',
    padding: 8,
    borderRadius: 8,
    gap: 6,
  },
  logCommentText: {
    fontSize: 13,
    color: '#5C6BC0',
    fontStyle: 'italic',
    flex: 1,
    lineHeight: 18,
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyLogsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  reportsSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },

  reportsSubtitle: {
    fontSize: 14,
    color: '#888',
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C6BC0',
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  downloadButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingBottom: 40,
    width: '100%',
    maxWidth: 480,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  // Oct 10: title takes the remaining width (flex:1, minWidth:0) so a long translation wraps/shrinks
  // instead of pushing the close X out of the section; X has a 44x44 hit area and never shrinks.
  modalTitle: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  monthsList: {
    padding: 16,
  },
  monthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  monthItemText: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  noMonthsContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  noMonthsText: {
    fontSize: 16,
    color: '#999',
  },
  shareParentButton: { flex: 1, alignItems: 'center', padding: 10, borderRadius: 10, backgroundColor: '#E3F2FD' },
  linkCodeContent: {
    padding: 24,
    alignItems: 'center',
  },
  linkCodeDescription: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
    lineHeight: 22,
  },
  generateCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  generateCodeButtonDisabled: {
    backgroundColor: '#CCC',
  },
  generateCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  linkCodeLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 16,
  },
  linkCodeValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#4A90D9',
    letterSpacing: 6,
    marginTop: 8,
    marginBottom: 16,
  },
  linkCodeNote: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  shareCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  shareCodeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  disclaimerText: {
    fontSize: 13,
    color: '#444',
    lineHeight: 20,
    marginBottom: 16,
  },
  disclaimerButtons: {
    flexDirection: 'row',
    marginTop: 8,
    paddingBottom: 20,
  },
  // Home Data Section Styles
  // Real fix Sep 23 (device report): borderRadius/padding/marginBottom were 16/16/16 - every
  // sibling section on this page (chartSection, logsSection, calendarSection, zoneDistSection,
  // strategiesSection, reportsSection) uses 12/10/8, which is why this one alone read as
  // slightly larger. Matched to the same values.
  homeDataSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
  },
  // Real fix Sep 23 (device report, 2nd pass): matching the OUTER container styles
  // (borderRadius/padding/marginBottom) wasn't enough - this section was still taller than
  // its siblings because THIS wrapper (icon+title, inside the header row) had its own
  // unconditional marginBottom:16 that none of the sibling sections' equivalent inline
  // header wrappers have (they carry no margin at all - see "Emotion Distribution"'s
  // {flexDirection:'row',alignItems:'center',gap:8} a few sections up, same role, no
  // margin). That 16px applied even while COLLAPSED, since it's on the icon+title View,
  // not gated on the expanded state the way the sharing-status text below it is.
  homeDataHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sharingEnabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 'auto',
  },
  sharingEnabledText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  sharingDisabledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
    marginLeft: 'auto',
  },
  sharingDisabledText: {
    fontSize: 12,
    color: '#999',
  },
  homeCheckinsContainer: {
    marginBottom: 16,
  },
  homeSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  homeCheckinItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    padding: 10,
    borderRadius: 10,
    marginBottom: 6,
  },
  homeCheckinZone: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  homeCheckinEmoji: {
    fontSize: 16,
  },
  homeCheckinDetails: {
    flex: 1,
    marginLeft: 10,
  },
  homeCheckinZoneLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  homeCheckinTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  homeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  noHomeData: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noHomeDataText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  linkedBadge: { flexDirection:'row', alignItems:'center', backgroundColor:'#5C6BC0', paddingHorizontal:8, paddingVertical:3, borderRadius:10, gap:4, marginTop:4, alignSelf:'flex-start' },
  linkedBadgeText: { fontSize:11, color:'white', fontWeight:'600' },
  calendarSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },
  calendarGrid: { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  calendarDay: { alignItems:'center', width:38 },
  calendarDayName: { fontSize:9, color:'#888', marginBottom:3 },
  calendarDayCircle: { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  calendarDayNum: { fontSize:11, fontWeight:'700', color:'white' },
  calendarBadges: { flexDirection:'row', gap:2, marginTop:2 },
  calendarBadge: { width:12, height:12, borderRadius:6, alignItems:'center', justifyContent:'center' },
  calendarBadgeText: { fontSize:7, color:'white', fontWeight:'700' },
  calendarLegend: { flexDirection:'row', gap:16, marginTop:10, justifyContent:'center' },



  zoneDistSection: { backgroundColor:'white', borderRadius:12, padding:10, marginBottom:8 },
  sectionHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:12 },
  dataTabRow: { flexDirection:'row', backgroundColor:'#F5F5F5', borderRadius:10, padding:3, marginBottom:12, gap:3 },
  dataTab: { flex:1, paddingVertical:7, borderRadius:8, alignItems:'center' },
  dataTabActive: { backgroundColor:'white' },
  dataTabText: { fontSize:12, color:'#555', fontWeight:'500' },
  dataTabTextActive: { color:'#333', fontWeight:'600' },
  zoneDistBars: { gap:10 },
  zoneDistRow: { flexDirection:'row', alignItems:'center', gap:8 },
  zoneDistDot: { width:12, height:12, borderRadius:6, flexShrink:0 },
  zoneDistLabel: { fontSize:12, color:'#333', width:50 },
  zoneDistBarBg: { flex:1, height:10, backgroundColor:'#F0F0F0', borderRadius:5, overflow:'hidden' },
  zoneDistBar: { height:10, borderRadius:5 },
  zoneDistPct: { fontSize:12, fontWeight:'600', color:'#333', width:35, textAlign:'right' },
  zoneDistCount: { fontSize:10, color:'#888', width:28 },

  stratSourceLabel: { fontSize:12, fontWeight:'600', color:'#888', marginBottom:8, marginTop:8 },
  strategyRow: { flexDirection:'row', alignItems:'center', backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginBottom:6, gap:10 },
  strategyInfo: { flex:1 },

  strategyDesc: { fontSize:11, color:'#888', marginTop:2 },
  shareToggleBtn: { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:8, paddingVertical:5, borderRadius:8, backgroundColor:'#F0F0F0' },
  shareToggleBtnActive: { backgroundColor:'#4CAF50' },
  shareToggleText: { fontSize:10, color:'#888', fontWeight:'500' },
  shareToggleTextActive: { color:'white' },
  zonePill: { paddingHorizontal:7, paddingVertical:3, borderRadius:8 },
  addStratBtn: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#5C6BC0', paddingHorizontal:10, paddingVertical:6, borderRadius:8, marginLeft:'auto' },
  addStratBtnText: { fontSize:12, color:'white', fontWeight:'600' },
  emptyStrategies: { alignItems:'center', paddingVertical:24, gap:8 },
  emptyText: { fontSize:13, color:'#999', textAlign:'center' },




  inputLabel: { fontSize:13, fontWeight:'600', color:'#555', marginBottom:6 },
  textInput: { backgroundColor:'#F5F5F5', borderRadius:10, padding:12, fontSize:15, color:'#333', marginBottom:14 },
  sharingNotEnabled: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  sharingNotEnabledText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  sharingNotEnabledHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    textAlign: 'center',
  },
  linkedStateContainer: {
    alignItems: 'center',
    padding: 20,
  },
  linkedStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginTop: 12,
  },
  linkedStateDesc: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },
  sharingStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  sharingStatusText: {
    fontSize: 14,
    color: '#666',
  },
  unlinkStudentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    marginTop: 20,
    gap: 8,
  },
  unlinkStudentButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F44336',
  },
  // Tooltip styles
  tooltipContainer: {
    position: 'relative',
  },
  tooltip: {
    position: 'absolute',
    top: -45,
    left: '50%',
    transform: [{ translateX: -60 }],
    backgroundColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    zIndex: 100,
    minWidth: 120,
  },
  tooltipRight: {
    left: 'auto',
    right: -10,
    transform: [],
  },
  tooltipText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  tooltipArrow: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    marginLeft: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#333',
  },
  tooltipArrowRight: {
    start: 'auto',
    end: 15,
    marginStart: 0,
  },
});
