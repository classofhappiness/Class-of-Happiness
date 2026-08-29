import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, Linking, Pressable, Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList, { NestableScrollContainer, NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { useRouter } from 'expo-router';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import { SecureField } from '../../src/components/SecureField';
import { orderPrimaryTopicsFirst } from '../../src/constants/resourceTopics';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const INDIGO = '#5C6BC0';
const ZONE_COLORS: Record<string,string> = EMOTION_COLOURS;
const ZONE_LABELS: Record<string,string> = { blue:'Blue Emotions', green:'Green Emotions', yellow:'Yellow Emotions', red:'Red Emotions' };
const ZONES = ['blue','green','yellow','red'];

async function apiCall(endpoint: string, token: string|null, options: any = {}) {
  const headers: any = { 'Content-Type':'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, { headers, ...options });
  if (!res.ok) {
    // Real bug fix Aug 28: this used to always throw a bare "API error: <status>", discarding
    // the real backend error detail entirely - every failure in this dashboard (promo code
    // creation, creature featuring, etc.) showed the same unhelpful generic message no matter
    // what actually went wrong (a genuine duplicate, a validation error, a real 500...).
    let detail = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json();
}

// ── Shared Components ────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, icon, color, children, defaultOpen = false }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={s.card}>
      <TouchableOpacity onPress={() => setOpen(v => !v)} style={s.cardHeader} activeOpacity={0.7}>
        <View style={[s.cardIconBox, { backgroundColor: color + '18' }]}>
          <MaterialIcons name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>{title}</Text>
          {subtitle ? <Text style={s.cardSubtitle}>{subtitle}</Text> : null}
        </View>
        <MaterialIcons name={open ? 'expand-less' : 'expand-more'} size={20} color="#999" />
      </TouchableOpacity>
      {open && <View style={s.cardBody}>{children}</View>}
    </View>
  );
}

function StatRow({ label, value, icon, color }: any) {
  return (
    <View style={s.statRow}>
      <MaterialIcons name={icon} size={16} color={color} />
      <Text style={s.statRowLabel}>{label}</Text>
      <Text style={[s.statRowValue, { color }]}>{value ?? '—'}</Text>
    </View>
  );
}

function ColourBar({ zone, count, total }: any) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <View style={s.colourRow}>
      <View style={[s.colourDot, { backgroundColor: ZONE_COLORS[zone] }]} />
      <Text style={s.colourLabel}>{ZONE_LABELS[zone]}</Text>
      <View style={s.colourBarBg}>
        <View style={[s.colourBar, { width: `${pct}%` as any, backgroundColor: ZONE_COLORS[zone] }]} />
      </View>
      <Text style={s.colourPct}>{pct}% ({count})</Text>
    </View>
  );
}

// ── Strategy Manager ─────────────────────────────────────────────────────────

const PERIOD_LABELS: any = { 1: 'Today', 7: '7 Days', 30: '30 Days', 90: '3 Months', 180: '6 Months', 365: '1 Year', 730: '2 Years', 1095: '3 Years' };

const ROLE_COLORS: any = { teacher: '#4CAF73', parent: '#4A90D9', school_admin: '#FFD93D', student: '#9C27B0', superadmin: '#E05252' };
const ROLE_EMOJI: any = { teacher: '👩‍🏫', parent: '👨‍👩‍👧', school_admin: '🏫' };

// Small "dropdown" filter — RN has no native <select>, so this opens a modal list.
// Mirrors the portal's saUserSchoolFilter/saUserCountryFilter <select> pair (item 10).
function FilterPickerButton({ label, value, options, onChange }: { label: string, value: string, options: string[], onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: value ? '#5C6BC0' : '#F0F0F0' }}
      >
        <Text style={{ fontSize: 11, fontWeight: '700', color: value ? 'white' : '#666' }} numberOfLines={1}>{value || label}</Text>
        <MaterialIcons name="arrow-drop-down" size={14} color={value ? 'white' : '#666'} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={[s.modalCard, { maxHeight: '70%' }]}>
            <Text style={s.cardTitle}>{label}</Text>
            <ScrollView style={{ marginTop: 8 }}>
              <TouchableOpacity style={{ paddingVertical: 10 }} onPress={() => { onChange(''); setOpen(false); }}>
                <Text style={{ fontSize: 13, fontWeight: value === '' ? '800' : '500', color: value === '' ? '#5C6BC0' : '#333' }}>All {label}</Text>
              </TouchableOpacity>
              {options.map(opt => (
                <TouchableOpacity key={opt} style={{ paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }} onPress={() => { onChange(opt); setOpen(false); }}>
                  <Text style={{ fontSize: 13, fontWeight: value === opt ? '800' : '500', color: value === opt ? '#5C6BC0' : '#333' }}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const SUB_BADGE_COLORS: Record<string, { bg: string, fg: string }> = {
  free: { bg: '#F0F0F0', fg: '#666' },
  trial: { bg: '#FFF8E1', fg: '#F57F17' },
  school_covered: { bg: '#E3F2FD', fg: '#1565C0' },
  school_covered_lapsed: { bg: '#FFF3E0', fg: '#E65100' },
  teacher_sub: { bg: '#E8F5E9', fg: '#2E7D32' },
  parent_sub: { bg: '#E8F5E9', fg: '#2E7D32' },
  active: { bg: '#E8F5E9', fg: '#2E7D32' },
  lapsed: { bg: '#FFEBEE', fg: '#C62828' },
};

// Real feature Aug 27 (item 10): per Jono's decision — "school-covered" badge uses the
// LOOSE definition (school_admin_id is set at all), matching check_subscription_active
// (server.py), which is what actually gates this user's access day-to-day. The stricter
// "is the school's own subscription genuinely active" check only adds a secondary visual
// flag (school_covered_lapsed) rather than replacing the primary badge, since Jono wants
// both: what the user experiences AND a way to spot a school that's stopped paying.
function getSubBadge(u: any, schoolAdminStatus: Record<string, string>): { key: string, label: string } | null {
  if (u.role === 'school_admin') {
    const st = u.subscription_status;
    if (st === 'active') return { key: 'active', label: 'School Plan Active' };
    if (st === 'trial') return { key: 'trial', label: 'Trial' };
    return { key: 'lapsed', label: 'Lapsed' };
  }
  if (u.role === 'teacher' || u.role === 'parent') {
    if (u.school_admin_id) {
      const adminStatus = schoolAdminStatus[u.school_admin_id];
      const lapsed = adminStatus && adminStatus !== 'active';
      return lapsed
        ? { key: 'school_covered_lapsed', label: 'School-Covered ⚠️' }
        : { key: 'school_covered', label: 'School-Covered' };
    }
    if (u.subscription_status === 'active') return { key: u.role === 'teacher' ? 'teacher_sub' : 'parent_sub', label: u.role === 'teacher' ? 'Teacher-Sub' : 'Parent-Sub' };
    if (u.subscription_status === 'trial') return { key: 'trial', label: 'Trial' };
    return { key: 'free', label: 'Free' };
  }
  return null;
}

function getDaysLeftLabel(expiresAt?: string): { text: string, color: string } | null {
  if (!expiresAt) return null;
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `Expired ${Math.abs(days)}d ago`, color: '#C62828' };
  if (days === 0) return { text: 'Expires today', color: '#C62828' };
  return { text: `${days}d left`, color: days <= 7 ? '#E65100' : '#666' };
}

function getUsageLabel(freq: any, role: string): string | null {
  if (!freq) return (role === 'teacher' || role === 'parent') ? 'No check-ins (30d)' : null;
  if (freq.count_7d > 0) return `${freq.count_7d}/wk`;
  if (freq.count_14d > 0) return `${freq.count_14d}/fortnight`;
  if (freq.count_30d > 0) return `${freq.count_30d}/month`;
  return 'No check-ins (30d)';
}

function UsersManager({ authToken, isSuperAdmin }: { authToken: string|null, isSuperAdmin: boolean }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [checkinFreq, setCheckinFreq] = useState<Record<string, any>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [suspendBusyId, setSuspendBusyId] = useState<string | null>(null);

  useEffect(() => {
    // Real fix Aug 21: this always called /admin/users, which is hardcoded superadmin-only
    // (server.py) - for a school_admin this silently 403'd and the .catch() below swallowed
    // it into an empty list, same bug class already found and fixed on the portal tonight.
    // /school-admin/users is the school-scoped equivalent (same {users,total} response shape).
    const endpoint = isSuperAdmin ? '/admin/users?limit=200' : '/school-admin/users?limit=200';
    apiCall(endpoint, authToken)
      .then((d: any) => setUsers(Array.isArray(d?.users) ? d.users : (Array.isArray(d) ? d : [])))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
    // Real feature Aug 27 (item 10): bulk usage-frequency map, superadmin-only endpoint —
    // school_admin has no equivalent (their own users list is small enough to not need it
    // yet, and the badge is a superadmin operational tool per the original ask).
    if (isSuperAdmin) {
      apiCall('/admin/users/checkin-frequency', authToken)
        .then((d: any) => setCheckinFreq(d && typeof d === 'object' ? d : {}))
        .catch(() => setCheckinFreq({}));
    }
  }, [authToken, isSuperAdmin]);

  if (loading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <EmotionColourLoader visible size={56} />
      </View>
    );
  }

  const roles = Array.from(new Set(users.map((u: any) => u.role).filter(Boolean)));
  const schools = Array.from(new Set(users.map((u: any) => u.school_name).filter(Boolean))).sort() as string[];
  const countries = Array.from(new Set(users.map((u: any) => u.school_country).filter(Boolean))).sort() as string[];
  const schoolAdminStatus: Record<string, string> = {};
  users.forEach((u: any) => { if (u.role === 'school_admin') schoolAdminStatus[u.user_id] = u.subscription_status; });

  const filtered = users.filter((u: any) =>
    (!roleFilter || u.role === roleFilter) &&
    (!schoolFilter || u.school_name === schoolFilter) &&
    (!countryFilter || u.school_country === countryFilter)
  );

  // Real fix Aug 28 (item 1): crash reported on real device. The bare `import('expo-clipboard')`
  // call had no synchronous guard - if the native module isn't linked in the running build
  // (e.g. added to package.json after the last native build/TestFlight upload), resolving it
  // can throw before the promise chain's own .catch() ever attaches, bypassing normal JS error
  // handling. Matches the already-proven-safe pattern used by settings.tsx's own copy-code
  // button: try legacy RN Clipboard first (optional-chained, no-ops if absent), fall back to
  // expo-clipboard, and wrap the whole thing in a real try/catch so nothing here can crash
  // the screen regardless of which native modules are actually available.
  const copyEmail = (u: any) => {
    try {
      const { Clipboard } = require('react-native');
      if (Clipboard?.setString) {
        Clipboard.setString(u.email);
      } else {
        import('expo-clipboard').then(m => m.setStringAsync(u.email)).catch(() => {});
      }
    } catch {}
    setCopiedId(u.user_id);
    setTimeout(() => setCopiedId((id) => (id === u.user_id ? null : id)), 1500);
  };

  // Real feature Aug 27 (item 11, account management): lives here rather than in Settings
  // since the user_id/name are already in memory from this list — a separate email-lookup
  // tool in Settings would just duplicate this data for a worse UX.
  const doSuspend = (u: any) => {
    Alert.alert(
      `Suspend ${u.name || u.email}?`,
      'This immediately blocks login and kills any active session. It can be reversed at any time.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Suspend', style: 'destructive', onPress: async () => {
          setSuspendBusyId(u.user_id);
          try {
            await apiCall(`/admin/users/${u.user_id}/suspend`, authToken, { method: 'POST', body: JSON.stringify({}) });
            setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, account_suspended: true } : x));
          } catch { Alert.alert('Error', 'Could not suspend this account.'); }
          setSuspendBusyId(null);
        }},
      ]
    );
  };

  const doReactivate = async (u: any) => {
    setSuspendBusyId(u.user_id);
    try {
      await apiCall(`/admin/users/${u.user_id}/reactivate`, authToken, { method: 'POST', body: JSON.stringify({}) });
      setUsers(prev => prev.map(x => x.user_id === u.user_id ? { ...x, account_suspended: false } : x));
    } catch { Alert.alert('Error', 'Could not reactivate this account.'); }
    setSuspendBusyId(null);
  };

  return (
    <View style={{ padding: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: roleFilter === '' ? '#1A1A2E' : '#F0F0F0' }}
            onPress={() => setRoleFilter('')}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: roleFilter === '' ? 'white' : '#666' }}>All ({users.length})</Text>
          </TouchableOpacity>
          {roles.map((r: any) => (
            <TouchableOpacity
              key={r}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: roleFilter === r ? (ROLE_COLORS[r] || '#5C6BC0') : '#F0F0F0' }}
              onPress={() => setRoleFilter(r)}
            >
              <Text style={{ fontSize: 11, fontWeight: '700', color: roleFilter === r ? 'white' : '#666' }}>{r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {isSuperAdmin && (schools.length > 0 || countries.length > 0) && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
          <FilterPickerButton label="Schools" value={schoolFilter} options={schools} onChange={setSchoolFilter} />
          <FilterPickerButton label="Countries" value={countryFilter} options={countries} onChange={setCountryFilter} />
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <MaterialIcons name="people" size={40} color="#CCC" />
          <Text style={{ marginTop: 8, color: '#999', fontSize: 13 }}>No users found</Text>
        </View>
      ) : (
        filtered.slice(0, 50).map((u: any, i: number) => {
          const badge = isSuperAdmin ? getSubBadge(u, schoolAdminStatus) : null;
          const badgeColors = badge ? (SUB_BADGE_COLORS[badge.key] || SUB_BADGE_COLORS.free) : null;
          const daysLeft = isSuperAdmin && badge && (badge.key === 'active' || badge.key === 'teacher_sub' || badge.key === 'parent_sub' || badge.key === 'trial') ? getDaysLeftLabel(u.subscription_expires_at) : null;
          const usage = isSuperAdmin ? getUsageLabel(checkinFreq[u.user_id], u.role) : null;
          return (
            <View key={i} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (ROLE_COLORS[u.role] || '#E0E0E0') + '22', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14 }}>{ROLE_EMOJI[u.role] || '👤'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A2E' }} numberOfLines={1}>{u.name || u.email}</Text>
                  <Text style={{ fontSize: 11, color: '#999' }} numberOfLines={1}>{u.school_name ? `${u.school_name} · ` : ''}{u.email}</Text>
                </View>
                <TouchableOpacity onPress={() => copyEmail(u)} hitSlop={8} style={{ padding: 4 }}>
                  <MaterialIcons name={copiedId === u.user_id ? 'check' : 'content-copy'} size={15} color={copiedId === u.user_id ? '#2E7D32' : '#AAA'} />
                </TouchableOpacity>
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: (ROLE_COLORS[u.role] || '#E0E0E0') + '22' }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: ROLE_COLORS[u.role] || '#666' }}>{u.role}</Text>
                </View>
              </View>
              {isSuperAdmin && (badge || usage || u.role !== 'superadmin') && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6, marginLeft: 44 }}>
                  {u.account_suspended && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: '#FFEBEE' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#C62828' }}>⛔ Suspended</Text>
                    </View>
                  )}
                  {badge && badgeColors && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: badgeColors.bg }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: badgeColors.fg }}>{badge.label}</Text>
                    </View>
                  )}
                  {daysLeft && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: '#F5F5F5' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: daysLeft.color }}>{daysLeft.text}</Text>
                    </View>
                  )}
                  {usage && (
                    <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: '#F5F5F5' }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#666' }}>📊 {usage}</Text>
                    </View>
                  )}
                  {u.role !== 'superadmin' && (
                    <TouchableOpacity
                      disabled={suspendBusyId === u.user_id}
                      onPress={() => u.account_suspended ? doReactivate(u) : doSuspend(u)}
                      style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 9, backgroundColor: u.account_suspended ? '#E8F5E9' : '#F5F5F5', opacity: suspendBusyId === u.user_id ? 0.5 : 1 }}
                    >
                      <Text style={{ fontSize: 9, fontWeight: '800', color: u.account_suspended ? '#2E7D32' : '#999' }}>{u.account_suspended ? '✅ Reactivate' : 'Suspend'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          );
        })
      )}
      {filtered.length > 50 && (
        <Text style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 10 }}>Showing first 50 of {filtered.length}</Text>
      )}
    </View>
  );
}

