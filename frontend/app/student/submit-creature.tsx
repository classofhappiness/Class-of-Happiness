import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, ActivityIndicator, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { COUNTRIES, countryFlagEmoji } from '../../src/constants/countries';
import { useFixedGridColumns, gridCardWidth } from '../../src/utils/globalStyles';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
console.log('[SubmitCreature] API_URL is:', JSON.stringify(API_URL));

const EMOTION_KEYS = [
  { key: 'green',  tKey: 'emotion_green',  fallback: '😊 Green',  color: '#4CAF73', bg: '#E8F5E9' },
  { key: 'blue',   tKey: 'emotion_blue',   fallback: '😔 Blue',   color: '#4A90D9', bg: '#E3F2FD' },
  { key: 'yellow', tKey: 'emotion_yellow', fallback: '😬 Yellow', color: '#FFC107', bg: '#FFF8E1' },
  { key: 'red',    tKey: 'emotion_red',    fallback: '😤 Red',    color: '#E05252', bg: '#FFEBEE' },
];

const STAGE_KEYS = ['stage_1_label', 'stage_2_label', 'stage_3_label', 'stage_4_label'];
const STAGE_FALLBACKS = [
  'Stage 1 — Egg or seed',
  'Stage 2 — Hatching or sprouting',
  'Stage 3 — Growing',
  'Stage 4 — Full creature',
];

const TIP_KEYS = ['creature_tip_1', 'creature_tip_2', 'creature_tip_3', 'creature_tip_4', 'creature_tip_5'];
const TIP_FALLBACKS = [
  '✅ Use white paper or card as your background',
  '✅ Draw or craft with clear colours',
  '✅ Good lighting — near a window works great',
  '✅ Show the creature growing across all 4 stages',
  '❌ No rude, violent or unkind content',
];

