import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable, ScrollView, Image, Alert, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../src/context/AppContext';
import { ZONE_FACES } from '../src/components/ZoneButton';
import { EMOTION_COLOURS } from '../src/constants/emotionColours';
import { getZoneWords, ZoneColour } from '../src/constants/zoneWords';

// Root cause: no existing local feature-flag constant pattern anywhere in this codebase
// (checked repo-wide) - the closest thing, server-side allowed_by_superadmin/enabled_by_school
// toggles, is a per-school DB-driven system, not appropriate for a single-device cosmetic
// toggle. A plain exported boolean, checked once at render, is the simplest thing that
// actually satisfies "flip it off, the screen behaves exactly as it did before this feature
// existed" - when false, none of the press-hold state/handlers/render branches below even run.
export const HOME_EMOJI_INTERACTION_ENABLED = true;

const WORD_CYCLE_MS = 1800;

// 2nd correction Sep 27: the earlier fix replayed EmotionColourLoader (the in-app loading
// spinner, code-driven, no asset file) - reasonable given no GIF existed in the repo at the
// time, but not what was actually being asked for. Jono supplied the real file
// (~/Desktop/coh-logo.gif, verified: genuine animated GIF89a, 37 frames, 300x300, not a
// static image saved with a .gif extension) - copied to assets/images/coh-logo.gif (same
// folder as every other logo/splash asset). No colour-shift/tint is applied: RN's only
// runtime recolour mechanic is Image's `tintColor`, which flattens every non-transparent
// pixel to one flat colour - correct for a silhouette, but would turn this multi-coloured
// photographic-style GIF into a solid colour blob, not a "fun variant" (no colour-matrix/
// hue-shift library is installed, and adding one for a cosmetic tap easter egg isn't
// justified) - so it plays in its real original colours, per Jono's own explicit fallback.
// Duration measured directly from the file's own frame delays (Python/Pillow: 37 frames,
// sum of per-frame `duration` = 3040ms) rather than guessed - one full pass, then hidden,
// since the file's own loop metadata is 0 (loop forever) and would otherwise repeat.
const EGG_DURATION_MS = 3040;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading, isAuthenticated, user, login, t, language, hasActiveSubscription } = useApp();

  // ── Logo easter egg (Sep 27, purely cosmetic) ──────────────────────────────
  // Real feature: tapping the logo replays the app's real EmotionColourLoader component (see
  // EGG_DURATION_MS/EASTER_EGG_PALETTE comment above) for one full pass, recoloured, then stops
  // - not a real loading state, and not a separate bespoke animation.
  const [eggPlaying, setEggPlaying] = useState(false);
  const eggTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLogoTap = () => {
    // "Tapping again while mid-animation should either restart cleanly or be ignored" - ignored
    // here (simplest way to guarantee zero stacking/glitching: a second tap while `eggPlaying`
    // is true is a no-op, the current play-through just finishes on its own).
    if (eggPlaying) return;
    setEggPlaying(true);
    if (eggTimeoutRef.current) clearTimeout(eggTimeoutRef.current);
    eggTimeoutRef.current = setTimeout(() => setEggPlaying(false), EGG_DURATION_MS);
  };
  useEffect(() => () => { if (eggTimeoutRef.current) clearTimeout(eggTimeoutRef.current); }, []);

  // ── Mood-emoji press-and-hold (Sep 27, build 27) ───────────────────────────
  const zoneOrder: ZoneColour[] = ['blue', 'green', 'yellow', 'red'];
  const zoneWords = getZoneWords(t);
  const [heldZone, setHeldZone] = useState<ZoneColour | null>(null);
  const [wordIdx, setWordIdx] = useState(0);
  // One Animated.Value per emoji for scale + opacity (focus/dim effect), plus one shared
  // crossfade value for the word swap and one breathing-pulse value while a word is showing.
  const zoneScale = useRef(zoneOrder.reduce((acc, z) => ({ ...acc, [z]: new Animated.Value(1) }), {} as Record<ZoneColour, Animated.Value>)).current;
  const zoneOpacity = useRef(zoneOrder.reduce((acc, z) => ({ ...acc, [z]: new Animated.Value(1) }), {} as Record<ZoneColour, Animated.Value>)).current;
  const wordFade = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(1)).current;
  const cycleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breatheLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  // Tracks the current word index for the setInterval closure below - React state
  // (wordIdx) would be stale inside that closure since the interval is only created once
  // per hold, not re-created every render.
  const wordIdxRef = useRef(0);

  const resetZoneVisuals = () => {
    Animated.parallel(
      zoneOrder.flatMap(z => [
        Animated.spring(zoneScale[z], { toValue: 1, useNativeDriver: true, friction: 6 }),
        Animated.timing(zoneOpacity[z], { toValue: 1, duration: 250, useNativeDriver: true }),
      ])
    ).start();
  };

  const stopMoodHold = () => {
    if (cycleIntervalRef.current) { clearInterval(cycleIntervalRef.current); cycleIntervalRef.current = null; }
    if (breatheLoopRef.current) { breatheLoopRef.current.stop(); breatheLoopRef.current = null; }
    breathe.setValue(1);
    resetZoneVisuals();
    setHeldZone(null);
  };
  // Unmount safety - never leaves a live interval/loop behind.
  useEffect(() => () => stopMoodHold(), []);

  const showWord = (idx: number) => {
    wordIdxRef.current = idx;
    wordFade.setValue(0);
    Animated.timing(wordFade, { toValue: 1, duration: 250, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    setWordIdx(idx);
  };

  const startMoodHold = (zone: ZoneColour) => {
    if (!HOME_EMOJI_INTERACTION_ENABLED) return;
    // If a previous hold's release animation/cleanup hadn't fully settled, starting fresh here
    // is safe - stopMoodHold below is idempotent (clearInterval/stop on already-cleared refs
    // are no-ops) and every Animated call sets its own starting value first.
    setHeldZone(zone);
    Animated.parallel(
      zoneOrder.flatMap(z => z === zone
        ? [Animated.spring(zoneScale[z], { toValue: 1.35, useNativeDriver: true, friction: 5 })]
        : [
            Animated.spring(zoneScale[z], { toValue: 0.85, useNativeDriver: true, friction: 6 }),
            Animated.timing(zoneOpacity[z], { toValue: 0.35, duration: 250, useNativeDriver: true }),
          ]
      )
    ).start();
    showWord(0);
    if (cycleIntervalRef.current) clearInterval(cycleIntervalRef.current);
    cycleIntervalRef.current = setInterval(() => {
      showWord((wordIdxRef.current + 1) % zoneWords[zone].length);
    }, WORD_CYCLE_MS);
    breathe.setValue(1);
    breatheLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.55, duration: WORD_CYCLE_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: WORD_CYCLE_MS / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    breatheLoopRef.current.start();
  };

  // Real bug fix Aug 28 (item 5): a parent account is genuinely on a lower-tier plan than
  // teacher (confirmed in server.py's SUBSCRIPTION_PLANS: parent_monthly is priced below
  // teacher_monthly) and has no real access to Teacher Dashboard - teacher/dashboard.tsx's
  // own guard already correctly blocks it, this just makes that visible before the tap
  // instead of after a confusing silent redirect.
  const teacherLocked = isAuthenticated && user?.role === 'parent';
  // Real fix Sep 15 (Marisa build-26, S02): Free Trial moves from a bordered button to a
  // small dismissible line at the bottom - local-state-only dismiss (reappears next visit),
  // same established pattern as the freemium notice banner elsewhere in the app.
  const [trialDismissed, setTrialDismissed] = React.useState(false);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.loadingContainer}>
          <Text style={styles.appTitle} allowFontScaling={false}>Class of Happiness</Text>
          <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Real fix Sep 15 (Marisa build-26, S02): small top-right Login removed - it becomes
            a large, full-width button further down the page instead (see below). */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => router.push('/settings')}>
            <MaterialIcons name="settings" size={24} color="#CCC" />
          </TouchableOpacity>
        </View>

        {/* Logo — tappable easter egg, purely cosmetic, see handleLogoTap's own comment */}
        <Pressable onPress={handleLogoTap} style={styles.logoContainer} hitSlop={{top:8,bottom:8,left:8,right:8}}>
          <Image source={require('../assets/images/logo_coh.png')} style={styles.mainLogo} resizeMode="contain" />
          {eggPlaying && (
            // key=eggPlaying's mount identity: this whole subtree is unmounted (by the
            // `eggPlaying &&` guard) the instant EGG_DURATION_MS elapses, then freshly
            // remounted on the next tap - RN's native GIF decoder always starts an animated
            // Image at frame 0 on mount, so no manual reset/seek logic is needed to guarantee
            // "restart cleanly" on the next play.
            <View pointerEvents="none" style={styles.eggOverlay}>
              <Image
                source={require('../assets/images/coh-logo.gif')}
                style={{ width: 96, height: 96 }}
                resizeMode="contain"
              />
            </View>
          )}
        </Pressable>

        {/* Subtitle */}
        <Text style={styles.subtitle} allowFontScaling={false}>{t('how_are_you_feeling') || 'How are you feeling today?'}</Text>

        {/* Zone emoji faces — decorative, sets the tone. Press-and-hold (build 27, live
            feedback): fully gated on HOME_EMOJI_INTERACTION_ENABLED - when false, this renders
            (and behaves) exactly as the plain decorative row it always was, Pressable's onPress
            handlers simply never firing anything beyond their default no-op. */}
        <View style={styles.zonePreviewRow}>
          {zoneOrder.map((zone) => {
            const face = ZONE_FACES[zone];
            const color = EMOTION_COLOURS[zone];
            return (
              <Pressable
                key={zone}
                disabled={!HOME_EMOJI_INTERACTION_ENABLED}
                onPressIn={() => startMoodHold(zone)}
                onPressOut={stopMoodHold}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <Animated.View
                  style={[
                    styles.zoneFaceContainer,
                    { backgroundColor: color },
                    HOME_EMOJI_INTERACTION_ENABLED && { transform: [{ scale: zoneScale[zone] }], opacity: zoneOpacity[zone] },
                  ]}
                >
                  <Text style={styles.zoneFace}>{face}</Text>
                </Animated.View>
              </Pressable>
            );
          })}
        </View>

        {/* Held-word display - reserves its height even when nothing is held, so the layout
            below never jumps/shifts as a hold starts or ends. */}
        {HOME_EMOJI_INTERACTION_ENABLED && (
          <View style={styles.moodWordSlot}>
            {heldZone && (
              <Animated.View style={{ opacity: Animated.multiply(wordFade, breathe), flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 22 }}>{zoneWords[heldZone][wordIdx]?.emoji}</Text>
                {/* Root cause fix (German/Russian/Arabic length check, this feature): a fixed
                    fontSize clipped/wrapped the longest real translations (e.g. German "Sehr
                    Aufgebracht", Russian "Сосредоточенность", both 16-17 chars) - same
                    adjustsFontSizeToFit + minimumFontScale + numberOfLines={1} pattern already
                    used on this exact screen's own Teacher/Parent subtitles for the same reason. */}
                <Text
                  style={styles.moodWordText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >
                  {zoneWords[heldZone][wordIdx]?.label}
                </Text>
              </Animated.View>
            )}
          </View>
        )}
        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, marginBottom:16}}>
          <Text style={{fontSize:12, fontStyle:'italic', color:'#000', fontWeight:'400'}}>{t('select_below_to_begin') || 'Select below to begin'}</Text>
          <Text style={{fontSize:13, color:'#000'}}>↓</Text>
        </View>

        {/* STUDENT — hero button, much bigger */}
        <TouchableOpacity
          style={styles.studentButton}
          onPress={() => router.push('/student/select')}
          activeOpacity={0.85}
        >
          <MaterialIcons name="child-care" size={44} color="white" />
          <View style={styles.studentButtonText}>
            <Text style={styles.studentButtonTitle} allowFontScaling={false}>{t('student') || 'Student'}</Text>
            <Text style={styles.studentButtonSub} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{t('check_in_feelings') || 'Check in my feelings'}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>

        {/* Teacher + Parent — smaller, side by side */}
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleButton, styles.teacherButton, teacherLocked && styles.roleButtonLocked]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              // Real bug fix Aug 28 (item 5): a parent account tapping this previously
              // navigated straight to /teacher/dashboard, which then silently redirected to
              // /parent/dashboard (the guard was working correctly - see teacher/dashboard.tsx)
              // - but from the user's side that just looks like the button did something
              // confusing rather than clearly communicating "not available on your account".
              // Now locked and explained up front instead, matching the existing
              // not-logged-in lock treatment, extended to "logged in as the wrong role".
              // Real feature Aug 29 (item 7, product decision): the lock itself stays exactly
              // as-is - a parent must still never functionally reach Teacher Dashboard,
              // including on a shared device where a child could tap it. Only the messaging
              // changed, from a flat "this isn't available" dead end to a real upgrade
              // invitation with an actual next step - same "Not Now"/"See Plans" pattern
              // already used for locked resources (resources.tsx's own Subscribe alert).
              if (teacherLocked) {
                Alert.alert(
                  t('teacher_dashboard_locked_title') || 'Teacher Dashboard',
                  t('teacher_dashboard_locked_desc') || 'Teacher features require a Teacher subscription - tap to learn more.',
                  [
                    { text: t('not_now') || 'Not Now', style: 'cancel' },
                    { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
                  ]
                );
                return;
              }
              router.push('/teacher/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="school" size={26} color="white" />
            <View style={{alignItems:'center'}}>
              <Text style={styles.roleButtonTitle}>{t('teacher') || 'Teacher'}</Text>
              <Text
                style={{fontSize:10, color:'#1A1A2E', fontStyle:'italic', fontWeight:'600', textAlign:'center', marginTop:1, lineHeight:14, opacity:0.95}}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >{t('teacher_dashboard_subtitle') || 'Teachers Dashboard - support your students here'}</Text>
            </View>
            {(!isAuthenticated || teacherLocked) && <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleButton, styles.parentButton]}
            onPress={() => {
              if (!isAuthenticated) { login(); return; }
              router.push('/parent/dashboard');
            }}
            activeOpacity={0.85}
          >
            <MaterialIcons name="family-restroom" size={26} color="white" />
            <View style={{alignItems:'center'}}>
              <Text style={styles.roleButtonTitle}>{t('parent') || 'Parent'}</Text>
              <Text
                style={{fontSize:10, color:'#1A1A2E', fontStyle:'italic', fontWeight:'600', textAlign:'center', marginTop:1, lineHeight:14, opacity:0.95}}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >{t('family_dashboard_subtitle') || 'Family Dashboard - support your family here'}</Text>
            </View>
            {!isAuthenticated && <MaterialIcons name="lock" size={14} color="rgba(255,255,255,0.7)" />}
          </TouchableOpacity>
        </View>

        {/* Real fix Sep 15 (Marisa build-26, S02): large, full-width Login - takes over the
            position the old Free Trial button used to occupy, replacing the small top-right
            one that was easy to miss. */}
        {!isAuthenticated && (
          <TouchableOpacity style={styles.loginButtonLarge} onPress={login} activeOpacity={0.85}>
            <MaterialIcons name="login" size={22} color="white" />
            <Text style={styles.loginButtonLargeText}>{t('login') || 'Login'}</Text>
          </TouchableOpacity>
        )}

        {/* Footer */}
        <View style={styles.footerSection}>
          {/* Real fix Sep 15 (Marisa build-26, S02): Free Trial demoted from a bordered
              button to a small dismissible line here at the bottom. */}
          {!isAuthenticated && !trialDismissed && (
            <View style={styles.trialLine}>
              <TouchableOpacity style={styles.trialLineText} onPress={login}>
                <MaterialIcons name="card-giftcard" size={13} color="#4CAF50" />
                <Text style={styles.trialLineTextLabel}>{t('trial') || 'Free Trial'} - {t('trial_desc') || 'No credit card needed'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setTrialDismissed(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <MaterialIcons name="close" size={14} color="#BBB" />
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.copyrightText}>© 2026 Class of Happiness</Text>
          <TouchableOpacity style={styles.aboutButton} onPress={() => router.push('/about' as any)}>
            <MaterialIcons name="info-outline" size={14} color="#CCC" />
            <Text style={styles.aboutButtonText}>{t('about_privacy') || 'About & Privacy'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24, flexGrow: 1, justifyContent: 'center' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  appTitle: { fontSize: 28, fontWeight: 'bold', color: '#5C6BC0' },
  loadingText: { fontSize: 18, color: '#666', marginTop: 20 },

  topBar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4, marginBottom: 4 },
  topBarBtn: { padding: 8 },

  logoContainer: { alignItems: 'center', marginBottom: 12, marginTop: 0 },
  mainLogo: { width: 140, height: 150 },
  // Centred over the logo - RN Views default to position:'relative', so this absolute child
  // anchors to logoContainer without needing an explicit position style there. Offset is half
  // the GIF's rendered 96x96 size (see the Image style at its render site).
  eggOverlay: { position: 'absolute', top: '50%', left: '50%', marginTop: -48, marginLeft: -48, alignItems: 'center', justifyContent: 'center' },

  subtitle: { fontSize: 16, color: '#333', textAlign: 'center', marginBottom: 14, fontWeight: '500' },

  // Root cause fix (flag-off parity check): this used to be marginBottom:14 before the
  // press-hold feature - reduced to 6 so the new moodWordSlot's OWN spacing (below) wouldn't
  // double up, but that meant flag-off (moodWordSlot never rendered at all) ended up with 8px
  // LESS space here than the screen had before this feature existed. Kept at the original 14
  // unconditionally; moodWordSlot's own marginBottom is what changes total spacing when a word
  // is actually showing, not this row's.
  zonePreviewRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 14 },
  zoneFaceContainer: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  zoneFace: { fontSize: 22 },
  zoneTip: { fontSize: 12, color: '#555', textAlign: 'center', marginBottom: 28 },
  // Reserves height whether or not a word is currently showing, so the rest of the page never
  // shifts as a hold starts/ends.
  moodWordSlot: { height: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  moodWordText: { fontSize: 15, fontWeight: '700', color: '#333', maxWidth: 220 },

  // Student — hero button
  studentButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', borderRadius: 22, paddingVertical: 20, paddingHorizontal: 20, marginBottom: 10 },
  studentButtonText: { flex: 1, marginLeft: 14 },
  studentButtonTitle: { fontSize: 26, fontWeight: '900', color: '#1A1A2E' },
  studentButtonSub: { fontSize: 13, color: '#1A1A2E', marginTop: 2, fontStyle: 'italic', fontWeight: '600', opacity: 0.95 },

  // Teacher + Parent — side by side smaller
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 0, marginTop: 0 },
  // Real fix Sep 24 (device report): paddingHorizontal moved here from a Parent-only
  // override (see git blame) - Italian/German/Portuguese/French subtitles all run
  // noticeably longer than the English text that override was tuned against, and Teacher
  // never got any horizontal padding at all, so its subtitle crowded the button edges in
  // those languages even though Parent's (with its own fix) looked fine. Both buttons now
  // get identical breathing room regardless of which one's translated text is longest for
  // a given language, instead of a fix that only ever covered whichever button happened to
  // be reported at the time.
  roleButton: { flex: 1, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  teacherButton: { backgroundColor: '#FFC107', elevation: 0 },
  parentButton: { backgroundColor: '#4A90D9', elevation: 0 },
  // Real feature Aug 28 (item 5): visually lighter/disabled treatment for a button that's
  // genuinely unavailable on the current account, distinct from the normal not-yet-tapped
  // state - opacity alone (rather than a colour swap) keeps it recognisably the same button,
  // just clearly inactive.
  roleButtonLocked: { opacity: 0.45 },
  roleButtonTitle: { fontSize: 17, fontWeight: '900', color: '#1A1A2E' },

  // Real fix Sep 15 (Marisa build-26, S02): large full-width Login, takes over the position
  // the old small bordered Free Trial button used to occupy. Round 2: background changed
  // from indigo to black - highest-contrast option against the page, and visually distinct
  // from the green/yellow/blue role buttons (Login = "I have an account" vs those three =
  // "start here").
  loginButtonLarge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1A1A2E', borderRadius: 18, paddingVertical: 16, gap: 10, marginTop: 12 },
  loginButtonLargeText: { fontSize: 18, fontWeight: '800', color: 'white' },

  // Real fix Sep 15 (Marisa build-26, S02): Free Trial demoted to a small dismissible line
  // at the bottom, above the footer.
  trialLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 10 },
  trialLineText: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trialLineTextLabel: { fontSize: 12, fontWeight: '600', color: '#4CAF50' },

  footerSection: { alignItems: 'center', paddingTop: 24, marginTop: 'auto' },
  copyrightText: { fontSize: 11, color: '#CCC' },
  aboutButton: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
  aboutButtonText: { fontSize: 12, color: '#CCC' },
});
