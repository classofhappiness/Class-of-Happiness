import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, TextInput, Alert, ActivityIndicator, Modal, Linking, Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import DraggableFlatList from 'react-native-draggable-flatlist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { useRouter } from 'expo-router';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const INDIGO = '#5C6BC0';
const ZONE_COLORS: Record<string,string> = { blue:'#4A90D9', green:'#4CAF50', yellow:'#FFC107', red:'#F44336' };
const ZONE_LABELS: Record<string,string> = { blue:'Blue Emotions', green:'Green Emotions', yellow:'Yellow Emotions', red:'Red Emotions' };
const ZONES = ['blue','green','yellow','red'];

async function apiCall(endpoint: string, token: string|null, options: any = {}) {
  const headers: any = { 'Content-Type':'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, { headers, ...options });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
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

function UsersManager({ authToken }: { authToken: string|null }) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState('');

  useEffect(() => {
    apiCall('/admin/users?limit=200', authToken)
      .then((d: any) => setUsers(Array.isArray(d?.users) ? d.users : (Array.isArray(d) ? d : [])))
      .catch(() => setUsers([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  if (loading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5C6BC0" />
      </View>
    );
  }

  const roles = Array.from(new Set(users.map((u: any) => u.role).filter(Boolean)));
  const filtered = roleFilter ? users.filter((u: any) => u.role === roleFilter) : users;

  return (
    <View style={{ padding: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
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

      {filtered.length === 0 ? (
        <View style={{ padding: 24, alignItems: 'center' }}>
          <MaterialIcons name="people" size={40} color="#CCC" />
          <Text style={{ marginTop: 8, color: '#999', fontSize: 13 }}>No users found</Text>
        </View>
      ) : (
        filtered.slice(0, 50).map((u: any, i: number) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: (ROLE_COLORS[u.role] || '#E0E0E0') + '22', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 14 }}>{ROLE_EMOJI[u.role] || '👤'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#1A1A2E' }} numberOfLines={1}>{u.name || u.email}</Text>
              <Text style={{ fontSize: 11, color: '#999' }} numberOfLines={1}>{u.school_name ? `${u.school_name} · ` : ''}{u.email}</Text>
            </View>
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: (ROLE_COLORS[u.role] || '#E0E0E0') + '22' }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: ROLE_COLORS[u.role] || '#666' }}>{u.role}</Text>
            </View>
          </View>
        ))
      )}
      {filtered.length > 50 && (
        <Text style={{ textAlign: 'center', fontSize: 11, color: '#999', marginTop: 10 }}>Showing first 50 of {filtered.length}</Text>
      )}
    </View>
  );
}

function SchoolsManager({ stats, statsLoading, authToken, statsPeriod }: { stats: any, statsLoading: boolean, authToken: string|null, statsPeriod: number }) {
  const { t } = useApp();
  const schools = stats?.schools_breakdown || [];
  const [profiles, setProfiles] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    apiCall('/admin/school-profiles', authToken).then((d: any[]) => setProfiles(Array.isArray(d) ? d : [])).catch(() => setProfiles([]));
  }, [authToken]);

  if (statsLoading) {
    return (
      <View style={{ padding: 40, alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#5C6BC0" />
      </View>
    );
  }

  if (schools.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <MaterialIcons name="business" size={40} color="#CCC" />
        <Text style={{ marginTop: 8, color: '#999', fontSize: 13 }}>No schools yet</Text>
      </View>
    );
  }

  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const field = (key: string) => (
    <TextInput
      style={{ backgroundColor: '#F5F5F5', borderRadius: 8, padding: 10, fontSize: 13, marginBottom: 8 }}
      placeholder={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
      value={form[key] || ''}
      onChangeText={v => setForm((f: any) => ({ ...f, [key]: v }))}
    />
  );

  const handleAddSchool = async () => {
    if (!form.school_name?.trim()) { Alert.alert('Error', 'School name is required'); return; }
    setSaving(true);
    try {
      await apiCall('/admin/school-profiles', authToken, { method: 'POST', body: JSON.stringify(form) });
      setForm({});
      setShowAddForm(false);
      const fresh = await apiCall('/admin/school-profiles', authToken);
      setProfiles(Array.isArray(fresh) ? fresh : []);
      Alert.alert('✅ Success', 'School added.');
    } catch {
      Alert.alert('Error', 'Could not add school.');
    }
    setSaving(false);
  };

  return (
    <View style={{ padding: 12 }}>
      <TouchableOpacity
        onPress={() => setShowAddForm(v => !v)}
        style={{ backgroundColor: '#1A1A2E', borderRadius: 25, paddingVertical: 10, alignItems: 'center', marginBottom: 12 }}
      >
        <Text style={{ color: '#FFD93D', fontWeight: '800', fontSize: 13 }}>{showAddForm ? '✕ Cancel' : '+ Add School'}</Text>
      </TouchableOpacity>

      {showAddForm && (
        <View style={{ backgroundColor: '#FAFAFA', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          {field('school_name')}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('city')}</View>
            <View style={{ flex: 1 }}>{field('country')}</View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>{field('lat')}</View>
            <View style={{ flex: 1 }}>{field('lng')}</View>
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
            <View style={{ flex: 1 }}>{field('student_count_official')}</View>
          </View>
          <TouchableOpacity
            onPress={handleAddSchool}
            disabled={saving}
            style={{ backgroundColor: '#5C6BC0', borderRadius: 25, paddingVertical: 10, alignItems: 'center', marginTop: 4, opacity: saving ? 0.6 : 1 }}
          >
            <Text style={{ color: 'white', fontWeight: '800', fontSize: 13 }}>{saving ? 'Saving...' : 'Save School'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={{ fontSize: 11, color: '#999', marginBottom: 8, textAlign: 'center' }}>
        Check-in counts for: {PERIOD_LABELS[statsPeriod] || `${statsPeriod} days`}
      </Text>
      {schools.map((school: any, i: number) => {
        const zc = school.zone_counts || {};
        const total = school.total_checkins || 0;
        const profile = profiles.find((p: any) => (p.school_name || '').trim().toLowerCase() === (school.name || '').trim().toLowerCase());
        const isOpen = !!expanded[school.name];
        return (
          <View key={i} style={{ backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#EEE' }}>
            <TouchableOpacity onPress={() => setExpanded(e => ({ ...e, [school.name]: !e[school.name] }))} activeOpacity={0.7}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialIcons name="business" size={20} color="#5C6BC0" />
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#1A1A2E', flex: 1 }}>{school.name}</Text>
                <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={22} color="#999" />
              </View>
              {!!school.description && (
                <Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{school.description}</Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                <Text style={{ fontSize: 12, color: '#666' }}>Check-ins: <Text style={{ fontWeight: '700', color: '#1A1A2E' }}>{total}</Text></Text>
                <Text style={{ fontSize: 12, color: '#4CAF73' }}>🟢 {zc.green || 0}</Text>
                <Text style={{ fontSize: 12, color: '#4A90D9' }}>🔵 {zc.blue || 0}</Text>
                <Text style={{ fontSize: 12, color: '#E0A800' }}>🟡 {zc.yellow || 0}</Text>
                <Text style={{ fontSize: 12, color: '#E05252' }}>🔴 {zc.red || 0}</Text>
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' }}>
                {profile ? (
                  <>
                    {!!profile.city && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>📍 {profile.city}{profile.country ? `, ${profile.country}` : ''}</Text>}
                    {!!profile.website && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>🌐 {profile.website}</Text>}
                    {!!profile.phone && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>📞 {profile.phone}</Text>}
                    {!!profile.principal_name && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>👤 Principal: {profile.principal_name}{profile.principal_email ? ` (${profile.principal_email})` : ''}</Text>}
                    {!!profile.wellbeing_lead_name && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>💚 Wellbeing Lead: {profile.wellbeing_lead_name}{profile.wellbeing_lead_email ? ` (${profile.wellbeing_lead_email})` : ''}</Text>}
                    {!!profile.school_type && <Text style={{ fontSize: 12, color: '#666', marginBottom: 3 }}>🏫 Type: {profile.school_type}</Text>}
                    {!!profile.student_count_official && <Text style={{ fontSize: 12, color: '#666' }}>👥 Official student count: {profile.student_count_official}</Text>}
                  </>
                ) : (
                  <Text style={{ fontSize: 12, color: '#AAA', fontStyle: 'italic' }}>No contact details added yet</Text>
                )}
              </View>
            )}
          </View>
        );
      })}
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
      if (type === 'teacher' || type === 'parent') {
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
  }, [type, authToken]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!name.trim()) { Alert.alert('Name required'); return; }
    const ep = (type === 'teacher' || type === 'parent') ? '/admin/teacher-strategies' : '/strategies';
    const body: any = { name, description: desc, zone, icon: 'star' };
    if (type === 'teacher' || type === 'parent') { body.strategy_type = type; body.audience = audience; }
    try {
      if (editing) {
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
        const ep = (type === 'teacher' || type === 'parent') ? '/admin/teacher-strategies' : '/strategies';
        try { await apiCall(`${ep}/${strat.id}`, authToken, { method: 'DELETE' }); load(); }
        catch { Alert.alert('Error', 'Could not delete.'); }
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

      {/* Add/Edit form */}
      {isSuperAdmin && (
        <View style={s.formBox}>
          <Text style={s.formTitle}>{editing ? '✏️ Editing strategy' : '➕ Add strategy'}</Text>
          <View style={s.chipRow}>
            {ZONES.map(z => (
              <TouchableOpacity key={z} style={[s.zoneChip, { backgroundColor: ZONE_COLORS[z], opacity: zone === z ? 1 : 0.3 }]} onPress={() => setZone(z)}>
                <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }}>{z[0].toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(type === 'teacher' || type === 'parent') && (
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
      {loading ? <ActivityIndicator color={INDIGO} /> : (
        <DraggableFlatList
          data={strats.filter((strat: any) => !zoneFilter || strat.zone === zoneFilter)}
          keyExtractor={(strat: any, i: number) => strat.id || String(i)}
          scrollEnabled={false}
          onDragEnd={async ({ data }: any) => {
            setStrats((prev: any[]) => {
              const others = prev.filter((p: any) => zoneFilter && p.zone !== zoneFilter);
              return zoneFilter ? [...others, ...data] : data;
            });
            if (type === 'teacher' || type === 'parent') {
              const ep = '/admin/teacher-strategies';
              const reorderable = data.filter((s: any) => !s.is_builtin && !s.builtin);
              try {
                await Promise.all(reorderable.map((s: any, i: number) =>
                  apiCall(`${ep}/${s.id}`, authToken, { method: 'PUT', body: JSON.stringify({ order_index: i + 1 }) })
                ));
              } catch { Alert.alert('Error', 'Could not save new order.'); }
            }
          }}
          renderItem={({ item: strat, drag, isActive }: any) => {
            const canDrag = (type === 'teacher' || type === 'parent') && !strat.is_builtin && !strat.builtin && !zoneFilter;
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

  if (loading) return <ActivityIndicator color={INDIGO} style={{ marginVertical: 12 }} />;
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

      {false ? <ActivityIndicator color={INDIGO} style={{ marginTop: 20 }} /> : <>
        {statsLoading && (
          <View style={{ paddingVertical: 6, alignItems: 'center' }}>
            <ActivityIndicator color={INDIGO} size="small" />
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

        {/* Subscriptions */}
        <SectionCard title="Subscriptions & Revenue" subtitle="Active paying users" icon="attach-money" color="#4CAF50">
          <StatRow label="Paying parents" value={stats?.active_parents} icon="family-restroom" color="#4CAF50" />
          <StatRow label="Annual parent plans" value={stats?.annual_parents} icon="star" color="#4CAF50" />
          <StatRow label="Paying teachers" value={stats?.active_teachers} icon="school" color="#FF9800" />
          <StatRow label="Annual teacher plans" value={stats?.annual_teachers} icon="star" color="#FF9800" />
          <StatRow label="School subscriptions" value={stats?.active_schools} icon="account-balance" color="#9C27B0" />
          <View style={s.pricingBox}>
            <Text style={s.pricingText}>Parent $4.99/mo · $39.99/yr</Text>
            <Text style={s.pricingText}>Teacher $7.99/mo · $59.99/yr</Text>
            <Text style={s.pricingText}>School from $299/yr</Text>
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

      </>}
    </>
  );
}

// ── School Admin Dashboard ────────────────────────────────────────────────────

function SchoolAdminDashboard({ authToken, stats, statsLoading, statsPeriod, setStatsPeriod }: any) {
  const { t } = useApp();
  const zc = stats?.zone_counts || {};
  const tzc = Object.values(zc).reduce((a: any, b: any) => a + b, 0) as number;

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

      {false ? <ActivityIndicator color={INDIGO} style={{ marginTop: 20 }} /> : <>
        {statsLoading && (
          <View style={{ paddingVertical: 6, alignItems: 'center' }}>
            <ActivityIndicator color={INDIGO} size="small" />
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

      </>}
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

const ADMIN_RESOURCE_TOPICS = [
  { id: 'general', name: 'General' },
  { id: 'emotions_program', name: 'Emotions Program' },
  { id: 'healthy_relationships', name: 'Healthy Relationships' },
  { id: 'leader_online', name: 'Leader Online' },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat' },
  { id: 'special_needs_education', name: 'Special Needs' },
  { id: 'teacher_hub', name: 'Teacher Hub' },
  { id: 'parent_hub', name: 'Parent Hub' },
];

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
        if (items.length === 0) return null;
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
  const [tab, setTab] = useState<'analytics'|'strategies'|'resources'|'settings'>('analytics');
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
      const d = await apiCall('/admin/verify', authToken, { method: 'POST', body: JSON.stringify({ code: adminCode }) });
      if (d.valid) {
        setUnlocked(true);
        setIsSuperAdmin(d.is_super_admin || false);
      } else {
        Alert.alert('Invalid code');
      }
    } catch {
      // Fallback: check hardcoded super admin code
      if (adminCode === 'COH_SUPER_2026') {
        setUnlocked(true); setIsSuperAdmin(true);
      } else if (adminCode.length === 6) {
        setUnlocked(true); setIsSuperAdmin(false);
      } else {
        Alert.alert('Invalid code');
      }
    }
  };

  // Tab config — super admin sees all, school admin sees subset
  const TABS = isSuperAdmin
    ? [
        { id: 'analytics', icon: 'bar-chart', label: 'Analytics' },
        { id: 'strategies', icon: 'lightbulb', label: 'Strategies' },
        { id: 'resources', icon: 'folder', label: 'Resources' },
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
          <TextInput
            style={[s.input, { textAlign: 'center', letterSpacing: 4, fontSize: 18 }]}
            placeholder="••••••"
            value={adminCode}
            onChangeText={setAdminCode}
            secureTextEntry
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
        <TouchableOpacity onPress={logout} style={s.logoutBtn}>
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

      {/* Content — scrollable */}
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {tab === 'analytics' && (
          isSuperAdmin
            ? <SuperAdminDashboard authToken={authToken} stats={stats} statsLoading={statsLoading} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod} loadStats={loadStats} />
            : <SchoolAdminDashboard authToken={authToken} stats={stats} statsLoading={statsLoading} statsPeriod={statsPeriod} setStatsPeriod={setStatsPeriod} />
        )}

        {tab === 'strategies' && (
          <StrategyManager authToken={authToken} isSuperAdmin={isSuperAdmin} />
        )}

        {tab === 'resources' && (
          <ResourceUpload authToken={authToken} />
        )}

        {tab === 'schools' && (
          <SchoolsManager stats={stats} statsLoading={statsLoading} authToken={authToken} statsPeriod={statsPeriod} />
        )}

        {tab === 'users' && (
          <UsersManager authToken={authToken} />
        )}

        {tab === 'settings' && (
          isSuperAdmin
            ? <View>
                <Text style={s.sectionHint}>Super admin app controls and configuration.</Text>
                <SectionCard title="Platform Version" subtitle="v2.1 — May 2026" icon="info" color={INDIGO} defaultOpen>
                  <StatRow label="Version" value="2.1" icon="info" color={INDIGO} />
                  <StatRow label="Total users" value={stats?.total_users} icon="people" color="#4CAF50" />
                </SectionCard>
              </View>
            : <SchoolSettings authToken={authToken} user={user} />
        )}

      </ScrollView>
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
});