export default function SubmitCreatureScreen() {
  const reviewPhotoWidth = gridCardWidth(useFixedGridColumns(4));
  const router = useRouter();
  const { t, user } = useApp();
  const [step, setStep] = useState<'tutorial'|'code'|'details'|'scope'|'photos'|'review'>('tutorial');
  const [code, setCode] = useState('');
  const [checkingCode, setCheckingCode] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emotion, setEmotion] = useState('');
  const [photos, setPhotos] = useState<(string|null)[]>([null,null,null,null]);
  const [uploading, setUploading] = useState(false);

  // Real feature Aug 21: "which student is this?" picker - previously this screen never
  // asked, so every submission was attributed to whichever account was logged in (teacher
  // or parent), never a real student. Optional - if nothing resolves (e.g. a home-only
  // family member with no school link), submission still works, just without classroom
  // info attached. Teacher -> their own students; parent -> their linked children.
  const [pickableStudents, setPickableStudents] = useState<{ id: string; name: string; realStudentId: string | null }[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        let resolved: { id: string; name: string; realStudentId: string | null }[] = [];
        if (user?.role === 'teacher') {
          const res = await fetch(`${BACKEND_URL}/api/students`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          resolved = list.map((s: any) => ({ id: s.id, name: s.name, realStudentId: s.id }));
        } else if (user?.role === 'parent') {
          const res = await fetch(`${BACKEND_URL}/api/family/members`, { headers: { 'Authorization': `Bearer ${token}` } });
          const data = await res.json();
          const list = Array.isArray(data) ? data : [];
          resolved = list.filter((m: any) => m.relationship === 'child')
              .map((m: any) => ({ id: m.id, name: m.name, realStudentId: m.student_id || null }));
        }
        setPickableStudents(resolved);
        // Real bug fix Aug 23 (parent scope options): "Who made this?" was optional and easy
        // to skip - if nothing was ever selected, submission-options never got a
        // real_student_id to resolve against, so classroom/school options silently never
        // appeared even for a school-linked child. Auto-select when there's exactly one
        // choice (the common case - one child) so the real scope options resolve without an
        // extra tap; still changeable, and still an active choice when there's more than one.
        if (resolved.length === 1) setSelectedStudentId(resolved[0].id);
      } catch {}
    })();
  }, [user?.role]);

  // Real feature Aug 22 (item 1): submission-time scope + country picker, replacing the old
  // silent behaviour where visibility_scope was only ever set later by an admin (defaulting
  // to "school") and country silently inherited the submitter's own profile. Scope options
  // are resolved server-side against the selected student's real classroom/school - never
  // guessed client-side - so a family with no school link only ever sees "Global" offered,
  // never a Classroom/School option that couldn't actually apply to them.
  const [submissionOptions, setSubmissionOptions] = useState<{ has_classroom: boolean; has_school: boolean; school_name: string | null; default_country: string } | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [visibilityScope, setVisibilityScope] = useState<'classroom'|'school'|'global'|null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  useEffect(() => {
    (async () => {
      setLoadingOptions(true);
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const token = await AsyncStorage.getItem('session_token');
        const realStudentId = selectedStudentId ? pickableStudents.find(p => p.id === selectedStudentId)?.realStudentId : null;
        const url = realStudentId
          ? `${BACKEND_URL}/api/creatures/submission-options?real_student_id=${realStudentId}`
          : `${BACKEND_URL}/api/creatures/submission-options`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setSubmissionOptions(data);
        setVisibilityScope(null);
        if (!country) setCountry(data.default_country || 'PT');
      } catch {
        setSubmissionOptions({ has_classroom: false, has_school: false, school_name: null, default_country: 'PT' });
      }
      setLoadingOptions(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  const pickOrCamera = async (index: number, source: 'camera'|'library') => {
    const perm = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') { Alert.alert(t('permission_needed') || 'Permission needed'); return; }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1,1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1,1], quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      const updated = [...photos];
      updated[index] = result.assets[0].uri;
      setPhotos(updated);
    }
  };

  const uploadImage = async (uri: string, stage: number): Promise<string> => {
    const token = await AsyncStorage.getItem('session_token') || '';
    // Convert URI to base64
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = reader.result as string;
        try {
          const res = await fetch(`${API_URL}/api/creatures/upload-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ image_base64: b64, stage, ext: 'jpg' }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || 'Upload failed');
          resolve(data.url);
        } catch (e) { reject(e); }
      };
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.readAsDataURL(blob);
    });
  };

  const handleContinueFromCode = async () => {
    setCheckingCode(true);
    try {
      const token = await AsyncStorage.getItem('session_token') || '';
      const res = await fetch(`${API_URL}/api/creatures/validate-code/${code.toUpperCase()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.valid) {
        setStep('details');
      } else {
        Alert.alert(t('code_not_valid_title') || 'Code not valid', data.reason || (t('code_not_valid_msg') || 'Please check the code and try again.'));
      }
    } catch (e: any) {
      Alert.alert(t('error') || 'Error', t('could_not_check_code') || 'Could not check the code. Please try again.');
    } finally {
      setCheckingCode(false);
    }
  };

  const handleSubmit = async () => {
    if (photos.some(p => !p)) { Alert.alert(t('missing_photos_title') || 'Missing photos', t('missing_photos_msg') || 'Please add all 4 stage photos.'); return; }
    if (!name.trim()) { Alert.alert(t('name_required_title') || 'Name required', t('name_required_msg') || 'Give your creature a name!'); return; }
    setUploading(true);
    try {
      const token = await AsyncStorage.getItem('session_token') || '';
      const urls = await Promise.all(photos.map((p, i) => uploadImage(p!, i + 1)));
      const res = await fetch(`${API_URL}/api/creatures/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          code: code.toUpperCase(),
          emotion_colour: emotion,
          name: name.trim(),
          description: description.trim(),
          stage1_url: urls[0], stage2_url: urls[1],
          stage3_url: urls[2], stage4_url: urls[3],
          visibility_scope: visibilityScope || 'global',
          country: country || 'PT',
          ...(selectedStudentId ? { real_student_id: pickableStudents.find(p => p.id === selectedStudentId)?.realStudentId || undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Submission failed');
      Alert.alert(t('creature_submitted_title') || '🎉 Submitted!', t('creature_submitted_msg') || 'Your creature is waiting for approval from your teacher or parent!',
        [{ text: t('ok') || 'OK', onPress: () => router.back() }]);
    } catch (err: any) {
      // Real feature Aug 24 (item 2, free-tier submission cap): same free_tier_limit pattern
      // already used elsewhere (profiles/create.tsx, teacher/checkin.tsx, etc.) - a real
      // upgrade prompt instead of the generic error, since this one's an intentional limit,
      // not a bug.
      const msg = err.message || '';
      if (msg.startsWith('free_tier_limit|')) {
        Alert.alert(t('free_plan_limit_title') || 'Free Plan Limit Reached', msg.split('|')[1] || (t('upgrade_unlimited_creatures') || 'Upgrade for unlimited creature submissions.'), [
          { text: t('not_now') || 'Not Now', style: 'cancel' },
          { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
        ]);
        return;
      }
      Alert.alert(t('error') || 'Error', `${err.message || 'Please try again.'}\n\nURL used: ${API_URL}/api/creatures/submit`);
    } finally { setUploading(false); }
  };

  // TUTORIAL SCREEN
  if (step === 'tutorial') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TranslatedHeader title={t('creature_tutorial_title') || 'How to make your creature'} showHome />
      <Text style={s.subtitle}>{t('creature_submit_read_tips') || 'Read these tips before you start!'}</Text>
      {TIP_KEYS.map((key, i) => (
        <View key={i} style={s.tipRow}>
          <Text style={s.tipText}>{t(key) || TIP_FALLBACKS[i]}</Text>
        </View>
      ))}
      <View style={s.exampleBox}>
        <Text style={s.exampleTitle}>{t('creature_submit_4_stages_title') || '📸 The 4 stages'}</Text>
        <Text style={s.exampleText}>{t('creature_submit_4_stages_desc') || "Stage 1: Just an egg or blob shape\nStage 2: Starting to hatch or sprout\nStage 3: Half grown — details appearing\nStage 4: The full creature in all its glory!"}</Text>
      </View>
      <TouchableOpacity style={s.btn} onPress={() => setStep('code')}>
        <Text style={s.btnTxt}>{t('creature_submit_ready_btn') || "I'm ready — let's go! →"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // CODE SCREEN
  if (step === 'code') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TranslatedHeader title={t('creature_code_screen_title') || 'Enter your code'} showHome onBackPress={() => setStep('tutorial')} />
      <Text style={s.subtitle}>{t('creature_submit_get_code') || 'Get a code from your teacher or parent first.'}</Text>
      <TextInput style={s.codeInput} value={code} onChangeText={v => setCode(v.toUpperCase())}
        placeholder={t('creature_code_input_placeholder') || 'e.g. ABC12345'} autoCapitalize="characters" maxLength={8} />
      <TouchableOpacity style={[s.btn, (code.length < 8 || checkingCode) && s.btnOff]}
        disabled={code.length < 8 || checkingCode} onPress={handleContinueFromCode}>
        {checkingCode
          ? <ActivityIndicator color="white" />
          : <Text style={s.btnTxt}>{t('continue_arrow') || 'Continue →'}</Text>}
      </TouchableOpacity>
    </ScrollView>
  );

  // DETAILS SCREEN
  if (step === 'details') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TranslatedHeader title={t('creature_details_title') || 'Your creature details'} showHome onBackPress={() => setStep('code')} />
      <Text style={s.label}>{t('creature_name_label') || 'Creature Name'}</Text>
      <TextInput style={s.input} value={name} onChangeText={setName}
        placeholder={t('creature_name_placeholder') || 'Give it a name!'} maxLength={50} />
      <Text style={s.label}>{t('creature_emotion_question') || 'Which emotion does it represent?'}</Text>
      <View style={s.emotionRow}>
        {EMOTION_KEYS.map(e => (
          <TouchableOpacity key={e.key}
            style={[s.emotionBtn, { backgroundColor: emotion === e.key ? e.color : e.bg }]}
            onPress={() => setEmotion(e.key)}>
            <Text style={[s.emotionLabel, { color: emotion === e.key ? 'white' : e.color }]}>{t(e.tKey) || e.fallback}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={s.label}>{t('creature_desc_optional_label') || 'Description (optional)'}</Text>
      <TextInput style={[s.input, { height: 80 }]} value={description}
        onChangeText={setDescription} placeholder={t('creature_desc_placeholder') || 'Tell us about your creature...'} maxLength={200} multiline />
      {pickableStudents.length > 0 && (
        <>
          <Text style={s.label}>{t('who_made_this_label') || 'Who made this? (optional)'}</Text>
          <View style={s.emotionRow}>
            {pickableStudents.map(p => (
              <TouchableOpacity key={p.id}
                style={[s.emotionBtn, { backgroundColor: selectedStudentId === p.id ? '#5C6BC0' : '#EEE' }]}
                onPress={() => setSelectedStudentId(selectedStudentId === p.id ? null : p.id)}>
                <Text style={[s.emotionLabel, { color: selectedStudentId === p.id ? 'white' : '#333' }]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      <TouchableOpacity style={[s.btn, (!emotion || !name) && s.btnOff]}
        disabled={!emotion || !name} onPress={() => setStep('scope')}>
        <Text style={s.btnTxt}>{t('next_arrow') || 'Next →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // SCOPE + COUNTRY SCREEN — real feature Aug 22 (item 1): who gets to see this creature, and
  // where it's from, chosen here rather than silently defaulted/inherited.
  if (step === 'scope') {
    // Real bug fix Aug 23: the narrowest option ("classroom") used to only appear when
    // has_classroom was true - meaning a parent submitting for a home-only family member
    // (no classroom at all, the common case) only ever saw "Global", never a private option.
    // It now always appears, relabeled "My Family" when there's no real classroom - matches
    // the same contextual relabeling world-creatures.tsx's scope-preference picker already
    // uses, and the backend now genuinely supports it (see get_eligible_creatures).
    const scopeOptions: { key: 'classroom'|'school'|'global'; label: string; hint: string }[] = [
      submissionOptions?.has_classroom
        ? { key: 'classroom', label: t('scope_classroom_label') || '👥 My Classroom', hint: t('scope_classroom_hint') || 'Only your own classroom can see and unlock it' }
        : { key: 'classroom', label: t('scope_family_label') || '👨‍👩‍👧 My Family', hint: t('scope_family_hint') || 'Only your own family can see and unlock it' },
      ...(submissionOptions?.has_school ? [{ key: 'school' as const, label: t('scope_school_label') || '🏫 My Whole School', hint: (submissionOptions?.school_name ? (t('scope_school_hint') || 'Everyone at {school}').replace('{school}', submissionOptions.school_name) : (t('scope_school_hint_generic') || 'Everyone at your school')) }] : []),
      { key: 'global', label: t('scope_global_label') || '🌍 Everyone, Everywhere', hint: t('scope_global_hint') || 'Students at any school worldwide can see and unlock it' },
    ];
    const selectedCountry = COUNTRIES.find(c => c.code === country);
    const filteredCountries = countrySearch.trim()
      ? COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()))
      : COUNTRIES;
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <TranslatedHeader title={t('creature_scope_title') || 'Who can see it?'} showHome onBackPress={() => setStep('details')} />
        <Text style={s.subtitle}>{t('creature_scope_disclaimer') || 'A teacher or superadmin can still change this later when they review it.'}</Text>
        {loadingOptions ? (
          <View style={{ marginVertical: 30 }}><EmotionColourLoader visible size={48} /></View>
        ) : (
          <>
            <Text style={s.label}>{t('creature_scope_question') || 'Where should it be available?'}</Text>
            {scopeOptions.map(opt => (
              <TouchableOpacity key={opt.key} style={[s.scopeCard, visibilityScope === opt.key && s.scopeCardActive]}
                onPress={() => setVisibilityScope(opt.key)}>
                <Text style={[s.scopeCardLabel, visibilityScope === opt.key && s.scopeCardLabelActive]}>{opt.label}</Text>
                <Text style={[s.scopeCardHint, visibilityScope === opt.key && s.scopeCardHintActive]}>{opt.hint}</Text>
              </TouchableOpacity>
            ))}

            <Text style={[s.label, { marginTop: 20 }]}>{t('creature_country_question') || 'Which country is this from?'}</Text>
            <TouchableOpacity style={s.countryPickerBtn} onPress={() => setCountryPickerOpen(true)}>
              <Text style={s.countryPickerTxt}>
                {selectedCountry ? `${countryFlagEmoji(selectedCountry.code)}  ${selectedCountry.name}` : (t('select_country') || 'Select a Country')}
              </Text>
              <Text style={s.countryPickerChevron}>▾</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity style={[s.btn, (!visibilityScope || !country) && s.btnOff]}
          disabled={!visibilityScope || !country} onPress={() => setStep('photos')}>
          <Text style={s.btnTxt}>{t('next_add_photos') || 'Next: Add photos →'}</Text>
        </TouchableOpacity>

        <Modal visible={countryPickerOpen} transparent animationType="fade" onRequestClose={() => setCountryPickerOpen(false)}>
          <View style={s.countryModalOverlay}>
            <View style={s.countryModalCard}>
              <Text style={s.countryModalTitle}>{t('select_country') || 'Select a Country'}</Text>
              <TextInput style={s.countrySearchInput} value={countrySearch} onChangeText={setCountrySearch}
                placeholder={t('search_countries_placeholder') || 'Search countries...'} autoCapitalize="words" />
              <ScrollView style={{ maxHeight: 360 }}>
                {filteredCountries.map(c => (
                  <TouchableOpacity key={c.code} style={s.countryRow}
                    onPress={() => { setCountry(c.code); setCountryPickerOpen(false); setCountrySearch(''); }}>
                    <Text style={s.countryRowTxt}>{countryFlagEmoji(c.code)}  {c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={s.countryModalClose} onPress={() => { setCountryPickerOpen(false); setCountrySearch(''); }}>
                <Text style={s.countryModalCloseTxt}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    );
  }

  // PHOTOS SCREEN
  if (step === 'photos') return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TranslatedHeader title={t('creature_photos_title') || '4 stage photos'} showHome onBackPress={() => setStep('scope')} />
      <Text style={s.subtitle}>{t('creature_photos_subtitle') || 'White background · good lighting · clear outline'}</Text>
      {STAGE_KEYS.map((key, i) => (
        <View key={i} style={s.photoCard}>
          <Text style={s.stageLabel}>{t(key) || STAGE_FALLBACKS[i]}</Text>
          {photos[i]
            ? <Image source={{ uri: photos[i]! }} style={s.photoPreview} />
            : <View style={s.photoEmpty}><Text style={s.photoEmptyTxt}>{t('no_photo_yet') || 'No photo yet'}</Text></View>}
          <View style={s.photoRow}>
            <TouchableOpacity style={s.photoBtn} onPress={() => pickOrCamera(i,'camera')}>
              <Text style={s.photoBtnTxt}>{t('camera_btn') || '📷 Camera'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.photoBtn} onPress={() => pickOrCamera(i,'library')}>
              <Text style={s.photoBtnTxt}>{t('gallery_btn') || '🖼 Gallery'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity style={[s.btn, photos.some(p=>!p) && s.btnOff]}
        disabled={photos.some(p=>!p)} onPress={() => setStep('review')}>
        <Text style={s.btnTxt}>{t('review_submit_btn') || 'Review & Submit →'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  // REVIEW SCREEN
  const visibleToText = visibilityScope === 'classroom'
    ? (submissionOptions?.has_classroom ? (t('scope_classroom_label') || '👥 My Classroom').replace('👥 ', '') : (t('scope_family_label') || '👨‍👩‍👧 My Family').replace('👨‍👩‍👧 ', ''))
    : visibilityScope === 'school' ? (t('scope_school_label') || '🏫 My Whole School').replace('🏫 ', '')
    : (t('scope_global_label') || '🌍 Everyone, Everywhere').replace('🌍 ', '');
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <TranslatedHeader title={t('creature_review_title') || 'Review your submission'} showHome onBackPress={() => setStep('photos')} />
      <View style={s.card}>
        <Text style={s.label}>{t('review_name_label') || 'Name:'} <Text style={{ color:'#4CAF73',fontWeight:'900' }}>{name}</Text></Text>
        <Text style={s.label}>{t('review_emotion_label') || 'Emotion:'} <Text style={{ color:'#4CAF73',fontWeight:'900' }}>{emotion}</Text></Text>
        <Text style={s.label}>{t('review_code_label') || 'Code:'} <Text style={{ color:'#4CAF73',fontWeight:'900' }}>{code}</Text></Text>
        <Text style={s.label}>{t('review_visible_to_label') || 'Visible to:'} <Text style={{ color:'#4CAF73',fontWeight:'900' }}>{visibleToText}</Text></Text>
        <Text style={s.label}>{t('review_country_label') || 'Country:'} <Text style={{ color:'#4CAF73',fontWeight:'900' }}>{country ? `${countryFlagEmoji(country)} ${COUNTRIES.find(c => c.code === country)?.name || country}` : '—'}</Text></Text>
        <View style={s.stageGrid}>
          {photos.map((p,i) => p && <Image key={i} source={{ uri:p }} style={[s.reviewPhoto, { width: reviewPhotoWidth }]} />)}
        </View>
        {uploading
          ? <View style={s.uploadRow}>
              <EmotionColourLoader visible size={40} />
              <Text style={s.uploadTxt}>{t('uploading_creature_msg') || 'Uploading your creature... please wait'}</Text>
            </View>
          : <TouchableOpacity style={s.btn} onPress={handleSubmit}>
              <Text style={s.btnTxt}>{t('submit_for_approval_btn') || '🚀 Submit for approval!'}</Text>
            </TouchableOpacity>}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex:1, backgroundColor:'#F7F8FA' },
  content: { padding:20, paddingBottom:50 },
  title: { fontSize:22, fontWeight:'900', color:'#1A1A2E', marginBottom:8, textAlign:'center' },
  subtitle: { fontSize:14, color:'#6B7280', textAlign:'center', marginBottom:20 },
  backBtn: { marginBottom:16 },
  backTxt: { fontSize:14, fontWeight:'700', color:'#6B7280' },
  card: { backgroundColor:'white', borderRadius:16, padding:20, shadowColor:'#000', shadowOpacity:0.07, shadowRadius:10, elevation:3 },
  label: { fontSize:13, fontWeight:'700', color:'#1A1A2E', marginBottom:6, marginTop:12 },
  input: { borderWidth:1.5, borderColor:'rgba(0,0,0,.1)', borderRadius:10, padding:12, fontSize:15, backgroundColor:'#F7F8FA', color:'#1A1A2E' },
  codeInput: { borderWidth:2, borderColor:'#1A1A2E', borderRadius:12, padding:14, fontSize:28, fontWeight:'900', color:'#1A1A2E', textAlign:'center', letterSpacing:8, marginBottom:20 },
  emotionRow: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:8, marginBottom:4 },
  emotionBtn: { paddingVertical:10, paddingHorizontal:14, borderRadius:50 },
  emotionLabel: { fontSize:13, fontWeight:'800' },
  btn: { backgroundColor:'#1A1A2E', borderRadius:50, padding:16, alignItems:'center', marginTop:20 },
  btnOff: { opacity:0.4 },
  btnTxt: { color:'#FFD93D', fontWeight:'900', fontSize:16 },
  tipRow: { backgroundColor:'white', borderRadius:10, padding:14, marginBottom:8, shadowColor:'#000', shadowOpacity:0.04, shadowRadius:4, elevation:1 },
  tipText: { fontSize:14, color:'#1A1A2E', fontWeight:'600' },
  exampleBox: { backgroundColor:'#E8F5E9', borderRadius:12, padding:16, marginTop:8, marginBottom:4 },
  exampleTitle: { fontSize:14, fontWeight:'900', color:'#2E7D32', marginBottom:8 },
  exampleText: { fontSize:13, color:'#1A1A2E', lineHeight:22 },
  photoCard: { backgroundColor:'white', borderRadius:14, padding:14, marginBottom:12, shadowColor:'#000', shadowOpacity:0.05, shadowRadius:6, elevation:2 },
  stageLabel: { fontSize:13, fontWeight:'800', color:'#1A1A2E', marginBottom:10 },
  photoPreview: { width:'100%', aspectRatio:1, borderRadius:10, backgroundColor:'#F0F0F0' },
  photoEmpty: { width:'100%', aspectRatio:1, borderRadius:10, backgroundColor:'#F0F0F0', alignItems:'center', justifyContent:'center', borderWidth:2, borderStyle:'dashed', borderColor:'#D0D0D0' },
  photoEmptyTxt: { color:'#9CA3AF', fontSize:14, fontWeight:'600' },
  photoRow: { flexDirection:'row', gap:10, marginTop:10 },
  photoBtn: { flex:1, backgroundColor:'#F7F8FA', borderRadius:8, padding:10, alignItems:'center', borderWidth:1, borderColor:'rgba(0,0,0,.1)' },
  photoBtnTxt: { fontSize:13, fontWeight:'700', color:'#1A1A2E' },
  stageGrid: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:12, marginBottom:8 },
  reviewPhoto: { aspectRatio:1, borderRadius:8 },
  uploadRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:12, padding:16 },
  uploadTxt: { fontSize:14, color:'#4CAF73', fontWeight:'700' },
  scopeCard: { backgroundColor:'white', borderRadius:12, padding:14, marginBottom:10, borderWidth:2, borderColor:'rgba(0,0,0,.08)' },
  scopeCardActive: { borderColor:'#1A1A2E', backgroundColor:'#FFF8E1' },
  scopeCardLabel: { fontSize:15, fontWeight:'800', color:'#1A1A2E' },
  scopeCardLabelActive: { color:'#1A1A2E' },
  scopeCardHint: { fontSize:12, color:'#6B7280', marginTop:4 },
  scopeCardHintActive: { color:'#4B4B3A' },
  countryPickerBtn: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', borderWidth:1.5, borderColor:'rgba(0,0,0,.1)', borderRadius:10, padding:14, backgroundColor:'#F7F8FA' },
  countryPickerTxt: { fontSize:15, fontWeight:'700', color:'#1A1A2E' },
  countryPickerChevron: { fontSize:16, color:'#6B7280' },
  countryModalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,.4)', alignItems:'center', justifyContent:'center', padding:24 },
  countryModalCard: { backgroundColor:'white', borderRadius:16, padding:16, width:'100%', maxWidth:420 },
  countryModalTitle: { fontSize:16, fontWeight:'900', color:'#1A1A2E', marginBottom:10 },
  countrySearchInput: { borderWidth:1.5, borderColor:'rgba(0,0,0,.1)', borderRadius:10, padding:10, fontSize:14, marginBottom:8, color:'#1A1A2E' },
  countryRow: { paddingVertical:10, borderTopWidth:1, borderTopColor:'#F0F0F0' },
  countryRowTxt: { fontSize:14, color:'#1A1A2E', fontWeight:'600' },
  countryModalClose: { marginTop:10, alignItems:'center', paddingVertical:10 },
  countryModalCloseTxt: { fontSize:14, fontWeight:'700', color:'#6B7280' },
});
