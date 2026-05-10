import React, { useState, useEffect } from 'react';
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
  Dimensions,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { registerForPushNotifications } from '../../src/utils/notifications';
import { PieChart, BarChart } from 'react-native-gifted-charts';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { 
  parentApi, Student, zoneLogsApi, ZoneLog, analyticsApi,
  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi, rewardsApi, linkedChildApi
} from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';
import { CreatureCollection } from '../../src/components/CreatureCollection';

// Pick image with camera or library choice
const pickImageWithChoice = (
  onSelect: (base64: string) => void
) => {
  Alert.alert(
    'Add Photo',
    'Choose how to add a photo',
    [
      {
        text: '📷 Take Photo',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestCameraPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission needed', 'Allow camera access in Settings.'); return; }
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true, aspect: [1,1], quality: 0.4, base64: true,
            });
            if (!result.canceled && result.assets?.[0]?.base64) {
              onSelect(`data:image/jpeg;base64,${result.assets[0].base64}`);
            }
          } catch (e) { console.error('Camera error:', e); Alert.alert('Error', 'Could not open camera'); }
        },
      },
      {
        text: '🖼️ Choose from Library',
        onPress: async () => {
          try {
            const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access in Settings.'); return; }
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true, aspect: [1,1], quality: 0.4, base64: true,
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
            });
            if (!result.canceled && result.assets?.[0]?.base64) {
              onSelect(`data:image/jpeg;base64,${result.assets[0].base64}`);
            }
          } catch (e) { console.error('Library error:', e); Alert.alert('Error', 'Could not open photo library'); }
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]
  );
};



const screenWidth = Dimensions.get('window').width;


const STRATEGY_NAMES: Record<string, string> = {
  b1:'Gentle Stretch', b2:'Favourite Song', b3:'Tell Someone', b4:'Slow Breathing',
  g1:'Keep Going!', g2:'Help a Friend', g3:'Set a Goal', g4:'Gratitude',
  y1:'Bubble Breathing', y2:'Count to 10', y3:'5 Senses', y4:'Talk About It',
  r1:'Freeze', r2:'Big Breaths', r3:'Safe Space', r4:'Ask for Help',
  p_b1:'Side-by-Side', p_b2:'Warm Drink', p_b3:'Name It',
  p_g1:'Gratitude Round', p_g2:'Strength Spotting', p_g3:'Creative Together',
  p_y1:'Box Breathing', p_y2:'Validate First', p_y3:'Body Check-In',
  p_r1:'Stay Calm', p_r2:'Safe Space Together', p_r3:'Cold Water Reset',
  // zone_ prefix variants
  blue_1:'Gentle Stretch', blue_2:'Favourite Song', blue_3:'Tell Someone', blue_4:'Slow Breathing',
  green_1:'Keep Going!', green_2:'Help a Friend', green_3:'Set a Goal', green_4:'Gratitude',
  yellow_1:'Bubble Breathing', yellow_2:'Count to 10', yellow_3:'5 Senses', yellow_4:'Talk About It',
  red_1:'Freeze', red_2:'Big Breaths', red_3:'Safe Space', red_4:'Ask for Help',
};
const resolveStrategy = (id: string): string => {
  if (!id) return '';
  const clean = id.trim().toLowerCase().replace(/^(helper_|strategy_)/, '');
  return STRATEGY_NAMES[clean] || STRATEGY_NAMES[id] || id.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
};

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

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
  partner: '#E91E63',
  child: '#4CAF50',
};

const getRelationshipColor = (relationship: string) => {
  return RELATIONSHIP_COLORS[relationship] || '#5C6BC0';
};

