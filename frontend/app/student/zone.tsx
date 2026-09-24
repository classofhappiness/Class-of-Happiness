import React, { useLayoutEffect, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';
import { loadVoiceEnabled, loadVoiceManifest, playVoiceClip, playPhraseFromPool, preloadZoneAudio } from '../../src/utils/voiceClips';
import { VoiceToggleButton } from '../../src/components/VoiceToggleButton';

const getColourInfo = (t: (key: string) => string) => ({
  blue: {
    color: '#5DADE2',
    emoji: '😔',
    title: t('blue_feelings') || 'Blue Feelings',
    feeling: t('blue_feeling') || 'Quiet Energy',
    words: [
      { label: t('tired') || 'Tired', emoji: '😴' },
      { label: t('sad') || 'Sad', emoji: '😢' },
      { label: t('bored') || 'Bored', emoji: '😑' },
      { label: t('lonely') || 'Lonely', emoji: '🥺' },
    ],
    description: t('blue_description') || 'Your body is moving slowly. You might feel tired, sad or need some rest.',
  },
  green: {
    color: '#58D68D',
    emoji: '😊',
    title: t('green_feelings') || 'Green Feelings',
    feeling: t('green_feeling') || 'Balanced Energy',
    words: [
      { label: t('calm') || 'Calm', emoji: '😌' },
      { label: t('happy') || 'Happy', emoji: '😄' },
      { label: t('focused') || 'Focused', emoji: '🎯' },
      { label: t('ready_to_learn') || 'Ready', emoji: '🌟' },
    ],
    description: t('green_description') || 'You feel calm, happy and ready. This is a great feeling!',
  },
  yellow: {
    color: '#F4D03F',
    emoji: '😬',
    title: t('yellow_feelings') || 'Yellow Feelings',
    feeling: t('yellow_feeling') || 'Fizzing Energy',
    words: [
      { label: t('silly') || 'Silly', emoji: '🤪' },
      { label: t('nervous') || 'Nervous', emoji: '😰' },
      { label: t('frustrated') || 'Frustrated', emoji: '😤' },
      { label: t('worried') || 'Worried', emoji: '😟' },
    ],
    description: t('yellow_description') || 'You are starting to feel wobbly. You might feel silly, nervous or frustrated.',
  },
  red: {
    color: '#EC7063',
    emoji: '🤯',
    title: t('red_feelings') || 'Red Feelings',
    feeling: t('red_feeling') || 'Big Energy',
    words: [
      { label: t('angry') || 'Angry', emoji: '😡' },
      { label: t('very_upset') || 'Very Upset', emoji: '😭' },
      { label: t('out_of_control') || 'Wild', emoji: '🌪️' },
      { label: t('super_charged') || 'Hyper', emoji: '⚡' },
    ],
    description: t('red_description') || 'Your body has big feelings right now. You might feel angry or out of control.',
  },
});

// Real fix Sep 24 (item1, device report): a late greeting is worse than no greeting (Jono's
// explicit rule) - 600ms is long enough to cover a genuinely-cached (near-instant) local file
// load with margin, but short enough that a kid isn't left waiting on the check-in they
// actually came here to do.
const GREETING_TIMEOUT_MS = 600;

export default function ColourSelectionScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { fromFamily, location: locationParam, returnTo } = useLocalSearchParams<{ fromFamily?: string; location?: string; returnTo?: string }>();
  const { currentStudent, presetAvatars, t, language, translations } = useApp();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Real fix Sep 24 (device report, load-speed investigation): this used to gate the
    // ENTIRE screen - including the colour buttons, the actual task - behind an
    // audioReady flag that only flipped once the opening greeting had genuinely started
    // playing or a 2.5s timeout fired (a deliberate Sep 14 design choice, to land audio and
    // content together and avoid a jarring silent gap). Jono's explicit rule this session:
    // nothing network-bound blocks a student screen's first render. The greeting fetch
    // (network call + audio cache/decode) is exactly that, so content now renders
    // immediately and the greeting plays into it whenever it's actually ready - same
    // pattern as every other "show cached/default content now, refresh/enrich behind it"
    // fix this session. `cancelled` still guards against a kid navigating away (to
    // strategies.tsx) while the greeting is still mid-flight - nothing here ever sets
    // React state after that, and the underlying Audio.Sound is torn down either way
    // (already resolved: unload it now; still loading: the .then() below notices
    // `cancelled` and unloads it the moment it does resolve) so it never keeps playing or
    // reporting status into a screen that's gone.
    //
    // Real fix Sep 24 (item1, device report - regression from the above: greeting now plays
    // NOTICEABLY LATE): removing the block-the-screen gate was correct (nothing network-bound
    // should block first render), but it left the greeting free to start playing however late
    // it actually resolves - including well after a kid's already reading the screen. Jono's
    // rule: a late greeting is worse than no greeting. playPhraseFromPool is now called with
    // shouldPlay:false (it only LOADS the sound, doesn't start it) and raced against a 600ms
    // grace window: loads within it -> play now (this is the fast path on a warm device, since
    // _layout.tsx's app-start warmGreetingAudio call means the clip is normally already a
    // local file by the time this screen is ever reached, and a local-file load resolves in
    // low tens of ms); still loading past 600ms -> skip it for this check-in entirely
    // (skipGreeting latched permanently for this mount) rather than let it start late -
    // cleanupSound below unloads it the instant it does resolve, before playAsync is ever
    // called, so it genuinely never plays, not just "stops quickly after starting".
    let greetingSound: Audio.Sound | null = null;
    let skipGreeting = false;
    const cleanupSound = (sound: Audio.Sound | null | undefined) => {
      sound?.setOnPlaybackStatusUpdate(null);
      sound?.unloadAsync().catch(() => {});
    };
    preloadSounds();
    loadVoiceManifest(language);
    // Real fix Sep 24 (device report, Kiosk A1): loadVoiceEnabled() and playPhraseFromPool
    // used to both fire in the same synchronous burst - loadVoiceEnabled reads the persisted
    // mute flag from AsyncStorage (async), while playPhraseFromPool's own mute check reads
    // the in-memory voiceEnabled module variable SYNCHRONOUSLY, before that read had a chance
    // to resolve. On a warm JS session (a dev reload, or a device that's been sitting on the
    // app for a while) voiceEnabled was already correctly loaded from an earlier screen visit,
    // so this never showed up - but a kiosk device is cold-launched fresh every morning, which
    // is exactly the one case where the module variable is still sitting at its default
    // (true) the very first time this screen ever mounts, regardless of what was muted
    // yesterday. Awaiting the load before the greeting (and the zone-clip preload, which has
    // the identical guard) closes that window - the persisted setting is always in memory
    // before anything checks it.
    loadVoiceEnabled()
      .then(() => {
        if (cancelled) return;
        // Real feature Sep 21 (device report): warms the 4 zone (question) clips plus every
        // "opening" pool variant in the background while the greeting below plays - by the
        // time a kid actually taps a colour (after hearing the greeting, reading the screen),
        // its clip is normally already a local file, not a fresh fetch.
        preloadZoneAudio(language);
        const greetingPromise = playPhraseFromPool('opening', language, { shouldPlay: false });
        const timedOut = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), GREETING_TIMEOUT_MS));
        Promise.race([greetingPromise, timedOut]).then((result) => {
          if (result === 'timeout') {
            skipGreeting = true;
            // Still loading past the grace window - let it resolve in the background purely
            // so it can be torn down (never played) the moment it lands, instead of leaking
            // a native audio resource.
            greetingPromise.then((sound) => cleanupSound(sound)).catch(() => {});
            return;
          }
          const sound = result;
          if (cancelled || skipGreeting) {
            cleanupSound(sound);
            return;
          }
          greetingSound = sound;
          sound?.playAsync().catch(() => {});
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      cleanupSound(greetingSound);
    };
  }, [language]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
  }, [navigation, language, translations]);

  const colourInfo = getColourInfo(t);

  const handleZoneSelect = (zone: 'blue' | 'green' | 'yellow' | 'red') => {
    playSelectFeedback();
    playVoiceClip(zone, language);
    router.push({ pathname: '/student/strategies', params: { zone, location: locationParam || '', fromFamily: fromFamily || '', returnTo: returnTo || '' } });
  };

  if (!currentStudent) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{t('select_profile') || 'Select Your Profile'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Greeting */}
        <View style={styles.greetingRow}>
          <Avatar
            type={currentStudent.avatar_type}
            preset={currentStudent.avatar_preset}
            custom={currentStudent.avatar_custom}
            size={40}
            presetAvatars={presetAvatars}
          />
          <View style={styles.greetingText}>
            <Text style={styles.greetingHi}>{t('hi') || 'Hi'}, {currentStudent.name}! 👋</Text>
            <Text style={styles.greetingSub}>{t('tap_colour_help') || 'How are you feeling today?'}</Text>
          </View>
          <VoiceToggleButton style={{ marginLeft: 8 }} />
        </View>

        {/* Full-width Zone Buttons */}
        <View style={styles.zonesStack}>
          {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => {
            const info = colourInfo[zone];
            return (
              <TouchableOpacity
                key={zone}
                style={[styles.zoneButton, { backgroundColor: info.color }]}
                onPress={() => handleZoneSelect(zone)}
                activeOpacity={0.85}
              >
                {/* Big emoji on left */}
                <Text style={styles.zoneEmoji}>{info.emoji}</Text>

                {/* Centre: title + feeling words */}
                <View style={styles.zoneCenter}>
                  <Text
                    style={styles.zoneTitle}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {info.title}
                  </Text>
                  <Text style={styles.zoneWords}>
                    {info.words.map(w => w.label).join('  ·  ')}
                  </Text>
                </View>

                {/* Arrow on right */}
                <MaterialIcons name="chevron-right" size={28} color="rgba(255,255,255,0.8)" />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Help button */}
        {/* New feature Sep 4 (Marisa's design review, S04): "Need help? Tap here!" was reading
            as a plain label, not a button - kids weren't tapping it. No existing screen had a
            matching pattern to copy, so this is a new design-system treatment: white fill +
            navy border + pill shape, signalling "this is tappable" the way a real button
            should, distinct from the plain-text hints elsewhere on this screen. */}
        <TouchableOpacity
          style={styles.helpButton}
          activeOpacity={0.75}
          onPress={() => { playButtonFeedback(); setShowHelp(true); }}
        >
          <MaterialIcons name="help-outline" size={18} color="#1A1A2E" />
          <Text style={styles.helpButtonText}>{t('need_help') || 'Need help? Tap here!'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Help Modal */}
      <Modal visible={showHelp} transparent animationType="slide" onRequestClose={() => setShowHelp(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('what_colours_mean') || 'What do the colours mean?'}</Text>
              <TouchableOpacity onPress={() => setShowHelp(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              {(['blue', 'green', 'yellow', 'red'] as const).map((zone) => {
                const info = colourInfo[zone];
                return (
                  <View key={zone} style={[styles.helpCard, { borderLeftColor: info.color }]}>
                    <Text style={[styles.helpCardTitle, { color: info.color }]}>{info.emoji} {info.title}</Text>
                    <Text style={styles.helpCardDesc}>{info.description}</Text>
                    <View style={styles.helpWordsRow}>
                      {info.words.map((w, i) => (
                        <View key={i} style={[styles.helpWordChip, { backgroundColor: info.color + '25' }]}>
                          <Text style={styles.helpWordEmoji}>{w.emoji}</Text>
                          <Text style={[styles.helpWordLabel, { color: info.color }]}>{w.label}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowHelp(false)}>
              <Text style={styles.modalCloseText}>{t('done') || 'Done'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  content: { padding: 12, paddingBottom: 32 },
  greetingRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', padding: 10, borderRadius: 14, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
  greetingText: { flex: 1, marginLeft: 10 },
  greetingHi: { fontSize: 18, fontWeight: '700', color: '#333' },
  greetingSub: { fontSize: 13, color: '#555', marginTop: 2 },

  // Full-width stacked buttons
  zonesStack: { gap: 10 },
  zoneButton: {
    width: '100%',
    paddingVertical: 20,
    paddingHorizontal: 18,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  zoneEmoji: { fontSize: 36, marginRight: 14 },
  zoneCenter: { flex: 1 },
  zoneTitle: { fontSize: 20, fontWeight: 'bold', color: 'white', marginBottom: 4 },
  zoneWords: { fontSize: 13, color: 'rgba(255,255,255,0.9)', fontWeight: '500' },

  helpButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 14, alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 22, backgroundColor: 'white', borderRadius: 24, borderWidth: 2, borderColor: '#1A1A2E' },
  helpButtonText: { fontSize: 13, color: '#1A1A2E', fontWeight: '700' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { fontSize: 18, color: '#666' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', alignItems: 'center' },
  modalContainer: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', width: '100%', maxWidth: 480 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  modalScroll: { padding: 14 },
  helpCard: { backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4 },
  helpCardTitle: { fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  helpCardDesc: { fontSize: 12, color: '#666', lineHeight: 18, marginBottom: 8 },
  helpWordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  helpWordChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, gap: 4 },
  helpWordEmoji: { fontSize: 14 },
  helpWordLabel: { fontSize: 11, fontWeight: '600' },
  modalClose: { margin: 14, backgroundColor: '#5C6BC0', borderRadius: 12, padding: 14, alignItems: 'center' },
  modalCloseText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});
