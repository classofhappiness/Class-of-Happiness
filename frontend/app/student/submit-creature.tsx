import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  TextInput, ScrollView, Alert, ActivityIndicator, Modal
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/utils/supabaseClient';
import { api } from '../../src/utils/api';
import { useAppContext } from '../../src/context/AppContext';

const EMOTIONS = [
  { key: 'green', label: '😊 Green', color: '#4CAF73', bg: '#E8F5E9' },
  { key: 'blue',  label: '😔 Blue',  color: '#4A90D9', bg: '#E3F2FD' },
  { key: 'yellow',label: '😬 Yellow',color: '#FFC107', bg: '#FFF8E1' },
  { key: 'red',   label: '😤 Red',   color: '#E05252', bg: '#FFEBEE' },
];

const STAGES = ['Stage 1 — Egg', 'Stage 2 — Hatching', 'Stage 3 — Growing', 'Stage 4 — Full Creature'];

export default function SubmitCreatureScreen() {
  const router = useRouter();
  const { t, user } = useAppContext();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emotion, setEmotion] = useState('');
  const [photos, setPhotos] = useState<(string|null)[]>([null, null, null, null]);
  const [uploading, setUploading] = useState(false);
  const [codeValid, setCodeValid] = useState<boolean|null>(null);
  const [step, setStep] = useState<'code'|'details'|'photos'|'review'>('code');

  const pickPhoto = async (index: number) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const updated = [...photos];
      updated[index] = result.assets[0].uri;
      setPhotos(updated);
    }
  };

  const takePhoto = async (index: number) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      const updated = [...photos];
      updated[index] = result.assets[0].uri;
      setPhotos(updated);
    }
  };

  const uploadPhoto = async (uri: string, index: number): Promise<string> => {
    const filename = `creatures/${user?.user_id}_${emotion}_stage${index+1}_${Date.now()}.jpg`;
    const response = await fetch(uri);
    const blob = await response.blob();
    const { data, error } = await supabase.storage
      .from('creature-images')
      .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from('creature-images').getPublicUrl(filename);
    return urlData.publicUrl;
  };

  const handleSubmit = async () => {
    if (photos.some(p => !p)) {
      Alert.alert('Missing photos', 'Please take or upload all 4 stage photos.');
      return;
    }
    if (!name.trim()) {
      Alert.alert('Name required', 'Give your creature a name!');
      return;
    }
    setUploading(true);
    try {
      const urls = await Promise.all(photos.map((p, i) => uploadPhoto(p!, i)));
      await api.post('/creatures/submit', {
        code: code.toUpperCase(),
        emotion_colour: emotion,
        name: name.trim(),
        description: description.trim(),
        stage1_url: urls[0],
        stage2_url: urls[1],
        stage3_url: urls[2],
        stage4_url: urls[3],
        year_group: user?.year_group || '',
        school_name: user?.school_name || '',
      });
      Alert.alert(
        '🎉 Submitted!',
        'Your creature is waiting for approval from your teacher or parent. Check back soon!',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not submit. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  if (step === 'code') return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🎨 Submit Your Creature</Text>
      <Text style={styles.subtitle}>Get a code from your teacher or parent to continue.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Enter your code</Text>
        <TextInput
          style={styles.codeInput}
          value={code}
          onChangeText={v => setCode(v.toUpperCase())}
          placeholder="e.g. ABC12345"
          autoCapitalize="characters"
          maxLength={8}
        />
        <TouchableOpacity
          style={[styles.btn, code.length < 6 && styles.btnDisabled]}
          disabled={code.length < 6}
          onPress={() => setStep('details')}
        >
          <Text style={styles.btnText}>Continue →</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>📋 Creature Rules</Text>
        <Text style={styles.rule}>✅ White background, good lighting</Text>
        <Text style={styles.rule}>✅ Clearly outlined with colour or black</Text>
        <Text style={styles.rule}>✅ 4 stages of growth (egg → full creature)</Text>
        <Text style={styles.rule}>❌ No violence, rude or hurtful content</Text>
        <Text style={styles.rule}>❌ No offensive messages or images</Text>
        <Text style={styles.rule}>❌ One creature per emotion colour only</Text>
      </View>
    </ScrollView>
  );

  if (step === 'details') return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your Creature Details</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Creature name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName}
          placeholder="Give it a name!" maxLength={50} />
        <Text style={styles.label}>Which emotion does it represent?</Text>
        <View style={styles.emotionRow}>
          {EMOTIONS.map(e => (
            <TouchableOpacity key={e.key}
              style={[styles.emotionBtn, { backgroundColor: emotion===e.key ? e.color : e.bg }]}
              onPress={() => setEmotion(e.key)}>
              <Text style={[styles.emotionLabel, { color: emotion===e.key ? 'white' : e.color }]}>
                {e.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Description (optional)</Text>
        <TextInput style={[styles.input, { height: 80 }]}
          value={description} onChangeText={setDescription}
          placeholder="Tell us about your creature..." maxLength={200} multiline />
        <TouchableOpacity
          style={[styles.btn, (!emotion || !name) && styles.btnDisabled]}
          disabled={!emotion || !name}
          onPress={() => setStep('photos')}>
          <Text style={styles.btnText}>Next: Upload Photos →</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (step === 'photos') return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>📸 4 Stage Photos</Text>
      <Text style={styles.subtitle}>White background · good lighting · clear outline</Text>
      {STAGES.map((label, i) => (
        <View key={i} style={styles.photoCard}>
          <Text style={styles.stageLabel}>{label}</Text>
          {photos[i] ? (
            <Image source={{ uri: photos[i]! }} style={styles.photoPreview} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.photoPlaceholderText}>No photo yet</Text>
            </View>
          )}
          <View style={styles.photoButtons}>
            <TouchableOpacity style={styles.photoBtn} onPress={() => takePhoto(i)}>
              <Text style={styles.photoBtnText}>📷 Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.photoBtn} onPress={() => pickPhoto(i)}>
              <Text style={styles.photoBtnText}>🖼️ Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity
        style={[styles.btn, photos.some(p=>!p) && styles.btnDisabled]}
        disabled={photos.some(p=>!p)}
        onPress={() => setStep('review')}>
        <Text style={styles.btnText}>Review & Submit →</Text>
      </TouchableOpacity>
    </ScrollView>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>✅ Review Your Submission</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Name: <Text style={styles.value}>{name}</Text></Text>
        <Text style={styles.label}>Emotion: <Text style={styles.value}>{emotion}</Text></Text>
        <View style={styles.stageGrid}>
          {photos.map((p, i) => p && (
            <Image key={i} source={{ uri: p }} style={styles.reviewPhoto} />
          ))}
        </View>
        {uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color="#4CAF73" />
            <Text style={styles.uploadingText}>Uploading your creature...</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
            <Text style={styles.btnText}>🚀 Submit for Approval!</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.backBtn} onPress={() => setStep('photos')}>
          <Text style={styles.backBtnText}>← Back to edit</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '900', color: '#1A1A2E', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  card: { backgroundColor: 'white', borderRadius: 16, padding: 20, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.07, shadowRadius: 10, elevation: 3 },
  label: { fontSize: 13, fontWeight: '700', color: '#1A1A2E', marginBottom: 6, marginTop: 12 },
  value: { fontWeight: '800', color: '#4CAF73' },
  input: { borderWidth: 1.5, borderColor: 'rgba(0,0,0,.1)', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#F7F8FA', color: '#1A1A2E' },
  codeInput: { borderWidth: 2, borderColor: '#1A1A2E', borderRadius: 12, padding: 14, fontSize: 24, fontWeight: '900', color: '#1A1A2E', textAlign: 'center', letterSpacing: 8 },
  emotionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  emotionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 50, marginBottom: 4 },
  emotionLabel: { fontSize: 13, fontWeight: '800' },
  btn: { backgroundColor: '#1A1A2E', borderRadius: 50, padding: 16, alignItems: 'center', marginTop: 20 },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: '#FFD93D', fontWeight: '900', fontSize: 16 },
  backBtn: { padding: 12, alignItems: 'center', marginTop: 8 },
  backBtnText: { color: '#6B7280', fontWeight: '700', fontSize: 14 },
  rulesCard: { backgroundColor: '#E8F5E9', borderRadius: 14, padding: 16 },
  rulesTitle: { fontSize: 14, fontWeight: '900', color: '#2E7D32', marginBottom: 10 },
  rule: { fontSize: 13, color: '#1A1A2E', marginBottom: 6, lineHeight: 20 },
  photoCard: { backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  stageLabel: { fontSize: 13, fontWeight: '800', color: '#1A1A2E', marginBottom: 10 },
  photoPreview: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#F0F0F0' },
  photoPlaceholder: { width: '100%', aspectRatio: 1, borderRadius: 10, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderStyle: 'dashed', borderColor: '#D0D0D0' },
  photoPlaceholderText: { color: '#9CA3AF', fontSize: 14, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  photoBtn: { flex: 1, backgroundColor: '#F7F8FA', borderRadius: 8, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,.1)' },
  photoBtnText: { fontSize: 13, fontWeight: '700', color: '#1A1A2E' },
  stageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 4 },
  reviewPhoto: { width: '47%', aspectRatio: 1, borderRadius: 8 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16 },
  uploadingText: { fontSize: 14, color: '#4CAF73', fontWeight: '700' },
});
