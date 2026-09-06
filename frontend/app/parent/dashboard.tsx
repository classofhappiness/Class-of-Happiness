import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Share,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from '../../src/utils/notifications';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { EMOTION_COLOURS } from '../../src/constants/emotionColours';
import {
  parentApi, Student, zoneLogsApi, ZoneLog, analyticsApi,
  familyApi, FamilyMember, FamilyZoneLog, teacherApi, rewardsApi, linkedChildApi, creaturesApi
} from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { resolveStrategyName } from '../../src/utils/resolveStrategyName';


// Pick image with camera or library choice
const pickImageWithChoice = (
  onSelect: (base64: string) => void,
  t: (key: string) => string = () => '',
) => {
  Alert.alert(
    t('add_photo_title') || 'Add Photo',
    t('choose_how_add_photo') || 'Choose how to add a photo',
    [
      {
        text: `📷 ${t('take_photo') || 'Take Photo'}`,
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { Alert.alert(t('permission_needed') || 'Permission needed', t('allow_camera_access_settings_short') || 'Allow camera access in Settings.'); return; }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true, aspect: [1,1], quality: 0.4, base64: true,
            });
            if (!result.canceled && result.assets?.[0]?.base64) {
              onSelect(`data:image/jpeg;base64,${result.assets[0].base64}`);
            }
          } catch (e) { console.error('Camera error:', e); Alert.alert(t('error') || 'Error', t('could_not_open_camera') || 'Could not open camera'); }
        },
      },
      {
        text: `🖼️ ${t('choose_from_library') || 'Choose from Library'}`,
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert(t('permission_needed') || 'Permission needed', t('allow_library_access_settings_short') || 'Allow photo library access in Settings.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true, aspect: [1,1], quality: 0.4, base64: true,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
            if (!result.canceled && result.assets?.[0]?.base64) {
              onSelect(`data:image/jpeg;base64,${result.assets[0].base64}`);
            }
          } catch (e) { console.error('Library error:', e); Alert.alert(t('error') || 'Error', t('could_not_open_library') || 'Could not open photo library'); }
        },
      },
      { text: t('cancel') || 'Cancel', style: 'cancel' },
    ]
  );
};


// Legacy fallback dictionary — kept only as a safety net for resolveStrategyName()
// (see src/utils/resolveStrategyName.ts) so nothing that used to resolve correctly
// can start showing blank/undefined. Real names now come from t() via that shared resolver.
const STRATEGY_NAMES: Record<string, string> = {
  // Short codes b/g/y/r + number (all 6)
  b1:'Gentle Stretch', b2:'Drink Water', b3:'Favourite Song', b4:'Cosy Spot', b5:'Tell Someone', b6:'Slow Breathing',
  g1:'Keep Going!', g2:'Help a Friend', g3:'Try Something New', g4:'Share Your Smile', g5:'Set a Goal', g6:'Gratitude',
  y1:'Bubble Breathing', y2:'Body Shake', y3:'Count to 10', y4:'5 Senses', y5:'Squeeze & Release', y6:'Talk About It',
  r1:'Freeze', r2:'Big Breaths', r3:'Count Backwards', r4:'Safe Space', r5:'Ask for Help', r6:'Self Hug',
  // blue_N / green_N / yellow_N / red_N variants (all 6)
  blue_1:'Gentle Stretch', blue_2:'Drink Water', blue_3:'Favourite Song', blue_4:'Cosy Spot', blue_5:'Tell Someone', blue_6:'Slow Breathing',
  green_1:'Keep Going!', green_2:'Help a Friend', green_3:'Try Something New', green_4:'Share Your Smile', green_5:'Set a Goal', green_6:'Gratitude',
  yellow_1:'Bubble Breathing', yellow_2:'Body Shake', yellow_3:'Count to 10', yellow_4:'5 Senses', yellow_5:'Squeeze & Release', yellow_6:'Talk About It',
  red_1:'Freeze', red_2:'Big Breaths', red_3:'Count Backwards', red_4:'Safe Space', red_5:'Ask for Help', red_6:'Self Hug',
  // Parent strategies
  p_b1:'Side-by-Side Presence', p_b2:'Warm Drink Ritual', p_b3:'Name It to Tame It', p_b4:'Movement Invitation', p_b5:'Comfort & Closeness',
  p_g1:'Gratitude Round', p_g2:'Strength Spotting', p_g3:'Creative Together', p_g4:'Family Dance', p_g5:'Calm Problem Solving',
  p_y1:'Box Breathing Together', p_y2:'Validate Feelings First', p_y3:'Body Check-In', p_y4:'Feelings Journal', p_y5:'Give Space with Love',
  p_r1:'Stay Calm Yourself', p_r2:'Safe Space Together', p_r3:'Cold Water Reset', p_r4:'No Teaching Now', p_r5:'Reconnect with Warmth',
  // Named strategies
  bubble_breathing:'Bubble Breathing', slow_breathing:'Slow Breathing', count_to_10:'Count to 10',
  safe_space:'Safe Space', talk_about_it:'Talk About It', tell_someone:'Tell Someone',
  gentle_stretch:'Gentle Stretch', gratitude:'Gratitude', help_friend:'Help a Friend',
  ask_for_help:'Ask for Help', self_hug:'Self Hug', big_breaths:'Big Breaths',
  cosy_spot:'Cosy Spot', warm_drink:'Drink Water', favourite_song:'Favourite Song',
  squeeze_release:'Squeeze & Release', body_shake:'Body Shake', count_backwards:'Count Backwards',
};

const ZONE_COLORS: Record<string, string> = EMOTION_COLOURS;

// Use translations for zone labels - will be populated from context
const getZoneLabel = (zone: string, t: (key: string) => string) => {
  const labels: Record<string, string> = {
    blue: t('blue_zone') || t('blue_emotions') || 'Blue Emotions',
    green: t('green_zone') || t('green_emotions') || 'Green Emotions',
    yellow: t('yellow_zone') || t('yellow_emotions') || 'Yellow Emotions',
    red: t('red_zone') || t('red_emotions') || 'Red Emotions',
  };
  return labels[zone] || zone;
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  self: '#5C6BC0',
  partner: '#5C6BC0',
  child: '#F44336',
};

const getRelationshipColor = (relationship: string) => {
  return RELATIONSHIP_COLORS[relationship] || '#5C6BC0';
};


// Real English fallback text, translated at render time via getColourTipsParent(t) below —
// this raw dictionary only supplies the English fallback + stable tip/action keys.
const COLOUR_TIPS_PARENT: Record<string, {tip: string, action: string, tipKey: string, actionKey: string}[]> = {
  blue: [
    { tip: 'Your child needs warmth', action: 'A hug and quiet time together goes a long way', tipKey: 'tip_parent_blue_1', actionKey: 'tip_parent_blue_1_action' },
    { tip: 'Low energy at home', action: 'Let them rest — avoid pressure or demands', tipKey: 'tip_parent_blue_2', actionKey: 'tip_parent_blue_2_action' },
    { tip: 'Sadness or tiredness showing', action: 'Listen without trying to fix — presence helps', tipKey: 'tip_parent_blue_3', actionKey: 'tip_parent_blue_3_action' },
  ],
  green: [
    { tip: 'Your child is thriving', action: "Celebrate with them — name what's going well", tipKey: 'tip_parent_green_1', actionKey: 'tip_parent_green_1_action' },
    { tip: 'Great emotional balance', action: 'Build connection through play or shared activity', tipKey: 'tip_parent_green_2', actionKey: 'tip_parent_green_2_action' },
    { tip: 'Strong and settled today', action: 'Perfect time for family conversations', tipKey: 'tip_parent_green_3', actionKey: 'tip_parent_green_3_action' },
  ],
  yellow: [
    { tip: 'Feeling a little wobbly', action: 'Slow down routines and avoid overstimulation', tipKey: 'tip_parent_yellow_1', actionKey: 'tip_parent_yellow_1_action' },
    { tip: 'Some anxiety present', action: 'Validate feelings before offering solutions', tipKey: 'tip_parent_yellow_2', actionKey: 'tip_parent_yellow_2_action' },
    { tip: 'Energy feels scattered', action: 'Outdoor movement or creative play can help', tipKey: 'tip_parent_yellow_3', actionKey: 'tip_parent_yellow_3_action' },
  ],
  red: [
    { tip: 'Big feelings at home', action: 'Stay regulated yourself — your calm is contagious', tipKey: 'tip_parent_red_1', actionKey: 'tip_parent_red_1_action' },
    { tip: 'Your child needs safety', action: 'Reconnect with warmth before setting limits', tipKey: 'tip_parent_red_2', actionKey: 'tip_parent_red_2_action' },
    { tip: 'High emotion showing', action: 'Give space, then gently check in with them', tipKey: 'tip_parent_red_3', actionKey: 'tip_parent_red_3_action' },
  ],
};