const SCHOOL_STATUSES = ['active', 'trial', 'lapsed'] as const;
const SCHOOL_STATUS_COLORS: Record<string, { bg: string, fg: string }> = {
  active: { bg: '#E8F5E9', fg: '#2E7D32' },
  trial: { bg: '#FFF8E1', fg: '#F57F17' },
  lapsed: { bg: '#FFEBEE', fg: '#C62828' },
};

// App-side "Registered Schools" tab — mirrors the portal's schoolManagementHTML/
// loadSASchools (portal100.html) as the source of truth. Real fix Aug 27 (item 9):
// this previously listed schools_breakdown (check-in activity) as its primary source,
// which meant a school added here with zero check-ins yet simply never appeared and
// couldn't be edited — and there was no Edit at all, only Add. The portal deliberately
// keeps "School Check-in Activity" and "Registered Schools" as two separate surfaces
// (see portal100.html's own Aug 26 comment) — the app already has its own equivalent
// check-in breakdown card (Analytics tab, "Schools Breakdown"), so this tab now sources
// from /admin/school-profiles directly, same as the portal, and merges in check-in
// counts as supplementary info rather than as the list itself.
function SchoolsManager({ stats, statsLoading, authToken, statsPeriod }: { stats: any, statsLoading: boolean, authToken: string|null, statsPeriod: number }) {
  const { t } = useApp();
  const breakdown = stats?.schools_breakdown || [];
  const [profiles, setProfiles] = useState<any[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ status: 'active' });

  const loadProfiles = useCallback(() => {
    setProfilesLoading(true);
    apiCall('/admin/school-profiles', authToken)
      .then((d: any[]) => setProfiles(Array.isArray(d) ? d : []))
      .catch(() => setProfiles([]))
      .finally(() => setProfilesLoading(false));
  }, [authToken]);

  useEffect(() => { loadProfiles(); }, [loadProfiles]);

  const field = (key: string, opts: { keyboardType?: any } = {}) => (
    <TextInput
      style={{ backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }}
      placeholder={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
      value={form[key] != null ? String(form[key]) : ''}
      onChangeText={v => setForm((f: any) => ({ ...f, [key]: v }))}
      keyboardType={opts.keyboardType}
    />
  );

  const openAddForm = () => {
    setEditingId(null);
    setForm({ status: 'active' });
    setShowForm(true);
  };

  const openEditForm = (p: any) => {
    setEditingId(p.id);
    setForm({ ...p });
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ status: 'active' });
  };

  const handleSaveSchool = async () => {
    if (!form.school_name?.trim()) { Alert.alert('Error', 'School name is required'); return; }
    setSaving(true);
    const payload = {
      ...form,
      lat: form.lat ? parseFloat(form.lat) : null,
      lng: form.lng ? parseFloat(form.lng) : null,
      student_count_official: form.student_count_official ? parseInt(form.student_count_official, 10) : null,
      subscription_seats: form.subscription_seats ? parseInt(form.subscription_seats, 10) : null,
    };
    try {
      if (editingId) {
        await apiCall(`/admin/school-profiles/${editingId}`, authToken, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiCall('/admin/school-profiles', authToken, { method: 'POST', body: JSON.stringify(payload) });
      }
      cancelForm();
      loadProfiles();
      Alert.alert('✅ Success', editingId ? 'School updated.' : 'School added.');
    } catch {
      Alert.alert('Error', editingId ? 'Could not update school.' : 'Could not add school.');
    }
    setSaving(false);
  };

  if (statsLoading || profilesLoading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <EmotionColourLoader visible size={56} />
      </View>
    );
  }

  return (
    <View style={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E' }}>🏫 Registered Schools</Text>
        <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 }}>
          <Text style={{ fontSize: 11, fontWeight: '800', color: '#2E7D32' }}>{profiles.length} schools</Text>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => (showForm ? cancelForm() : openAddForm())}
        style={{ backgroundColor: '#1A1A2E', borderRadius: 25, paddingVertical: 10, alignItems: 'center', marginBottom: 12 }}
      >
        <Text style={{ color: '#FFD93D', fontWeight: '800', fontSize: 13 }}>{showForm ? '✕ Cancel' : '+ Add School'}</Text>
      </TouchableOpacity>

      {showForm && (
        <View style={{ backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A2E', marginBottom: 8 }}>{editingId ? '✏️ Edit School' : '➕ Add School'}</Text>
          {field('school_name')}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('city')}</View>
            <View style={{ flex: 1 }}>{field('country')}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('lat', { keyboardType: 'numeric' })}</View>
            <View style={{ flex: 1 }}>{field('lng', { keyboardType: 'numeric' })}</View>
          </View>
          {field('website')}
          {field('phone')}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('principal_name')}</View>
            <View style={{ flex: 1 }}>{field('principal_email')}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('wellbeing_lead_name')}</View>
            <View style={{ flex: 1 }}>{field('wellbeing_lead_email')}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('school_type')}</View>
            <View style={{ flex: 1 }}>{field('student_count_official', { keyboardType: 'numeric' })}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('subscription_package')}</View>
            <View style={{ flex: 1 }}>{field('subscription_seats', { keyboardType: 'numeric' })}</View>
          </View>
          {field('subscription_renewal_date', {})}
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 4 }}>Status</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
            {SCHOOL_STATUSES.map(st => (
              <TouchableOpacity
                key={st}
                onPress={() => setForm((f: any) => ({ ...f, status: st }))}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: form.status === st ? SCHOOL_STATUS_COLORS[st].fg : '#F0F0F0' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: form.status === st ? 'white' : '#666' }}>{st.charAt(0).toUpperCase() + st.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            style={{ backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8, minHeight: 50, textAlignVertical: 'top' }}
            placeholder="Notes"
            multiline
            value={form.notes || ''}
            onChangeText={v => setForm((f: any) => ({ ...f, notes: v }))}
          />
          <TouchableOpacity
            onPress={handleSaveSchool}
            disabled={saving}
            style={{ backgroundColor: '#5C6BC0', borderRadius: 25, paddingVertical: 10, alignItems: 'center', marginTop: 4, opacity: saving ? 0.6 : 1 }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{saving ? 'Saving...' : editingId ? 'Save Changes' : 'Save School'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {profiles.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <MaterialIcons name="business" size={40} color="#CCC" />
          <Text style={{ marginTop: 8, color: '#999', fontSize: 13 }}>No schools yet — tap "+ Add School" above.</Text>
        </View>
      ) : (
        <>
          <Text style={{ fontSize: 11, color: '#999', marginBottom: 8, textAlign: 'center' }}>
            Check-in counts for: {PERIOD_LABELS[statsPeriod] || `${statsPeriod} days`}
          </Text>
          {profiles.map((profile: any) => {
            const name = profile.school_name || 'Unnamed School';
            const bd = breakdown.find((b: any) => (b.name || '').trim().toLowerCase() === name.trim().toLowerCase());
            const zc = bd?.zone_counts || {};
            const isOpen = !!expanded[profile.id];
            const statusColors = SCHOOL_STATUS_COLORS[profile.status] || SCHOOL_STATUS_COLORS.active;
            return (
              <View key={profile.id} style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EEE' }}>
                <TouchableOpacity onPress={() => setExpanded(e => ({ ...e, [profile.id]: !e[profile.id] }))} activeOpacity={0.7}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="business" size={20} color="#5C6BC0" />
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E', flex: 1 }}>{name}</Text>
                    <View style={{ backgroundColor: statusColors.bg, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                      <Text style={{ fontSize: 9, fontWeight: '800', color: statusColors.fg }}>{(profile.status || 'active').toUpperCase()}</Text>
                    </View>
                    <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color="#999" />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                    {!!(profile.city || profile.country) && (
                      <Text style={{ fontSize: 12, color: '#666' }}>🌍 {[profile.city, profile.country].filter(Boolean).join(', ')}</Text>
                    )}
                    {!!profile.student_count_official && <Text style={{ fontSize: 12, color: '#666' }}>👥 {profile.student_count_official} students</Text>}
                    {!!profile.subscription_package && <Text style={{ fontSize: 12, color: '#666' }}>💰 {profile.subscription_package}</Text>}
                  </View>
                  {bd && (
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 11, color: '#666' }}>Check-ins: <Text style={{ fontWeight: '700', color: '#1A1A2E' }}>{bd.total_checkins || 0}</Text></Text>
                      <Text style={{ fontSize: 11, color: EMOTION_COLOURS.green }}>🟢 {zc.green || 0}</Text>
                      <Text style={{ fontSize: 11, color: EMOTION_COLOURS.blue }}>🔵 {zc.blue || 0}</Text>
                      <Text style={{ fontSize: 11, color: EMOTION_COLOURS.yellow }}>🟡 {zc.yellow || 0}</Text>
                      <Text style={{ fontSize: 11, color: EMOTION_COLOURS.red }}>🔴 {zc.red || 0}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {isOpen && (
                  <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                    {(profile.website || profile.phone || profile.principal_name || profile.principal_email || profile.wellbeing_lead_name || profile.wellbeing_lead_email || profile.school_type) ? (
                      <>
                        {!!profile.website && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>🌐 {profile.website}</Text>}
                        {!!profile.phone && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>📞 {profile.phone}</Text>}
                        {!!(profile.principal_name || profile.principal_email) && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>👤 Principal: {profile.principal_name}{profile.principal_email ? ` (${profile.principal_email})` : ''}</Text>}
                        {!!(profile.wellbeing_lead_name || profile.wellbeing_lead_email) && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>💚 Wellbeing Lead: {profile.wellbeing_lead_name}{profile.wellbeing_lead_email ? ` (${profile.wellbeing_lead_email})` : ''}</Text>}
                        {!!profile.school_type && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>🏫 Type: {profile.school_type}</Text>}
                      </>
                    ) : (
                      <Text style={{ fontSize: 12, color: '#AAA', fontStyle: 'italic', marginBottom: 6 }}>No contact details added yet — tap Edit to add website, phone, principal or wellbeing lead.</Text>
                    )}
                    {!!profile.subscription_renewal_date && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>📅 Renewal: {profile.subscription_renewal_date}</Text>}
                    {!!profile.notes && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>📝 {profile.notes}</Text>}
                    <TouchableOpacity
                      onPress={() => openEditForm(profile)}
                      style={{ marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#EEE', borderRadius: 14, flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <MaterialIcons name="edit" size={13} color="#5C6BC0" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#5C6BC0' }}>Edit</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}
    </View>
  );
}

// Real feature Aug 27 (item 11): promo codes were hardcoded in a Python dict, needing a
// code deploy to add or change one. This CRUD panel talks to /admin/promo-codes
// (server.py) — DB-backed, superadmin-only. Built-in (hardcoded) codes are shown
// read-only alongside real ones so superadmin sees the full picture in one place.
function PromoCodesCard({ authToken }: { authToken: string|null }) {
  const [codes, setCodes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({ code: '', days: '30', max_uses: '', expires_at: '', notes: '' });

  const load = useCallback(() => {
    setLoading(true);
    apiCall('/admin/promo-codes', authToken)
      .then((d: any) => setCodes(Array.isArray(d) ? d : []))
      .catch(() => setCodes([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    const code = form.code.trim().toUpperCase();
    if (!code) { Alert.alert('Error', 'Code is required'); return; }
    setSaving(true);
    try {
      await apiCall('/admin/promo-codes', authToken, {
        method: 'POST',
        body: JSON.stringify({
          code,
          days: parseInt(form.days) || 30,
          max_uses: form.max_uses ? parseInt(form.max_uses) : null,
          expires_at: form.expires_at || null,
          notes: form.notes,
        }),
      });
      setForm({ code: '', days: '30', max_uses: '', expires_at: '', notes: '' });
      setShowForm(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Could not create code.');
    }
    setSaving(false);
  };

  const toggleActive = async (c: any) => {
    try {
      await apiCall(`/admin/promo-codes/${c.code}`, authToken, { method: 'PUT', body: JSON.stringify({ is_active: !c.is_active }) });
      setCodes(prev => prev.map(x => x.code === c.code ? { ...x, is_active: !c.is_active } : x));
    } catch { Alert.alert('Error', 'Could not update code.'); }
  };

  const remove = (c: any) => {
    Alert.alert('Delete code', `Delete "${c.code}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiCall(`/admin/promo-codes/${c.code}`, authToken, { method: 'DELETE' });
          setCodes(prev => prev.filter(x => x.code !== c.code));
        } catch { Alert.alert('Error', 'Could not delete code.'); }
      }},
    ]);
  };

  return (
    <SectionCard title="Promo / Trial Codes" subtitle="Manage trial-unlock codes without a deploy" icon="local-offer" color="#FF9800">
      {loading ? <EmotionColourLoader visible size={36} /> : (
        <>
          {codes.map((c: any) => (
            <View key={c.code} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A2E', flex: 1 }}>{c.code}</Text>
                {c.is_builtin && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#EDE7F6' }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: '#7C5CBF' }}>BUILT-IN</Text>
                  </View>
                )}
                {!c.is_builtin && (
                  <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: c.is_active ? '#E8F5E9' : '#F0F0F0' }}>
                    <Text style={{ fontSize: 8, fontWeight: '800', color: c.is_active ? '#2E7D32' : '#999' }}>{c.is_active ? 'ACTIVE' : 'INACTIVE'}</Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                {c.days}d trial{c.max_uses != null ? ` · ${c.uses || 0}/${c.max_uses} uses` : (c.uses != null ? ` · ${c.uses} uses` : '')}{c.expires_at ? ` · expires ${String(c.expires_at).slice(0, 10)}` : ''}
              </Text>
              {!!c.notes && <Text style={{ fontSize: 11, color: '#AAA', marginTop: 1 }}>{c.notes}</Text>}
              {!c.is_builtin && (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <TouchableOpacity onPress={() => toggleActive(c)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: INDIGO }}>{c.is_active ? 'Deactivate' : 'Activate'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => remove(c)}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#F44336' }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
          {codes.length === 0 && <Text style={s.hint}>No promo codes yet.</Text>}

          <TouchableOpacity onPress={() => setShowForm(v => !v)} style={{ marginTop: 10 }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: INDIGO }}>{showForm ? '✕ Cancel' : '+ New Code'}</Text>
          </TouchableOpacity>
          {showForm && (
            <View style={{ backgroundColor: '#FAFAFA', borderRadius: 10, padding: 10, marginTop: 8 }}>
              <TextInput style={s.input} placeholder="CODE (e.g. SUMMER2026)" autoCapitalize="characters" value={form.code} onChangeText={v => setForm((f: any) => ({ ...f, code: v }))} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Trial days" keyboardType="numeric" value={form.days} onChangeText={v => setForm((f: any) => ({ ...f, days: v }))} />
                <TextInput style={[s.input, { flex: 1 }]} placeholder="Max uses (optional)" keyboardType="numeric" value={form.max_uses} onChangeText={v => setForm((f: any) => ({ ...f, max_uses: v }))} />
              </View>
              <TextInput style={s.input} placeholder="Expires YYYY-MM-DD (optional)" value={form.expires_at} onChangeText={v => setForm((f: any) => ({ ...f, expires_at: v }))} />
              <TextInput style={s.input} placeholder="Notes (optional)" value={form.notes} onChangeText={v => setForm((f: any) => ({ ...f, notes: v }))} />
              <TouchableOpacity style={[s.btn, { opacity: saving ? 0.6 : 1 }]} disabled={saving} onPress={create}>
                <Text style={s.btnText}>{saving ? 'Creating...' : 'Create Code'}</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </SectionCard>
  );
}

const EXPORT_TYPES = [
  { key: 'checkins', label: 'Check-ins' },
  { key: 'users', label: 'Users' },
  { key: 'students', label: 'Students' },
  { key: 'resources', label: 'Resources' },
];

// Real feature Aug 27 (item 11): the backend endpoint (GET /admin/export) already existed
// but was a completely unscoped full-table JSON dump with no UI anywhere - see its
// docstring for the real authorization/PII fixes made alongside this UI. Uses the same
// token-as-query-param + Linking.openURL pattern already established for PDF downloads
// elsewhere in this file (handleDownload above).
function DataExportCard({ authToken }: { authToken: string|null }) {
  const [exportType, setExportType] = useState('checkins');
  const [format, setFormat] = useState<'json'|'csv'>('csv');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const doExport = async () => {
    const params = new URLSearchParams({ type: exportType, format, token: authToken || '' });
    if (dateFrom.trim()) params.set('date_from', dateFrom.trim());
    if (dateTo.trim()) params.set('date_to', dateTo.trim());
    const url = `${BACKEND_URL}/api/admin/export?${params.toString()}`;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Error', 'Could not start the export.');
    }
  };

  return (
    <SectionCard title="Data Export" subtitle="Scoped, redacted export — school_admin sees only their own school" icon="download" color="#4A90D9">
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 4 }}>Data type</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {EXPORT_TYPES.map(t => (
          <TouchableOpacity key={t.key} onPress={() => setExportType(t.key)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: exportType === t.key ? INDIGO : '#F0F0F0' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: exportType === t.key ? 'white' : '#666' }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 4 }}>Date range (optional)</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <TextInput style={[s.input, { flex: 1 }]} placeholder="From YYYY-MM-DD" value={dateFrom} onChangeText={setDateFrom} />
        <TextInput style={[s.input, { flex: 1 }]} placeholder="To YYYY-MM-DD" value={dateTo} onChangeText={setDateTo} />
      </View>
      <Text style={{ fontSize: 11, fontWeight: '700', color: '#999', marginBottom: 4 }}>Format</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {(['csv', 'json'] as const).map(f => (
          <TouchableOpacity key={f} onPress={() => setFormat(f)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: format === f ? INDIGO : '#F0F0F0' }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: format === f ? 'white' : '#666' }}>{f.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.btn} onPress={doExport}>
        <MaterialIcons name="download" size={16} color="white" />
        <Text style={s.btnText}>Export</Text>
      </TouchableOpacity>
      <Text style={[s.hint, { marginTop: 8 }]}>Password hashes and reset tokens are always stripped from user exports.</Text>
    </SectionCard>
  );
}

function SuperAdminSettings({ authToken, stats }: { authToken: string|null, stats: any }) {
  return (
    <View>
      <Text style={s.sectionHint}>Super admin app controls and configuration.</Text>
      <SectionCard title="Platform Version" subtitle="v2.1 — May 2026" icon="info" color={INDIGO} defaultOpen>
        <StatRow label="Version" value="2.1" icon="info" color={INDIGO} />
        <StatRow label="Total users" value={stats?.total_users} icon="people" color="#4CAF50" />
      </SectionCard>
      <PromoCodesCard authToken={authToken} />
      <DataExportCard authToken={authToken} />
    </View>
  );
}

function StrategyManager({ authToken, isSuperAdmin }: { authToken: string|null, isSuperAdmin: boolean }) {
  const [type, setType] = useState<'teacher'|'student'|'parent'>('student');
  const [strats, setStrats] = useState<any[]>([]);
  const [zone, setZone] = useState('green');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [editing, setEditing] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [zoneFilter, setZoneFilter] = useState('');
  const [audience, setAudience] = useState<'all_students'|'all_teachers'|'all_parents'>('all_students');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isSuperAdmin) {
        // Real fix Aug 16: school_admin sees a MERGED view — superadmin's global
        // defaults for this type, plus their own custom/forked strategies. A global
        // item that's been forked (edited/deleted/reordered locally) is excluded
        // from the global side and shown from the school's own copy instead.
        const d = await apiCall(`/school-admin/school-strategies?strategy_type=${type}`, authToken);
        const schoolSpecific = Array.isArray(d?.school_specific) ? d.school_specific : [];
        const globalList = Array.isArray(d?.global) ? d.global : [];
        const forkedIds = new Set(schoolSpecific.map((s: any) => s.forked_from).filter(Boolean));
        const visibleGlobal = globalList.filter((g: any) => !forkedIds.has(g.id)).map((g: any) => ({ ...g, _isGlobal: true }));
        const visibleSchool = schoolSpecific.filter((s: any) => s.is_active !== false);
        const merged = [...visibleGlobal, ...visibleSchool].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
        setStrats(merged);
      } else if (type === 'teacher' || type === 'parent') {
        const d = await apiCall(`/admin/teacher-strategies?strategy_type=${type}`, authToken);
        setStrats(Array.isArray(d) ? d : []);
      } else {
        const all = await Promise.all(ZONES.map(z =>
          apiCall(`/strategies?zone=${z}`, authToken)
            .then((d: any[]) => (Array.isArray(d) ? d : []).map(s => ({ ...s, zone: s.zone || z })))
            .catch(() => [])
        ));
        const flat = all.flat();
        const seen = new Set();
        setStrats(flat.filter((s: any) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; }));
      }
    } catch { setStrats([]); }
    setLoading(false);
  }, [type, authToken, isSuperAdmin]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    // Real fix Aug 16: school_admin always saves to their own scoped table with
    // strategy_type set (no separate student-only endpoint like superadmin has).
    const ep = !isSuperAdmin
      ? '/school-admin/school-strategies'
      : (type === 'teacher' || type === 'parent') ? '/admin/teacher-strategies' : '/strategies';
    const body: any = { name, description: desc, zone, icon: 'star' };
    if (!isSuperAdmin) {
      body.strategy_type = type;
      // Editing a GLOBAL (superadmin-set) item forks it into the school's own
      // copy instead of trying to edit the shared global record.
      if (editing?._isGlobal) { body.forked_from = editing.id; body.order_index = editing.order_index ?? 0; }
    } else if (type === 'teacher' || type === 'parent') {
      body.strategy_type = type; body.audience = audience;
    }
    const isForkOnEdit = !isSuperAdmin && editing?._isGlobal;
    try {
      if (editing && !isForkOnEdit) {
        await apiCall(`${ep}/${editing.id}`, authToken, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiCall(ep, authToken, { method: 'POST', body: JSON.stringify(body) });
      }
      setName(''); setDesc(''); setEditing(null); load();
      Alert.alert('✅ Saved');
    } catch { Alert.alert('Error', 'Could not save.'); }
  };

  const del = (strat: any) => {
    Alert.alert('Delete', `Delete "${strat.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          if (!isSuperAdmin && strat._isGlobal) {
            // Real fix Aug 16: can't delete a global (superadmin-owned) record —
            // fork it as inactive instead. Hides it from this school's view while
            // leaving the original global item untouched for every other school.
            await apiCall('/school-admin/school-strategies', authToken, {
              method: 'POST',
              body: JSON.stringify({ name: strat.name, description: strat.description, icon: strat.icon, zone: strat.zone, strategy_type: type, forked_from: strat.id, is_active: false, order_index: strat.order_index ?? 0 }),
            });
          } else {
            const ep = !isSuperAdmin
              ? '/school-admin/school-strategies'
              : (type === 'teacher' || type === 'parent') ? '/admin/teacher-strategies' : '/strategies';
            await apiCall(`${ep}/${strat.id}`, authToken, { method: 'DELETE' });
          }
          load();
        } catch { Alert.alert('Error', 'Could not delete.'); }
      }},
    ]);
  };

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.hint}>{isSuperAdmin ? '⚠️ Global strategies affect ALL schools.' : 'Add strategies for your school only.'}</Text>

      {/* Type toggle */}
      <View style={s.chipRow}>
        {(['student', 'teacher', 'parent'] as const).map(tp => (
          <TouchableOpacity key={tp} style={[s.chip, type === tp && s.chipActive]} onPress={() => setType(tp)}>
            <Text style={[s.chipText, type === tp && s.chipTextActive]}>{tp === 'teacher' ? '👩‍🏫 Teacher' : tp === 'parent' ? '👨‍👩‍👧 Parent' : '🧒 Student'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Real fix Aug 15: zone-color filter, added per Jono's request */}
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <TouchableOpacity
          style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: zoneFilter === '' ? '#1A1A2E' : '#F0F0F0' }}
          onPress={() => setZoneFilter('')}
        >
          <Text style={{ fontSize: 10, fontWeight: '700', color: zoneFilter === '' ? 'white' : '#666' }}>All</Text>
        </TouchableOpacity>
        {ZONES.map(z => (
          <TouchableOpacity
            key={z}
            style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: ZONE_COLORS[z], alignItems: 'center', justifyContent: 'center', opacity: zoneFilter === '' || zoneFilter === z ? 1 : 0.3, borderWidth: zoneFilter === z ? 2 : 0, borderColor: '#1A1A2E' }}
            onPress={() => setZoneFilter(zoneFilter === z ? '' : z)}
          >
            <Text style={{ color: 'white', fontSize: 11, fontWeight: '800' }}>{z[0].toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Add/Edit form — real fix Aug 16: available to school_admin now too */}
      {(
        <View style={s.formBox}>
          <Text style={s.formTitle}>{editing ? '✏️ Editing strategy' : '➕ Add strategy'}</Text>
          <View style={s.chipRow}>
            {ZONES.map(z => (
              <TouchableOpacity key={z} style={[s.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: zone === z ? 1 : 0.3 }]} onPress={() => setZone(z)}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>{z[0].toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {isSuperAdmin && (type === 'teacher' || type === 'parent') && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
              {(['all_students', 'all_teachers', 'all_parents'] as const).map(a => (
                <TouchableOpacity
                  key={a}
                  style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: audience === a ? '#1A1A2E' : '#F0F0F0' }}
                  onPress={() => setAudience(a)}
                >
                  <Text style={{ fontSize: 10, fontWeight: '700', color: audience === a ? 'white' : '#666' }}>
                    {a === 'all_students' ? 'All Students' : a === 'all_teachers' ? 'All Teachers' : 'All Parents'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <TextInput style={s.input} placeholder="Strategy name..." value={name} onChangeText={setName} placeholderTextColor="#AAA" />
          <TextInput style={s.input} placeholder="Description..." value={desc} onChangeText={setDesc} placeholderTextColor="#AAA" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={save}>
              <MaterialIcons name={editing ? 'save' : 'add'} size={16} color="white" />
              <Text style={s.btnText}>{editing ? 'Save' : 'Add'}</Text>
            </TouchableOpacity>
            {editing && (
              <TouchableOpacity style={[s.btn, { backgroundColor: '#EEE', paddingHorizontal: 16 }]} onPress={() => { setEditing(null); setName(''); setDesc(''); }}>
                <Text style={[s.btnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Strategy list — real drag-reorder Aug 15 (only when unfiltered by zone, and
          only for real teacher/parent items — student ones use a different endpoint,
          built-ins have no real record to reorder) */}
      {loading ? <View style={{ padding: 20, alignItems: 'center' }}><EmotionColourLoader visible size={48} /></View> : (
        <NestableDraggableFlatList
          data={strats.filter((strat: any) => !zoneFilter || strat.zone === zoneFilter)}
          keyExtractor={(strat: any, i: number) => strat.id || String(i)}
          scrollEnabled={false}
          onDragEnd={async ({ data }: any) => {
            setStrats((prev: any[]) => {
              const others = prev.filter((p: any) => zoneFilter && p.zone !== zoneFilter);
              return zoneFilter ? [...others, ...data] : data;
            });
            // Real fix Aug 16: school_admin can reorder ALL types via their own
            // scoped table; superadmin keeps the original teacher/parent-only reorder.
            const ep = !isSuperAdmin ? '/school-admin/school-strategies' : '/admin/teacher-strategies';
            const canReorderThisType = !isSuperAdmin || type === 'teacher' || type === 'parent';
            if (canReorderThisType) {
              const reorderable = data.filter((s: any) => !s.is_builtin && !s.builtin);
              try {
                // Real fix Aug 16: a global item being dragged gets forked into the
                // school's own copy at its new position; already-owned items just
                // get their order_index updated.
                await Promise.all(reorderable.map((s: any, i: number) => {
                  if (!isSuperAdmin && s._isGlobal) {
                    return apiCall('/school-admin/school-strategies', authToken, {
                      method: 'POST',
                      body: JSON.stringify({ name: s.name, description: s.description, icon: s.icon, zone: s.zone, strategy_type: type, forked_from: s.id, order_index: i + 1 }),
                    });
                  }
                  return apiCall(`${ep}/${s.id}`, authToken, { method: 'PUT', body: JSON.stringify({ order_index: i + 1 }) });
                }));
                load();
              } catch { Alert.alert('Error', 'Could not save new order.'); }
            }
          }}
          renderItem={({ item: strat, drag, isActive }: any) => {
            const canDrag = (!isSuperAdmin || type === 'teacher' || type === 'parent') && !strat.is_builtin && !strat.builtin && !zoneFilter;
            return (
              <Pressable
                onLongPress={canDrag ? drag : undefined}
                delayLongPress={200}
                disabled={isActive}
                style={[s.stratRow, isActive && { opacity: 0.6 }]}
              >
                {canDrag && <MaterialIcons name="drag-indicator" size={18} color="#CCC" style={{ marginRight: 2 }} />}
                <View style={[s.stratDot, { backgroundColor: ZONE_COLORS[strat.zone] || '#999' }]} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.stratName}>{strat.name}</Text>
                    {(strat.is_builtin || strat.builtin) && (
                      <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, backgroundColor: '#EDE7F6' }}>
                        <Text style={{ fontSize: 8, fontWeight: '800', color: '#7C5CBF' }}>BUILT-IN</Text>
                      </View>
                    )}
                  </View>
                  {strat.description ? <Text style={s.stratDesc}>{strat.description}</Text> : null}
                  {strat.created_by_role && (
                    <Text style={{ fontSize: 9, color: '#AAA', marginTop: 2 }}>
                      Added by {strat.created_by_role === 'superadmin' ? 'Superadmin' : strat.created_by_role === 'school_admin' ? 'School Admin' : strat.created_by_role}
                      {strat.audience ? ` · ${strat.audience === 'all_students' ? 'All Students' : strat.audience === 'all_teachers' ? 'All Teachers' : strat.audience === 'all_parents' ? 'All Parents' : strat.audience}` : ''}
                    </Text>
                  )}
                  {strat.created_at && (
                    <Text style={{ fontSize: 9, color: '#CCC', marginTop: 1 }}>
                      Added {new Date(strat.created_at).toLocaleDateString()}
                    </Text>
                  )}
                </View>
                {isSuperAdmin && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity onPress={() => { setEditing(strat); setName(strat.name || ''); setDesc(strat.description || ''); setZone(strat.zone || 'blue'); setAudience(strat.audience || 'all_students'); }}>
                      <MaterialIcons name="edit" size={16} color={INDIGO} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => del(strat)}>
                      <MaterialIcons name="delete" size={16} color="#F44336" />
                    </TouchableOpacity>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

// ── World Wall ───────────────────────────────────────────────────────────────

function WorldWall({ authToken }: { authToken: string|null }) {
  const [schools, setSchools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiCall('/schools/world-wall', authToken)
      .then(d => setSchools(Array.isArray(d) ? d : []))
      .catch(() => setSchools([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <View style={{ marginVertical: 12, alignItems: 'center' }}><EmotionColourLoader visible size={40} /></View>;
  if (schools.length === 0) return <Text style={s.hint}>No schools registered yet.</Text>;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
      {schools.map((sch, i) => (
        <View key={i} style={s.schoolPill}>
          <Text style={{ fontSize: 22 }}>{sch.flag || '🌍'}</Text>
          <Text style={s.schoolPillName}>{sch.name}</Text>
          {sch.city ? <Text style={s.schoolPillCity}>{sch.city}</Text> : null}
        </View>
      ))}
    </View>
  );
}

// ── Creature Moderation (item 7) ──────────────────────────────────────────────
// Real feature Aug 26: the RN app has had zero creature-moderation UI anywhere - every
// submission has only ever been reviewable from the web portal (portal100.html's
// saCreatureQueue/saGlobalApprove/saGlobalReject/renderApprovedCreaturesInto). Built to
// real parity against that live implementation, not reinvented: same two endpoints
// (/creatures/awaiting-global-approval, /creatures/global-approve/{id}), same
// classroom-vs-family-private relabeling rule the portal itself was fixed to use
// (c.classroom_id truthy = a real classroom scope, falsy = a home-only family
// submission - "classroom" is still the wire value either way, only the label differs -
// see A44 item 5), same real hard-delete (DELETE /creatures/{id}) and feature action
// (POST /creatures/feature/{id}). Two real, deliberate mobile-native adaptations rather
// than a literal port: the portal uses the browser's own prompt()/confirm() for the
// rejection-reason and delete-confirmation dialogs - neither exists in React Native, so
// these are a real TextInput modal and a real Alert.alert respectively, not a shortcut.

function scopeLabel(scope: string, hasClassroom: boolean) {
  if (scope === 'classroom') return hasClassroom ? 'Classroom' : 'Family (private)';
  if (scope === 'school') return 'School';
  return 'Global';
}

function CreaturePendingCard({ c, onApprove, onReject, onDelete, busy }: any) {
  const hasClassroom = !!c.classroom_id;
  const stages = [c.stage1_url, c.stage2_url, c.stage3_url, c.stage4_url].filter(Boolean);
  return (
    <View style={s.creatureCard}>
      <View style={s.creatureTopRow}>
        <View style={[s.creatureDot, { backgroundColor: ZONE_COLORS[c.emotion_colour] || '#999' }]} />
        <Text style={s.creatureName}>{c.creature_name || 'Unnamed'}</Text>
      </View>
      <Text style={s.creatureMeta}>
        {c.real_student_name ? `👦 For: ${c.real_student_name} · ` : ''}{c.school_name || ''}{c.school_name && c.country ? ' · ' : ''}{c.country || ''}
      </Text>
      {c.description ? <Text style={s.creatureDesc}>{c.description}</Text> : null}
      {stages.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          {stages.map((url: string, i: number) => (
            <Image key={i} source={{ uri: url }} style={s.stageThumb} />
          ))}
        </ScrollView>
      )}
      <Text style={s.creatureRequested}>📋 Requested: {scopeLabel('classroom', hasClassroom)}</Text>
      <View style={s.creatureActionsRow}>
        <TouchableOpacity disabled={busy} style={[s.creatureActionBtn, { backgroundColor: '#4CAF50' }]} onPress={() => onApprove(c.id, 'classroom')}>
          <Text style={s.creatureActionBtnText}>✅ {hasClassroom ? 'Classroom only' : 'Family only (private)'}</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.creatureActionBtn, { backgroundColor: '#4A90D9' }]} onPress={() => onApprove(c.id, 'school')}>
          <Text style={s.creatureActionBtnText}>✅ Whole school</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.creatureActionBtn, { backgroundColor: '#7C5CBF' }]} onPress={() => onApprove(c.id, 'global')}>
          <Text style={s.creatureActionBtnText}>✅ Everyone (global)</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.creatureActionBtn, { backgroundColor: '#999' }]} onPress={() => onReject(c)}>
          <Text style={s.creatureActionBtnText}>❌ Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity disabled={busy} style={[s.creatureActionBtn, { backgroundColor: '#8B0000' }]} onPress={() => onDelete(c)}>
          <Text style={s.creatureActionBtnText}>🗑️ Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CreatureApprovedCard({ c, onChangeScope, onFeature, onDelete, busy }: any) {
  const stages = [c.stage1_url, c.stage2_url, c.stage3_url, c.stage4_url].filter(Boolean);
  const currentScope = c.visibility_scope || 'school';
  return (
    <View style={[s.creatureCard, { width: 190 }]}>
      {stages[0] ? <Image source={{ uri: stages[0] }} style={s.approvedThumb} /> : <View style={[s.approvedThumb, { backgroundColor: '#F0F0F0' }]} />}
      <Text style={s.creatureName}>{c.creature_name || ''}</Text>
      <Text style={s.creatureMeta}>{c.student_name || ''}{c.school_name ? ` · 🏫 ${c.school_name}` : ''}</Text>
      <Text style={s.creatureStatsLine}>🌍 {c.global_uses || 0} uses</Text>
      <View style={s.scopeRow}>
        {['classroom', 'school', 'global'].map(opt => (
          <TouchableOpacity
            key={opt}
            disabled={busy}
            style={[s.scopeChip, currentScope === opt && s.scopeChipActive]}
            onPress={() => onChangeScope(c.id, opt)}
          >
            <Text style={[s.scopeChipText, currentScope === opt && s.scopeChipTextActive]}>
              {scopeLabel(opt, !!c.classroom_id)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity disabled={busy} style={s.featureBtn} onPress={() => onFeature(c.id)}>
        <Text style={s.featureBtnText}>⭐ Feature</Text>
      </TouchableOpacity>
      <TouchableOpacity disabled={busy} style={s.deleteBtn} onPress={() => onDelete(c)}>
        <Text style={s.deleteBtnText}>🗑️ Delete</Text>
      </TouchableOpacity>
    </View>
  );
}

function CreatureModeration({ authToken }: { authToken: string|null }) {
  const { t } = useApp();
  const [pending, setPending] = useState<any[]>([]);
  const [approved, setApproved] = useState<any[]>([]);
  const [countryGallery, setCountryGallery] = useState<{ country: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('Does not meet the Class of Happiness standards');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      apiCall('/creatures/awaiting-global-approval', authToken).catch(() => []),
      apiCall('/creatures/global', authToken).catch(() => []),
      apiCall('/creatures/global/by-country', authToken).catch(() => []),
    ]).then(([p, a, gallery]) => {
      setPending(Array.isArray(p) ? p : []);
      setApproved(Array.isArray(a) ? a : []);
      // Real bug fix Aug 29: this used to reuse the `approved` array (the same
      // /creatures/global response that genuinely includes student_name/real_student_id,
      // needed by the Approved Creatures card above) and aggregate it client-side - the
      // names/IDs never rendered here, but were still sitting in this component's memory for
      // a feature that explicitly promises no student data. Now a real, separate fetch to a
      // dedicated endpoint that aggregates server-side and never returns a name or ID, and
      // correctly counts distinct contributing students against the threshold, not raw
      // creature count.
      setCountryGallery(Array.isArray(gallery) ? gallery.map((g: any) => ({ country: g.country, count: g.creature_count })) : []);
    }).finally(() => setLoading(false));
  }, [authToken]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (id: string, scope: string) => {
    setBusyId(id);
    try {
      await apiCall(`/creatures/global-approve/${id}`, authToken, { method: 'POST', body: JSON.stringify({ action: 'approve', visibility_scope: scope }) });
      setPending(prev => prev.filter(c => c.id !== id));
      const fresh = await apiCall('/creatures/global', authToken).catch(() => null);
      if (fresh) setApproved(Array.isArray(fresh) ? fresh : []);
    } catch { Alert.alert('Error', 'Could not approve this creature.'); }
    setBusyId(null);
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const id = rejectTarget.id;
    setRejectTarget(null);
    setBusyId(id);
    try {
      await apiCall(`/creatures/global-approve/${id}`, authToken, { method: 'POST', body: JSON.stringify({ action: 'reject', reason: rejectReason }) });
      setPending(prev => prev.filter(c => c.id !== id));
    } catch { Alert.alert('Error', 'Could not reject this creature.'); }
    setBusyId(null);
  };

  const handleDelete = (c: any) => {
    Alert.alert(
      'Delete creature?',
      `Permanently delete "${c.creature_name || 'this creature'}"? This cannot be undone - the submission, any student progress on it, and any featured-creature entries will all be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setBusyId(c.id);
            try {
              await apiCall(`/creatures/${c.id}`, authToken, { method: 'DELETE' });
              setPending(prev => prev.filter(x => x.id !== c.id));
              setApproved(prev => prev.filter(x => x.id !== c.id));
            } catch { Alert.alert('Error', 'Could not delete this creature.'); }
            setBusyId(null);
          },
        },
      ]
    );
  };

  const handleChangeScope = async (id: string, scope: string) => {
    setBusyId(id);
    try {
      await apiCall(`/creatures/global-approve/${id}`, authToken, { method: 'POST', body: JSON.stringify({ action: 'approve', visibility_scope: scope }) });
      setApproved(prev => prev.map(c => c.id === id ? { ...c, visibility_scope: scope } : c));
    } catch { Alert.alert('Error', 'Could not update scope.'); }
    setBusyId(null);
  };

  const handleFeature = async (id: string) => {
    setBusyId(id);
    try {
      await apiCall(`/creatures/feature/${id}`, authToken, { method: 'POST', body: JSON.stringify({}) });
      Alert.alert('⭐ Featured', 'Creature featured for this month!');
    } catch (e: any) { Alert.alert('Error', e?.message || 'Could not feature this creature.'); }
    setBusyId(null);
  };

  if (loading) return <View style={{ marginVertical: 20, alignItems: 'center' }}><EmotionColourLoader visible size={48} /></View>;

  return (
    <View>
      <SectionCard title="Awaiting Final Approval" subtitle="Already approved by a teacher or parent" icon="pending-actions" color="#FF9800" defaultOpen>
        {pending.length === 0
          ? <Text style={s.hint}>Nothing waiting for final approval right now.</Text>
          : pending.map(c => (
              <CreaturePendingCard key={c.id} c={c} busy={busyId === c.id}
                onApprove={handleApprove}
                onReject={(target: any) => { setRejectReason('Does not meet the Class of Happiness standards'); setRejectTarget(target); }}
                onDelete={handleDelete} />
            ))}
      </SectionCard>

      <SectionCard title="Approved Creatures" subtitle="System-wide — every school" icon="check-circle" color="#4CAF50" defaultOpen>
        {approved.length === 0
          ? <Text style={s.hint}>No approved creatures yet.</Text>
          : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {approved.map(c => (
                  <CreatureApprovedCard key={c.id} c={c} busy={busyId === c.id}
                    onChangeScope={handleChangeScope} onFeature={handleFeature} onDelete={handleDelete} />
                ))}
              </View>
            </ScrollView>
          )}
      </SectionCard>

      <SectionCard title={t("world_creature_gallery") || "World Creature Gallery"} subtitle={t("world_creature_gallery_subtitle") || "Aggregated by country — no student data shown"} icon="public" color="#4CAF50">
        {countryGallery.length === 0
          ? <Text style={s.hint}>{t("world_gallery_empty") || "No countries have reached the minimum contributor threshold yet."}</Text>
          : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {countryGallery.map(g => (
                <View key={g.country} style={s.galleryPill}>
                  <Text style={s.galleryPillCountry}>{g.country}</Text>
                  <Text style={s.galleryPillCount}>{g.count} {t("creatures_lowercase") || "creatures"}</Text>
                </View>
              ))}
            </View>
          )}
      </SectionCard>

      {/* Reject-reason modal - React Native has no browser prompt(), unlike the portal's
          saGlobalReject. Real input, not a shortcut. */}
      <Modal visible={!!rejectTarget} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.cardTitle}>Reason for rejecting</Text>
            <Text style={[s.hint, { marginBottom: 8 }]}>The student will see this.</Text>
            <TextInput style={s.input} value={rejectReason} onChangeText={setRejectReason} multiline />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#EEE' }]} onPress={() => setRejectTarget(null)}>
                <Text style={[s.btnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#8B0000' }]} onPress={submitReject}>
                <Text style={s.btnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Super Admin Dashboard ─────────────────────────────────────────────────────

function SuperAdminDashboard({ authToken, stats, statsLoading, statsPeriod, setStatsPeriod, loadStats }: any) {
  // Real fix Aug 14: this component called t(...) throughout but never pulled it from
  // context — could never surface before since superadmin access to this screen was
  // itself broken (see /admin/verify fix). Matches the same pattern already used
  // elsewhere in this file.
  const { t } = useApp();
  const [unlinkEmail, setUnlinkEmail] = useState('');
  const [unlinkType, setUnlinkType] = useState<'teacher'|'parent'>('teacher');
  const [showUnlink, setShowUnlink] = useState(false);

  const doUnlink = async () => {
    if (!unlinkEmail.trim()) { Alert.alert('Enter email'); return; }
    try {
      await apiCall('/admin/unlink-user', authToken, { method: 'POST', body: JSON.stringify({ email: unlinkEmail.trim(), type: unlinkType }) });
      Alert.alert('✅ Unlinked', `${unlinkEmail} has been unlinked.`);
      setShowUnlink(false); setUnlinkEmail('');
    } catch { Alert.alert('Error', 'Could not unlink. Check the email is correct.'); }
  };

  const zc = stats?.zone_counts || {};
  const tzc = Object.values(zc).reduce((a: any, b: any) => a + b, 0) as number;
  const tc = stats?.teacher_zone_counts || {};
  const ttc = Object.values(tc).reduce((a: any, b: any) => a + b, 0) as number;
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  // Real feature Aug 28 (item 6): multi-school PDF picker - the backend now genuinely
  // breaks out a comparison + per-school sections instead of one flat total, so the app
  // needs a real way to pick which schools to include, not just "one" or "literally all".
  const [showSchoolPicker, setShowSchoolPicker] = useState(false);
  const [pickerSchools, setPickerSchools] = useState<string[]>([]);
  const [selectedSchools, setSelectedSchools] = useState<string[]>([]);

  const openSchoolPicker = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      const profiles = await apiCall('/admin/school-profiles', token);
      const names = (Array.isArray(profiles) ? profiles : []).map((p: any) => p.school_name).filter(Boolean);
      setPickerSchools(names);
      setSelectedSchools(names); // default: all real schools pre-checked
      setShowSchoolPicker(true);
    } catch { Alert.alert('Error', 'Could not load the school list.'); }
  };

  const toggleSchoolPick = (name: string) => {
    setSelectedSchools(prev => prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]);
  };

  // Real fix Aug 21: superadmin had NO PDF export UI anywhere (app or portal), despite the
  // backend already granting superadmin the fullest access of any role to this exact
  // endpoint - confirmed working since Aug 15 for school_admin, just never had a superadmin
  // trigger. No school_name param, so the backend correctly falls back to "All Schools".
  // Real feature Aug 28 (item 6): now sends school_names (comma-separated) when the picker
  // has a real subset selected - empty/all-selected still omits the param, so the backend's
  // own "no selection = every real registered school" default stays the single source of
  // truth for what "all schools" means, not duplicated here.
  const downloadAllSchoolsPDF = async () => {
    setDownloadingPdf(true);
    setShowSchoolPicker(false);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const lang = await AsyncStorage.getItem('app_language') || 'en';
      const allSelected = selectedSchools.length === 0 || selectedSchools.length === pickerSchools.length;
      const namesParam = allSelected ? '' : `&school_names=${encodeURIComponent(selectedSchools.join(','))}`;
      const url = `${BACKEND_URL}/api/reports/pdf/school-overview?days=${statsPeriod}${namesParam}&token=${token}&lang=${lang}`;
      const checkRes = await fetch(url);
      if (!checkRes.ok) {
        Alert.alert('Error', 'Could not generate report right now.');
        setDownloadingPdf(false);
        return;
      }
      await Linking.openURL(url);
    } catch { Alert.alert('Error', 'Could not generate report right now.'); }
    setDownloadingPdf(false);
  };

  return (
    <>
      {/* Period toggle */}
      <View style={s.periodRow}>
        {([1, 7, 30, 90, 180, 365, 730, 1095] as const).map(p => (
          <TouchableOpacity key={p} style={[s.periodBtn, statsPeriod === p && s.periodBtnActive]} onPress={() => setStatsPeriod(p)}>
            <Text style={[s.periodTxt, statsPeriod === p && s.periodTxtActive]}>{p === 1 ? 'Today' : p === 7 ? '7 Days' : p === 30 ? '30 Days' : p === 90 ? '3 Months' : p === 180 ? '6 Months' : p === 365 ? '1 Year' : p === 730 ? '2 Years' : '3 Years'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: INDIGO, borderRadius: 10, paddingVertical: 10, marginBottom: 10 }}
        onPress={openSchoolPicker}
        disabled={downloadingPdf}
      >
        {downloadingPdf ? <ActivityIndicator color="white" size="small" /> : <MaterialIcons name="picture-as-pdf" size={16} color="white" />}
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{downloadingPdf ? 'Generating…' : 'Download Schools Report (PDF)'}</Text>
      </TouchableOpacity>

      <Modal visible={showSchoolPicker} transparent animationType="fade" onRequestClose={() => setShowSchoolPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.cardTitle}>Select Schools</Text>
            <Text style={[s.hint, { marginBottom: 8 }]}>Pick which schools to include — a single school keeps the original report layout, 2+ adds a comparison table plus a section per school.</Text>
            <ScrollView style={{ maxHeight: 260 }}>
              {pickerSchools.map(name => {
                const checked = selectedSchools.includes(name);
                return (
                  <TouchableOpacity key={name} onPress={() => toggleSchoolPick(name)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
                    <MaterialIcons name={checked ? 'check-box' : 'check-box-outline-blank'} size={20} color={checked ? INDIGO : '#CCC'} />
                    <Text style={{ fontSize: 13, color: '#333' }}>{name}</Text>
                  </TouchableOpacity>
                );
              })}
              {pickerSchools.length === 0 && <Text style={s.hint}>No registered schools found.</Text>}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[s.btn, { flex: 1, backgroundColor: '#EEE' }]} onPress={() => setShowSchoolPicker(false)}>
                <Text style={[s.btnText, { color: '#666' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.btn, { flex: 1 }]} onPress={downloadAllSchoolsPDF} disabled={selectedSchools.length === 0}>
                <Text style={s.btnText}>{selectedSchools.length === pickerSchools.length ? 'Export All' : `Export ${selectedSchools.length} Selected`}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Real bug fix Aug 30: removed a dead, always-false ternary (`{false ? <ActivityIndicator .../> : <>...`)
          found during the loader-consistency work - the ActivityIndicator branch could never render, and
          statsLoading's own real loading state (right below) already uses EmotionColourLoader correctly. */}
      <>
        {statsLoading && (
          <View style={{ paddingVertical: 6, alignItems: 'center' }}>
            <EmotionColourLoader visible size={28} />
          </View>
        )}

        {/* Global Stats */}
        <SectionCard title="Global Overview" subtitle="All schools · anonymised" icon="bar-chart" color={INDIGO} defaultOpen>
          <StatRow label="Total students" value={stats?.total_students} icon="child-care" color="#4CAF50" />
          <StatRow label="Total teachers" value={stats?.total_teachers} icon="school" color="#FFC107" />
          <StatRow label="Total schools" value={stats?.total_schools} icon="account-balance" color="#9C27B0" />
          <StatRow label="Check-ins today" value={stats?.checkins_today} icon="favorite" color="#4A90D9" />
          <StatRow label="Home check-ins total" value={stats?.home_checkins_total} icon="home" color="#5C6BC0" />
          <StatRow label="Linked families" value={stats?.linked_families} icon="family-restroom" color="#4CAF50" />
        </SectionCard>

        {/* Subscriptions — real feature Aug 26 (item 10): active_parents/active_teachers/
            active_schools were never actually returned by /admin/stats until tonight, so
            this card showed nothing but dashes since the day it was built. annual_parents/
            annual_teachers dropped rather than shown as fake zeros — confirmed live there is
            no self-serve annual plan for parents/teachers today (see /subscription/checkout),
            so the data to populate them doesn't exist yet. Pricing footer still advertises
            annual pricing with no purchase path — flagged to Jono separately, not silently
            fixed here since it's his call whether to build annual billing or drop the copy. */}
        <SectionCard title={t("subscriptions_revenue") || "Subscriptions & Revenue"} subtitle={t("active_paying_users") || "Active paying users"} icon="attach-money" color="#4CAF50">
          <StatRow label={t("paying_parents") || "Paying parents"} value={stats?.active_parents} icon="family-restroom" color="#4CAF50" />
          <StatRow label={t("paying_teachers") || "Paying teachers"} value={stats?.active_teachers} icon="school" color="#FF9800" />
          <StatRow label={t("school_subscriptions") || "School subscriptions"} value={stats?.active_schools} icon="account-balance" color="#9C27B0" />
          <View style={s.pricingBox}>
            <Text style={s.pricingText}>{t("pricing_parent_line") || "Parent €4.99/mo (monthly only)"}</Text>
            <Text style={s.pricingText}>{t("pricing_teacher_line") || "Teacher €7.99/mo (monthly only)"}</Text>
            <Text style={s.pricingText}>{t("pricing_school_line") || "School from €299/yr"}</Text>
          </View>
        </SectionCard>

        {/* Student Emotions */}
        <SectionCard title={t("student_emotion_distribution") || "Student Emotion Distribution"} subtitle="% of all check-ins · no names shown" icon="donut-large" color="#4A90D9">
          {ZONES.map(z => <ColourBar key={z} zone={z} count={zc[z] ?? 0} total={tzc} />)}
        </SectionCard>

        {/* Teacher Wellbeing */}
        <SectionCard title={t("teacher_wellbeing") || "Teacher Wellbeing"} subtitle="Teacher self check-in data · anonymised" icon="spa" color="#4CAF50">
          {ZONES.map(z => <ColourBar key={z} zone={z} count={tc[z] ?? 0} total={ttc} />)}
          <StatRow label="Support requests this month" value={stats?.support_requests} icon="notifications-active" color="#F44336" />
        </SectionCard>

        {/* Engagement */}
        <SectionCard title="Engagement & Creatures" subtitle="Platform-wide engagement metrics" icon="trending-up" color="#FF9800">
          <StatRow label="Total creatures collected" value={stats?.total_creatures} icon="pets" color="#9C27B0" />
          <StatRow label="Avg check-ins to evolve" value={stats?.avg_checkins_to_evolve} icon="trending-up" color="#4A90D9" />
          <StatRow label="Students with 7+ day streak" value={stats?.streak_students} icon="local-fire-department" color="#FF9800" />
          <StatRow label="Most used student strategy" value={stats?.top_strategy} icon="lightbulb" color="#4CAF50" />
          <StatRow label="Most used teacher strategy" value={stats?.top_teacher_strategy} icon="school" color="#FFC107" />
        </SectionCard>

        {/* Schools breakdown */}
        <SectionCard title="Schools Breakdown" subtitle="Emotion data per school this week" icon="account-balance" color="#9C27B0">
          {(stats?.schools_breakdown || []).length === 0
            ? <Text style={s.hint}>Schools appear here once they complete their profile in Settings.</Text>
            : (stats?.schools_breakdown || []).map((sch: any, i: number) => (
              <View key={i} style={s.schoolCard}>
                <Text style={s.schoolName}>{sch.name || 'Unknown School'}</Text>
                <Text style={s.hint}>{sch.total_checkins} check-ins</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                  {ZONES.filter(z => sch.zone_counts?.[z] > 0).map(z => (
                    <View key={z} style={[s.zonePill, { backgroundColor: ZONE_COLORS[z] + '25' }]}>
                      <Text style={[s.zonePillText, { color: ZONE_COLORS[z] }]}>{ZONE_LABELS[z]}: {sch.zone_counts[z]}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          }
        </SectionCard>

        {/* World wall */}
        <SectionCard title="Schools Around the World" subtitle="Every school using Class of Happiness" icon="public" color="#4CAF50">
          <WorldWall authToken={authToken} />
        </SectionCard>

        {/* App info */}
        <SectionCard title="App Info" subtitle="Version & platform details" icon="info" color={INDIGO}>
          <StatRow label="Version" value="v2.1 — May 2026" icon="info" color={INDIGO} />
          <StatRow label="Total users" value={stats?.total_users} icon="people" color="#4CAF50" />
          <StatRow label="Avg student session" value={`${stats?.avg_student_session ?? '—'} mins`} icon="timer" color="#FF9800" />
          <StatRow label="Avg teacher session" value={`${stats?.avg_teacher_session ?? '—'} mins`} icon="timer" color="#FFC107" />
        </SectionCard>

        {/* Unlink tool — super admin only */}
        <SectionCard title="Unlink User" subtitle="Remove parent-teacher connection · use with care" icon="link-off" color="#F44336">
          <Text style={[s.hint, { color: '#F44336', marginBottom: 8 }]}>Only use following a formal complaint or verified request.</Text>
          <View style={s.chipRow}>
            {(['teacher', 'parent'] as const).map(tp => (
              <TouchableOpacity key={tp} style={[s.chip, unlinkType === tp && s.chipActive]} onPress={() => setUnlinkType(tp)}>
                <Text style={[s.chipText, unlinkType === tp && s.chipTextActive]}>{tp === 'teacher' ? '👩‍🏫 Teacher' : '👨‍👩‍👧 Parent'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.input} placeholder="User email..." value={unlinkEmail} onChangeText={setUnlinkEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA" />
          <TouchableOpacity style={[s.btn, { backgroundColor: '#F44336' }]} onPress={doUnlink}>
            <MaterialIcons name="link-off" size={16} color="white" />
            <Text style={s.btnText}>Confirm Unlink</Text>
          </TouchableOpacity>
        </SectionCard>

      </>
    </>
  );
}

// ── School Admin Dashboard ────────────────────────────────────────────────────

function SchoolAdminDashboard({ authToken, stats, statsLoading, statsPeriod, setStatsPeriod, user }: any) {
  const { t } = useApp();
  const zc = stats?.zone_counts || {};
  const tzc = Object.values(zc).reduce((a: any, b: any) => a + b, 0) as number;
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  // Real fix Aug 16: school-overview PDF download button — backend endpoint
  // has existed and been confirmed working since Aug 15, just never had a
  // real UI trigger. Same proven token-in-query pattern as teacher-wellbeing PDF.
  const downloadSchoolPDF = async () => {
    setDownloadingPdf(true);
    try {
      const token = await AsyncStorage.getItem('session_token');
      const lang = await AsyncStorage.getItem('app_language') || 'en';
      const schoolName = encodeURIComponent(user?.school_name || '');
      const url = `${BACKEND_URL}/api/reports/pdf/school-overview?days=${statsPeriod}&school_name=${schoolName}&token=${token}&lang=${lang}`;
      const checkRes = await fetch(url);
      if (!checkRes.ok) {
        Alert.alert('Error', 'Could not generate report right now.');
        setDownloadingPdf(false);
        return;
      }
      await Linking.openURL(url);
    } catch { Alert.alert('Error', 'Could not generate report right now.'); }
    setDownloadingPdf(false);
  };

  return (
    <>
      {/* Real fix Aug 15: period pills added — school_admin previously had no time filter
          at all, only superadmin's dashboard had these. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {([1, 7, 30, 90, 180, 365, 730, 1095] as const).map(p => (
          <TouchableOpacity key={p} style={[s.periodBtn, statsPeriod === p && s.periodBtnActive]} onPress={() => setStatsPeriod(p)}>
            <Text style={[s.periodTxt, statsPeriod === p && s.periodTxtActive]}>{p === 1 ? 'Today' : p === 7 ? '7 Days' : p === 30 ? '30 Days' : p === 90 ? '3 Months' : p === 180 ? '6 Months' : p === 365 ? '1 Year' : p === 730 ? '2 Years' : '3 Years'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: INDIGO, borderRadius: 10, paddingVertical: 10, marginBottom: 10 }}
        onPress={downloadSchoolPDF}
        disabled={downloadingPdf}
      >
        {downloadingPdf ? <ActivityIndicator color="white" size="small" /> : <MaterialIcons name="picture-as-pdf" size={16} color="white" />}
        <Text style={{ color: 'white', fontWeight: '700', fontSize: 13 }}>{downloadingPdf ? 'Generating…' : 'Download School Report (PDF)'}</Text>
      </TouchableOpacity>

      {/* Real bug fix Aug 30: removed a dead, always-false ternary (`{false ? <ActivityIndicator .../> : <>...`)
          found during the loader-consistency work - the ActivityIndicator branch could never render, and
          statsLoading's own real loading state (right below) already uses EmotionColourLoader correctly. */}
      <>
        {statsLoading && (
          <View style={{ paddingVertical: 6, alignItems: 'center' }}>
            <EmotionColourLoader visible size={28} />
          </View>
        )}

        {/* School overview */}
        <SectionCard title={t("your_school_overview") || "Your School Overview"} subtitle={t("anonymised_data") || "Your school's data"} icon="account-balance" color={INDIGO} defaultOpen>
          <StatRow label="Students" value={stats?.total_students} icon="child-care" color="#4CAF50" />
          <StatRow label="Teachers" value={stats?.total_teachers} icon="school" color="#FFC107" />
          <StatRow label="Check-ins today" value={stats?.checkins_today} icon="favorite" color="#4A90D9" />
          <StatRow label="Home check-ins" value={stats?.home_checkins_total} icon="home" color="#5C6BC0" />
        </SectionCard>

        {/* Student emotions */}
        <SectionCard title={t("student_emotion_distribution") || "Student Emotion Distribution"} subtitle={t("no_names_shown") || "No names shown"} icon="donut-large" color="#4A90D9">
          {ZONES.map(z => <ColourBar key={z} zone={z} count={zc[z] ?? 0} total={tzc} />)}
          <View style={s.privacyBox}>
            <MaterialIcons name="lock" size={12} color="#888" />
            <Text style={s.privacyText}>{t("individual_data_never_shown") || "Individual student data is never shown here."}</Text>
          </View>
        </SectionCard>

        {/* Teacher wellbeing */}
        <SectionCard title={t("teacher_wellbeing") || "Teacher Wellbeing"} subtitle={t("teacher_checkin_private") || "Anonymised data"} icon="spa" color="#4CAF50">
          <StatRow label="Support requests" value={stats?.support_requests} icon="notifications-active" color="#F44336" />
          <View style={s.privacyBox}>
            <MaterialIcons name="lock" size={12} color="#888" />
            <Text style={s.privacyText}>{t("teacher_checkin_private") || "Teacher check-ins are private."}</Text>
          </View>
        </SectionCard>

        {/* Engagement */}
        <SectionCard title={t("engagement") || "Engagement"} subtitle={t("how_school_using") || "App usage"} icon="trending-up" color="#FF9800">
          <StatRow label="Most used student strategy" value={stats?.top_strategy} icon="lightbulb" color="#4CAF50" />
          <StatRow label="Students with 7+ day streak" value={stats?.streak_students} icon="local-fire-department" color="#FF9800" />
          <StatRow label="Total creatures collected" value={stats?.total_creatures} icon="pets" color="#9C27B0" />
        </SectionCard>

      </>
    </>
  );
}

// ── School Settings ───────────────────────────────────────────────────────────

const COUNTRY_FLAGS = [
  { flag: '🇵🇹', name: 'Portugal' }, { flag: '🇦🇺', name: 'Australia' },
  { flag: '🇬🇧', name: 'United Kingdom' }, { flag: '🇺🇸', name: 'United States' },
  { flag: '🇪🇸', name: 'Spain' }, { flag: '🇫🇷', name: 'France' },
  { flag: '🇩🇪', name: 'Germany' }, { flag: '🇮🇹', name: 'Italy' },
  { flag: '🇳🇿', name: 'New Zealand' }, { flag: '🇮🇪', name: 'Ireland' },
  { flag: '🇿🇦', name: 'South Africa' }, { flag: '🇨🇦', name: 'Canada' },
  { flag: '🇧🇷', name: 'Brazil' }, { flag: '🌍', name: 'Other' },
];
const SCHOOL_TYPES = ['International', 'Public', 'Private', 'Charter', 'Faith-based'];
const CURRICULA = ['IB (International Baccalaureate)', 'National', 'Cambridge', 'Montessori', 'Mixed/Other'];

function SchoolSettings({ authToken, user }: any) {
  const { t } = useApp();
  const [schoolName, setSchoolName] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('🌍');
  const [schoolType, setSchoolType] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [studentCount, setStudentCount] = useState('');
  const [wellbeingEmail, setWellbeingEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [generatingCode, setGeneratingCode] = useState(false);

  const generateInviteCode = async () => {
    setGeneratingCode(true);
    try {
      const d = await apiCall('/school/generate-invite-code', authToken, { method: 'POST' });
      setInviteCode(d.code || d.invite_code || '');
    } catch {
      Alert.alert('Error', 'Could not generate invite code.');
    }
    setGeneratingCode(false);
  };

  useEffect(() => {
    if (!authToken) return;
    apiCall('/schools/my-school', authToken)
      .then((d: any) => {
        setSchoolName(d.name || '');
        setCity(d.city || '');
        setCountry(d.flag || '🌍');
        setSchoolType(d.school_type || '');
        setCurriculum(d.curriculum || '');
        setStudentCount(d.student_count?.toString() || '');
        setWellbeingEmail(d.wellbeing_email || '');
      }).catch(() => {});
  }, [authToken]);

  const save = async () => {
    setSaving(true);
    try {
      await apiCall('/schools/my-school', authToken, {
        method: 'PUT',
        body: JSON.stringify({ name: schoolName, city, flag: country, school_type: schoolType, curriculum, student_count: parseInt(studentCount) || 0, wellbeing_email: wellbeingEmail }),
      });
      Alert.alert('✅ Saved', 'School profile updated.');
    } catch { Alert.alert('Error', 'Could not save.'); }
    setSaving(false);
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionCard title={t("school_profile") || "School Profile"} subtitle={t("appears_world_wall") || "Appears on world wall"} icon="account-balance" color={INDIGO} defaultOpen>
        <TextInput style={s.input} placeholder="School name" value={schoolName} onChangeText={setSchoolName} placeholderTextColor="#AAA" />
        <TextInput style={s.input} placeholder="City" value={city} onChangeText={setCity} placeholderTextColor="#AAA" />
        <Text style={s.fieldLabel}>{t("school") || "Country"}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {COUNTRY_FLAGS.map(c => (
              <TouchableOpacity key={c.flag} style={[s.flagBtn, country === c.flag && s.flagBtnActive]} onPress={() => setCountry(c.flag)}>
                <Text style={{ fontSize: 22 }}>{c.flag}</Text>
                <Text style={{ fontSize: 9, color: country === c.flag ? INDIGO : '#888' }}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={s.fieldLabel}>{t("school_type") || "School Type"}</Text>
        <View style={s.chipRow}>
          {SCHOOL_TYPES.map(t => (
            <TouchableOpacity key={t} style={[s.chip, schoolType === t && s.chipActive]} onPress={() => setSchoolType(t)}>
              <Text style={[s.chipText, schoolType === t && s.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={s.fieldLabel}>{t("curriculum") || "Curriculum"}</Text>
        <View style={s.chipRow}>
          {CURRICULA.map(c => (
            <TouchableOpacity key={c} style={[s.chip, curriculum === c && s.chipActive]} onPress={() => setCurriculum(c)}>
              <Text style={[s.chipText, curriculum === c && s.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={s.input} placeholder="Approximate number of students" value={studentCount} onChangeText={setStudentCount} keyboardType="numeric" placeholderTextColor="#AAA" />
      </SectionCard>

      <SectionCard title={t("wellbeing_alerts") || "Wellbeing Alerts"} subtitle={t("get_notified") || "Get notified"} icon="notifications-active" color="#F44336">
        <Text style={s.hint}>{t("wellbeing_alert_desc") || "Receive email alerts when students or teachers request support."}</Text>
        <TextInput style={s.input} placeholder="Wellbeing alert email" value={wellbeingEmail} onChangeText={setWellbeingEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor="#AAA" />
      </SectionCard>

      <SectionCard title="Invite Teachers" subtitle="Link your teachers to this school" icon="group-add" color="#5C6BC0">
        <Text style={s.hint}>Generate a code and share it with your teachers so they link to your school.</Text>
        {!!inviteCode && (
          <View style={{ backgroundColor: '#F0F4FF', borderRadius: 10, padding: 14, marginVertical: 8, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#1A1A2E', letterSpacing: 1 }}>{inviteCode}</Text>
          </View>
        )}
        <TouchableOpacity
          style={[s.btn, generatingCode && { opacity: 0.6 }]}
          onPress={generateInviteCode}
          disabled={generatingCode}
        >
          <MaterialIcons name="qr-code" size={16} color="white" />
          <Text style={s.btnText}>{generatingCode ? 'Generating...' : (inviteCode ? 'Generate New Code' : 'Generate Invite Code')}</Text>
        </TouchableOpacity>
      </SectionCard>

      <TouchableOpacity style={s.btn} onPress={save} disabled={saving}>
        <MaterialIcons name="save" size={16} color="white" />
        <Text style={s.btnText}>{saving ? (t("saving") || "Saving...") : (t("save_school_profile") || "Save School Profile")}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Resource Upload ───────────────────────────────────────────────────────────

// Real feature Aug 28: fixed order for the 4 primary categories, confirmed with Jono before
// building — see resourceTopics.ts for the shared ordering logic used across every screen.
const ADMIN_RESOURCE_TOPICS = orderPrimaryTopicsFirst([
  { id: 'general', name: 'General' },
  { id: 'emotions_program', name: 'Emotions Program' },
  { id: 'healthy_relationships', name: 'Healthy Relationships' },
  { id: 'leader_online', name: 'Leader Online' },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat' },
  { id: 'special_needs_education', name: 'Special Needs' },
  { id: 'teacher_hub', name: 'Teacher Hub' },
  { id: 'parent_hub', name: 'Parent Hub' },
]);

function ResourceUpload({ authToken }: { authToken: string|null }) {
  const { t } = useApp();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [audience, setAudience] = useState<'teacher'|'parent'|'both'>('teacher');
  const [topic, setTopic] = useState('general');
  const [saving, setSaving] = useState(false);
  const [resources, setResources] = useState<any[]>([]);

  const loadResources = () => {
    apiCall('/teacher-resources', authToken)
      .then(d => setResources(Array.isArray(d) ? d : []))
      .catch(() => {});
  };

  useEffect(() => { loadResources(); }, []);

  const handleDownload = async (resource: any) => {
    try {
      const dlToken = authToken;
      const pdfUrl = `${BACKEND_URL}/api/teacher-resources/${resource.id}/download?token=${encodeURIComponent(dlToken || '')}`;
      console.log('🟡 Attempting to open:', pdfUrl);
      const supported = await Linking.canOpenURL(pdfUrl);
      console.log('🟡 canOpenURL result:', supported);
      await Linking.openURL(pdfUrl);
    } catch (err: any) {
      console.log('🔴 handleDownload error:', err?.message || err);
      Alert.alert('Error', `Could not open resource: ${err?.message || 'unknown'}`);
    }
  };

  const save = async () => {
    if (!title.trim() || !url.trim()) { Alert.alert('Title and URL required'); return; }
    setSaving(true);
    try {
      // Real fix Aug 15: added a real topic field so admin-created resources are
      // categorized the same way as everywhere else (teacher/parent screens, portal) —
      // matches Jono's explicit design-sync principle, instead of one flat uncategorized list.
      await apiCall('/teacher-resources', authToken, { method: 'POST', body: JSON.stringify({ title, url, content: url, audience, target_audience: audience, topic, category: topic }) });
      setTitle(''); setUrl('');
      loadResources();
      Alert.alert('✅ Added');
    } catch { Alert.alert('Error', 'Could not add resource.'); }
    setSaving(false);
  };

  const del = (id: string) => {
    Alert.alert('Delete', 'Remove this resource?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await apiCall(`/teacher-resources/${id}`, authToken, { method: 'DELETE' });
          setResources(r => r.filter(x => x.id !== id));
        } catch { Alert.alert('Error'); }
      }},
    ]);
  };

  return (
    <View style={{ gap: 12 }}>
      <SectionCard title={t("add_resource") || "Add Resource"} subtitle={t("share_pdfs") || "Share PDFs or links"} icon="add-circle" color={INDIGO} defaultOpen>
        <TextInput style={s.input} placeholder="Title" value={title} onChangeText={setTitle} placeholderTextColor="#AAA" />
        <TextInput style={s.input} placeholder="URL or PDF link" value={url} onChangeText={setUrl} autoCapitalize="none" placeholderTextColor="#AAA" />
        <Text style={s.fieldLabel}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {ADMIN_RESOURCE_TOPICS.map(tp => (
              <TouchableOpacity key={tp.id} style={[s.chip, topic === tp.id && s.chipActive]} onPress={() => setTopic(tp.id)}>
                <Text style={[s.chipText, topic === tp.id && s.chipTextActive]}>{tp.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={s.fieldLabel}>{t("audience") || "Audience"}</Text>
        <View style={s.chipRow}>
          {(['teacher', 'parent', 'both'] as const).map(a => (
            <TouchableOpacity key={a} style={[s.chip, audience === a && s.chipActive]} onPress={() => setAudience(a)}>
              <Text style={[s.chipText, audience === a && s.chipTextActive]}>{a === 'teacher' ? '👩‍🏫 Teachers' : a === 'parent' ? '👨‍👩‍👧 Parents' : '👥 Both'}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={s.btn} onPress={save} disabled={saving}>
          <MaterialIcons name="add" size={16} color="white" />
          <Text style={s.btnText}>{saving ? 'Adding...' : 'Add Resource'}</Text>
        </TouchableOpacity>
      </SectionCard>

      {/* Real fix Aug 15: grouped by category (matching teacher/parent/portal), each
          category pre-expanded — per Jono's design-sync principle. */}
      {ADMIN_RESOURCE_TOPICS.map(tp => {
        const items = resources.filter((r: any) => (r.topic || r.category || 'general') === tp.id);
        // Real feature Aug 28, broadened Aug 29 (item 4): originally gated to only the 4
        // primary categories — Jono explicitly confirmed this should apply to ANY category
        // with zero real resources, not just those 4. Driven entirely by items.length, so it
        // disappears the moment one is uploaded here.
        if (items.length === 0) {
          return (
            <SectionCard key={tp.id} title={tp.name} subtitle="0 resources" icon="folder" color="#FF9800" defaultOpen>
              <View style={{ alignItems: 'center', padding: 20, gap: 8 }}>
                <Image
                  source={require('../../assets/images/logo_coh.png')}
                  style={{ width: 40, height: 40, opacity: 0.5 }}
                  resizeMode="contain"
                />
                <Text style={{ fontStyle: 'italic', color: '#999', fontSize: 14 }}>Coming soon</Text>
              </View>
            </SectionCard>
          );
        }
        return (
          <SectionCard key={tp.id} title={tp.name} subtitle={`${items.length} resource${items.length === 1 ? '' : 's'}`} icon="folder" color="#FF9800" defaultOpen>
            {items.map((r: any, i: number) => (
              <View key={r.id || i} style={s.stratRow}>
                <MaterialIcons name="description" size={16} color={INDIGO} />
                <View style={{ flex: 1 }}>
                  <Text style={s.stratName}>{r.title}</Text>
                  <Text style={s.stratDesc}>{r.target_audience === 'teacher' || r.audience === 'teacher' ? '👩‍🏫 Teachers' : r.target_audience === 'parent' || r.audience === 'parent' ? '👨‍👩‍👧 Parents' : '👥 Both'}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDownload(r)} style={{ padding: 4 }}>
                  <MaterialIcons name="visibility" size={18} color="#4CAF50" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => del(r.id)} style={{ padding: 4 }}>
                  <MaterialIcons name="delete" size={16} color="#F44336" />
                </TouchableOpacity>
              </View>
            ))}
          </SectionCard>
        );
      })}
      {resources.length === 0 && (
        <SectionCard title={t("current_resources") || "Current Resources"} subtitle="0 resources" icon="folder" color="#FF9800" defaultOpen>
          <Text style={s.hint}>{t("no_resources_added") || "No resources yet."}</Text>
        </SectionCard>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const { user, logout, t } = useApp();
  const router = useRouter();
  const [authToken, setAuthToken] = useState<string|null>(null);
  const [adminCode, setAdminCode] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tab, setTab] = useState<'analytics'|'strategies'|'resources'|'creatures'|'schools'|'users'|'settings'>('analytics');
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsPeriod, setStatsPeriod] = useState<1|7|30|90|180|365|730|1095>(7);

  useEffect(() => {
    AsyncStorage.getItem('session_token').then(t => setAuthToken(t));
  }, []);

  useEffect(() => {
    if (unlocked && tab === 'analytics') loadStats();
  }, [unlocked, tab, statsPeriod]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const d = await apiCall(`/admin/stats?days=${statsPeriod}`, authToken);
      setStats(d);
    } catch {}
    setStatsLoading(false);
  };

  const unlock = async () => {
    try {
      // Real fix Aug 20 (A17): authToken state loads asynchronously and nothing gated
      // Unlock on that finishing - firing before it resolved sent /admin/verify with no
      // auth header at all (apiCall omits it entirely for a falsy token), which now
      // correctly denies instead of falling into the old bypass L1 removed. Read the
      // token fresh here instead of trusting component state that might not have settled.
      const freshToken = await AsyncStorage.getItem('session_token');
      const d = await apiCall('/admin/verify', freshToken, { method: 'POST', body: JSON.stringify({ code: adminCode }) });
      if (d.valid) {
        setUnlocked(true);
        setIsSuperAdmin(d.is_super_admin || false);
      } else {
        Alert.alert('Invalid code');
      }
    } catch {
      Alert.alert('Could not verify', 'Check your connection and try again.');
    }
  };

  // Tab config — super admin sees all, school admin sees subset
  const TABS = isSuperAdmin
    ? [
        { id: 'analytics', icon: 'bar-chart', label: 'Analytics' },
        { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
        { id: 'resources', icon: 'folder', label: 'Resources' },
        { id: 'creatures', icon: 'pets', label: 'Creatures' },
        { id: 'schools', icon: 'business', label: 'Schools' },
        { id: 'users', icon: 'people', label: 'Users' },
        { id: 'settings', icon: 'settings', label: 'Settings' },
      ]
    : [
        { id: 'analytics', icon: 'bar-chart', label: 'Analytics' },
        { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
        { id: 'resources', icon: 'folder', label: 'Resources' },
        { id: 'settings', icon: 'account-balance', label: 'School' },
      ];

  if (!unlocked) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.lockScreen}>
          {/* COH Header */}
          <View style={s.logoBox}>
            <Text style={s.logoEmoji}>😊</Text>
            <Text style={s.logoTitle}>Class of Happiness</Text>
            <Text style={s.logoSub}>{isSuperAdmin ? 'Super Admin' : 'School Admin'}</Text>
          </View>
          <Text style={s.lockHint}>{t("unlock_admin") || "Enter your admin code to unlock"}</Text>
          <SecureField
            variant="code"
            containerStyle={{ marginBottom: 8 }}
            placeholder="••••••"
            value={adminCode}
            onChangeText={setAdminCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
            placeholderTextColor="#CCC"
            returnKeyType="done"
            onSubmitEditing={unlock}
          />
          <TouchableOpacity style={s.btn} onPress={unlock}>
            <MaterialIcons name="lock-open" size={16} color="white" />
            <Text style={s.btnText}>Unlock</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Text style={s.headerEmoji}>😊</Text>
          <View>
            <Text style={s.headerTitle}>Class of Happiness</Text>
            <Text style={s.headerRole}>{isSuperAdmin ? '⭐ Super Admin' : '🏫 School Admin'}</Text>
          </View>
        </View>
        <TouchableOpacity onPress={async () => { await logout(); router.replace('/'); }} style={s.logoutBtn}>
          <MaterialIcons name="logout" size={18} color="#F44336" />
        </TouchableOpacity>
      </View>

      {/* Tab bar — no scroll, fixed at top */}
      <View style={s.tabBar}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[s.tab, tab === t.id && s.tabActive]} onPress={() => setTab(t.id as any)}>
            <MaterialIcons name={t.icon as any} size={18} color={tab === t.id ? INDIGO : '#AAA'} />
            <Text style={[s.tabLabel, tab === t.id && s.tabLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content — scrollable. Real fix Aug 16: NestableScrollContainer, not plain
          ScrollView, so the Strategies tab's draggable list can coexist with this
          outer scroll instead of blocking it entirely. */}
      <NestableScrollContainer contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {tab === 'analytics' && (
          isSuperAdmin
            ? <SuperAdminDashboard authToken={authToken} stats={stats} statsLoading={statsLoading} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod} loadStats={loadStats} />
            : <SchoolAdminDashboard authToken={authToken} stats={stats} statsLoading={statsLoading} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod} user={user} />
        )}

        {tab === 'strategies' && (
          <StrategyManager authToken={authToken} isSuperAdmin={isSuperAdmin} />
        )}

        {tab === 'resources' && (
          <ResourceUpload authToken={authToken} />
        )}

        {tab === 'creatures' && isSuperAdmin && (
          <CreatureModeration authToken={authToken} />
        )}

        {tab === 'schools' && (
          <SchoolsManager stats={stats} statsLoading={statsLoading} authToken={authToken} statsPeriod={statsPeriod} />
        )}

        {tab === 'users' && (
          <UsersManager authToken={authToken} isSuperAdmin={isSuperAdmin} />
        )}

        {tab === 'settings' && (
          isSuperAdmin
            ? <SuperAdminSettings authToken={authToken} stats={stats} />
            : <SchoolSettings authToken={authToken} user={user} />
        )}

      </NestableScrollContainer>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  // Lock screen
  lockScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  logoBox: { alignItems: 'center', gap: 6, marginBottom: 24 },
  logoEmoji: { fontSize: 56 },
  logoTitle: { fontSize: 22, fontWeight: '800', color: INDIGO },
  logoSub: { fontSize: 13, color: '#888' },
  lockHint: { fontSize: 14, color: '#666', textAlign: 'center' },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerEmoji: { fontSize: 28 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: INDIGO },
  headerRole: { fontSize: 11, color: '#888', marginTop: 1 },
  logoutBtn: { padding: 8 },
  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EEEEEE' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, gap: 3 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: INDIGO },
  tabLabel: { fontSize: 10, color: '#AAA', fontWeight: '600' },
  tabLabelActive: { color: INDIGO },
  // Scroll
  scroll: { padding: 16, paddingBottom: 48, gap: 0 },
  // Cards
  card: { backgroundColor: 'white', borderRadius: 14, marginBottom: 10, overflow: 'hidden', elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  cardIconBox: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  cardSubtitle: { fontSize: 11, color: '#888', marginTop: 1 },
  cardBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 4 },
  // Stats
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  statRowLabel: { flex: 1, fontSize: 12, color: '#555' },
  statRowValue: { fontSize: 14, fontWeight: '700' },
  // Period toggle
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  periodBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 2, borderRadius: 8, alignItems: 'center', backgroundColor: '#F0F0F0' },
  periodBtnActive: { backgroundColor: INDIGO },
  periodTxt: { fontSize: 9, fontWeight: '600', color: '#666' },
  periodTxtActive: { color: 'white' },
  // Colour bars
  colourRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  colourDot: { width: 10, height: 10, borderRadius: 5 },
  colourLabel: { fontSize: 11, color: '#555', width: 110 },
  colourBarBg: { flex: 1, height: 8, backgroundColor: '#F0F0F0', borderRadius: 4, overflow: 'hidden' },
  colourBar: { height: 8, borderRadius: 4 },
  colourPct: { fontSize: 11, color: '#888', width: 70, textAlign: 'right' },
  // Chips
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F0F0' },
  chipActive: { backgroundColor: INDIGO },
  chipText: { fontSize: 12, color: '#666', fontWeight: '600' },
  chipTextActive: { color: 'white' },
  zoneChip: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  // Forms
  formBox: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, gap: 8, marginBottom: 4 },
  formTitle: { fontSize: 13, fontWeight: '700', color: '#333', marginBottom: 4 },
  input: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12, fontSize: 13, color: '#333', borderWidth: 1, borderColor: '#E8E8E8', marginBottom: 8 },
  fieldLabel: { fontSize: 12, color: '#888', fontWeight: '600', marginBottom: 4 },
  // Button
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: INDIGO, borderRadius: 12, padding: 14 },
  btnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  // Strategy list
  stratRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  stratDot: { width: 10, height: 10, borderRadius: 5 },
  stratName: { fontSize: 13, fontWeight: '600', color: '#333' },
  stratDesc: { fontSize: 11, color: '#888', marginTop: 2 },
  // Schools
  schoolPill: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 10, alignItems: 'center', minWidth: 80, borderWidth: 1, borderColor: '#E8EAF6' },
  schoolPillName: { fontSize: 11, fontWeight: '600', color: '#333', textAlign: 'center', marginTop: 4 },
  schoolPillCity: { fontSize: 10, color: '#888', textAlign: 'center' },
  schoolCard: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 8 },
  schoolName: { fontSize: 13, fontWeight: '700', color: '#333' },
  // World Creature Gallery (item 10)
  galleryPill: { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, alignItems: 'center', minWidth: 100 },
  galleryPillCountry: { fontSize: 13, fontWeight: '900', color: INDIGO },
  galleryPillCount: { fontSize: 11, color: '#888', marginTop: 2 },
  // Misc
  hint: { fontSize: 12, color: '#888', lineHeight: 18 },
  sectionHint: { fontSize: 12, color: '#888', marginBottom: 12 },
  zonePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  zonePillText: { fontSize: 11, fontWeight: '600' },
  pricingBox: { backgroundColor: '#F0F4FF', borderRadius: 8, padding: 10, marginTop: 8, gap: 4 },
  pricingText: { fontSize: 12, color: INDIGO, fontWeight: '600' },
  privacyBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F8F9FA', borderRadius: 8, padding: 8, marginTop: 8 },
  privacyText: { fontSize: 11, color: '#888', flex: 1, lineHeight: 16 },
  flagBtn: { alignItems: 'center', padding: 8, borderRadius: 10, borderWidth: 1, borderColor: '#E8E8E8', minWidth: 60 },
  flagBtnActive: { borderColor: INDIGO, backgroundColor: '#EEF0FF' },

  // Creature moderation (item 7)
  creatureCard: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginBottom: 10 },
  creatureTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  creatureDot: { width: 8, height: 8, borderRadius: 4 },
  creatureName: { fontSize: 14, fontWeight: '800', color: '#333' },
  creatureMeta: { fontSize: 11, color: '#888', marginTop: 3 },
  creatureDesc: { fontSize: 12, color: '#555', marginTop: 6 },
  stageThumb: { width: 64, height: 64, borderRadius: 8, marginRight: 6, backgroundColor: '#EEE' },
  creatureRequested: { fontSize: 11, fontWeight: '700', color: INDIGO, marginTop: 8 },
  creatureActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  creatureActionBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  creatureActionBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
  approvedThumb: { width: '100%', aspectRatio: 1, borderRadius: 8, marginBottom: 6 },
  creatureStatsLine: { fontSize: 10, color: '#999', marginTop: 2 },
  scopeRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  scopeChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#EEE' },
  scopeChipActive: { backgroundColor: INDIGO },
  scopeChipText: { fontSize: 9, fontWeight: '700', color: '#666' },
  scopeChipTextActive: { color: 'white' },
  featureBtn: { marginTop: 6, padding: 7, backgroundColor: '#1A1A2E', borderRadius: 8, alignItems: 'center' },
  featureBtnText: { color: '#FFD93D', fontSize: 11, fontWeight: '700' },
  deleteBtn: { marginTop: 6, padding: 7, backgroundColor: '#8B0000', borderRadius: 8, alignItems: 'center' },
  deleteBtnText: { color: 'white', fontSize: 11, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 20, width: '100%', maxWidth: 480 },
});
