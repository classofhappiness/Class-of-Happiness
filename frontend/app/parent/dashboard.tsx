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
import { PieChart } from 'react-native-gifted-charts';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '../../src/context/AppContext';
import { 
  parentApi, Student, zoneLogsApi, ZoneLog, analyticsApi,
  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi
} from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

const screenWidth = Dimensions.get('window').width;

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

// Use translations for zone labels - will be populated from context
const getZoneLabel = (zone: string, t: (key: string) => string) => {
  const labels: Record<string, string> = {
    blue: t('blue_zone') || 'Blue Emotions',
    green: t('green_zone') || 'Green Emotions',
    yellow: t('yellow_zone') || 'Yellow Emotions',
    red: t('red_zone') || 'Red Emotions',
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
  const { user, presetAvatars, t } = useApp();
  
  // Linked children from school
  const [linkedChildren, setLinkedChildren] = useState<Student[]>([]);
  // Family members (self, partner, kids at home)
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  
  // Selected member for viewing
  const [selectedMember, setSelectedMember] = useState<FamilyMember | Student | null>(null);
  const [selectedType, setSelectedType] = useState<'family' | 'linked'>('family');
  
  // Analytics
  const [analytics, setAnalytics] = useState<{ zone_counts: Record<string, number> } | null>(null);
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

  // Pick image for edit modal
  const pickImageForEdit = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      
      if (!result.canceled && result.assets[0].base64) {
        setEditMember({
          ...editMember,
          avatar_type: 'custom',
          avatar_custom: `data:image/jpeg;base64,${result.assets[0].base64}`,
        });
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
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

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      
      if (!result.canceled && result.assets[0].base64) {
        setNewMember({
          ...newMember,
          avatar_type: 'custom',
          avatar_custom: `data:image/jpeg;base64,${result.assets[0].base64}`,
        });
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
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
          familyApi.getZoneLogs((selectedMember as FamilyMember).id, 7),
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

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedMember) {
      fetchMemberData();
    }
  }, [selectedMember, selectedType]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    await fetchMemberData();
    setRefreshing(false);
  };

  const handleLinkChild = async () => {
    if (!linkCode.trim()) return;
    setLinking(true);
    try {
      const result = await parentApi.linkChild(linkCode.trim());
      Alert.alert('Success', `${result.student_name} has been linked!`);
      setShowLinkModal(false);
      setLinkCode('');
      fetchData();
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('family_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness')}</Text>
        </View>

        {/* Family Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('my_family')}</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddFamilyModal(true)}
            >
              <MaterialIcons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll}>
            {familyMembers.map((member) => (
              <View key={member.id} style={styles.memberCardWrapper}>
                <TouchableOpacity
                  style={[
                    styles.memberCard,
                    selectedMember?.id === member.id && selectedType === 'family' && styles.memberCardSelected,
                  ]}
                  onPress={() => {
                    setSelectedMember(member);
                    setSelectedType('family');
                  }}
                  onLongPress={() => handleDeleteFamilyMember(member)}
                >
                  {/* Action buttons row */}
                  <View style={styles.cardActionButtons}>
                    {/* Edit button */}
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleEditFamilyMember(member)}
                    >
                      <MaterialIcons name="edit" size={14} color="#5C6BC0" />
                    </TouchableOpacity>
                    {/* Link to School button */}
                    {!(member as any).student_id && (
                      <TouchableOpacity
                        style={[styles.editButton, {backgroundColor:'#E8EAF6'}]}
                        onPress={async () => {
                          try {
                            const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
                            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
                            const token = await AsyncStorage.getItem('session_token');
                            const res = await fetch(`${BACKEND_URL}/api/family/linkable-students`, {
                              headers: { 'Authorization': `Bearer ${token}` }
                            });
                            const students = await res.json().catch(() => []);
                            if (!students.length) {
                              Alert.alert(
                                t('link_child')||'Link to School',
                                'Ask your child\'s teacher for a link code first. This connects school and home check-ins.'
                              );
                            } else {
                              Alert.alert(
                                t('link_child')||'Link to School Profile',
                                'Select your child\'s school profile:',
                                [...students.map((s: any) => ({
                                  text: s.name,
                                  onPress: async () => {
                                    const linkRes = await fetch(`${BACKEND_URL}/api/family/members/${member.id}/link-student`, {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                                      body: JSON.stringify({ student_id: s.id })
                                    });
                                    if (linkRes.ok) {
                                      Alert.alert('Linked', `${member.name} linked to school profile.`);
                                    }
                                  }
                                })), { text: t('cancel')||'Cancel', style: 'cancel' }]
                              );
                            }
                          } catch { Alert.alert('Error', 'Could not load students'); }
                        }}
                      >
                        <MaterialIcons name="link" size={14} color="#5C6BC0" />
                      </TouchableOpacity>
                    )}
                    {/* Delete button */}
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDeleteFamilyMember(member)}
                    >
                      <MaterialIcons 
                        name="close" 
                        size={16} 
                        color={deletingMember === member.id ? '#999' : '#F44336'} 
                      />
                    </TouchableOpacity>
                  </View>
                  
                  {/* Avatar - Support both preset and custom */}
                  {member.avatar_type === 'custom' && member.avatar_custom ? (
                    <Image 
                      source={{ uri: member.avatar_custom }} 
                      style={styles.memberAvatarImage} 
                    />
                  ) : member.avatar_type === 'preset' && member.avatar_preset ? (
                    <View style={[styles.memberAvatar, { backgroundColor: getRelationshipColor(member.relationship) + '20' }]}>
                      <Text style={styles.memberAvatarEmoji}>
                        {presetAvatars?.find(a => a.id === member.avatar_preset)?.emoji || '⭐'}
                      </Text>
                    </View>
                  ) : (
                    <View style={[styles.memberAvatar, { backgroundColor: getRelationshipColor(member.relationship) + '20' }]}>
                      <MaterialIcons 
                        name={member.relationship === 'self' ? 'person' : member.relationship === 'partner' ? 'favorite' : 'child-care'} 
                        size={32} 
                        color={getRelationshipColor(member.relationship)} 
                      />
                    </View>
                  )}
                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  <Text style={styles.memberRole}>{t(member.relationship)}</Text>
                </TouchableOpacity>
                
                {/* Big kid-friendly check-in button */}
                <TouchableOpacity
                  style={styles.bigCheckinButton}
                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { memberId: member.id, memberName: member.name }
                  })}
                >
                  <Text style={styles.bigCheckinEmoji}>😊</Text>
                  <Text style={styles.bigCheckinText}>{t('check_in') || t('check_in')||t('check_in')||'Check In'}</Text>
                </TouchableOpacity>
              </View>
            ))}
            
            {familyMembers.length === 0 && (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyText}>{t('add_family_to_track')}</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Linked Children from School */}
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
                              await teacherApi.unlinkStudent(child.id);
                              Alert.alert(t('success') || 'Success', t('child_unlinked') || 'Child has been unlinked');
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

        {/* Quick Actions - Always visible */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('quick_actions') || t('quick_actions')||'Quick Actions'}</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/parent/family-strategies')}
            >
              <MaterialIcons name="lightbulb" size={24} color="#FFC107" />
              <Text style={styles.actionButtonText} numberOfLines={1}>{t('family_strategies') || t('family_strategies')||'Family Strategies'}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/parent/resources')}
            >
              <MaterialIcons name="library-books" size={24} color="#5C6BC0" />
              <Text style={styles.actionButtonText} numberOfLines={1}>{t('resources')}</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push('/parent/widget')}
            >
              <MaterialIcons name="widgets" size={24} color="#9C27B0" />
              <Text style={styles.actionButtonText}>Widget</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected Member Analytics */}
        {selectedMember && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {(selectedMember as any).name}'s {t('week_overview')}
              </Text>
              
              {totalLogs > 0 ? (
                <View style={styles.chartContainer}>
                  <PieChart
                    data={pieData}
                    donut
                    radius={80}
                    innerRadius={50}
                    centerLabelComponent={() => (
                      <View style={styles.chartCenter}>
                        <Text style={styles.chartCenterNumber}>{totalLogs}</Text>
                        <Text style={styles.chartCenterLabel}>{t('check_ins')}</Text>
                      </View>
                    )}
                  />
                  <View style={styles.legendContainer}>
                    {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                      <View key={zone} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                        <Text style={styles.legendText}>{getZoneLabel(zone, t)}</Text>
                        <Text style={styles.legendCount}>
                          {analytics?.zone_counts[zone] || 0}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={styles.noDataContainer}>
                  <MaterialIcons name="pie-chart" size={48} color="#CCC" />
                  <Text style={styles.noDataText}>{t('no_checkins_week')}</Text>
                </View>
              )}
            </View>

            {/* Recent Activity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t('recent_check_ins')}</Text>
              
              {/* Weekly Table View - All 7 days */}
              <View style={styles.weeklyTable}>
                <View style={styles.weeklyHeader}>
                  {[t('day_sun') || 'Sun', t('day_mon') || 'Mon', t('day_tue') || 'Tue', t('day_wed') || 'Wed', t('day_thu') || 'Thu', t('day_fri') || 'Fri', t('day_sat') || 'Sat'].map((day) => (
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
                      <Text style={styles.logZoneName}>{getZoneLabel(log.zone, t)}</Text>
                      <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>
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
          </>
        )}
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
    marginBottom: 20,
    marginTop: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
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
  memberRole: {
    fontSize: 11,
    color: '#888',
    textTransform: 'capitalize',
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8EAF6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
    marginTop: 4,
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