export default function ParentDashboard() {
  const router = useRouter();
  const { user, presetAvatars, t, language, setCurrentStudent, hasActiveSubscription, students, refreshStudents } = useApp();

  // Real bug fix Sep 4: the Aug 28 guard here was unconditional on role !== 'parent',
  // which - combined with role being a single mutable field last set by whichever way the
  // Settings role-switcher was flipped - meant a genuine teacher account tapping "Parent" on
  // the entry screen got bounced straight back to /teacher/dashboard, and a teacher could
  // never reach their own parent dashboard even with linked children. Per the new model,
  // teacher and superadmin accounts now stay on this screen (GET/POST/PUT/DELETE
  // /family/members already widened server-side to allow both - see server.py Sep 4 fix,
  // same pattern already in place for superadmin). Only a role with no legitimate parent-data
  // access at all (school_admin, admin, kiosk) still gets redirected away.
  useEffect(() => {
    if (user && user.role !== 'parent' && user.role !== 'teacher' && user.role !== 'superadmin') {
      router.replace('/teacher/dashboard');
    }
  }, [user?.role]);

  const [strategyNames, setStrategyNames] = useState<Record<string,string>>({});
  
  // Linked children from school
  const [linkedChildren, setLinkedChildren] = useState<Student[]>([]);

  // ── Creature section ──────────────────────────────
  const [featuredCreatures, setFeaturedCreatures] = React.useState<any[]>([]);
  const [studentCreatures, setStudentCreatures] = React.useState<any[]>([]);
  
  React.useEffect(() => {
    // Real fix: use rewardsApi.getCollection, the same proven call used in rewards.tsx and student/select.tsx —
    // the old /creatures/featured + /creatures/my-unlocks calls were never real and crashed the screen.
    if (linkedChildren?.length) {
      Promise.allSettled(
        linkedChildren.map((c: any) => rewardsApi.getCollection(c.id).then(col => ({ id: c.id, name: c.name, col })))
      ).then(results => {
        const collected: any[] = [];
        const perChild: Record<string, any> = {};
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.col?.current_creature) {
            const { id, name, col } = r.value;
            perChild[id] = col;
            collected.push({ childId: id, childName: name, ...col.current_creature, stage: col.current_stage, points: col.current_points });
          }
        });
        setFeaturedCreatures(collected);
        setStudentCreatures(perChild);
      });
    }
  }, [linkedChildren]);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [childCreatures, setChildCreatures] = useState<Record<string, any>>({});
  // Family members (self, partner, kids at home)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [memberCreatures, setMemberCreatures] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);
  
  // Selected member for viewing
  const [selectedMember, setSelectedMember] = useState<FamilyMember | Student | null>(null);
  const [selectedType, setSelectedType] = useState<'family' | 'linked'>('family');
  const [orderedMembers, setOrderedMembers] = useState<typeof familyMembers>([]);
  const [reorderMode, setReorderMode] = useState(false);
  
  // Analytics
  const [analytics, setAnalytics] = useState<{ zone_counts: Record<string, number> } | null>(null);
  const [weekExpanded, setWeekExpanded] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [selectedWeekChild, setSelectedWeekChild] = useState<string | null>(null);
  const [parentAlertCount, setParentAlertCount] = useState(0);
  const [linkedChildSections, setLinkedChildSections] = useState<Record<string, {emoDistrib:boolean, recentCheckins:boolean, weekOverview:boolean}>>({});
  const toggleLinkedSection = (childId: string, section: 'emoDistrib'|'recentCheckins'|'weekOverview') => {
    setLinkedChildSections(prev => ({
      ...prev,
      [childId]: { emoDistrib:false, recentCheckins:false, weekOverview:false, ...prev[childId], [section]: !(prev[childId]?.[section]) }
    }));
  };
  const [analyticsPeriod, setAnalyticsPeriod] = useState<1|7|14|30>(7);
  const [checkInsExpanded, setCheckInsExpanded] = useState(false);

  // removed duplicate checkInsExpanded state — using checkInsExpanded
  const [recentLogs, setRecentLogs] = useState<(ZoneLog | FamilyZoneLog)[]>([]);
  
  // Modals
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showAddFamilyModal, setShowAddFamilyModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showDisclaimerModal, setShowDisclaimerModal] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [disclaimerAccepted, setDisclaimerAccepted] = useState(false);
  
  // New family member form
  const [newMember, setNewMember] = useState({
    name: '',
    relationship: 'child' as 'child' | 'partner' | 'self',
    avatar_type: 'preset' as 'preset' | 'custom',
    avatar_preset: 'star',
    avatar_custom: '',
  });
  const [savingMember, setSavingMember] = useState(false);
  const [deletingMember, setDeletingMember] = useState<string | null>(null);
  
  // Edit family member state
  const [showEditFamilyModal, setShowEditFamilyModal] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [editMember, setEditMember] = useState({
    name: '',
    relationship: 'child' as 'child' | 'partner' | 'self',
    avatar_type: 'preset' as 'preset' | 'custom',
    avatar_preset: 'star',
    avatar_custom: '',
  });
  const [updatingMember, setUpdatingMember] = useState(false);

  // Open edit modal for a family member
  const handleEditFamilyMember = (member: FamilyMember) => {
    setEditingMember(member);
    setEditMember({
      name: member.name,
      relationship: member.relationship as 'child' | 'partner' | 'self',
      avatar_type: member.avatar_type as 'preset' | 'custom',
      avatar_preset: member.avatar_preset || 'star',
      avatar_custom: member.avatar_custom || '',
    });
    setShowEditFamilyModal(true);
  };

  // Update family member
  const handleUpdateFamilyMember = async () => {
    if (!editingMember || !editMember.name.trim()) {
      Alert.alert(t('error') || 'Error', t('please_enter_name') || 'Please enter a name');
      return;
    }
    setUpdatingMember(true);
    try {
      const updated = await familyApi.updateMember(editingMember.id, {
        name: editMember.name.trim(),
        relationship: editMember.relationship,
        avatar_type: editMember.avatar_type,
        avatar_preset: editMember.avatar_preset,
        avatar_custom: editMember.avatar_type === 'custom' ? editMember.avatar_custom : undefined,
      });
      // Update local state
      setFamilyMembers(prev => prev.map(m => m.id === editingMember.id ? { ...m, ...updated } : m));
      Alert.alert(t('success') || 'Success', `${editMember.name} ${t('has_been_updated') || 'has been updated'}`);
      setShowEditFamilyModal(false);
      setEditingMember(null);
    } catch (error: any) {
      console.error('Error updating family member:', error);
      Alert.alert(t('error') || 'Error', error.message || t('failed_update_member') || 'Failed to update family member');
    } finally {
      setUpdatingMember(false);
    }
  };

  // Pick image for edit modal - camera or library
  const pickImageForEdit = () => {
    pickImageWithChoice((base64) => {
      setEditMember({
        ...editMember,
        avatar_type: 'custom',
        avatar_custom: base64,
      });
    }, t);
  };

  // Delete family member
  const handleDeleteFamilyMember = async (member: FamilyMember) => {
    Alert.alert(
      t('delete_member') || 'Delete Family Member',
      `${t('confirm_delete_member') || 'Are you sure you want to remove'} ${member.name}?`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingMember(member.id);
              await familyApi.deleteMember(member.id);
              setFamilyMembers(prev => prev.filter(m => m.id !== member.id));
              if (selectedMember?.id === member.id) {
                setSelectedMember(null);
              }
              Alert.alert(t('success') || 'Success', `${member.name} ${t('has_been_removed') || 'has been removed'}`);
            } catch (error) {
              console.error('Error deleting family member:', error);
              Alert.alert(t('error') || 'Error', t('failed_delete_member') || 'Failed to delete family member');
            } finally {
              setDeletingMember(null);
            }
          },
        },
      ]
    );
  };

  // Helper to get day of week
  const getDayOfWeek = (dateStr: string): string => {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  };

  // Group logs by day for weekly view - all 7 days
  const getFilteredLogs = () => {
    if (!selectedWeekChild) return recentLogs;
    // Match by member_id (family children) OR student_id (linked children)
    // Also match family members whose student_id equals selectedWeekChild
    const fm = familyMembers.find((m:any) => m.id === selectedWeekChild);
    const matchIds = new Set([selectedWeekChild, fm?.student_id].filter(Boolean));
    return recentLogs.filter((log) =>
      matchIds.has((log as any).member_id) ||
      matchIds.has((log as any).student_id) ||
      matchIds.has((log as any).linked_id)
    );
  };

  const getWeeklyLogs = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekData: Record<string, { logs: (ZoneLog | FamilyZoneLog)[], times: string[] }> = {};
    days.forEach(day => { weekData[day] = { logs: [], times: [] }; });
    
    getFilteredLogs().forEach(log => {
      const ts = (log as any).timestamp || (log as any).created_at || '';
      if (!ts) return;
      const day = getDayOfWeek(ts);
      if (weekData[day]) {
        const time = new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        weekData[day].logs.push(log);
        weekData[day].times.push(time);
      }
    });
    return weekData;
  };

  const pickImage = () => {
    pickImageWithChoice((base64) => {
      setNewMember(prev => ({
        ...prev,
        avatar_type: 'custom',
        avatar_custom: base64,
      }));
    }, t);
  };

  const handleMemberCheckin = (member: any) => {
    const rel = member.relationship || 'adult';
    if (rel === 'child') {
      const linkedStudent = linkedChildren.find((s: any) => s.name === member.name || s.id === (member as any).student_id);
      if (linkedStudent) {
        // Linked child — use student zone with school account
        setCurrentStudent(linkedStudent);
      } else {
        // Non-linked child — use family member as student object
        // Full student experience: zone, helpers, creatures, points
        setCurrentStudent({
          id: (member as any).student_id || member.id,
          name: member.name,
          avatar_type: member.avatar_type || 'preset',
          avatar_preset: member.avatar_preset || 'bear',
          avatar_custom: member.avatar_custom || null,
          is_family_member: true,
          family_member_id: member.id,
          student_id: (member as any).student_id,
        } as any);
      }
      // All children get full student zone experience
      router.push({ pathname: '/student/zone', params: { fromFamily: 'true', location: 'home', memberName: member.name, memberId: member.id, returnTo: 'family' } });
      return;
    } else {
      // Adults get parent checkin (max 3 taps: dashboard → checkin → zone → done)
      router.push({
        pathname: '/parent/checkin',
        params: { memberId: member.id, memberName: member.name, relationship: rel }
      });
    }
  };

  const loadLinkedChildCreatures = async (children: any[]) => {
    for (const child of children) {
      try {
        const collection = await rewardsApi.getCollection(child.id);
        if (collection?.current_creature) {
          const stage = collection.current_stage || 0;
          const emoji = collection.current_creature.stages?.[stage]?.emoji || '🥚';
          setChildCreatures(prev => ({ ...prev, [child.id]: {
            emoji, color: collection.current_creature.color || '#4CAF50',
            allCreatures: collection.all_creatures || [],
          }}));
        }
      } catch {}
    }
  };

  const loadFamilyMemberCreatures = async (members: any[]) => {
    const creatures: Record<string, any> = {};
    const childMembers = members.filter((m: any) => m.relationship === 'child');
    await Promise.allSettled(childMembers.map(async (member: any) => {
      // Try to fetch real creature data if member has a student_id
      if ((member as any).student_id) {
        try {
          const data = await rewardsApi.getStudentRewards((member as any).student_id);
          if (data?.current_creature) {
            const stageIdx = Number(data.current_stage || 0);
            const stage = data.current_creature.stages?.[stageIdx];
            creatures[member.id] = {
              emoji: stage?.emoji || '🥚',
              color: data.current_creature.color || '#4CAF50',
              stage: stageIdx,
              points: data.current_points || 0,
            };
            return;
          }
        } catch {}
      }
      // Default egg for unlinked children
      creatures[member.id] = {
        emoji: '🥚',
        color: '#4CAF50',
        stage: 0,
        points: 0,
      };
    }));
    setChildCreatures(prev => ({ ...prev, ...creatures }));
  };

  const loadParentAlerts = async () => {
    try {
      const token = await AsyncStorage.getItem('session_token');
      if (!token) return;
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const res = await fetch(`${BACKEND_URL}/api/notifications/alerts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data) ? data.filter((a:any) => !a.resolved).length : 0;
        setParentAlertCount(count);
      }
    } catch {}
  };

  const fetchData = async () => {
    // Fetch strategy names
    try {
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const tok = await AsyncStorage.getItem('session_token');
      const nameMap: Record<string,string> = {};
      await Promise.all(['blue','green','yellow','red'].map(async (zone) => {
        const r = await fetch(`${BURL}/api/strategies?zone=${zone}`, { headers: { Authorization: `Bearer ${tok}` } });
        if (r.ok) { const d = await r.json(); d.forEach((s:any) => { if(s.id&&s.name) nameMap[s.id]=s.name; }); }
      }));
      setStrategyNames(nameMap);
    } catch {}
    try {
      // Real fix Aug 26 (item 1, silent role auto-sync): this used to silently overwrite the
      // account's real role field to 'parent' every single time this screen mounted, no
      // confirmation, no visibility to the user - meaning role was never a stable, deliberate
      // choice, just whatever screen was last opened. Now that role is a real access boundary
      // (teacher/dashboard.tsx locks parent-role accounts out entirely, per the Aug 26 access-
      // control fix), silently rewriting it on every visit is no longer safe. Role now only
      // changes via an explicit "Switch account type" action in Settings, with confirmation.

      // Fetch linked children from school
      const children = await parentApi.getChildren();
      setLinkedChildren(children);
      loadLinkedChildCreatures(children);
      
      // Fetch family members
      const members = await familyApi.getMembers();
      setFamilyMembers(members);
      // Fetch creatures for all family members
      const creatureMap: Record<string, any> = {};
      // Default creature emojis by relationship for non-linked members
      const defaultCreatures: Record<string, {emoji:string,color:string}> = {
        self: {emoji:'🌟', color:'#5C6BC0'},
        partner: {emoji:'💙', color:'#E91E63'},
        child: {emoji:'🥚', color:'#4CAF50'},
        sibling: {emoji:'🌈', color:'#FFC107'},
        grandparent: {emoji:'🌸', color:'#9C27B0'},
        other: {emoji:'⭐', color:'#FF9800'},
      };
      for (const m of members) {
        // Try to find a linked student for this family member (match by name or student_id)
        const linkedId = (m as any).student_id ||
          children.find((s: any) => s.name === m.name)?.id;
        if (linkedId) {
          try {
            const collection = await rewardsApi.getCollection(linkedId);
            if (collection) {
              const stage = collection.current_stage || 0;
              const stageEmoji = collection.current_creature?.stages?.[stage]?.emoji;
              creatureMap[m.id] = {
                emoji: stageEmoji || collection.current_creature?.emoji || '🥚',
                color: collection.current_creature?.color || '#4CAF50',
                points: collection.current_points || 0,
                stage,
                currentStage: stage,
                currentCreature: collection.current_creature,
                name: collection.current_creature?.name || '',
                hasRealCreature: !!stageEmoji,
                allCreatures: collection.all_creatures || [],
                current_points: collection.current_points || 0,
              };
            }
          } catch { /* no creature yet - use default */ }
          // Real feature Aug 23 (item 5): the small family-member cards never showed active
          // community (Family/Class/School/Global) creatures at all - only defaults, via
          // rewardsApi.getCollection above. Same enrichment already built for
          // student/select.tsx's bigger cards, applied here too so both surfaces are
          // consistent.
          try {
            const myCreatures = await creaturesApi.getMyCreatures(linkedId);
            const active: any[] = [];
            Object.entries(myCreatures?.colours || {}).forEach(([colour, bucket]) => {
              (bucket as any[]).forEach(entry => {
                if (entry.type === 'community' && entry.is_active) active.push({ ...entry, colour });
              });
            });
            if (active.length) {
              creatureMap[m.id] = { ...(creatureMap[m.id] || {}), activeCommunity: active };
            }
          } catch { /* no community creature - fine, defaults still show */ }
        }
        // Give non-linked members a default creature
        if (!creatureMap[m.id]) {
          const def = defaultCreatures[m.relationship] || defaultCreatures.other;
          creatureMap[m.id] = {
            emoji: def.emoji,
            color: def.color,
            points: 0,
            stage: 0,
            name: t('start_checking_in_creature') || 'Start checking in!',
            hasRealCreature: false,
          };
        }
      }
      setMemberCreatures(creatureMap);
      
      // Auto-select first CHILD member (not adult) so graphs show children's data
      if (!selectedMember) {
        const firstChild = members.find((m: any) => m.relationship === 'child');
        if (firstChild) {
          setSelectedMember(firstChild);
          setSelectedType('family');
        } else if (children.length > 0) {
          setSelectedMember(children[0]);
          setSelectedType('linked');
        } else if (members.length > 0) {
          setSelectedMember(members[0]);
          setSelectedType('family');
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchMemberData = useCallback(async () => {
    // Fetch combined logs for ALL children (family + linked)
    // This powers the Week Overview and Recent Check-ins sections
    try {
      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const AsyncStorage2 = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage2.getItem('session_token');
      const headers = { 'Authorization': `Bearer ${token}` };

      // Get all family members
      const membersRes = await fetch(`${BACKEND_URL}/api/family/members`, { headers });
      const allMembers = membersRes.ok ? await membersRes.json() : [];
      const children = allMembers.filter((m: any) => m.relationship === 'child');

      // Also get school-linked children
      const linkedRes = await fetch(`${BACKEND_URL}/api/parent/linked-children`, { headers });
      const linkedKids = linkedRes.ok ? await linkedRes.json() : [];

      const allLogs: any[] = [];

      // Fetch logs for each family child
      for (const child of children) {
        // From feeling_logs via student_id (primary source — creature points go here)
        if (child.student_id) {
          try {
            const r = await fetch(`${BACKEND_URL}/api/zone-logs/student/${child.student_id}?days=${analyticsPeriod}`, { headers });
            const logs = r.ok ? await r.json() : [];
            const tagged = Array.isArray(logs) ? logs.map((l: any) => ({
              ...l,
              zone: l.zone || l.feeling_colour,
              member_name: child.name,
              member_id: child.id,
            })) : [];
            allLogs.push(...tagged);
          } catch {}
        }
        // Also from family_zone_logs (fallback)
        try {
          const r2 = await fetch(`${BACKEND_URL}/api/family/zone-logs/${child.id}?days=${analyticsPeriod}`, { headers });
          const logs2 = r2.ok ? await r2.json() : [];
          const tagged2 = Array.isArray(logs2) ? logs2.map((l: any) => ({
            ...l,
            zone: l.zone || l.feeling_colour,
            member_name: child.name,
            member_id: child.id,
          })) : [];
          // Deduplicate by id
          const existingIds = new Set(allLogs.map((l: any) => l.id));
          allLogs.push(...tagged2.filter((l: any) => !existingIds.has(l.id)));
        } catch {}
      }

      // Fetch logs for ALL school-linked children
      for (const linked of linkedKids) {
        try {
          const r = await fetch(`${BACKEND_URL}/api/parent/linked-child/${linked.id}/all-checkins?days=${analyticsPeriod}`, { headers });
          const logs = r.ok ? await r.json() : [];
          const tagged = Array.isArray(logs) ? logs.map((l: any) => ({
            ...l,
            zone: l.zone || l.feeling_colour,
            member_name: linked.name,
            linked_id: linked.id,
            student_id: linked.id,
          })) : [];
          const existingIds2 = new Set(allLogs.map((l: any) => l.id));
          allLogs.push(...tagged.filter((l: any) => !existingIds2.has(l.id)));
        } catch {}
      }

      // Sort by timestamp desc
      allLogs.sort((a: any, b: any) => new Date(b.timestamp || b.created_at).getTime() - new Date(a.timestamp || a.created_at).getTime());
      setRecentLogs(allLogs as any);

      // Build analytics from combined logs
      const counts = { blue: 0, green: 0, yellow: 0, red: 0 } as Record<string,number>;
      allLogs.forEach((l: any) => { const z = l.zone; if (z in counts) counts[z]++; });
      setAnalytics({ zone_counts: counts, total_logs: allLogs.length });

    } catch (error) {
      console.error('Error fetching children data:', error);
      setRecentLogs([]);
      setAnalytics({ zone_counts: { blue: 0, green: 0, yellow: 0, red: 0 } });
    }
  }, [analyticsPeriod]);

  // Register for push notifications on mount
  useEffect(() => {
    registerForPushNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
    loadParentAlerts();
    fetchMemberData(); // Load children's data for graphs on mount
  }, []);

  // Reload alert count every time dashboard comes into focus (e.g. after resolving alerts)
  useFocusEffect(
    React.useCallback(() => {
      loadParentAlerts();
      const interval = setInterval(() => { loadParentAlerts(); }, 30000);
      return () => clearInterval(interval);
    }, [])
  );

  useEffect(() => {
    fetchMemberData();
  }, [analyticsPeriod]);

  // Sync ordered members from saved order or default
  useEffect(() => {
    if (familyMembers.length === 0) { setOrderedMembers([]); return; }
    AsyncStorage.getItem('family_member_order').then(raw => {
      if (!raw) { setOrderedMembers(familyMembers); return; }
      try {
        const savedIds: string[] = JSON.parse(raw);
        const sorted = [...familyMembers].sort((a, b) => {
          const ai = savedIds.indexOf(a.id);
          const bi = savedIds.indexOf(b.id);
          if (ai === -1) return 1;
          if (bi === -1) return -1;
          return ai - bi;
        });
        setOrderedMembers(sorted);
      } catch { setOrderedMembers(familyMembers); }
    });
  }, [familyMembers]);

  const moveCard = (fromIdx: number, dir: -1 | 1) => {
    const to = fromIdx + dir;
    if (to < 0 || to >= orderedMembers.length) return;
    const next = [...orderedMembers];
    [next[fromIdx], next[to]] = [next[to], next[fromIdx]];
    setOrderedMembers(next);
    AsyncStorage.setItem('family_member_order', JSON.stringify(next.map((m: any) => m.id)));
  };

  const onRefresh = async () => { loadParentAlerts();
    setRefreshing(true);
    await fetchData();
    await fetchMemberData();
    setRefreshing(false);
  };

  const handleLinkChild = async () => {
    if (!linkCode.trim()) return;
    // Consent is shown after linking via the sharing prompt
    // No gate needed here
    setLinking(true);
    try {
      const result = await parentApi.linkChild(linkCode.trim());
      const childName = result.student_name || t('child') || 'Child';
      setShowLinkModal(false);
      setLinkCode('');
      fetchData();
      // Show sharing consent after linking
      setTimeout(() => {
        Alert.alert(
          `✅ ${childName} ${t('linked_exclaim') || 'Linked!'}`,
          `${childName} ${t('connected_home_school_desc') || 'is now connected between home and school.'}\n\n📋 ${t('sharing_label') || 'SHARING:'}\n\n🏫→🏠 ${t('already_see_school_checkins') || 'You can already see school check-ins here.'}\n\n🏠→🏫 ${t('choose_share_home_checkins') || 'You can choose to share home check-ins with the teacher.'}\n\n${t('home_sharing_off_default') || 'Home sharing is OFF by default for privacy.'}`,
          [
            { text: t('keep_private') || '🔒 Keep Private', style: 'cancel' },
            {
              text: `📤 ${t('share_with_teacher') || 'Share with Teacher'}`,
              onPress: async () => {
                try {
                  await linkedChildApi.toggleHomeSharing(result.student_id);
                  Alert.alert(`✅ ${t('sharing_on') || 'Sharing On'}`, t('teacher_sees_home_checkins_desc') || 'Teacher can now see home check-ins. Turn off anytime in the linked student section.');
                } catch (e) { console.log('Sharing toggle error:', e); }
              }
            }
          ]
        );
      }, 500);
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || (t('invalid_or_expired_code') || 'Invalid or expired code'));
    } finally {
      setLinking(false);
    }
  };

  const handleAddFamilyMember = async () => {
    if (!newMember.name.trim()) {
      Alert.alert(t('error') || 'Error', t('please_enter_name') || 'Please enter a name');
      return;
    }
    setSavingMember(true);
    try {
      await familyApi.createMember({
        name: newMember.name.trim(),
        relationship: newMember.relationship,
        avatar_type: newMember.avatar_type,
        avatar_preset: newMember.avatar_preset,
        avatar_custom: newMember.avatar_type === 'custom' ? newMember.avatar_custom : undefined,
      });
      Alert.alert(t('success') || 'Success', `${newMember.name} ${t('added_to_family_exclaim') || 'has been added to your family!'}`);
      setShowAddFamilyModal(false);
      setNewMember({ name: '', relationship: 'child', avatar_type: 'preset', avatar_preset: 'star', avatar_custom: '' });
      fetchData();
      refreshStudents();
    } catch (error: any) {
      console.error('Error adding family member:', error);
      Alert.alert(t('error') || 'Error', error.message || (t('failed_add_family_member_login') || 'Failed to add family member. Please make sure you are logged in as a parent.'));
    } finally {
      setSavingMember(false);
    }
  };

  const handleGenerateTeacherCode = async (studentId: string) => {
    try {
      const result = await familyApi.generateTeacherCode(studentId);
      setGeneratedCode(result.link_code);
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || (t('failed_generate_code') || 'Failed to generate code'));
    }
  };

  const handleShareCode = () => {
    if (!generatedCode) return;
    Share.share({
      message: `Teacher link code: ${generatedCode}\n\nUse this code in the Class of Happiness app to link to my child.`,
    });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  // Prepare pie chart data
  const pieData = analytics ? Object.entries(analytics.zone_counts)
    .filter(([_, count]) => count > 0)
    .map(([zone, count]) => ({
      value: count,
      color: ZONE_COLORS[zone],
      text: `${count}`,
      label: zone.charAt(0).toUpperCase() + zone.slice(1),
    })) : [];

  const totalLogs = pieData.reduce((sum, item) => sum + item.value, 0);
  const totalFamilyCheckins = recentLogs.length;

  // Real bug fix Sep 4: this mirrored render-guard was missed when the useEffect redirect
  // above was widened to let teacher/superadmin stay on this screen - it still unconditionally
  // returned null for any non-parent role, which discarded the entire render (including a
  // successfully-fetched family list) for a teacher account. The fetch itself was never the
  // problem - confirmed live via Railway logs that GET /family/members returned 200 with real
  // data - this line alone is what threw the result away before it could render. Now matches
  // the useEffect's widened role list exactly.
  if (user && user.role !== 'parent' && user.role !== 'teacher' && user.role !== 'superadmin') return null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C6BC0" colors={['#5C6BC0']} />
        }
      >
        {/* Build 26 (Sep 6): the alert/colour-tip/trial banner stack (built in review round 3,
            A86) is removed entirely by design, mobile app only - push notifications supersede
            it in build 27. The Alerts nav tile's own badge (count: parentAlertCount) is the
            in-app alert channel now. Colour tip relocated into Week Overview below (same
            zone-count data, no new fetch); trial/HAPPYCLASS2026 messaging relocated to
            Settings' existing Trial Code section. See COH-REVIEW-PLAN.md A88. */}

        {/* Subtitle removed (round 3, Sep 5) - wasted space per review, title alone in the
            native header already says "Family Dashboard". */}

        {/* Time filter pills — restructure (Sep 5) to mirror the teacher dashboard: now the
            second real element on screen, always visible, instead of buried inside the
            collapsed Week Overview section. Same state (selectedWeekChild/analyticsPeriod)
            already powered Week Overview AND Recent Check-ins below - only where this control
            renders changed, not how it computes. */}
        <View style={{ paddingHorizontal:16, paddingBottom:8, gap:8 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ flexDirection:'row', gap:6 }}>
            <TouchableOpacity onPress={() => setSelectedWeekChild(null)}
              style={{ paddingHorizontal:12, paddingVertical:5, borderRadius:16,
                backgroundColor: selectedWeekChild===null?'#5C6BC0':'#F0F0F0',
                borderWidth:1, borderColor: selectedWeekChild===null?'#5C6BC0':'#E0E0E0' }}>
              <Text style={{ fontSize:11, fontWeight:'700', color: selectedWeekChild===null?'white':'#666' }}>All</Text>
            </TouchableOpacity>
            {/* Build 26 (Sep 6): was filtered to relationship==='child' only, so any
                self/partner family member (e.g. a parent logging their own wellbeing
                check-ins via the Wellbeing button) could never get a filter pill at all,
                regardless of how long they'd existed - confirmed live (Joana, relationship
                "self", pre-existing) vs. a child member (Jeffrey) showing fine right after
                creation. getFilteredLogs() below already matches by member id generically
                (not child-specific), so the underlying filter always supported this - only
                the pill list itself was artificially narrowed. Now built from every family
                member, any relationship. */}
            {(() => {
              const pills: {id:string,name:string}[] = [];
              (familyMembers as any[]).forEach((m:any)=>{
                // Use linked child ID if this family member is also school-linked
                const lc = linkedChildren.find((l:any)=>l.name===m.name);
                pills.push({id: lc ? lc.id : m.id, name:m.name});
              });
              linkedChildren.forEach((lc:any)=>{ if(!pills.some(c=>c.name===lc.name)) pills.push({id:lc.id,name:lc.name}); });
              return pills.map(k=>(
                <TouchableOpacity key={k.id} onPress={()=>setSelectedWeekChild(selectedWeekChild===k.id?null:k.id)}
                  style={{ paddingHorizontal:12, paddingVertical:5, borderRadius:16,
                    backgroundColor: selectedWeekChild===k.id?'#5C6BC0':'#F0F0F0',
                    borderWidth:1, borderColor: selectedWeekChild===k.id?'#5C6BC0':'#E0E0E0' }}>
                  <Text style={{ fontSize:11, fontWeight:'700', color: selectedWeekChild===k.id?'white':'#666' }}>{k.name}</Text>
                </TouchableOpacity>
              ));
            })()}
          </ScrollView>
          <View style={{ flexDirection:'row', gap:6 }}>
            {([1,7,14,30] as const).map(p=>(
              <TouchableOpacity key={p} onPress={()=>setAnalyticsPeriod(p)}
                style={{ flex:1, paddingVertical:6, borderRadius:8, alignItems:'center',
                  backgroundColor: analyticsPeriod===p?'#5C6BC0':'#F0F0F0' }}>
                <Text style={{ fontSize:11, fontWeight:'700', color: analyticsPeriod===p?'white':'#888' }}>
                  {p===1?(t('today')||'Today'):p===7?(t('this_week')||'Week'):p===14?(t('period_fortnight')||'Fortnight'):(t('month')||'Month')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Children Analytics */}
        <>
          <View style={styles.section}>
            <TouchableOpacity style={styles.collapsibleHeader} onPress={()=>setWeekExpanded(e=>!e)} activeOpacity={0.7}>
              <Text style={styles.sectionTitle}>{t('week_overview')||'Week Overview'}</Text>
              <MaterialIcons name={weekExpanded?'expand-less':'expand-more'} size={22} color="#5C6BC0" />
              </TouchableOpacity>


              {weekExpanded && (() => {
                const filtered = getFilteredLogs().filter((l:any) => {
                  const ts = (l as any).timestamp || (l as any).created_at;
                  if (!ts) return false;
                  const logDate = new Date(ts);
                  if (analyticsPeriod === 1) {
                    const today = new Date(); today.setHours(0,0,0,0);
                    return logDate >= today;
                  }
                  const diff = (Date.now() - logDate.getTime()) / 86400000;
                  return diff <= analyticsPeriod;
                });
                const counts: Record<string,number> = { blue:0, green:0, yellow:0, red:0 };
                filtered.forEach((l:any) => { const z = (l as any).zone || (l as any).feeling_colour; if (z in counts) counts[z]++; });
                const total = Object.values(counts).reduce((a,b)=>a+b,0);
                const ZONE_LABELS: Record<string,string> = {
                  green: (t('zone_green') || 'Green Emotions') + ' 😊',
                  blue: (t('zone_blue') || 'Blue Emotions') + ' 😢',
                  yellow: (t('zone_yellow') || 'Yellow Emotions') + ' 😰',
                  red: (t('zone_red') || 'Red Emotions') + ' 😠'
                };
                if (total === 0) return <Text style={{ color:'#999', fontSize:13, textAlign:'center', paddingVertical:16 }}>{t('no_checkins_for_period') || 'No check-ins for this period'}</Text>;
                return (
                  <View style={{ gap:10, marginTop:12 }}>
                    {/* Summary pill */}
                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, marginBottom:4 }}>
                      <Text style={{ fontSize:22, fontWeight:'800', color:'#333' }}>{total}</Text>
                      <Text style={{ fontSize:13, color:'#888' }}>{t('checkins_total') || 'check-ins total'}</Text>
                    </View>
                    {(['green','blue','yellow','red'] as const).map(zone => {
                      const pct = total > 0 ? Math.round((counts[zone]/total)*100) : 0;
                      return (
                        <View key={zone} style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
                          <Text style={{ fontSize:12, color:'#333', width:90 }}>{ZONE_LABELS[zone]}</Text>
                          <View style={{ flex:1, height:12, backgroundColor:'#F0F0F0', borderRadius:6, overflow:'hidden' }}>
                            <View style={{ width:`${pct}%` as any, height:12, borderRadius:6, backgroundColor:ZONE_COLORS[zone] }} />
                          </View>
                          <Text style={{ fontSize:12, fontWeight:'700', color:'#333', width:38, textAlign:'right' }}>{pct}%</Text>
                          <Text style={{ fontSize:11, color:'#888', width:20 }}>({counts[zone]})</Text>
                        </View>
                      );
                    })}
                    {/* Daily colour tip, relocated here from the removed dashboard banner
                        (build 26, Sep 6) - reuses this section's own period-filtered `counts`
                        instead of the banner's old "latest single log" signal, so the tip now
                        reflects whichever period is actually selected. Approved-with-tweak
                        same day: X-dismiss + Swipeable restored (cheap - gesture-handler is
                        already a dependency, same pattern as the teacher dashboard's own
                        relocated tip) since a permanent, un-dismissable card was still an
                        unwanted fixture even living inside a collapsible section.
                        Real fix, same day: swipe-to-dismiss didn't register here even though
                        the X button did, while the teacher dashboard's identical Swipeable
                        worked for both. Only real difference between the two blocks was this
                        View missing `width:'100%'` - Swipeable measures its child via onLayout
                        to compute drag thresholds, and without an explicit width this row could
                        shrink-wrap instead of spanning the card, breaking the pan gesture's
                        math while leaving the plain-press X button (unaffected by that
                        measurement) working fine. Added, matching the teacher dashboard exactly. */}
                    {!tipDismissed && (() => {
                      const dominant = (['red','yellow','blue','green'] as const).find(c => counts[c] > 0) || 'green';
                      const tips = (COLOUR_TIPS_PARENT as any)[dominant] || COLOUR_TIPS_PARENT.green;
                      const tip = tips[new Date().getDate() % tips.length];
                      const clrs: Record<string,string> = EMOTION_COLOURS;
                      const bgs: Record<string,string> = { blue:'#EBF5FB', green:'#EAFAF1', yellow:'#FEFDE7', red:'#FDEDEC' };
                      return (
                        <Swipeable renderRightActions={() => null} onSwipeableOpen={() => setTipDismissed(true)}>
                        <View style={{ marginTop:4, width:'100%', padding:12, borderRadius:12, flexDirection:'row', alignItems:'flex-start',
                          backgroundColor: bgs[dominant] || '#EAFAF1', borderLeftWidth:4, borderLeftColor: clrs[dominant] || EMOTION_COLOURS.green }}>
                          <View style={{ flex:1 }}>
                            <Text style={{ fontSize:13, fontWeight:'700', color:'#333', marginBottom:3 }}>{t(tip.tipKey) || tip.tip}</Text>
                            <Text style={{ fontSize:12, color:'#555', lineHeight:17 }}>{t(tip.actionKey) || tip.action}</Text>
                          </View>
                          <TouchableOpacity onPress={() => setTipDismissed(true)} style={{ padding:4, marginLeft:8 }}>
                            <MaterialIcons name="close" size={16} color="#AAA" />
                          </TouchableOpacity>
                        </View>
                        </Swipeable>
                      );
                    })()}
                  </View>
                );
              })()}
            </View>

            {/* Recent Activity */}
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setCheckInsExpanded(e => !e)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionTitle}>{t('recent_check_ins')}</Text>
                <MaterialIcons name={checkInsExpanded ? 'expand-less' : 'expand-more'} size={22} color="#5C6BC0" />
              </TouchableOpacity>
              
              {checkInsExpanded && (
              <View>
              {/* Weekly Table View - All 7 days */}
              <View style={styles.weeklyTable}>
                <View style={styles.weeklyHeader}>
                  {(language === 'pt'
                    ? ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                  ).map((day) => (
                    <View key={day} style={styles.weeklyDayHeader}>
                      <Text style={styles.weeklyDayText}>{day}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.weeklyBody}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => {
                    const dayData = getWeeklyLogs()[day];
                    return (
                      <View key={day} style={styles.weeklyDayCell}>
                        {dayData.logs.length > 0 ? (
                          dayData.logs.slice(0, 3).map((log, idx) => {
                            const ts = (log as any).timestamp || (log as any).created_at || '';
                            const hour = ts ? new Date(ts).getHours() : 12;
                            const ampm = hour < 12 ? 'am' : 'pm';
                            const fullName = (log as any).member_name || (log as any).student_name || '';
                            const initial = fullName.length >= 2 ? fullName.slice(0,2) : fullName.toUpperCase();
                            const zone = (log as any).zone || (log as any).feeling_colour || 'green';
                            const dotColor = ZONE_COLORS[zone] || EMOTION_COLOURS.green;
                            return (
                              <View key={idx} style={{ alignItems:'center', marginBottom:3 }}>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:2 }}>
                                  <View style={[styles.weeklyZoneDot, { backgroundColor: dotColor }]} />
                                  {initial ? <Text style={{ fontSize:7, color:'#888', fontWeight:'700' }}>{initial}</Text> : null}
                                  {/* Build 26 (Sep 6): was HOME-only, so a school check-in
                                      showed nothing here at all - same home/else-school binary
                                      as linked-child/[id].tsx and the teacher dashboard fix. */}
                                  <Text style={{ fontSize:7 }}>{((log as any).location==='home' || (log as any).logged_by==='parent' || (log as any).logged_by==='family') ? '🏠' : '🏫'}</Text>
                                </View>
                                <Text style={{ fontSize:7, color:'#AAA' }}>{ampm}</Text>
                              </View>
                            );
                          })
                        ) : (
                          <Text style={styles.weeklyNoData}>-</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
              
              {/* Recent logs list */}
              {(() => {
                const periodFiltered = getFilteredLogs().filter((l:any) => {
                  const ts = (l as any).timestamp || (l as any).created_at;
                  if (!ts) return false;
                  const logDate = new Date(ts);
                  if (analyticsPeriod === 1) {
                    const today = new Date(); today.setHours(0,0,0,0);
                    return logDate >= today;
                  }
                  return (Date.now() - logDate.getTime()) / 86400000 <= analyticsPeriod;
                });
                return periodFiltered.length > 0 ? (
                periodFiltered.slice(0, 10).map((log) => (
                  <View key={log.id} style={styles.logItem}>
                    <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                      <Text style={styles.logZoneText}>
                        {log.zone==='green'?'😊':log.zone==='blue'?'😔':log.zone==='yellow'?'😟':'😣'}
                      </Text>
                    </View>
                    <View style={styles.logDetails}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:4, flexWrap:'wrap' }}>
                          {(log as any).member_name && <Text style={[styles.logZoneName, { fontSize:14 }]}>{(log as any).member_name.split(' ')[0]}</Text>}
                          {!(log as any).member_name && (log as any).student_name && <Text style={[styles.logZoneName, { fontSize:14, color:'#5C6BC0' }]}>{(log as any).student_name.split(' ')[0]}</Text>}
                          <Text style={{ fontSize:11, color:'#888' }}>{getZoneLabel(log.zone, t)}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Text style={styles.logTime}>{new Date((log as any).timestamp||(log as any).created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})} · {formatTime((log as any).timestamp||(log as any).created_at)}</Text>
                        {/* Home/school icon added (round 3, Sep 5) - was text-only before.
                            Build 26 (Sep 6): was an exact match on logged_by==='parent' /
                            'student' - missed 'teacher_bulk' (bulk check-in never sets
                            logged_by to 'student') and 'family', so any check-in logged that
                            way (e.g. a teacher's own linked child, checked in via their
                            classroom's bulk check-in - the "family-dash-as-teacher" gap) showed
                            no icon at all. Same home/else-school binary as linked-child/[id].tsx. */}
                        {((log as any).location==='home' || (log as any).logged_by==='parent' || (log as any).logged_by==='family')
                          ? <Text style={{ fontSize: 9, color: '#4CAF50', fontWeight: '700' }}>🏠 {t('home') || 'HOME'}</Text>
                          : <Text style={{ fontSize: 9, color: '#5C6BC0', fontWeight: '700' }}>🏫 {t('school') || 'SCHOOL'}</Text>}
                      </View>
                      {(log as any).strategies_selected?.length > 0 && (
                        <Text style={[styles.logTime, { color: '#AAA', fontSize: 10 }]} numberOfLines={1}>
                          {(log as any).strategies_selected.slice(0,2).map((s:string)=>strategyNames[s]||resolveStrategyName(s, t, STRATEGY_NAMES)).join(', ')}
                          {(log as any).strategies_selected.length > 2 ? ` +${(log as any).strategies_selected.length-2}` : ''}
                        </Text>
                      )}
                      {log.comment && (
                        <View style={styles.commentBubble}>
                          <MaterialIcons name="chat-bubble" size={14} color="#666" />
                          <Text style={styles.commentText}>"{log.comment}"</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noDataContainer}>
                  <MaterialIcons name="history" size={48} color="#CCC" />
                  <Text style={styles.noDataText}>{t('no_recent_activity')}</Text>
                </View>
              ); })()}
            </View>
            )}
            </View>
          </>
        {/* Family Member cards — restructure (Sep 5, mirrors teacher dashboard): moved from
            near the top of the screen down to right after Recent Check-ins. Block itself
            (reorder mode, add-member flow, creature emoji, the upgrade nudge banner that
            follows it) is unchanged, only its position moved. */}
        {/* Family Members — Whole card taps to check in */}
        <View style={styles.familySection}>
          <View style={{flexDirection:'row',justifyContent:'flex-end',paddingHorizontal:12,paddingBottom:2,gap:6}}>
              {orderedMembers.length > 1 && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: reorderMode ? '#F44336' : '#9E9E9E' }]}
                  onPress={() => setReorderMode(r => !r)}
                >
                  <MaterialIcons name={reorderMode ? 'check' : 'swap-horiz'} size={16} color="white" />
                </TouchableOpacity>
              )}
              {!reorderMode && familyMembers.length < 20 && (
                <TouchableOpacity style={styles.addButton} onPress={async () => {
                  if (!hasActiveSubscription && familyMembers.length >= 2) {
                    router.push('/subscription'); return;
                  }
                  setShowAddFamilyModal(true);
                  try {
                    const token = await AsyncStorage.getItem('session_token');
                    const burl = process.env.EXPO_PUBLIC_BACKEND_URL || '';
                    const res = await fetch(`${burl}/api/parent/available-students`, {
                      headers: { Authorization: `Bearer ${token}` }
                    });
                    if (res.ok) { const data = await res.json(); setAvailableStudents(Array.isArray(data) ? data : []); }
                  } catch(e) { console.log('[AddModal] fetch error:', e); }
                }}>
                  <MaterialIcons name="add" size={18} color="white" />
                </TouchableOpacity>
              )}
          </View>

          {familyMembers.length === 0 ? (
            <TouchableOpacity style={styles.emptyFamilyCard} onPress={() => setShowAddFamilyModal(true)}>
              <MaterialIcons name="add-circle-outline" size={32} color="#C5CAE9" />
              <Text style={styles.emptyFamilyTxt}>{t('add_family_to_track') || 'Add a family member'}</Text>
            </TouchableOpacity>
          ) : (
            <>
            {/* Build 26 (Sep 6), approved-with-tweak: this used to split members into two
                hardcoded even/odd rows inside the horizontal scroll (a 2-row zigzag grid, not
                a single scrollable row) - a newly-added member landing at the end of
                orderedMembers (already correct, see the sort effect above) could surface in
                either row depending on parity, reading as if it hadn't actually been appended.
                Now a single flat row; the "Add more" upgrade card (freemium, 2+ members) moved
                out from after a `return` in the old per-row map, where it was unreachable dead
                code that never actually rendered - now a real sibling appended once, after the
                last member card, in that same row. */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{flexDirection:'row', gap:10, paddingHorizontal:12, paddingBottom:6}}>
                {orderedMembers.map((member) => {
                const creature = memberCreatures[member.id];
                const creatureEmoji = childCreatures[member.id]?.emoji || creature?.emoji || '🥚';
                const isChild = member.relationship === 'child';
                const cardColor = getRelationshipColor(member.relationship);
                const isLinked = linkedChildren.some((lc: any) => lc.name === member.name || lc.id === (member as any).student_id);
                const isLinkedChild = !!(member as any).classroom_id || (!member.relationship && !!(member as any).avatar_type);
                const linkedChildId = (member as any).student_id || (isLinkedChild ? member.id : null);
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.gridCard, { borderColor: cardColor + '30' }]}
                    onPress={() => { if (!reorderMode) handleMemberCheckin(member); }}
                    activeOpacity={reorderMode ? 1 : 0.85}
                  >
                    {/* Edit/delete top row */}
                    <View style={styles.gridCardActions}>
                      {reorderMode ? (
                        <>
                          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); moveCard(orderedMembers.indexOf(member), -1); }} style={styles.gridActionBtn}>
                            <MaterialIcons name="chevron-left" size={16} color="#5C6BC0" />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); moveCard(orderedMembers.indexOf(member), 1); }} style={styles.gridActionBtn}>
                            <MaterialIcons name="chevron-right" size={16} color="#5C6BC0" />
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleEditFamilyMember(member); }} style={styles.gridActionBtn}>
                          <MaterialIcons name="edit" size={11} color="#5C6BC0" />
                        </TouchableOpacity>
                      )}
                      {isLinked && (
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation?.(); router.push(`/parent/linked-child/${linkedChildId || member.id}`); }}
                          style={[styles.linkedBadge, { backgroundColor:'#E8F5E9' }]}>
                          <MaterialIcons name="link" size={10} color="#4CAF50" />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleDeleteFamilyMember(member); }} style={styles.gridActionBtn}>
                        <MaterialIcons name="close" size={11} color="#F44336" />
                      </TouchableOpacity>
                    </View>

                    {/* Avatar */}
                    <View style={[styles.gridAvatar, { backgroundColor: cardColor + '15' }]}>
                      {member.avatar_type === 'custom' && member.avatar_custom ? (
                        <Image source={{ uri: member.avatar_custom }} style={styles.gridAvatarImg} />
                      ) : (
                        <Text style={{ fontSize: 26 }}>
                          {presetAvatars?.find((a: any) => a.id === member.avatar_preset)?.emoji || (isChild ? '👧' : '⭐')}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.gridName} numberOfLines={1}>{member.name}</Text>
                    {isLinkedChild && <Text style={styles.linkedLabel}>{t('children_school') || t('children_school') || 'School Linked'}</Text>}



                    {!isChild && (
                      <TouchableOpacity
                        style={styles.wellbeingBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/parent/my-wellbeing?memberId=${member.id}&memberName=${encodeURIComponent(member.name)}&skipPin=false`);
                        }}
                      >
                        <MaterialIcons name="spa" size={12} color="#5C6BC0" />
                        <Text style={styles.wellbeingBtnTxt}>{t('wellbeing') || 'Wellbeing'}</Text>
                      </TouchableOpacity>
                    )}
                    {isChild && (
                      <TouchableOpacity
                        style={[styles.wellbeingBtn, { backgroundColor:'#E8F5E9', borderColor:'#4CAF50', marginTop:2, flexDirection:'row', gap:3 }]}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          if (isLinked || isLinkedChild) {
                            const lc = linkedChildren.find((lc: any) => lc.name === member.name);
                            router.push(`/parent/linked-child/${(member as any).student_id || lc?.id || member.id}`);
                          } else {
                            router.push(`/parent/family-member-stats/${member.id}?name=${encodeURIComponent(member.name)}`);
                          }
                        }}
                      >
                        <MaterialIcons name={isLinked || isLinkedChild ? "school" : "home"} size={10} color="#4CAF50" />
                        <Text style={[styles.wellbeingBtnTxt, { color:'#4CAF50' }]}>{t('stats') || t('stats') || 'Stats'}</Text>
                        <MaterialIcons name="chevron-right" size={10} color="#4CAF50" />
                      </TouchableOpacity>
                    )}
                    {isChild && (
                      <TouchableOpacity
                        style={{ marginTop: 4, alignItems: 'center', width: '100%', borderWidth:1, borderColor:'#C5CAE9', borderRadius:8, paddingVertical:3, backgroundColor:'#F3F4FF', minHeight:28 }}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          // Real bug fix Aug 23: this used to open the old defaults-only
                          // CreatureCollection modal - the same disconnected-destination bug
                          // already fixed once on student/select.tsx's card button, just never
                          // fixed here too. Now routes to the real unified My Creatures screen,
                          // same setCurrentStudent enrichment pattern already used by
                          // handleMemberCheckin above (linked child -> real student record;
                          // non-linked -> family-member wrapper with the resolved id).
                          const linkedStudent = linkedChildren.find((s: any) => s.name === member.name || s.id === (member as any).student_id);
                          if (linkedStudent) {
                            setCurrentStudent(linkedStudent);
                          } else {
                            setCurrentStudent({
                              id: (member as any).student_id || member.id,
                              name: member.name,
                              avatar_type: member.avatar_type || 'preset',
                              avatar_preset: member.avatar_preset || 'bear',
                              avatar_custom: member.avatar_custom || null,
                              is_family_member: true,
                              family_member_id: member.id,
                              student_id: (member as any).student_id,
                            } as any);
                          }
                          router.push('/student/creatures');
                        }}
                      >
                        <View style={{ flexDirection:'row', justifyContent:'center', flexWrap:'wrap', gap:2 }}>
                          {(memberCreatures[member.id]?.allCreatures || []).slice(0,4).map((cr, i) => {
                            const stg = cr.stages?.[Number(cr.current_stage||0)]?.emoji || '🥚';
                            return <Text key={i} style={{ fontSize:14 }}>{stg}</Text>;
                          })}
                          {(!memberCreatures[member.id]?.allCreatures?.length) && (
                            <Text style={{ fontSize:20 }}>{creatureEmoji}</Text>
                          )}
                          {/* Real feature Aug 23 (item 5): active community creatures,
                              matching the same icon treatment student/select.tsx already has. */}
                          {(memberCreatures[member.id]?.activeCommunity || []).map((entry: any) => {
                            const zoneColor = EMOTION_COLOURS[entry.colour as keyof typeof EMOTION_COLOURS] || '#5C6BC0';
                            return (
                              <View key={`community-${entry.id}`} style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 1, borderColor: zoneColor, overflow: 'hidden', position: 'relative' }}>
                                {entry.stage_image ? (
                                  <Image source={{ uri: entry.stage_image }} style={{ width: '100%', height: '100%' }} />
                                ) : (
                                  <Text style={{ fontSize: 10, textAlign: 'center' }}>🐾</Text>
                                )}
                                {entry.is_complete && (
                                  <View style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: 4, backgroundColor: zoneColor, alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ fontSize: 6, color: 'white', fontWeight: '900' }}>✓</Text>
                                  </View>
                                )}
                              </View>
                            );
                          })}
                        </View>
                        <Text style={{ fontSize:8, color:'#5C6BC0', marginTop:2 }}>{t('my_creatures') || 'My Creatures'}</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })}
                {!hasActiveSubscription && familyMembers.length >= 2 && (
                  <TouchableOpacity onPress={() => router.push('/subscription')}
                    style={[styles.gridCard, { borderColor:'#5C6BC0', borderStyle:'dashed', opacity:0.85, justifyContent:'center', alignItems:'center', gap:6 }]}>
                    <View style={{ width:40, height:40, borderRadius:20, backgroundColor:'#EDE7F6', justifyContent:'center', alignItems:'center' }}>
                      <MaterialIcons name="lock" size={20} color="#5C6BC0" />
                    </View>
                    <Text style={{ fontSize:10, fontWeight:'700', color:'#5C6BC0', textAlign:'center' }}>{t('add_more')||'Add more'}</Text>
                    <View style={{ backgroundColor:'#5C6BC0', borderRadius:8, paddingHorizontal:8, paddingVertical:3 }}>
                      <Text style={{ fontSize:9, color:'white', fontWeight:'700' }}>{t('upgrade') || 'UPGRADE'}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            </>
          )}
        </View>
        {/* Upgrade nudge — show after 5 checkins if not subscribed */}
        {!hasActiveSubscription && familyMembers.length >= 1 && totalFamilyCheckins >= 3 && (
          <TouchableOpacity
            onPress={() => router.push('/subscription')}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', borderRadius: 12, marginHorizontal: 16, marginBottom: 8, padding: 12, gap: 10, borderWidth: 1, borderColor: '#FFE082' }}>
            <Text style={{ fontSize: 20 }}>⭐</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#333' }}>{t('loving_the_app') || 'Loving the app?'}</Text>
              <Text style={{ fontSize: 11, color: '#666' }}>{t('unlock_pdf_unlimited_linking') || 'Unlock PDF reports, unlimited family & school linking'}</Text>
            </View>
            <View style={{ backgroundColor: '#FF9800', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}>
              <Text style={{ fontSize: 11, color: 'white', fontWeight: '700' }}>{t('trial') || t('trial') || 'Upgrade'}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Icon grid — round 3 (Sep 5): all 4 tiles must fit on one row (unlike the teacher
            dashboard's 6 tiles across 2 rows of 3), so these are smaller than teacher-dash's
            84px - 64px circles, 34px icons, 16px badge - same "fixed legible size" reasoning
            for the badge, just scaled down a step since the tile itself is smaller. Same
            gutter approach (paddingHorizontal per column) so the white space between tiles
            matches teacher-dash's feel even though the tiles themselves don't. */}
        <View style={{flexDirection:'row', flexWrap:'wrap', marginTop:12, marginBottom:4, paddingHorizontal:6}}>
          {[
            { label: t('family_strategies') || 'Family Strategies', icon: 'lightbulb', color: '#FFC107', route: '/parent/family-strategies', count: null },
            { label: t('resources') || 'Resources', icon: 'library-books', color: '#5C6BC0', route: '/parent/resources', count: null },
            { label: t('alerts') || 'Alerts', icon: 'notifications', color: '#F44336', route: '/parent/alerts', count: parentAlertCount > 0 ? parentAlertCount : null },
            { label: t('creatures_manage') || 'Creatures', icon: 'pets', color: '#9C27B0', route: '/parent/creature-code', count: null },
          ].map((btn) => (
            <TouchableOpacity
              key={btn.route}
              style={{width:'25%', alignItems:'center', gap:6, marginBottom:18, paddingHorizontal:6}}
              onPress={() => router.push(btn.route as any)}
            >
              <View style={{width:64, height:64, borderRadius:18, backgroundColor: btn.color + '15', alignItems:'center', justifyContent:'center', position:'relative'}}>
                <MaterialIcons name={btn.icon as any} size={34} color={btn.color}/>
                {btn.count != null && btn.count > 0 && (
                  <View style={{position:'absolute', top:-4, right:-4, width:16, height:16, borderRadius:8, alignItems:'center', justifyContent:'center', backgroundColor: btn.color}}>
                    <Text style={{fontSize:9, color:'white', fontWeight:'700'}}>{btn.count}</Text>
                  </View>
                )}
              </View>
              <Text style={{fontSize:11, fontWeight:'700', color:'#555', textAlign:'center'}}>{btn.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>


      {/* Link Child Modal */}
      <Modal visible={showLinkModal} transparent animationType="slide" onRequestClose={() => setShowLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('link_child_school') || 'Link Child from School'}</Text>
              <TouchableOpacity onPress={() => setShowLinkModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>
              {t('enter_code') || "Enter the 6-character code that your child's teacher provided. This will let you see your child's emotion check-ins from school."}
            </Text>
            <TextInput
              style={styles.codeInput}
              value={linkCode}
              onChangeText={(text) => setLinkCode(text.toUpperCase())}
              placeholder="ABC123"
              placeholderTextColor="#999"
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.submitButton, linking && styles.submitButtonDisabled]}
              onPress={handleLinkChild}
              disabled={linking || linkCode.length !== 6}
            >
              <Text style={styles.submitButtonText}>
                {linking ? (t('linking') || 'Linking...') : (t('link_child') || t('link_child')||'Link Child')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Family Member Modal */}
      <Modal visible={showAddFamilyModal} transparent animationType="slide" onRequestClose={() => setShowAddFamilyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_family_member') || 'Add Family Member'}</Text>
              <TouchableOpacity onPress={() => setShowAddFamilyModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            {/* Link existing student from student flow */}
            {(() => {
                const availableToAdd = availableStudents.filter((s:any) => 
                  !familyMembers.some((fm:any) => fm.student_id === s.id || fm.name === s.name));
                return availableToAdd.length > 0 ? (
              <View style={{marginBottom:12, paddingHorizontal:4}}>
                <Text style={{fontSize:12,fontWeight:'700',color:'#5C6BC0',marginBottom:6}}>
                  👧 {t('add_child_to_family_dashboard') || 'Add your child to your family dashboard'}
                </Text>
                <ScrollView style={{maxHeight:140}} nestedScrollEnabled showsVerticalScrollIndicator={true}>
                  {availableToAdd.map((s:any) => (
                    <TouchableOpacity key={s.id}
                      style={{flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,paddingHorizontal:10,backgroundColor:'#F0F4FF',borderRadius:8,marginBottom:4,borderWidth:1,borderColor:'#C5CAE9'}}
                      onPress={() => {
                        Alert.alert(
                          `${t('add') || 'Add'} ${s.name} ${t('to_family_question') || 'to family?'}`,
                          `${s.name} ${t('appear_on_dashboard_track_wellbeing') || 'will appear on your family dashboard and you can track their home wellbeing.'}`,
                          [
                            { text: t('cancel')||'Cancel', style: 'cancel' },
                            { text: t('add_member')||'Add', onPress: async () => {
                              try {
                                const token = await AsyncStorage.getItem('session_token');
                                const burl2 = process.env.EXPO_PUBLIC_BACKEND_URL || '';
                                const res = await fetch(`${burl2}/api/family/members`, {
                                  method:'POST',
                                  headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
                                  body: JSON.stringify({name:s.name,relationship:'child',student_id:s.id,avatar_preset:s.avatar_preset||'bear',avatar_type:'preset'})
                                });
                                const resText = await res.text();
                                if (res.ok) {
                                  setShowAddFamilyModal(false);
                                  fetchData();
                                  refreshStudents();
                                  Alert.alert(`✅ ${t('added_exclaim') || 'Added!'}`, `${s.name} ${t('added_to_family_dashboard_desc') || 'has been added to your family dashboard.'}`);
                                } else {
                                  let detail = resText;
                                  try { detail = JSON.parse(resText)?.detail || resText; } catch {}
                                  if (typeof detail === 'string' && detail.startsWith('free_tier_limit|')) {
                                    Alert.alert(t('free_plan_limit_title') || 'Free Plan Limit Reached', detail.split('|')[1] || (t('upgrade_add_more_children') || 'Upgrade to add more children.'), [
                                      { text: t('not_now') || 'Not Now', style: 'cancel' },
                                      { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
                                    ]);
                                  } else {
                                    Alert.alert(t('error') || 'Error', detail || (t('could_not_add_try_again') || 'Could not add. Please try again.'));
                                  }
                                }
                              } catch(e: any) {
                                Alert.alert(t('error') || 'Error', e?.message || (t('something_went_wrong') || 'Something went wrong.'));
                              }
                            }}
                          ]
                        );
                      }}>
                      <MaterialIcons name="person-add" size={16} color="#5C6BC0"/>
                      <Text style={{fontSize:13,fontWeight:'600',color:'#333',flex:1}}>{s.name}</Text>
                      <MaterialIcons name="chevron-right" size={14} color="#5C6BC0"/>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={{height:1,backgroundColor:'#EEE',marginVertical:8}}/>
                <Text style={{fontSize:11,color:'#888',marginBottom:4}}>{t('add_new_student') || 'Or create new'}</Text>
              </View>
                ) : null;
            })()}
            
            {/* Avatar Selection */}
            <Text style={styles.inputLabel}>{t('photo') || 'Photo'}</Text>
            <View style={styles.avatarSelection}>
              <TouchableOpacity
                style={[
                  styles.avatarOption,
                  newMember.avatar_type === 'preset' && styles.avatarOptionSelected
                ]}
                onPress={() => setNewMember({ ...newMember, avatar_type: 'preset', avatar_custom: '' })}
              >
                <View style={styles.presetAvatarPreview}>
                  <MaterialIcons 
                    name={newMember.relationship === 'self' ? 'person' : newMember.relationship === 'partner' ? 'favorite' : 'child-care'} 
                    size={40} 
                    color="#5C6BC0" 
                  />
                </View>
                <Text style={styles.avatarOptionText}>{t('use_icon') || 'Use Icon'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.avatarOption,
                  newMember.avatar_type === 'custom' && styles.avatarOptionSelected
                ]}
                onPress={pickImage}
              >
                {newMember.avatar_custom ? (
                  <Image 
                    source={{ uri: newMember.avatar_custom }} 
                    style={styles.customAvatarPreview} 
                  />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <MaterialIcons name="add-a-photo" size={40} color="#5C6BC0" />
                  </View>
                )}
                <Text style={styles.avatarOptionText}>{t('upload_photo') || 'Upload Photo'}</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>{t('name')}</Text>
            <TextInput
              style={styles.textInput}
              value={newMember.name}
              onChangeText={(text) => setNewMember({ ...newMember, name: text })}
              placeholder={t('name')}
            />
            
            <Text style={styles.inputLabel}>{t('relationship')}</Text>
            <View style={styles.relationshipButtons}>
              {(['self', 'partner', 'child'] as const).map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipButton,
                    newMember.relationship === rel && styles.relationshipButtonSelected,
                  ]}
                  onPress={() => setNewMember({ ...newMember, relationship: rel })}
                >
                  <MaterialIcons 
                    name={rel === 'self' ? 'person' : rel === 'partner' ? 'favorite' : 'child-care'} 
                    size={20} 
                    color={newMember.relationship === rel ? 'white' : '#666'} 
                  />
                  <Text style={[
                    styles.relationshipButtonText,
                    newMember.relationship === rel && styles.relationshipButtonTextSelected,
                  ]}>
                    {t(rel)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              style={[styles.submitButton, savingMember && styles.submitButtonDisabled]}
              onPress={handleAddFamilyMember}
              disabled={savingMember}
            >
              <Text style={styles.submitButtonText}>
                {savingMember ? t('adding') : t('add_member')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Share to Teacher Modal */}
      <Modal visible={showShareModal} transparent animationType="slide" onRequestClose={() => { setShowShareModal(false); setGeneratedCode(null); setDisclaimerAccepted(false); }}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('share_with_teacher')}</Text>
              <TouchableOpacity onPress={() => { setShowShareModal(false); setGeneratedCode(null); setDisclaimerAccepted(false); }}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {!disclaimerAccepted ? (
              // Disclaimer step
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={true}>
                <Text style={styles.disclaimerTitle}>{t('sharing_disclaimer_title')}</Text>
                <Text style={styles.disclaimerText}>{t('sharing_disclaimer_text')}</Text>
                <View style={styles.disclaimerButtons}>
                  <TouchableOpacity
                    style={[styles.submitButton, { backgroundColor: '#999', flex: 1, marginRight: 8 }]}
                    onPress={() => { setShowShareModal(false); setDisclaimerAccepted(false); }}
                  >
                    <Text style={styles.submitButtonText}>{t('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.submitButton, { flex: 1.5 }]}
                    onPress={() => setDisclaimerAccepted(true)}
                  >
                    <Text style={styles.submitButtonText}>{t('i_agree_and_continue')}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : !generatedCode ? (
              <>
                <View style={styles.shareInfo}>
                  <MaterialIcons name="qr-code-2" size={64} color="#4A90D9" />
                  <Text style={styles.modalText}>
                    {t('generate_teacher_code')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => selectedMember && handleGenerateTeacherCode(selectedMember.id)}
                >
                  <Text style={styles.submitButtonText}>{t('generate_code')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.codeDisplay}>
                  <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                  <Text style={styles.codeLabel}>{t('teacher_link_code')}</Text>
                  <Text style={styles.codeValue}>{generatedCode}</Text>
                  <Text style={styles.codeExpiry}>{t('trial_active') || 'Trial Active'} · {t('trial_active_desc') || 'Your free trial is active'}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#4CAF50' }]}
                  onPress={handleShareCode}
                >
                  <MaterialIcons name="share" size={20} color="white" />
                  <Text style={styles.submitButtonText}> {t('share_code')}</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Family Member Modal */}
      <Modal visible={showEditFamilyModal} transparent animationType="slide" onRequestClose={() => setShowEditFamilyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('edit_member') || 'Edit Family Member'}</Text>
              <TouchableOpacity onPress={() => setShowEditFamilyModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {/* Avatar Selection */}
            <Text style={styles.inputLabel}>{t('photo') || 'Photo'}</Text>
            <View style={styles.avatarSelection}>
              <TouchableOpacity
                style={[
                  styles.avatarOption,
                  editMember.avatar_type === 'preset' && styles.avatarOptionSelected
                ]}
                onPress={() => setEditMember({ ...editMember, avatar_type: 'preset', avatar_custom: '' })}
              >
                <View style={styles.presetAvatarPreview}>
                  <Text style={{ fontSize: 32 }}>
                    {presetAvatars?.find(a => a.id === editMember.avatar_preset)?.emoji || '⭐'}
                  </Text>
                </View>
                <Text style={styles.avatarOptionText}>{t('use_icon') || 'Use Icon'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[
                  styles.avatarOption,
                  editMember.avatar_type === 'custom' && styles.avatarOptionSelected
                ]}
                onPress={pickImageForEdit}
              >
                {editMember.avatar_custom ? (
                  <Image 
                    source={{ uri: editMember.avatar_custom }} 
                    style={styles.customAvatarPreview} 
                  />
                ) : (
                  <View style={styles.uploadPlaceholder}>
                    <MaterialIcons name="add-a-photo" size={40} color="#5C6BC0" />
                  </View>
                )}
                <Text style={styles.avatarOptionText}>{t('upload_photo') || 'Upload Photo'}</Text>
              </TouchableOpacity>
            </View>
            
            {/* Icon Selection (when preset is selected) */}
            {editMember.avatar_type === 'preset' && (
              <>
                <Text style={styles.inputLabel}>{t('choose_icon') || 'Choose Icon'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.iconScrollView}>
                  <View style={styles.iconGrid}>
                    {(presetAvatars || []).map((avatar) => (
                      <TouchableOpacity
                        key={avatar.id}
                        style={[
                          styles.iconOption,
                          editMember.avatar_preset === avatar.id && styles.iconOptionSelected
                        ]}
                        onPress={() => setEditMember({ ...editMember, avatar_preset: avatar.id })}
                      >
                        <Text style={styles.iconEmoji}>{avatar.emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}
            
            <Text style={styles.inputLabel}>{t('name')}</Text>
            <TextInput
              style={styles.textInput}
              value={editMember.name}
              onChangeText={(text) => setEditMember({ ...editMember, name: text })}
              placeholder={t('name')}
            />
            
            <Text style={styles.inputLabel}>{t('relationship')}</Text>
            <View style={styles.relationshipButtons}>
              {(['self', 'partner', 'child'] as const).map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipButton,
                    editMember.relationship === rel && styles.relationshipButtonSelected,
                  ]}
                  onPress={() => setEditMember({ ...editMember, relationship: rel })}
                >
                  <MaterialIcons 
                    name={rel === 'self' ? 'person' : rel === 'partner' ? 'favorite' : 'child-care'} 
                    size={20} 
                    color={editMember.relationship === rel ? 'white' : '#666'} 
                  />
                  <Text style={[
                    styles.relationshipButtonText,
                    editMember.relationship === rel && styles.relationshipButtonTextSelected,
                  ]}>
                    {t(rel)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            
            <TouchableOpacity
              style={[styles.submitButton, updatingMember && styles.submitButtonDisabled]}
              onPress={handleUpdateFamilyMember}
              disabled={updatingMember}
            >
              <Text style={styles.submitButtonText}>
                {updatingMember ? t('updating') || 'Updating...' : t('save_changes') || 'Save Changes'}
              </Text>
            </TouchableOpacity>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 20,
    paddingBottom: 2,
    paddingTop: 4,
  },
  headerLogo: { width: 56, height: 56, marginBottom: 4 },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 4,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
  },
  familySection: { paddingHorizontal: 0, marginBottom: 4 },
  familySectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  familySectionTitle: { fontSize: 13, fontWeight: '700', color: '#333' },
  familyGrid: { flexDirection: 'column', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  gridCard: { width: 100, backgroundColor: 'white', borderRadius: 12, padding: 6, alignItems: 'center', borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  gridCardActions: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  gridActionBtn: { padding: 2 },
  gridAvatar: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', marginBottom: 3 },
  gridAvatarImg: { width: 38, height: 38, borderRadius: 19 },
  gridName: { fontSize: 12, fontWeight: '700', color: '#333', marginBottom: 4, textAlign: 'center' },
  linkedLabel: { fontSize: 9, color: '#4CAF50', fontWeight: '600', marginBottom: 4 },
  linkedBadge: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  wellbeingBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#F3F4FF', borderRadius: 6, paddingHorizontal: 4, paddingVertical: 2, marginTop: 3, borderWidth: 1, borderColor: '#E8EAF6', width: '100%', justifyContent: 'center' },
  wellbeingBtnTxt: { fontSize: 8, fontWeight: '600', color: '#5C6BC0' },
  compactActions: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: 'white', borderRadius: 16, padding: 8, marginHorizontal: 16, marginBottom: 6, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  compactAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  compactActionTxt: { fontSize: 10, fontWeight: '600', color: '#555', textAlign: 'center' },
  emptyFamilyCard: { margin: 16, padding: 24, backgroundColor: 'white', borderRadius: 16, alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: '#E8EAF6', borderStyle: 'dashed' },
  emptyFamilyTxt: { fontSize: 14, color: '#AAA', textAlign: 'center' },
  addButton: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#5C6BC0', justifyContent: 'center', alignItems: 'center' },
  unlinkButton: { position: 'absolute', top: 4, right: 4, padding: 4 },
  membersScroll: { marginHorizontal: 16 },
  memberCard: { width: 100, backgroundColor: 'white', borderRadius: 12, padding: 10, alignItems: 'center', marginRight: 10, borderWidth: 1.5, borderColor: '#E8EAF6' },
  memberCardSelected: { borderColor: '#5C6BC0', backgroundColor: '#F3F4FF' },
  memberName: { fontSize: 12, fontWeight: '600', color: '#333', marginTop: 6, textAlign: 'center' },

  sectionTitle: { fontSize: 13, fontWeight: '600', color: '#333' },
  wellnessButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#5C6BC0', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, borderWidth: 1, borderColor: '#E8EAF6', gap: 12 },
  wellnessIcon: { fontSize: 28 },
  wellnessTitle: { fontSize: 16, fontWeight: '700', color: '#5C6BC0' },
  wellnessSub: { fontSize: 12, color: '#999', marginTop: 2 },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  linkButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  cardActionButtons: {
    position: 'absolute',
    top: 4,
    start: 4,
    end: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  editButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8EAF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberCreatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    gap: 4,
  },
  memberCreatureEmoji: {
    fontSize: 18,
  },
  memberCreatureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  memberRole: {
    fontSize: 11,
    color: '#888',
    textTransform: 'capitalize',
  },
  linkedBadgeText: {
    fontSize: 10,
    color: '#5C6BC0',
    fontWeight: '500',
  },
  shareToTeacherButton: {
    position: 'absolute',
    top: 4,
    end: 4,
    padding: 4,
  },
  checkinButton: {
    position: 'absolute',
    bottom: 4,
    end: 4,
    padding: 4,
  },
  emptyMembers: {
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  chartContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  chartCenter: {
    alignItems: 'center',
  },
  chartCenterNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  chartCenterLabel: {
    fontSize: 12,
    color: '#666',
  },
  legendContainer: {
    marginTop: 16,
    width: '100%',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  legendCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  noDataText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
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
  commentBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 6,
  },
  commentText: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flex: 1,
    minWidth: 100,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 16,
    gap: 6,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 24,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    lineHeight: 20,
    textAlign: 'center',
  },
  codeInput: {
    borderWidth: 2,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 16,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 8,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  relationshipButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  relationshipButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    gap: 6,
  },
  relationshipButtonSelected: {
    backgroundColor: '#4A90D9',
  },
  relationshipButtonText: {
    fontSize: 14,
    color: '#666',
  },
  relationshipButtonTextSelected: {
    color: 'white',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4A90D9',
    padding: 16,
    borderRadius: 12,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  shareInfo: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  codeDisplay: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  codeLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 16,
  },
  codeValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#4A90D9',
    letterSpacing: 6,
    marginTop: 8,
  },
  codeExpiry: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  // New styles for kid-friendly check-in and weekly table
  memberCardWrapper: {
    alignItems: 'center',
    marginHorizontal: 6,
  },
  memberAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  memberAvatarEmoji: {
    fontSize: 28,
  },
  bigCheckinButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 8,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  bigCheckinEmoji: {
    fontSize: 20,
  },
  bigCheckinText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  // Weekly table styles
  weeklyTable: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  weeklyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  weeklyDayHeader: {
    flex: 1,
    alignItems: 'center',
  },
  weeklyDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  weeklyBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
  },
  weeklyDayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 4,
  },
  weeklyLogItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  weeklyZoneDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  weeklyTime: {
    fontSize: 10,
    color: '#666',
  },
  weeklyNoData: {
    fontSize: 16,
    color: '#CCC',
  },
  // Avatar selection styles
  avatarSelection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  avatarOption: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    width: 120,
  },
  avatarOptionSelected: {
    borderColor: '#5C6BC0',
    backgroundColor: '#E8EAF6',
  },
  presetAvatarPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  customAvatarPreview: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  uploadPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#CCC',
  },
  avatarOptionText: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
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
    marginBottom: 20,
  },
  disclaimerButtons: {
    flexDirection: 'row',
    marginTop: 8,
    paddingBottom: 20,
  },
  // Icon selection styles
  iconScrollView: {
    marginBottom: 16,
  },
  iconGrid: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
  },
  iconOption: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E0E0E0',
  },
  iconOptionSelected: {
    borderColor: '#5C6BC0',
    backgroundColor: '#E8EAF6',
  },
  iconEmoji: {
    fontSize: 28,
  },
});
