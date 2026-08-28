import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Image, Share, TextInput, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { teacherApi, parentApi, creaturesApi } from '../utils/api';
import { EmotionColourLoader } from './EmotionColourLoader';
import { useApp } from '../context/AppContext';
import { EMOTION_COLOURS } from '../constants/emotionColours';

// Real component, Aug 16: shared creature-management screen for both teacher and
// parent roles. Generates a submission code, and shows pending creature
// submissions with real Approve/Reject actions (backend already supported both,
// just never had a UI). Two-step approval: this is step one - superadmin's
// global-approve is the real second gate before anything goes public.

const ZONE_COLORS: Record<string, string> = EMOTION_COLOURS;

const STATUS_INFO: Record<string, { label: string; bg: string; color: string }> = {
  pending: { label: 'Pending', bg: '#FFF3E0', color: '#E65100' },
  approved: { label: 'Approved', bg: '#E8F5E9', color: '#2E7D32' },
  rejected: { label: 'Rejected', bg: '#FFEBEE', color: '#C62828' },
};

// Real feature Aug 23 (item 4): reviewers need to know which real child a submission is
// for, and when it was submitted - not just the submitting account's own name.
function formatSubDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

interface Props {
  role: 'teacher' | 'parent';
}

export const CreatureManagement: React.FC<Props> = ({ role }) => {
  const { t } = useApp();
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pending, setPending] = useState<any[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [mySubmissions, setMySubmissions] = useState<any[]>([]);
  const [loadingMySubmissions, setLoadingMySubmissions] = useState(true);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    try {
      const rows = await creaturesApi.getPending();
      setPending(Array.isArray(rows) ? rows : []);
    } catch { setPending([]); }
    setLoadingPending(false);
  }, []);

  const loadMySubmissions = useCallback(async () => {
    setLoadingMySubmissions(true);
    try {
      const rows = await creaturesApi.getMySubmissions();
      setMySubmissions(Array.isArray(rows) ? rows : []);
    } catch { setMySubmissions([]); }
    setLoadingMySubmissions(false);
  }, []);

  useEffect(() => { loadPending(); loadMySubmissions(); }, [loadPending, loadMySubmissions]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      const result = role === 'teacher'
        ? await teacherApi.generateCreatureCode()
        : await parentApi.generateCreatureCode();
      setCode(result.code);
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not generate a code right now.');
    }
    setGenerating(false);
  };

  const shareCode = () => {
    if (!code) return;
    Share.share({
      message: `Class of Happiness creature code: ${code}\n\nUse this code in "Submit a Creature" to send in your creature drawing. Code expires in 30 days.`,
    });
  };

  const approve = async (submission: any) => {
    setActioningId(submission.id);
    try {
      await creaturesApi.approve(submission.id);
      setPending(prev => prev.filter(p => p.id !== submission.id));
      loadMySubmissions();
      Alert.alert('✅', `${submission.creature_name} approved! Awaiting final review.`);
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not approve this submission.');
    }
    setActioningId(null);
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    setActioningId(rejectTarget.id);
    try {
      await creaturesApi.reject(rejectTarget.id, rejectReason.trim() || 'Does not meet the Class of Happiness standards');
      setPending(prev => prev.filter(p => p.id !== rejectTarget.id));
      loadMySubmissions();
    } catch {
      Alert.alert(t('error') || 'Error', 'Could not reject this submission.');
    }
    setActioningId(null);
    setRejectTarget(null);
    setRejectReason('');
  };

  return (
    <ScrollView style={s.container} contentContainerStyle={{ padding: 16 }}>
      {/* Generate code section */}
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialIcons name="pets" size={24} color="#9C27B0" />
          <Text style={s.cardTitle}>Creature Submission Code</Text>
        </View>
        <Text style={s.cardHint}>
          {role === 'teacher'
            ? "Generate a code for your class. Students enter it in \"Submit a Creature\" to send in their drawing."
            : "Generate a code for your family. Your child enters it in \"Submit a Creature\" to send in their drawing."}
        </Text>
        <TouchableOpacity style={[s.btn, { marginBottom: 14 }]} onPress={() => router.push('/student/submit-creature')}>
          <MaterialIcons name="palette" size={18} color="white" />
          <Text style={s.btnText}>Submit a Creature</Text>
        </TouchableOpacity>
        {!code ? (
          <TouchableOpacity style={[s.btn, generating && s.btnDisabled]} onPress={generateCode} disabled={generating}>
            {generating ? <ActivityIndicator color="white" size="small" /> : <MaterialIcons name="vpn-key" size={18} color="white" />}
            <Text style={s.btnText}>{generating ? 'Generating…' : 'Generate Code'}</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={s.codeValue}>{code}</Text>
            <Text style={s.codeNote}>Expires in 30 days · up to 10 students can use it</Text>
            <TouchableOpacity style={[s.btn, { backgroundColor: '#4CAF50' }]} onPress={shareCode}>
              <MaterialIcons name="share" size={18} color="white" />
              <Text style={s.btnText}>Share Code</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Pending submissions section */}
      <View style={[s.card, { marginTop: 16 }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="pending-actions" size={24} color="#9C27B0" />
          <Text style={s.cardTitle}>Pending Creatures</Text>
        </View>
        {loadingPending ? (
          <View style={{ marginVertical: 20 }}><EmotionColourLoader visible size={40} /></View>
        ) : pending.length === 0 ? (
          <Text style={s.emptyText}>No creatures waiting for review right now.</Text>
        ) : (
          pending.map((sub) => (
            <View key={sub.id} style={s.subRow}>
              {sub.stage4_url ? (
                <Image source={{ uri: sub.stage4_url }} style={s.thumb} />
              ) : (
                <View style={[s.thumb, s.thumbPlaceholder]}>
                  <MaterialIcons name="pets" size={22} color="#CCC" />
                </View>
              )}
              <View style={{ flex: 1, marginLeft: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[s.zoneDot, { backgroundColor: ZONE_COLORS[sub.emotion_colour] || '#999' }]} />
                  <Text style={s.subName}>{sub.creature_name}</Text>
                </View>
                <Text style={s.subMeta}>
                  {sub.real_student_name ? `For: ${sub.real_student_name}` : sub.student_name}
                  {formatSubDate(sub.created_at) ? ` · ${formatSubDate(sub.created_at)}` : ''}
                </Text>
                {sub.description ? <Text style={s.subMeta}>{sub.description}</Text> : null}
              </View>
              <View style={{ gap: 6 }}>
                <TouchableOpacity
                  style={[s.smallBtn, { backgroundColor: '#4CAF50' }]}
                  onPress={() => approve(sub)}
                  disabled={actioningId === sub.id}
                >
                  {actioningId === sub.id ? <ActivityIndicator color="white" size="small" /> : <MaterialIcons name="check" size={16} color="white" />}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.smallBtn, { backgroundColor: '#F44336' }]}
                  onPress={() => setRejectTarget(sub)}
                  disabled={actioningId === sub.id}
                >
                  <MaterialIcons name="close" size={16} color="white" />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </View>

      {/* My Submissions - real feature Aug 22 (items 8a/8b): status view of this account's
          own submissions, separate from the Pending Creatures moderation queue above. Parent
          sees their own family's; teacher sees everything their classroom(s) have submitted
          (explicit product decision - not just what they personally logged). */}
      <View style={[s.card, { marginTop: 16 }]}>
        <View style={s.cardHeader}>
          <MaterialIcons name="checklist" size={24} color="#9C27B0" />
          <Text style={s.cardTitle}>{role === 'teacher' ? "My Classroom's Submissions" : 'My Submissions'}</Text>
        </View>
        {loadingMySubmissions ? (
          <View style={{ marginVertical: 20 }}><EmotionColourLoader visible size={40} /></View>
        ) : mySubmissions.length === 0 ? (
          <Text style={s.emptyText}>No creatures submitted yet.</Text>
        ) : (
          mySubmissions.map((sub) => {
            const statusInfo = STATUS_INFO[sub.status] || STATUS_INFO.pending;
            return (
              <View key={sub.id} style={s.subRow}>
                {sub.stage4_url ? (
                  <Image source={{ uri: sub.stage4_url }} style={s.thumb} />
                ) : (
                  <View style={[s.thumb, s.thumbPlaceholder]}>
                    <MaterialIcons name="pets" size={22} color="#CCC" />
                  </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.zoneDot, { backgroundColor: ZONE_COLORS[sub.emotion_colour] || '#999' }]} />
                    <Text style={s.subName}>{sub.creature_name}</Text>
                  </View>
                  <Text style={s.subMeta}>
                    {sub.real_student_name ? `For: ${sub.real_student_name}` : sub.student_name}
                    {formatSubDate(sub.created_at) ? ` · ${formatSubDate(sub.created_at)}` : ''}
                  </Text>
                  {sub.status === 'rejected' && sub.rejection_reason ? (
                    <Text style={s.subMeta}>{sub.rejection_reason}</Text>
                  ) : null}
                </View>
                <View style={[s.statusBadge, { backgroundColor: statusInfo.bg }]}>
                  <Text style={[s.statusBadgeText, { color: statusInfo.color }]}>{statusInfo.label}</Text>
                </View>
              </View>
            );
          })
        )}
      </View>

      {/* Reject reason modal */}
      <Modal visible={!!rejectTarget} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Reject "{rejectTarget?.creature_name}"?</Text>
            <Text style={s.modalHint}>Give a short reason - the student will see this.</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Please keep drawings kind and friendly"
              value={rejectReason}
              onChangeText={setRejectReason}
              multiline
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#999' }]} onPress={() => { setRejectTarget(null); setRejectReason(''); }}>
                <Text style={s.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#F44336' }]} onPress={confirmReject}>
                <Text style={s.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  card: { backgroundColor: 'white', borderRadius: 14, padding: 16, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A2E' },
  cardHint: { fontSize: 13, color: '#666', marginBottom: 14, lineHeight: 18 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#9C27B0', borderRadius: 10, paddingVertical: 12 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  codeValue: { fontSize: 32, fontWeight: '900', color: '#9C27B0', textAlign: 'center', letterSpacing: 4, marginBottom: 4 },
  codeNote: { fontSize: 12, color: '#888', textAlign: 'center', marginBottom: 14 },
  emptyText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 20 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbPlaceholder: { backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  zoneDot: { width: 8, height: 8, borderRadius: 4 },
  subName: { fontSize: 14, fontWeight: '700', color: '#1A1A2E' },
  subMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  smallBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '100%' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A2E', marginBottom: 4 },
  modalHint: { fontSize: 13, color: '#666', marginBottom: 10 },
  modalInput: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 10, minHeight: 60, fontSize: 13, textAlignVertical: 'top' },
});
