import React, { useState, useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator, TextInput, Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import {
  supportRequestsApi, SupportRequestType, StaffShortcut, SupportRequest,
  zoneLogsApi, formatSupportRequestStatus, formatSentLine, ColourMix, classroomsColourMixApi,
} from '../../src/utils/api';
import { useSupportRequestsList } from '../../src/utils/supportRequestsPoller';
import { EMOTION_COLOURS, EmotionZone } from '../../src/constants/emotionColours';

const RECENTS_KEY = 'support_request_recent_staff_names';
const MAX_RECENTS = 5;
const COLOUR_ZONES: EmotionZone[] = ['blue', 'green', 'yellow', 'red'];

type Step = 'classroom' | 'student' | 'type' | 'detail' | 'status';

// Real revision Sep 11 (Jono, exact spec): reordered for a specific-student request, with
// a new first option - "Support in classroom" (support comes TO the teacher's room for
// THIS student, teacher stays with the class) - CLASSROOM_SUPPORT with student_id
// attached, distinct from the whole-class "Support to my classroom" top-row button on the
// student picker (same request_type, different meaning - see describeSupportRequest()).
const REQUEST_TYPES: { type: SupportRequestType; icon: keyof typeof MaterialIcons.glyphMap; label: string; needsTarget?: 'staff' | 'note' }[] = [
  { type: 'CLASSROOM_SUPPORT', icon: 'meeting-room', label: 'Support in classroom' },
  { type: 'BACK_ON_TRACK', icon: 'self-improvement', label: "Student to 'Back on Track' Space" },
  { type: 'STAFF_MEMBER', icon: 'person-search', label: 'Student to a staff member', needsTarget: 'staff' },
  { type: 'INCIDENT', icon: 'warning', label: 'Incident — urgent' },
  { type: 'OTHER', icon: 'more-horiz', label: 'Other', needsTarget: 'note' },
];

// Real feature Sep 10 (build 27): teacher-side entry point for the Support Request
// "buzz" system. Mirrors bulk-checkin.tsx's classroom -> student picker structure and
// styling exactly (same header/row-card/success-screen conventions) rather than
// inventing a new pattern. Ordering follows the brief precisely: classroom/student
// first, then request type - CLASSROOM_SUPPORT is reached via "Whole classroom" on the
// student step (schema-consistent: that type carries no student_id at all), every other
// type requires picking a real student first.
export default function SupportRequestScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { classrooms, students, t } = useApp();
  // Real addition Sep 10 (dashboard pending banner): tapping the banner reopens THIS
  // specific request's live status, deep-linked via ?viewId= rather than a new screen -
  // reuses the exact same status step/polling this screen already has.
  const { viewId } = useLocalSearchParams<{ viewId?: string }>();
  const [viewLoading, setViewLoading] = useState(!!viewId);

  const [step, setStep] = useState<Step>('classroom');
  const [classroomId, setClassroomId] = useState('');
  const [classroomName, setClassroomName] = useState('');
  const [studentId, setStudentId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState('');
  const [requestType, setRequestType] = useState<SupportRequestType | null>(null);
  const [targetText, setTargetText] = useState('');
  const [recents, setRecents] = useState<string[]>([]);
  const [shortcuts, setShortcuts] = useState<StaffShortcut[]>([]);
  const [saving, setSaving] = useState(false);
  // Design change 6 (Sep 10): optional colour circles on the individual-student step only -
  // CLASSROOM_SUPPORT never gets one (Jono: a class-level colour would create false
  // check-ins for regulated students). Selected colour writes a REAL check-in at submit
  // time; skipped falls back to the existing auto-attach-latest-checkin behaviour.
  const [studentColours, setStudentColours] = useState<Record<string, EmotionZone>>({});
  const [sentRequest, setSentRequest] = useState<SupportRequest | null>(null);
  const [markingArrived, setMarkingArrived] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Item 5 (Sep 11): brief tap-highlight on a student row before advancing.
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // Item 8 (Sep 11): today's classroom colour mix, shown as small dots on "Support to my
  // classroom" - read-only, fetched once the classroom is chosen, zero new writes.
  const [colourMix, setColourMix] = useState<ColourMix | null>(null);

  const classroomStudents = (students || [])
    .filter((s: any) => s.classroom_id === classroomId)
    .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

  useEffect(() => {
    AsyncStorage.getItem(RECENTS_KEY).then(raw => {
      if (raw) { try { setRecents(JSON.parse(raw)); } catch {} }
    });
    supportRequestsApi.getShortcuts().then(setShortcuts).catch(() => {});
  }, []);

  useEffect(() => {
    if (!viewId) return;
    supportRequestsApi.getOne(viewId).then(r => {
      setSentRequest(r);
      setStep('status');
      setViewLoading(false);
    }).catch(() => {
      setViewLoading(false);
      Alert.alert(t('error') || 'Error', 'Could not load this request');
      router.replace('/teacher/dashboard');
    });
  }, [viewId]);

  // Design change 5 (Sep 10): "Uber-request" live status - flips in place instead of the
  // screen just disappearing. Real fix Sep 11 (stop-ship): this used to run its own
  // setInterval calling getOne(id) - one more of the stacked pollers that flooded the
  // backend (a screen left mounted-but-unfocused in the nav stack kept polling forever).
  // Now derives from the ONE shared list poller (supportRequestsPoller.ts), which is
  // itself focus-gated - navigating away stops this screen's contribution immediately.
  const liveList = useSupportRequestsList(true);
  useEffect(() => {
    if (!sentRequest) return;
    const updated = liveList.find(r => r.id === sentRequest.id);
    if (updated) setSentRequest(updated);
  }, [liveList]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const display = sentRequest ? formatSupportRequestStatus(sentRequest) : null;
    if (!display?.pulse) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sentRequest?.status, sentRequest?.last_rebuzz_at]);

  const pickClassroom = (c: any) => {
    setClassroomId(c.id); setClassroomName(c.name); setStep('student');
    setColourMix(null);
    classroomsColourMixApi.getTodaysMix(c.id).then(setColourMix).catch(() => {});
  };

  const pickWholeClassroom = () => {
    setStudentId(null); setStudentName('');
    setRequestType('CLASSROOM_SUPPORT');
    setStep('detail');
  };

  // Item 7 (Sep 11): incidents are usually classroom-level - this is the fastest path in
  // the app, a second top row alongside "Support to my classroom", same skip-to-confirm
  // behaviour (the confirm screen is the accidental-tap guard for both).
  const pickWholeClassroomIncident = () => {
    setStudentId(null); setStudentName('');
    setRequestType('INCIDENT');
    setStep('detail');
  };

  // Item 5 (Sep 11): tapping a student shows a brief highlight (black border) before
  // advancing, so the tap itself is legible as "selected" rather than an instant jump.
  const pickStudent = (s: any) => {
    setSelectedStudentId(s.id);
    setTimeout(() => {
      setStudentId(s.id); setStudentName(s.name); setStep('type');
      setSelectedStudentId(null);
    }, 180);
  };

  const pickType = (type: SupportRequestType) => {
    setRequestType(type);
    const needsTarget = REQUEST_TYPES.find(r => r.type === type)?.needsTarget;
    if (needsTarget) { setTargetText(''); setStep('detail'); }
    else { handleSubmit(type, ''); }
  };

  const saveRecent = async (name: string) => {
    const next = [name, ...recents.filter(n => n !== name)].slice(0, MAX_RECENTS);
    setRecents(next);
    await AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  };

  const handleSubmit = async (typeOverride?: SupportRequestType, textOverride?: string) => {
    const finalType = typeOverride || requestType;
    const finalText = textOverride !== undefined ? textOverride : targetText;
    if (!finalType) return;
    if (finalType === 'STAFF_MEMBER' && !finalText.trim()) {
      Alert.alert(t('error') || 'Error', 'Enter a staff member name');
      return;
    }
    setSaving(true);
    try {
      // Design change 6: a selected colour writes a REAL check-in first (same endpoint,
      // path, and downstream effects - streaks/analytics/history - as any other check-in),
      // via the /feeling-logs write-through used by design change 6, and
      // create_support_request's own auto-attach then picks it up as the latest
      // feeling_log automatically - no need to also pass colour to the request itself.
      // Never let a colour-write failure block the actual request.
      const colour = studentId ? studentColours[studentId] : undefined;
      if (colour) {
        try {
          await zoneLogsApi.create({
            student_id: studentId!, zone: colour, strategies_selected: [],
            logged_by: 'teacher_individual', suppress_auto_alert: true,
            support_request_type: finalType,
          });
        } catch {}
      }
      // Real bug fix Sep 11: classroom_id was only ever sent when finalType ===
      // 'CLASSROOM_SUPPORT' - item 7's new classroom-level INCIDENT button (student_id
      // null, classroom_id set) sent NEITHER field, hitting the backend's "classroom_id
      // or student_id is required" 400 every time (confirmed live - Jono hit this exact
      // error). classroomId is always the right value regardless of type: the flow
      // always picks a classroom first, then optionally a student FROM that classroom,
      // so sending it unconditionally is correct for every path, not just this one.
      const created = await supportRequestsApi.create({
        request_type: finalType,
        student_id: studentId || undefined,
        classroom_id: classroomId || undefined,
        target_text: finalText.trim() || undefined,
      });
      if (finalType === 'STAFF_MEMBER' && finalText.trim()) {
        await saveRecent(finalText.trim());
      }
      setSentRequest(created);
      setStep('status');
    } catch (e: any) {
      // Real handling Sep 11 (one-open-request rule): same "type|payload" convention as
      // free_tier_limit elsewhere in this app - don't show a raw error for a case that's
      // actually just "you already have one open," route them to it instead.
      const msg: string = e.message || '';
      if (msg.startsWith('support_request_open|')) {
        const existingId = msg.split('|')[1];
        Alert.alert(
          'Already in progress',
          "You already have a request in progress.",
          [{ text: 'View it', onPress: async () => {
            try {
              const existing = await supportRequestsApi.getOne(existingId);
              setSentRequest(existing);
              setStep('status');
            } catch {
              router.replace('/teacher/dashboard');
            }
          } }]
        );
      } else {
        Alert.alert(t('error') || 'Error', msg || 'Could not send request');
      }
    } finally {
      setSaving(false);
    }
  };

  if (viewLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <TranslatedHeader title="Support Request" backTo="/teacher/dashboard" />
        <View style={styles.successScreen}>
          <ActivityIndicator color="#5C6BC0" />
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'status' && sentRequest) {
    const display = formatSupportRequestStatus(sentRequest);
    const who = sentRequest.student_name || studentName || sentRequest.classroom_name || classroomName || 'Classroom';
    // Real fix Sep 11: open now means genuinely still in play - CANCELLED/SUPERSEDED are
    // just as terminal as RESOLVED, the Arrived/Cancel actions make no sense on either.
    const isOpen = sentRequest.status === 'PENDING' || sentRequest.status === 'ACKNOWLEDGED';
    return (
      <SafeAreaView style={styles.container}>
        <TranslatedHeader title={who} backTo="/teacher/dashboard" />
        {/* Real fix Sep 11: this was a plain View, not scrollable - with the dot/title/
            text plus now up to three buttons (Arrived/Cancel/Back to Dashboard), a small
            screen or a long custom admin response could push Back to Dashboard below the
            visible area entirely, not just make it laggy. ScrollView guarantees it's
            always reachable regardless of content height or device size. */}
        <ScrollView contentContainerStyle={styles.statusScroll}>
          <Animated.View style={[styles.statusDot, { backgroundColor: display.color, opacity: pulseAnim }]} />
          <Text style={styles.successTitle}>{who}</Text>
          <Text style={styles.statusText}>{display.text}</Text>
          {/* Item 1 (Sep 11): so a teacher routed here (one-open-request 409) knows which
              request is active and since when. */}
          <Text style={styles.sentLine}>{formatSentLine(sentRequest.created_at)}</Text>
          {isOpen && (
            <TouchableOpacity
              style={styles.arrivedBtn}
              disabled={markingArrived || cancelling}
              onPress={async () => {
                setMarkingArrived(true);
                try {
                  const updated = await supportRequestsApi.markArrived(sentRequest.id);
                  setSentRequest(updated);
                } catch (e: any) {
                  Alert.alert(t('error') || 'Error', e.message || 'Could not update request');
                } finally {
                  setMarkingArrived(false);
                }
              }}
            >
              {markingArrived ? <ActivityIndicator color="white" /> : <Text style={styles.arrivedBtnText}>Support arrived ✓</Text>}
            </TouchableOpacity>
          )}
          {isOpen && (
            <TouchableOpacity
              style={styles.cancelBtn}
              disabled={markingArrived || cancelling}
              onPress={() => Alert.alert(
                'Cancel request?',
                "This stops the buzzing and closes it - the admin will be told it's no longer needed.",
                [
                  { text: 'Keep it', style: 'cancel' },
                  { text: 'Cancel request', style: 'destructive', onPress: async () => {
                    setCancelling(true);
                    try {
                      const updated = await supportRequestsApi.cancel(sentRequest.id);
                      setSentRequest(updated);
                    } catch (e: any) {
                      Alert.alert(t('error') || 'Error', e.message || 'Could not cancel request');
                    } finally {
                      setCancelling(false);
                    }
                  } },
                ]
              )}
            >
              {cancelling ? <ActivityIndicator color="#999" /> : <Text style={styles.cancelBtnText}>Cancel request</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.backToDashboardBtn} onPress={() => router.replace('/teacher/dashboard')}>
            <Text style={styles.backToDashboardText}>Back to Dashboard</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'classroom') {
    return (
      <SafeAreaView style={styles.container}>
        <TranslatedHeader title="🔔 Support Request" backTo="/teacher/dashboard" />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <Text style={styles.stepSubtitle}>Select a classroom</Text>
          {(classrooms || []).length === 0 ? (
            <View style={styles.empty}>
              <MaterialIcons name="school" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No classrooms yet</Text>
            </View>
          ) : (classrooms || []).map((c: any) => (
            <TouchableOpacity key={c.id} style={styles.rowCard} onPress={() => pickClassroom(c)}>
              <MaterialIcons name="school" size={24} color="#5C6BC0" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{c.name}</Text>
                <Text style={styles.rowSub}>{(students || []).filter((s: any) => s.classroom_id === c.id).length} students</Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'student') {
    return (
      <SafeAreaView style={styles.container}>
        <TranslatedHeader title={classroomName} onBackPress={() => setStep('classroom')} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Text style={styles.stepSubtitle}>Select a student, or the whole classroom</Text>
          <TouchableOpacity style={[styles.rowCard, styles.wholeClassCard]} onPress={pickWholeClassroom}>
            <MaterialIcons name="groups" size={24} color="#5C6BC0" />
            <View style={{ flex: 1 }}>
              <Text style={styles.wholeClassTitle}>Support to my classroom</Text>
              <Text style={styles.rowSub}>No specific student — support for the whole class</Text>
              {/* Item 8 (Sep 11): today's colour mix, ambient context only - no colour
                  step, no extra tap. Dot size reflects relative count, not exact numbers. */}
              {colourMix && (colourMix.blue + colourMix.green + colourMix.yellow + colourMix.red) > 0 && (
                <View style={styles.colourMixRow}>
                  {COLOUR_ZONES.filter(z => colourMix[z] > 0).map(zone => (
                    <View
                      key={zone}
                      style={{
                        width: 8 + Math.min(colourMix[zone], 5) * 2,
                        height: 8 + Math.min(colourMix[zone], 5) * 2,
                        borderRadius: 999,
                        backgroundColor: EMOTION_COLOURS[zone],
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>
          {/* Item 7 (Sep 11): incidents are usually classroom-level - fastest path in the
              app, second top row alongside "Support to my classroom", same skip-to-confirm. */}
          <TouchableOpacity style={[styles.rowCard, styles.incidentCard]} onPress={pickWholeClassroomIncident}>
            <MaterialIcons name="warning" size={24} color="#F44336" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, styles.incidentText]}>🚨 Incident — urgent</Text>
              <Text style={styles.rowSub}>Classroom-level, immediate</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#999" />
          </TouchableOpacity>
          {classroomStudents.map((s: any) => (
            <View key={s.id} style={[styles.rowCard, selectedStudentId === s.id && styles.rowCardSelected]}>
              <TouchableOpacity style={styles.rowMainTap} onPress={() => pickStudent(s)}>
                <Avatar type={s.avatar_type || 'preset'} preset={s.avatar_preset} custom={s.avatar_custom} size={36} />
                <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{s.name}</Text>
              </TouchableOpacity>
              {/* Item 6 (Sep 11, confirmed unchanged): tapping a colour circle only
                  selects it - it never advances/submits. Only the row's own tap (above)
                  or its arrow proceeds. */}
              <View style={styles.colourCircleRow}>
                {COLOUR_ZONES.map(zone => (
                  <TouchableOpacity
                    key={zone}
                    onPress={() => setStudentColours(prev => ({
                      ...prev, [s.id]: prev[s.id] === zone ? (undefined as any) : zone,
                    }))}
                    style={[
                      styles.colourCircle,
                      { backgroundColor: EMOTION_COLOURS[zone] },
                      studentColours[s.id] === zone && styles.colourCircleSelected,
                    ]}
                  />
                ))}
              </View>
              <TouchableOpacity onPress={() => pickStudent(s)} style={styles.rowArrowBtn}>
                <MaterialIcons name="chevron-right" size={20} color="#999" />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'type') {
    return (
      <SafeAreaView style={styles.container}>
        <TranslatedHeader title={studentName} onBackPress={() => setStep('student')} />
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
          <Text style={styles.stepSubtitle}>What's needed?</Text>
          {REQUEST_TYPES.map(rt => (
            <TouchableOpacity
              key={rt.type}
              style={[styles.rowCard, rt.type === 'INCIDENT' && styles.incidentCard]}
              onPress={() => pickType(rt.type)}
            >
              <MaterialIcons name={rt.icon} size={24} color={rt.type === 'INCIDENT' ? '#F44336' : '#5C6BC0'} />
              <Text style={[styles.rowTitle, { flex: 1 }, rt.type === 'INCIDENT' && styles.incidentText]}>{rt.label}</Text>
              <MaterialIcons name="chevron-right" size={20} color="#999" />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // step === 'detail'
  const needsStaffPicker = requestType === 'STAFF_MEMBER';
  const isClassroomSupport = requestType === 'CLASSROOM_SUPPORT' && !studentId;
  // Item 7 (Sep 11): the new classroom-level incident top row also lands here (skip-to-
  // confirm, same as its sibling) - needs its own urgent-styled confirm, not the calm
  // "someone will come to help" text, and no staff/note input.
  const isClassroomIncident = requestType === 'INCIDENT' && !studentId;
  const isClassroomLevel = isClassroomSupport || isClassroomIncident;
  return (
    <SafeAreaView style={styles.container}>
      <TranslatedHeader
        title={isClassroomLevel ? 'Whole classroom' : studentName}
        onBackPress={() => setStep(isClassroomLevel ? 'student' : 'type')}
      />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {isClassroomIncident ? (
          <Text style={[styles.rowSub, styles.incidentText]}>🚨 Immediate support needed in {classroomName}.</Text>
        ) : isClassroomSupport ? (
          <Text style={styles.rowSub}>Someone will come to {classroomName} to help.</Text>
        ) : needsStaffPicker ? (
          <>
            <Text style={styles.sectionLabel}>Who?</Text>
            {(recents.length > 0 || shortcuts.length > 0) && (
              <View style={styles.chipRow}>
                {shortcuts.map(sc => (
                  <TouchableOpacity key={sc.id} style={styles.chip} onPress={() => setTargetText(sc.name)}>
                    <Text style={styles.chipText}>{sc.name}</Text>
                  </TouchableOpacity>
                ))}
                {recents.filter(r => !shortcuts.some(sc => sc.name === r)).map(name => (
                  <TouchableOpacity key={name} style={styles.chip} onPress={() => setTargetText(name)}>
                    <Text style={styles.chipText}>🕓 {name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder="Staff member's name"
              value={targetText}
              onChangeText={setTargetText}
            />
          </>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Note (optional)</Text>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="What's needed?"
              value={targetText}
              onChangeText={setTargetText}
              multiline
            />
          </>
        )}
        <TouchableOpacity
          style={[styles.bottomSubmit, isClassroomIncident && styles.bottomSubmitIncident]}
          onPress={() => handleSubmit()}
          disabled={saving}
        >
          {saving ? <ActivityIndicator color="white" /> : <Text style={styles.bottomSubmitText}>Send Request</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  // Real fix Sep 11 (UI consistency): the hand-rolled header (backBtn/headerCenter/
  // headerTitle/headerSub) is gone - every step now uses the shared TranslatedHeader
  // (logo, standard back affordance) like every other teacher screen. stepSubtitle
  // replaces headerSub as ordinary content just below the header, not part of it.
  stepSubtitle: { fontSize: 12, color: '#888', marginBottom: 2 },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'white', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E0E0E0',
  },
  // Real fix Sep 10 (Jono's placement call): relabelled from "Whole classroom" to the
  // action itself ("Support to my classroom") - a stressed teacher scans for the words
  // of the request they're making, not a selection label. Border strengthened (was tint
  // only) so it reads as visually distinct from the student rows below, not just another
  // list item with a different background.
  wholeClassCard: { backgroundColor: '#EEF1FB', borderColor: '#5C6BC0', borderWidth: 1.5 },
  wholeClassTitle: { fontSize: 15, fontWeight: '800', color: '#333' },
  incidentCard: { borderColor: '#F44336', borderWidth: 1.5 },
  incidentText: { color: '#F44336', fontWeight: '800' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: '#333' },
  rowSub: { fontSize: 12, color: '#888', marginTop: 2 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#555' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  chip: { backgroundColor: '#EEF1FB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 13, fontWeight: '600', color: '#5C6BC0' },
  input: {
    backgroundColor: 'white', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0',
    padding: 12, fontSize: 15, color: '#333',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  bottomSubmit: { backgroundColor: '#4CAF50', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 12 },
  bottomSubmitIncident: { backgroundColor: '#F44336' },
  bottomSubmitText: { color: 'white', fontWeight: '700', fontSize: 16 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12, textAlign: 'center' },
  successScreen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  // ScrollView contentContainerStyle needs flexGrow (not flex) to both center short
  // content AND allow scrolling past the viewport when content is taller than the screen.
  statusScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successTitle: { fontSize: 24, fontWeight: '700', color: '#333', marginTop: 16, textAlign: 'center' },
  successSub: { fontSize: 14, color: '#888', marginTop: 8 },
  colourCircleRow: { flexDirection: 'row', gap: 6 },
  colourCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  colourCircleSelected: { borderColor: '#333' },
  colourMixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
  rowArrowBtn: { padding: 4 },
  // Item 5 (Sep 11): tapping a student row highlights it (black border) before advancing.
  rowMainTap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowCardSelected: { borderColor: '#333', borderWidth: 1.5 },
  statusDot: { width: 22, height: 22, borderRadius: 11, marginBottom: 8 },
  statusText: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 4, textAlign: 'center' },
  sentLine: { fontSize: 12, color: '#999', marginTop: 6, textAlign: 'center' },
  arrivedBtn: {
    marginTop: 28, backgroundColor: EMOTION_COLOURS.green, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28, minWidth: 200, alignItems: 'center',
  },
  arrivedBtnText: { color: 'white', fontWeight: '700', fontSize: 15 },
  cancelBtn: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 20 },
  cancelBtnText: { color: '#999', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },
  backToDashboardBtn: {
    marginTop: 14, backgroundColor: '#5C6BC0', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28,
  },
  backToDashboardText: { color: 'white', fontWeight: '700', fontSize: 15 },
});
