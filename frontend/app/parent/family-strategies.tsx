import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, RefreshControl, Modal, TextInput, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

async function familyStratApi(endpoint: string, method = 'GET', body?: any) {
  const token = await AsyncStorage.getItem('session_token');
  const res = await fetch(`${BACKEND_URL}/api${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF50', yellow: '#FFC107', red: '#F44336',
};
const ZONE_BG: Record<string, string> = {
  blue: '#EBF3FB', green: '#E8F5E9', yellow: '#FFF8E1', red: '#FFEBEE',
};
const ZONE_NAMES: Record<string, string> = {
  blue: 'Blue Emotions — Quiet Energy',
  green: 'Green Emotions — Balanced Energy',
  yellow: 'Yellow Emotions — Fizzing Energy',
  red: 'Red Emotions — Big Energy',
};
const ZONE_DESC: Record<string, string> = {
  blue: 'Sad, tired, withdrawn, low motivation',
  green: 'Calm, happy, focused, ready to connect',
  yellow: 'Worried, frustrated, silly, losing control',
  red: 'Angry, scared, overwhelmed, out of control',
};

const FAMILY_STRATEGIES = [
  // BLUE
  { zone:'blue', name:'Side-by-Side Presence', description:'Sit quietly next to your child without expectation. No screens, no fixing — just presence. Research shows co-regulation starts with felt safety.', icon:'people', research:'Attachment theory' },
  { zone:'blue', name:'Warm Drink Ritual', description:'Make a warm drink together. The act of preparing something nourishing activates the caregiving system and signals safety.', icon:'local-cafe', research:'Gottman Emotion Coaching' },
  { zone:'blue', name:'Name It to Tame It', description:'Gently name what you see: "You seem really low today." Labelling emotions reduces amygdala activation by up to 50%.', icon:'chat-bubble', research:'Siegel & Bryson (2012)' },
  { zone:'blue', name:'Movement Invitation', description:'Suggest a 5-minute walk outside. Even slow movement increases serotonin and dopamine. Invite — never force.', icon:'directions-walk', research:'Exercise & mood regulation' },
  { zone:'blue', name:'Comfort Object or Pet', description:'Encourage connection with a pet, soft toy or blanket. Physical comfort activates the parasympathetic nervous system.', icon:'pets', research:'Polyvagal Theory (Porges)' },
  { zone:'blue', name:'Lowered Expectations Day', description:'Explicitly say "Today we can take it easy." Removing performance pressure allows natural energy to return without shame.', icon:'hotel', research:'Positive Discipline (Nelsen)' },
  // GREEN
  { zone:'green', name:'Gratitude Round', description:'Each family member shares one thing they appreciated today. Builds positive neural pathways and strengthens family cohesion over time.', icon:'favorite', research:'Positive Psychology (Seligman)' },
  { zone:'green', name:'Family Dance Break', description:'Put on a favourite upbeat song and move together. Music + movement + laughter = powerful social bonding.', icon:'music-note', research:'Social rhythm therapy' },
  { zone:'green', name:'Strength Spotting', description:'Point out a specific strength: "I noticed how patient you were today." Specific praise builds a secure self-concept.', icon:'star', research:'Growth mindset (Dweck)' },
  { zone:'green', name:'Creative Together Time', description:'Draw, build, cook or make something with no goal in mind. Open-ended play activates curiosity and strengthens connection.', icon:'palette', research:'Play therapy research' },
  { zone:'green', name:'Calm Problem-Solving', description:'When things are calm, solve problems together: "What could we do differently next time?" Green zone is ideal for collaborative planning.', icon:'lightbulb', research:'Collaborative Problem Solving (Greene)' },
  { zone:'green', name:'Special One-on-One Time', description:'10-15 minutes of undivided attention where your child leads. Non-negotiable — significantly reduces attention-seeking behaviour.', icon:'child-care', research:'Attachment-based parenting' },
  // YELLOW
  { zone:'yellow', name:'Box Breathing Together', description:'Breathe in 4, hold 4, out 4, hold 4. Do it WITH your child — modelling is more powerful than instruction.', icon:'air', research:'HRV & vagal tone research' },
  { zone:'yellow', name:'Validate First Always', description:'Before solving, say "That makes sense you\'d feel that way." Validation reduces emotional intensity within 90 seconds.', icon:'volunteer-activism', research:'DBT validation (Linehan)' },
  { zone:'yellow', name:'Body Check-In', description:'Ask "Where do you feel this in your body?" Noticing physical sensations interrupts the spiral and increases interoceptive awareness.', icon:'accessibility', research:'Somatic therapy (Levine)' },
  { zone:'yellow', name:'Feelings Journal or Drawing', description:'Offer a notebook to write or draw feelings. Externalising emotions reduces intensity and builds long-term emotional literacy.', icon:'edit', research:'Expressive writing research' },
  { zone:'yellow', name:'Space with Check-Back', description:'Say "I\'ll give you 5 minutes and come back to check on you." Respects autonomy while maintaining warm connection.', icon:'timer', research:'Autonomy-supportive parenting' },
  { zone:'yellow', name:'Playful Interruption', description:'For younger children — a funny face or ridiculous sound can work. Laughter physically downregulates the stress response.', icon:'mood', research:'Playful parenting (Cohen)' },
  // RED
  { zone:'red', name:'Regulate Yourself First', description:'Your nervous system regulates theirs. Take one slow breath before responding. Children co-regulate through adult calm — not words.', icon:'self-improvement', research:'Polyvagal Theory (Porges)' },
  { zone:'red', name:'Safe Space — Not Isolation', description:'Guide your child to a quiet corner WITH you nearby. Isolation increases shame; proximity while calm reduces it.', icon:'home', research:'Attachment-based discipline' },
  { zone:'red', name:'Cold Water Reset', description:'Splash cold water on the face or hold a cold drink. This activates the dive reflex, rapidly reducing heart rate.', icon:'water', research:'Physiological self-regulation' },
  { zone:'red', name:'No Teaching in the Storm', description:'Wait until the red zone passes before discussing what happened. The reasoning brain goes offline during high arousal.', icon:'do-not-disturb', research:'Siegel — Window of Tolerance' },
  { zone:'red', name:'Reconnect Before Redirect', description:'After the storm, reconnect with warmth first: a hug, eye contact, soft voice. Only then address behaviour — calmly.', icon:'favorite-border', research:'Gottman Emotion Coaching' },
  { zone:'red', name:'Model Repair', description:'If you lost your cool, model repair: "I\'m sorry I raised my voice. Let\'s try again." Repair is more powerful than perfection.', icon:'handshake', research:'Rupture-repair cycle (Tronick)' },
];

export default function FamilyStrategiesScreen() {
  const router = useRouter();
  const { t, user } = useApp();
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Custom strategies CRUD
  const [customStrategies, setCustomStrategies] = useState<any[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<any | null>(null);
  const [newStrat, setNewStrat] = useState({ name: '', description: '', zone: 'green', share_with_teacher: false, assigned_to: 'all' });
  const [saving, setSaving] = useState(false);
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'parent' | 'child' | 'custom'>('parent');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  useEffect(() => {
    loadCustomStrategies();
    loadFamilyMembers();
  }, []);

  const loadFamilyMembers = async () => {
    try {
      const data = await familyStratApi('/family/members');
      setFamilyMembers(Array.isArray(data) ? data : []);
    } catch { setFamilyMembers([]); }
  };

  const loadCustomStrategies = async () => {
    try {
      const data = await familyStratApi('/custom-strategies');
      setCustomStrategies(Array.isArray(data) ? data : []);
    } catch { setCustomStrategies([]); }
  };

  const saveStrategy = async () => {
    if (!newStrat.name.trim()) { Alert.alert('Name required'); return; }
    setSaving(true);
    try {
      if (editingStrategy) {
        await familyStratApi(`/custom-strategies/${editingStrategy.id}`, 'PUT', newStrat);
      } else {
        await familyStratApi('/custom-strategies', 'POST', {
          ...newStrat,
          feeling_colour: newStrat.zone,
          is_shared: newStrat.share_with_teacher,
          assigned_to: newStrat.assigned_to,
        });
      }
      setShowAddModal(false);
      setEditingStrategy(null);
      setNewStrat({ name: '', description: '', zone: 'green', share_with_teacher: false, assigned_to: 'all' });
      loadCustomStrategies();
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setSaving(false); }
  };

  const deleteStrategy = (s: any) => {
    Alert.alert('Delete', `Delete "${s.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await familyStratApi(`/custom-strategies/${s.id}`, 'DELETE'); loadCustomStrategies(); }
        catch { Alert.alert('Error', 'Could not delete'); }
      }},
    ]);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    if (selectedIds.size === 0) return;
    Alert.alert('Delete', `Delete ${selectedIds.size} strategy${selectedIds.size > 1 ? 'ies' : 'y'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: async () => {
        try {
          await Promise.all([...selectedIds].map(id => familyStratApi(`/custom-strategies/${id}`, 'DELETE')));
          setSelectedIds(new Set());
          setSelectMode(false);
          loadCustomStrategies();
        } catch { Alert.alert('Error', 'Could not delete some strategies'); }
      }},
    ]);
  };

  const openEdit = (s: any) => {
    setEditingStrategy(s);
    setNewStrat({ name: s.name, description: s.description || '', zone: s.feeling_colour || s.zone || 'green', share_with_teacher: s.is_shared || false, assigned_to: s.assigned_to || 'all' });
    setShowAddModal(true);
  };

  const zones = ['green', 'blue', 'yellow', 'red'];
  const filteredStrategies = selectedZone
    ? FAMILY_STRATEGIES.filter(s => s.zone === selectedZone)
    : FAMILY_STRATEGIES;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('family_strategies') || 'Family Strategies'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 400); }} />}
      >
        {/* Tab selector */}
        <View style={{ flexDirection: 'row', backgroundColor: '#F0F0F0', borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {([
            { id: 'parent', label: '👨‍👩‍👧 Parent Strategies' },
            { id: 'child', label: '🧒 Child Strategies' },
            { id: 'custom', label: '⭐ My Strategies' },
          ] as const).map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={{ flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center',
                backgroundColor: activeTab === tab.id ? 'white' : 'transparent' }}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={{ fontSize: 11, fontWeight: activeTab === tab.id ? '700' : '400',
                color: activeTab === tab.id ? '#333' : '#888' }}>{tab.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab !== 'custom' && (
          <>
        <Text style={styles.subtitle}>
          {activeTab === 'parent'
            ? 'Evidence-based co-regulation strategies for parents. Tap any card to read more.'
            : 'Emotion strategies for children — the same ones used at school.'}
        </Text>
        <View style={styles.infoNote}>
          <MaterialIcons name="info" size={14} color="#5C6BC0" />
          <Text style={styles.infoNoteText}>
            For educational purposes only. Not a substitute for professional advice. See disclaimer below.
          </Text>
        </View>

        {/* Zone filter tabs - matching app style */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 14, marginHorizontal: -4 }}
          contentContainerStyle={{ paddingHorizontal: 4, gap: 8, flexDirection: 'row' }}>
          <TouchableOpacity
            style={[styles.zoneChip, !selectedZone && styles.zoneChipActive]}
            onPress={() => setSelectedZone(null)}>
            <Text style={[styles.zoneChipText, !selectedZone && styles.zoneChipTextActive]}>All Zones</Text>
          </TouchableOpacity>
          {zones.map(zone => (
            <TouchableOpacity key={zone}
              style={[styles.zoneChip, selectedZone === zone && { backgroundColor: ZONE_COLORS[zone], borderColor: ZONE_COLORS[zone] }]}
              onPress={() => setSelectedZone(selectedZone === zone ? null : zone)}>
              <Text style={[styles.zoneChipText, selectedZone === zone && styles.zoneChipTextActive]}>
                {zone.charAt(0).toUpperCase() + zone.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Zone info card */}
        {selectedZone && (
          <View style={[styles.zoneInfoCard, { borderLeftColor: ZONE_COLORS[selectedZone], backgroundColor: ZONE_BG[selectedZone] }]}>
            <Text style={[styles.zoneInfoTitle, { color: ZONE_COLORS[selectedZone] }]}>{ZONE_NAMES[selectedZone]}</Text>
            <Text style={styles.zoneInfoDesc}>{ZONE_DESC[selectedZone]}</Text>
          </View>
        )}

        {/* Strategies grouped by zone */}
        {activeTab === 'child' && (
          <View style={{ backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginBottom: 14 }}>
            <Text style={{ fontSize: 12, color: '#2E7D32', lineHeight: 18 }}>
              These are the same strategies children use at school. They are shown here so families can reinforce them at home.
            </Text>
          </View>
        )}
        {(!selectedZone ? zones : [selectedZone]).map(zone => {
          const strats = activeTab === 'child'
            ? [
                {zone, name:'Gentle Stretch', description:'Move your body slowly and gently', icon:'fitness-center'},
                {zone, name:'Bubble Breathing', description:'Breathe out slowly like blowing a bubble', icon:'air'},
                {zone, name:'Count to 10', description:'Count slowly from 1 to 10', icon:'filter-9-plus'},
                {zone, name:'5 Senses', description:'Name 5 things you can see, hear, feel', icon:'visibility'},
                {zone, name:'Talk About It', description:'Find a safe person to share feelings', icon:'chat'},
                {zone, name:'Ask for Help', description:'Tell a trusted adult you need support', icon:'support-agent'},
              ].filter(s => {
                if (zone === 'blue') return ['Gentle Stretch','Talk About It','Ask for Help'].includes(s.name);
                if (zone === 'green') return ['Count to 10','5 Senses'].includes(s.name) === false;
                if (zone === 'yellow') return ['Bubble Breathing','Count to 10','5 Senses','Talk About It'].includes(s.name);
                if (zone === 'red') return ['Bubble Breathing','Ask for Help','Talk About It'].includes(s.name);
                return true;
              })
            : filteredStrategies.filter(s => s.zone === zone);
          if (strats.length === 0) return null;
          return (
            <View key={zone}>
              {!selectedZone && (
                <TouchableOpacity
                  style={[styles.zoneSectionHeader, { backgroundColor: ZONE_COLORS[zone] }]}
                  onPress={() => setSelectedZone(zone)} activeOpacity={0.85}>
                  <Text style={styles.zoneSectionTitle}>{ZONE_NAMES[zone]}</Text>
                  <Text style={styles.zoneSectionDesc}>{ZONE_DESC[zone]}</Text>
                </TouchableOpacity>
              )}
              {strats.map((s, i) => {
                const key = `${zone}-${i}`;
                const isOpen = expandedStrategy === key;
                return (
                  <TouchableOpacity key={key}
                    style={[styles.stratCard, { borderLeftColor: ZONE_COLORS[zone] }]}
                    onPress={() => setExpandedStrategy(isOpen ? null : key)}
                    activeOpacity={0.8}>
                    <View style={styles.stratHeader}>
                      <View style={[styles.stratIcon, { backgroundColor: ZONE_BG[zone] }]}>
                        <MaterialIcons name={s.icon as any} size={22} color={ZONE_COLORS[zone]} />
                      </View>
                      <Text style={styles.stratName}>{s.name}</Text>
                      <MaterialIcons name={isOpen ? 'expand-less' : 'expand-more'} size={20} color="#999" />
                    </View>
                    {isOpen && (
                      <View style={styles.stratBody}>
                        <Text style={styles.stratDesc}>{s.description}</Text>
                        {(s as any).research && (
                          <View style={styles.researchBadge}>
                            <MaterialIcons name="science" size={11} color="#5C6BC0" />
                            <Text style={styles.researchText}>{(s as any).research}</Text>
                          </View>
                        )}
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}

        {/* Research attribution */}
          </>
        )}

        {/* My Family Strategies — Custom */}
        <View style={{ backgroundColor: 'white', borderRadius: 14, padding: 16, marginTop: 16, marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#333' }}>My Family Strategies</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {selectMode ? (
                <>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F0F0F0', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 4 }}
                    onPress={() => {
                      if (selectedIds.size === customStrategies.length) {
                        setSelectedIds(new Set());
                      } else {
                        setSelectedIds(new Set(customStrategies.map((s: any) => s.id)));
                      }
                    }}
                  >
                    <MaterialIcons name={selectedIds.size === customStrategies.length ? 'check-box' : 'check-box-outline-blank'} size={16} color="#5C6BC0" />
                    <Text style={{ fontSize: 12, color: '#5C6BC0' }}>All</Text>
                  </TouchableOpacity>
                  {selectedIds.size > 0 && (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F44336', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, gap: 4 }}
                      onPress={deleteSelected}
                    >
                      <MaterialIcons name="delete" size={16} color="white" />
                      <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>Delete ({selectedIds.size})</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0' }}
                    onPress={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                  >
                    <Text style={{ fontSize: 12, color: '#666' }}>Done</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0' }}
                    onPress={() => setSelectMode(true)}
                  >
                    <Text style={{ fontSize: 12, color: '#666' }}>Select</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#5C6BC0', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, gap: 4 }}
                    onPress={() => { setEditingStrategy(null); setNewStrat({ name: '', description: '', zone: 'green', share_with_teacher: false, assigned_to: 'all' }); setShowAddModal(true); }}
                  >
                    <MaterialIcons name="add" size={16} color="white" />
                    <Text style={{ color: 'white', fontSize: 13, fontWeight: '600' }}>Add</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
          {customStrategies.length === 0 ? (
            <Text style={{ fontSize: 13, color: '#AAA', textAlign: 'center', paddingVertical: 16 }}>
              No custom strategies yet. Tap Add to create one for your family.
            </Text>
          ) : (
            customStrategies.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0', gap: 10,
                  backgroundColor: selectedIds.has(s.id) ? '#EEF2FF' : 'transparent' }}
                onPress={() => selectMode ? toggleSelect(s.id) : null}
                activeOpacity={selectMode ? 0.6 : 1}
              >
                {selectMode && (
                  <MaterialIcons
                    name={selectedIds.has(s.id) ? 'check-box' : 'check-box-outline-blank'}
                    size={20} color="#5C6BC0"
                  />
                )}
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: ZONE_COLORS[s.feeling_colour || s.zone || 'green'] || '#5C6BC0', flexShrink: 0 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{s.name}</Text>
                  {s.description ? <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{s.description}</Text> : null}
                  {s.is_shared && <Text style={{ fontSize: 10, color: '#4CAF50', marginTop: 2 }}>Shared with teacher ✅</Text>}
                </View>
                {!selectMode && (
                  <>
                    <TouchableOpacity onPress={() => openEdit(s)} style={{ padding: 6 }}>
                      <MaterialIcons name="edit" size={18} color="#5C6BC0" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteStrategy(s)} style={{ padding: 6 }}>
                      <MaterialIcons name="delete" size={18} color="#F44336" />
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Add/Edit Modal */}
        <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 20 }}>
                {editingStrategy ? 'Edit Strategy' : 'Add Family Strategy'}
              </Text>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 }}>Name *</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14 }}
                value={newStrat.name}
                onChangeText={v => setNewStrat(p => ({ ...p, name: v }))}
                placeholder="e.g. Breathing together"
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 }}>Description</Text>
              <TextInput
                style={{ borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 14, height: 70, textAlignVertical: 'top' }}
                value={newStrat.description}
                onChangeText={v => setNewStrat(p => ({ ...p, description: v }))}
                placeholder="What does this strategy involve?"
                multiline
              />
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 }}>Emotion colour</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                {(['blue','green','yellow','red'] as const).map(z => (
                  <TouchableOpacity key={z}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: newStrat.zone === z ? ZONE_COLORS[z] : '#F5F5F5', borderWidth: 2, borderColor: newStrat.zone === z ? ZONE_COLORS[z] : '#E0E0E0' }}
                    onPress={() => setNewStrat(p => ({ ...p, zone: z }))}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: newStrat.zone === z ? 'white' : '#666' }}>{z.charAt(0).toUpperCase() + z.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 8 }}>Assign to</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                    backgroundColor: newStrat.assigned_to === 'all' ? '#5C6BC0' : '#F0F0F0' }}
                  onPress={() => setNewStrat(p => ({ ...p, assigned_to: 'all' }))}
                >
                  <Text style={{ fontSize: 12, color: newStrat.assigned_to === 'all' ? 'white' : '#666' }}>Everyone</Text>
                </TouchableOpacity>
                {familyMembers.map((m: any) => (
                  <TouchableOpacity key={m.id}
                    style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                      backgroundColor: newStrat.assigned_to === m.id ? '#5C6BC0' : '#F0F0F0' }}
                    onPress={() => setNewStrat(p => ({ ...p, assigned_to: m.id }))}
                  >
                    <Text style={{ fontSize: 12, color: newStrat.assigned_to === m.id ? 'white' : '#666' }}>{m.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ fontSize: 14, color: '#333' }}>Share with teacher</Text>
                <Switch value={newStrat.share_with_teacher} onValueChange={v => setNewStrat(p => ({ ...p, share_with_teacher: v }))} trackColor={{ false: '#ddd', true: '#81C784' }} thumbColor={newStrat.share_with_teacher ? '#4CAF50' : '#999'} />
              </View>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#F5F5F5' }} onPress={() => setShowAddModal(false)}>
                  <Text style={{ fontSize: 15, color: '#666' }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#5C6BC0', opacity: saving ? 0.6 : 1 }} onPress={saveStrategy} disabled={saving}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: 'white' }}>{saving ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.footer}>
          <MaterialIcons name="info-outline" size={14} color="#AAA" />
          <Text style={styles.footerText}>
            Based on colour emotion check-ins, Gottman Emotion Coaching, Collaborative Problem Solving, Attachment Theory, and Polyvagal Theory.
          </Text>
        </View>

                {/* Legal disclaimer */}
        <View style={styles.disclaimer}>
          <MaterialIcons name="gavel" size={14} color="#999" />
          <View style={{ flex: 1 }}>
            <Text style={styles.disclaimerText}>
              <Text style={styles.disclaimerBold}>Important Notice: </Text>
              The strategies provided in this section are for general educational and informational purposes only. They are not a substitute for professional psychological, medical, or therapeutic advice, diagnosis, or treatment.
            </Text>
            <Text style={[styles.disclaimerText, { marginTop: 6 }]}>
              If you have concerns about your child's emotional, mental, or physical health, please consult a qualified healthcare or mental health professional.
            </Text>
            <Text style={[styles.disclaimerText, { marginTop: 6 }]}>
              Class of Happiness is not liable for any outcomes resulting from the application of strategies found in this app. All strategies should be applied with parental judgement and in accordance with your child's individual needs.
            </Text>
            <Text style={[styles.disclaimerText, { marginTop: 6 }]}>
              © Class of Happiness. All rights reserved.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F8F9FA',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 3,
  },
  backButton: { padding: 4 },
  topBarTitle: { fontSize: 17, fontWeight: '700', color: '#333' },
  scrollContent: { padding: 16, paddingBottom: 50 },
  subtitle: { fontSize: 13, color: '#AAA', marginBottom: 14, lineHeight: 18, textAlign: 'center', fontStyle: 'italic', textShadowColor: 'transparent', textShadowOffset: {width:0,height:0}, textShadowRadius: 0 },
  zoneChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1.5, borderColor: '#E0E0E0' },
  zoneChipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  zoneChipText: { fontSize: 13, fontWeight: '600', color: '#666' },
  zoneChipTextActive: { color: 'white' },
  zoneInfoCard: { borderLeftWidth: 4, borderRadius: 10, padding: 12, marginBottom: 14 },
  zoneInfoTitle: { fontSize: 15, fontWeight: '700', marginBottom: 3 },
  zoneInfoDesc: { fontSize: 13, color: '#555', lineHeight: 18 },
  zoneSectionHeader: { borderRadius: 12, padding: 14, marginBottom: 8, marginTop: 8 },
  zoneSectionTitle: { fontSize: 15, fontWeight: '700', color: 'white' },
  zoneSectionDesc: { fontSize: 12, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  stratCard: { backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 8, borderLeftWidth: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  stratHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stratIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stratName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#333' },
  stratBody: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  stratDesc: { fontSize: 13, color: '#555', lineHeight: 19, marginBottom: 8 },
  researchBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  researchText: { fontSize: 10, color: '#5C6BC0', fontWeight: '500' },
  footer: { flexDirection: 'row', gap: 6, marginTop: 24, padding: 12, backgroundColor: '#F0F0F0', borderRadius: 10, alignItems: 'flex-start' },
  footerText: { fontSize: 11, color: '#999', flex: 1, lineHeight: 16 },
  infoNote: {
    flexDirection: 'row', gap: 6, marginBottom: 14, padding: 10,
    backgroundColor: '#EEF2FF', borderRadius: 8, alignItems: 'center',
  },
  infoNoteText: { fontSize: 11, color: '#5C6BC0', flex: 1, lineHeight: 15 },
  disclaimer: {
    flexDirection: 'row', gap: 8, marginTop: 12, padding: 14,
    backgroundColor: '#FFF8E1', borderRadius: 10,
    borderWidth: 1, borderColor: '#FFE082',
    alignItems: 'flex-start',
  },
  disclaimerText: { fontSize: 11, color: '#666', flex: 1, lineHeight: 17 },
  disclaimerBold: { fontWeight: '700', color: '#555' },
});