export default function ParentDashboard() {
  const router = useRouter();
  const { user, presetAvatars, t, language , setCurrentStudent } = useApp();
  
  // Linked children from school
  const [linkedChildren, setLinkedChildren] = useState<Student[]>([]);
  const [childCreatures, setChildCreatures] = useState<Record<string, any>>({});
  // Family members (self, partner, kids at home)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [memberCreatures, setMemberCreatures] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);
  
  // Selected member for viewing
  const [selectedMember, setSelectedMember] = useState<FamilyMember | Student | null>(null);
  const [selectedType, setSelectedType] = useState<'family' | 'linked'>('family');
  
  // Analytics
  const [analytics, setAnalytics] = useState<{ zone_counts: Record<string, number> } | null>(null);
  const [weekExpanded, setWeekExpanded] = useState(false);
  const [analyticsPeriod, setAnalyticsPeriod] = useState<1|7|14|30>(7);
  const [checkInsExpanded, setCheckInsExpanded] = useState(false);
  const [showCollection, setShowCollection] = useState(false);
  const [collectionMember, setCollectionMember] = useState<any>(null);
  const [checkinsExpanded, setCheckinsExpanded] = useState(true);
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
    });
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
  const getWeeklyLogs = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekData: Record<string, { logs: (ZoneLog | FamilyZoneLog)[], times: string[] }> = {};
    days.forEach(day => { weekData[day] = { logs: [], times: [] }; });
    
    recentLogs.forEach(log => {
      const day = getDayOfWeek(log.timestamp);
      if (weekData[day]) {
        const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
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
    });
  };

  const handleMemberCheckin = (member: any) => {
    const rel = member.relationship || 'adult';
    if (rel === 'child') {
      // ALL children go to student zone flow regardless of link status
      const linkedStudent = linkedChildren.find((s: any) => s.name === member.name);
      if (linkedStudent) {
        setCurrentStudent(linkedStudent);
      }
      // Always go to student zone select - same experience as school
      router.push({ pathname: '/student/zone', params: { fromFamily: 'true', memberName: member.name } });
    } else {
      // Adults get parent checkin (max 3 taps: dashboard → checkin → zone → done)
      router.push({
        pathname: '/parent/checkin',
        params: { memberId: member.id, memberName: member.name, relationship: rel }
      });
    }
  };

  const loadFamilyMemberCreatures = async (members: any[]) => {
    const creatures: Record<string, any> = {};
    const childMembers = members.filter((m: any) => m.relationship === 'child');
    await Promise.allSettled(childMembers.map(async (member: any) => {
      // Family members don't have creature collections yet - show default egg
      creatures[member.id] = {
        emoji: '🥚',
        color: '#5C6BC0',
        stage: 0,
        points: 0,
      };
    }));
    setChildCreatures(prev => ({ ...prev, ...creatures }));
  };

  const fetchData = async () => {
    try {
      // First, ensure user role is set to parent
      try {
        await authApiExtended.updateRole('parent');
      } catch (roleError) {
        console.log('Role update skipped or failed:', roleError);
      }
      
      // Fetch linked children from school
      const children = await parentApi.getChildren();
      setLinkedChildren(children);
      
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
              creatureMap[m.id] = {
                emoji: collection.current_creature?.stages?.[stage]?.emoji || '🥚',
                color: collection.current_creature?.color || '#4CAF50',
                points: collection.current_points || 0,
                stage,
                name: collection.current_creature?.name || '',
                hasRealCreature: true,
                allCreatures: collection.all_creatures || [],
                current_points: collection.current_points || 0,
              };
            }
          } catch { /* no creature yet - use default */ }
        }
        // Give non-linked members a default creature
        if (!creatureMap[m.id]) {
          const def = defaultCreatures[m.relationship] || defaultCreatures.other;
          creatureMap[m.id] = {
            emoji: def.emoji,
            color: def.color,
            points: 0,
            stage: 0,
            name: 'Start checking in!',
            hasRealCreature: false,
          };
        }
      }
      setMemberCreatures(creatureMap);
      
      // Auto-select first member if none selected
      if (!selectedMember) {
        if (members.length > 0) {
          setSelectedMember(members[0]);
          setSelectedType('family');
        } else if (children.length > 0) {
          setSelectedMember(children[0]);
          setSelectedType('linked');
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchMemberData = async () => {
    if (!selectedMember) return;
    
    try {
      if (selectedType === 'linked') {
        // Fetch school data for linked child
        const [logsData, analyticsData] = await Promise.all([
          zoneLogsApi.getByStudent((selectedMember as Student).id, 7),
          analyticsApi.getStudent((selectedMember as Student).id, 7),
        ]);
        setRecentLogs(logsData);
        setAnalytics(analyticsData);
      } else {
        // Fetch family data
        const [logsData, analyticsData] = await Promise.all([
          (async () => {
            try {
              const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
              const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
              const token = await AsyncStorage.getItem('session_token');
              const r = await fetch(`${BACKEND_URL}/api/family/zone-logs/${(selectedMember as FamilyMember).id}?days=${analyticsPeriod}`, {
                headers: { 'Authorization': `Bearer ${token}` }
              });
              return r.ok ? r.json() : [];
            } catch { return []; }
          })(),
          (async () => {
          const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          const token = await AsyncStorage.getItem('session_token');
          const r = await fetch(`${BACKEND_URL}/api/family/analytics/${(selectedMember as FamilyMember).id}?days=7`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          return r.ok ? r.json() : { zone_counts: { blue: 0, green: 0, yellow: 0, red: 0 } };
        })(),
        ]);
        setRecentLogs(logsData);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      console.error('Error fetching member data:', error);
      setRecentLogs([]);
      setAnalytics({ zone_counts: { blue: 0, green: 0, yellow: 0, red: 0 } });
    }
  };

  // Register for push notifications on mount
  useEffect(() => {
    registerForPushNotifications().catch(() => {});
  }, []);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      fetchMemberData();
    }
  }, [selectedMember, selectedType, analyticsPeriod]);

  const onRefresh = async () => {
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
      const childName = result.student_name || 'Child';
      setShowLinkModal(false);
      setLinkCode('');
      fetchData();
      // Show sharing consent after linking
      setTimeout(() => {
        Alert.alert(
          `✅ ${childName} Linked!`,
          `${childName} is now connected between home and school.\n\n📋 SHARING:\n\n🏫→🏠 You can already see school check-ins here.\n\n🏠→🏫 You can choose to share home check-ins with the teacher.\n\nHome sharing is OFF by default for privacy.`,
          [
            { text: '🔒 Keep Private', style: 'cancel' },
            {
              text: '📤 Share with Teacher',
              onPress: async () => {
                try {
                  await linkedChildApi.toggleHomeSharing(result.student_id);
                  Alert.alert('✅ Sharing On', 'Teacher can now see home check-ins. Turn off anytime in the linked student section.');
                } catch (e) { console.log('Sharing toggle error:', e); }
              }
            }
          ]
        );
      }, 500);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Invalid or expired code');
    } finally {
      setLinking(false);
    }
  };

  const handleAddFamilyMember = async () => {
    if (!newMember.name.trim()) {
      Alert.alert('Error', 'Please enter a name');
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
      Alert.alert('Success', `${newMember.name} has been added to your family!`);
      setShowAddFamilyModal(false);
      setNewMember({ name: '', relationship: 'child', avatar_type: 'preset', avatar_preset: 'star', avatar_custom: '' });
      fetchData();
    } catch (error: any) {
      console.error('Error adding family member:', error);
      Alert.alert('Error', error.message || 'Failed to add family member. Please make sure you are logged in as a parent.');
    } finally {
      setSavingMember(false);
    }
  };

  const handleGenerateTeacherCode = async (studentId: string) => {
    try {
      const result = await familyApi.generateTeacherCode(studentId);
      setGeneratedCode(result.link_code);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to generate code');
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

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Subtitle */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
          <Text style={{ fontSize: 12, color: '#333', textAlign: 'center', fontWeight: '400', letterSpacing: 0.2 }}>
            {t('family_wellbeing_desc') || "My Family's Emotional Wellbeing"}
          </Text>
        </View>
        {/* Family Members — Whole card taps to check in */}
        <View style={styles.familySection}>
          <View style={styles.familySectionHeader}>
            <Text style={styles.familySectionTitle}>{t('my_family') || 'My Family'}</Text>
            {familyMembers.length < 4 && (
              <TouchableOpacity style={styles.addButton} onPress={() => setShowAddFamilyModal(true)}>
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
            <View style={styles.familyGrid}>
              {familyMembers.slice(0, 4).map((member) => {
                const creature = memberCreatures[member.id];
                const creatureEmoji = creature?.allCreatures?.[0]
                  ? creature.allCreatures[0].stages?.[Number(creature.allCreatures[0].current_stage || 0)]?.emoji || '🥚'
                  : creature?.emoji || '🥚';
                const isChild = member.relationship === 'child';
                const cardColor = getRelationshipColor(member.relationship);
                const isLinked = !!(member as any).student_id;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.gridCard, { borderColor: cardColor + '30' }]}
                    onPress={() => handleMemberCheckin(member)}
                    activeOpacity={0.85}
                  >
                    {/* Edit/delete top row */}
                    <View style={styles.gridCardActions}>
                      <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); handleEditFamilyMember(member); }} style={styles.gridActionBtn}>
                        <MaterialIcons name="edit" size={11} color="#5C6BC0" />
                      </TouchableOpacity>
                      {isLinked && (
                        <View style={styles.linkedBadge}>
                          <MaterialIcons name="link" size={10} color="#4CAF50" />
                        </View>
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
                          {isChild ? creatureEmoji : presetAvatars?.find((a: any) => a.id === member.avatar_preset)?.emoji || '⭐'}
                        </Text>
                      )}
                    </View>

                    <Text style={styles.gridName} numberOfLines={1}>{member.name}</Text>
                    {isLinked && <Text style={styles.linkedLabel}>Linked Child</Text>}



                    {!isChild && (
                      <TouchableOpacity
                        style={styles.wellbeingBtn}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          router.push(`/parent/my-wellbeing?memberId=${member.id}&memberName=${encodeURIComponent(member.name)}&skipPin=false`);
                        }}
                      >
                        <MaterialIcons name="spa" size={12} color="#5C6BC0" />
                        <Text style={styles.wellbeingBtnTxt}>Wellbeing</Text>
                      </TouchableOpacity>
                    )}
                    {isChild && creature && (
                      <TouchableOpacity
                        style={[styles.wellbeingBtn, { marginTop: 4, borderColor: creature.color || '#4CAF50' }]}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          setCollectionMember(member);
                          setShowCollection(true);
                        }}
                      >
                        <Text style={{ fontSize: 12 }}>{creatureEmoji}</Text>
                        <Text style={[styles.wellbeingBtnTxt, { color: creature.color || '#4CAF50' }]}>Creature</Text>
                      </TouchableOpacity>
                    )}
                    {isChild && (
                      <View style={{ display: 'none' }} />
                    )}
                  </TouchableOpacity>
                );
              })}
              {/* Linked children in same row */}
              {linkedChildren.slice(0, Math.max(0, 4 - familyMembers.length)).map((child: any) => (
                <TouchableOpacity
                  key={`linked-${child.id}`}
                  style={[styles.gridCard, { borderColor: '#4CAF5030' }]}
                  onPress={() => router.push({
                    pathname: '/student/zone',
                    params: { studentId: child.id, location: 'home', fromFamily: 'true' }
                  })}
                  activeOpacity={0.85}
                >
                  <View style={styles.gridCardActions}>
                    <View style={[styles.linkedBadge, { flexDirection: 'row', gap: 2 }]}>
                      <MaterialIcons name="link" size={9} color="#4CAF50" />
                      <Text style={{ fontSize: 7, color: '#4CAF50', fontWeight: '700' }}>SCHOOL</Text>
                    </View>
                  </View>
                  <View style={[styles.gridAvatar, { backgroundColor: '#4CAF5015' }]}>
                    {child.avatar_type === 'custom' && child.avatar_custom ? (
                      <Image source={{ uri: child.avatar_custom }} style={styles.gridAvatarImg} />
                    ) : child.avatar_preset ? (
                      <Text style={{ fontSize: 24 }}>
                        {presetAvatars?.find((a: any) => a.id === child.avatar_preset)?.emoji || '🎒'}
                      </Text>
                    ) : (
                      <MaterialIcons name="child-care" size={26} color="#4CAF50" />
                    )}
                  </View>
                  <Text style={styles.gridName} numberOfLines={1}>{child.name}</Text>
                  <Text style={styles.linkedLabel}>Linked Child</Text>
                  <TouchableOpacity
                    style={styles.wellbeingBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      router.push(`/parent/my-wellbeing?memberId=${child.id}&memberName=${encodeURIComponent(child.name)}&skipPin=true`);
                    }}
                  >
                    <MaterialIcons name="spa" size={12} color="#5C6BC0" />
                    <Text style={styles.wellbeingBtnTxt}>Wellbeing</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.wellbeingBtn, { marginTop: 4, borderColor: childCreatures[child.id]?.color || '#4CAF50' }]}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setCollectionMember(child);
                      setShowCollection(true);
                    }}
                  >
                    <Text style={{ fontSize: 14 }}>{childCreatures[child.id]?.emoji || '🥚'}</Text>
                    <Text style={[styles.wellbeingBtnTxt, { color: childCreatures[child.id]?.color || '#4CAF50' }]}>Creatures</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        {/* Linked Children from School — now shown in My Family above */}
        {false && <View>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('children_school')}</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setShowLinkModal(true)}
            >
              <MaterialIcons name="link" size={18} color="white" />
              <Text style={styles.linkButtonText}>{t('link_child')}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll}>
            {linkedChildren.map((child) => (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.memberCard,
                  selectedMember?.id === child.id && selectedType === 'linked' && styles.memberCardSelected,
                ]}
                onPress={() => {
                  // Navigate to linked child detail screen
                  console.log('[Dashboard] Navigating to linked child:', child.id);
                  router.push(`/parent/linked-child/${child.id}`);
                }}
              >
                {/* Unlink Button (X) */}
                <TouchableOpacity
                  style={styles.unlinkButton}
                  onPress={(e) => {
                    e.stopPropagation();
                    Alert.alert(
                      t('unlink_child') || 'Unlink Child',
                      t('confirm_unlink_child') || `Are you sure you want to unlink ${child.name}? You will need a new code from the teacher to reconnect.`,
                      [
                        { text: t('cancel') || 'Cancel', style: 'cancel' },
                        {
                          text: t('unlink') || 'Unlink',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              await linkedChildApi.unlink(child.id);
                              setLinkedChildren(prev => prev.filter(c => c.id !== child.id));
                              Alert.alert('✅ Unlinked', `${child.name} has been unlinked. You'll need a new code from the teacher to reconnect.`);
                              // Refresh data
                              const children = await parentApi.getChildren();
                              setLinkedChildren(children);
                            } catch (error: any) {
                              Alert.alert(t('error') || 'Error', error.message || 'Failed to unlink');
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <MaterialIcons name="close" size={14} color="#F44336" />
                </TouchableOpacity>
                
                <Avatar
                  type={child.avatar_type}
                  preset={child.avatar_preset}
                  custom={child.avatar_custom}
                  size={50}
                  presetAvatars={presetAvatars}
                />
                <Text style={styles.memberName}>{child.name}</Text>
                <View style={styles.linkedBadge}>
                  <MaterialIcons name="school" size={12} color="#5C6BC0" />
                  <Text style={styles.linkedBadgeText}>{t('school')}</Text>
                </View>
              </TouchableOpacity>
            ))}

            {linkedChildren.length === 0 && (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyText}>{t('link_children_school')}</Text>
              </View>
            )}
          </ScrollView>
        </View>

        </View>}
        {/* Quick Actions — compact row */}
        <View style={styles.section}>
          <View style={styles.compactActions}>
            <TouchableOpacity style={styles.compactAction} onPress={() => router.push('/parent/family-strategies')}>
              <MaterialIcons name="lightbulb" size={22} color="#FFC107" />
              <Text style={styles.compactActionTxt}>{t('family_strategies') || 'Family Strategies'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.compactAction} onPress={() => router.push('/parent/resources')}>
              <MaterialIcons name="library-books" size={22} color="#5C6BC0" />
              <Text style={styles.compactActionTxt}>{t('resources') || 'Resources'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.compactAction} onPress={() => router.push('/parent/alerts')}>
              <MaterialIcons name="notifications" size={22} color="#F44336" />
              <Text style={styles.compactActionTxt}>{t('alerts') || 'Alerts'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.compactAction} onPress={() => router.push('/parent/widget')}>
              <MaterialIcons name="widgets" size={22} color="#9C27B0" />
              <Text style={styles.compactActionTxt}>Widget</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Member Analytics */}
        {selectedMember && (
          <>
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setWeekExpanded(e => !e)}
                activeOpacity={0.7}
              >
                <Text style={styles.sectionTitle}>{t('week_overview') || 'Week Overview'}</Text>
                <MaterialIcons name={weekExpanded ? 'expand-less' : 'expand-more'} size={22} color="#5C6BC0" />
              </TouchableOpacity>
              {weekExpanded && (
                <View style={{ flexDirection:'row', gap:6, marginBottom:10, marginTop:4 }}>
                  {([1,7,14,30] as const).map(p => (
                    <TouchableOpacity key={p} onPress={() => setAnalyticsPeriod(p)}
                      style={{ flex:1, paddingVertical:5, borderRadius:8, alignItems:'center',
                        backgroundColor: analyticsPeriod===p ? '#5C6BC0' : '#F0F0F0' }}>
                      <Text style={{ fontSize:11, fontWeight:'700',
                        color: analyticsPeriod===p ? 'white' : '#888' }}>
                        {p===1?(t('today')||'Today'):p===7?(t('week')||'Week'):p===14?(t('fortnight')||'Fortnight'):(t('month')||'Month')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {weekExpanded && totalLogs > 0 ? (
                <View style={styles.chartContainer}>
                  <BarChart
                    data={[
                      { value: recentLogs.filter((l:any)=>{ const diff=(Date.now()-new Date(l.timestamp).getTime())/(86400000); return diff<=analyticsPeriod&&(l.zone||l.feeling_colour)==='blue'; }).length, frontColor:'#4A90D9', label:'😊', labelTextStyle:{fontSize:16} },
                      { value: recentLogs.filter((l:any)=>{ const diff=(Date.now()-new Date(l.timestamp).getTime())/(86400000); return diff<=analyticsPeriod&&(l.zone||l.feeling_colour)==='green'; }).length, frontColor:'#43A047', label:'😌', labelTextStyle:{fontSize:16} },
                      { value: recentLogs.filter((l:any)=>{ const diff=(Date.now()-new Date(l.timestamp).getTime())/(86400000); return diff<=analyticsPeriod&&(l.zone||l.feeling_colour)==='yellow'; }).length, frontColor:'#F9A825', label:'😟', labelTextStyle:{fontSize:16} },
                      { value: recentLogs.filter((l:any)=>{ const diff=(Date.now()-new Date(l.timestamp).getTime())/(86400000); return diff<=analyticsPeriod&&(l.zone||l.feeling_colour)==='red'; }).length, frontColor:'#E53935', label:'😡', labelTextStyle:{fontSize:16} },
                    ]}
                    barWidth={44}
                    spacing={20}
                    roundedTop
                    xAxisThickness={1}
                    xAxisColor={'#E0E0E0'}
                    yAxisThickness={0}
                    yAxisTextStyle={{color:'#999',fontSize:10}}
                    noOfSections={4}
                    isAnimated
                    barBorderRadius={6}
                    width={260}
                    xAxisLabelTextStyle={{fontSize:16}}
                  />
                  <View style={styles.legendContainer}>
                    {['blue','green','yellow','red'].map((zone) => (
                      <View key={zone} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: ZONE_COLORS[zone] }]} />
                        <Text style={styles.legendText}>{getZoneLabel(zone, t)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
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
                          dayData.logs.slice(0, 3).map((log, idx) => (
                            <View key={idx} style={styles.weeklyLogItem}>
                              <View style={[styles.weeklyZoneDot, { backgroundColor: ZONE_COLORS[log.zone] }]} />
                              <Text style={styles.weeklyTime}>{dayData.times[idx]}</Text>
                            </View>
                          ))
                        ) : (
                          <Text style={styles.weeklyNoData}>-</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
              
              {/* Recent logs list */}
              {recentLogs.length > 0 ? (
                recentLogs.slice(0, 10).map((log) => (
                  <View key={log.id} style={styles.logItem}>
                    <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                      <Text style={styles.logZoneText}>{log.zone[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.logDetails}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.logZoneName}>{getZoneLabel(log.zone, t)}</Text>
                        {(log as any).member_name && <Text style={{ fontSize: 11, color: '#888' }}>· {(log as any).member_name.split(' ')[0]}</Text>}
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
                        {(log as any).logged_by === 'parent' && <Text style={{ fontSize: 9, color: '#4CAF50', fontWeight: '700' }}>HOME</Text>}
                        {(log as any).logged_by === 'student' && <Text style={{ fontSize: 9, color: '#5C6BC0', fontWeight: '700' }}>SCHOOL</Text>}
                      </View>
                      {(log as any).strategies_selected?.length > 0 && (
                        <Text style={[styles.logTime, { color: '#AAA', fontSize: 10 }]} numberOfLines={1}>
                          {(log as any).strategies_selected.slice(0,2).map(resolveStrategy).join(', ')}
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
              )}
            </View>
            )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Creature Collection Modal */}
      {showCollection && collectionMember && (
        <CreatureCollection
          visible={showCollection}
          onClose={() => { setShowCollection(false); setCollectionMember(null); }}
          collectedCreatures={memberCreatures[collectionMember.id]?.allCreatures || childCreatures[collectionMember.id]?.allCreatures || []}
          currentCreature={memberCreatures[collectionMember.id]?.currentCreature || (memberCreatures[collectionMember.id]?.allCreatures?.[0]) || null}
          currentStage={memberCreatures[collectionMember.id]?.currentStage || 0}
          currentPoints={memberCreatures[collectionMember.id]?.totalPoints || 0}
          totalCreatures={4}
          unlockedMoves={[]}
          unlockedOutfits={[]}
          unlockedFoods={[]}
          unlockedHomes={[]}
          allCreatures={memberCreatures[collectionMember.id]?.allCreatures || childCreatures[collectionMember.id]?.allCreatures || []}
        />
      )}

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
              <Text style={styles.modalTitle}>{t('add_family_member')}</Text>
              <TouchableOpacity onPress={() => setShowAddFamilyModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
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
                  <Text style={styles.codeExpiry}>{t('access_expires_30_days')}</Text>
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
    padding: 16,
    marginBottom: 16,
  },
  familySection: { paddingHorizontal: 16, marginBottom: 8 },
  familySectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  familySectionTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A2E' },
  familyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-start' },
  gridCard: { width: '30%', backgroundColor: 'white', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1.5, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  gridCardActions: { flexDirection: 'row', justifyContent: 'flex-end', width: '100%', gap: 4, marginBottom: 6 },
  gridActionBtn: { padding: 3, backgroundColor: '#F5F5F5', borderRadius: 6 },
  gridAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  gridAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  gridName: { fontSize: 14, fontWeight: '700', color: '#333', marginBottom: 8, textAlign: 'center' },
  gridCheckinBtn: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7, marginBottom: 6 },
  gridCheckinTxt: { fontSize: 13, fontWeight: '700', color: 'white' },
  gridWellnessBtn: { padding: 4 },
  linkedBadge: { backgroundColor: '#E8F5E9', borderRadius: 6, padding: 2 },
  linkedLabel: { fontSize: 9, color: '#4CAF50', fontWeight: '600', marginBottom: 4 },
  gridCheckinPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 5 },
  wellbeingBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 12, borderWidth: 1.5, borderColor: '#333', marginTop: 4 },
  wellbeingBtnTxt: { fontSize: 11, color: '#333', fontWeight: '700' },
  emptyFamilyCard: { borderRadius: 16, borderWidth: 2, borderColor: '#E8EAF6', borderStyle: 'dashed', padding: 32, alignItems: 'center', gap: 8 },
  emptyFamilyTxt: { fontSize: 14, color: '#AAA', textAlign: 'center' },
  compactActions: { flexDirection: 'row', gap: 8 },
  compactAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: 'white', borderRadius: 12, paddingVertical: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1 },
  compactActionTxt: { fontSize: 10, fontWeight: '600', color: '#555', textAlign: 'center' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  wellnessButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 12, shadowColor: '#5C6BC0', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3, borderWidth: 1, borderColor: '#E8EAF6', gap: 12 },
  wellnessIcon: { fontSize: 28 },
  wellnessTitle: { fontSize: 16, fontWeight: '700', color: '#5C6BC0' },
  wellnessSub: { fontSize: 12, color: '#999', marginTop: 2 },
  addButton: {
    backgroundColor: '#4A90D9',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  membersScroll: {
    marginHorizontal: -8,
  },
  memberCard: {
    alignItems: 'center',
    padding: 12,
    paddingTop: 24,
    marginHorizontal: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    minWidth: 100,
    position: 'relative',
  },
  memberCardSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  cardActionButtons: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 4,
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
  memberName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
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
  unlinkButton: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  shareToTeacherButton: {
    position: 'absolute',
    top: 4,
    right: 4,
    padding: 4,
  },
  checkinButton: {
    position: 'absolute',
    bottom: 4,
    right: 4,
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
