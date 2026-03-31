import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Switch,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { familyApi, familyStrategiesApi, FamilyStrategyData, linkedChildApi } from '../../src/utils/api';
import * as ImagePicker from 'expo-image-picker';

const ZONE_CONFIG = [
  { id: 'blue', name: 'Blue - Sad/Tired', color: '#4A90D9', emoji: '💙' },
  { id: 'green', name: 'Green - Calm/Happy', color: '#4CAF50', emoji: '💚' },
  { id: 'yellow', name: 'Yellow - Anxious/Excited', color: '#FFC107', emoji: '💛' },
  { id: 'red', name: 'Red - Angry/Upset', color: '#F44336', emoji: '❤️' },
];

const EMOJI_OPTIONS = ['⭐', '🌟', '💪', '🧘', '🎯', '🌊', '🔥', '🌈', '🎵', '🏃', '🧸', '📖', '🎨', '🌳', '💧', '🤝', '🙏', '💬', '🛑', '🏠', '❄️', '🆘', '🔢', '🔴'];

const ICON_OPTIONS = [
  { id: 'self-improvement', name: 'Calm' },
  { id: 'music-note', name: 'Music' },
  { id: 'sports', name: 'Sports' },
  { id: 'pets', name: 'Pet' },
  { id: 'nature', name: 'Nature' },
  { id: 'book', name: 'Book' },
  { id: 'favorite', name: 'Heart' },
  { id: 'star', name: 'Star' },
];

export default function FamilyStrategiesScreen() {
  const router = useRouter();
  const { user, t } = useApp();
  
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [linkedChildren, setLinkedChildren] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<FamilyStrategyData[]>([]);
  const [selectedZone, setSelectedZone] = useState('blue');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Filter view
  const [filterMemberId, setFilterMemberId] = useState<string | null>(null); // null = all members
  
  // Add/Edit Strategy Modal
  const [showModal, setShowModal] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<FamilyStrategyData | null>(null);
  const [saving, setSaving] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    emoji: '⭐',
    icon: '',
    photo_base64: '',
    zone: 'blue',
    assigned_member_ids: [] as string[],
    share_with_teacher: false,
  });
  
  // Emoji/Icon picker
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [members, strategiesData, linked] = await Promise.all([
        familyApi.getMembers().catch(() => []),
        familyStrategiesApi.getAll().catch(() => []),
        linkedChildApi.getAll().catch(() => []),
      ]);
      
      setFamilyMembers(members);
      setStrategies(strategiesData);
      setLinkedChildren(linked);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // All members including linked children
  const allMembers = [
    ...familyMembers.map(m => ({ ...m, type: 'family' })),
    ...linkedChildren.map(c => ({ ...c, name: c.name, type: 'linked' })),
  ];

  // Filter strategies by zone and member
  const filteredStrategies = strategies.filter(s => {
    if (s.zone !== selectedZone) return false;
    if (!s.is_active) return false;
    
    // If filtering by member
    if (filterMemberId) {
      // Empty array means assigned to all
      if (s.assigned_member_ids.length === 0) return true;
      return s.assigned_member_ids.includes(filterMemberId);
    }
    
    return true;
  });

  const openAddModal = () => {
    setEditingStrategy(null);
    setFormData({
      name: '',
      description: '',
      emoji: '⭐',
      icon: '',
      photo_base64: '',
      zone: selectedZone,
      assigned_member_ids: [], // Empty = all members
      share_with_teacher: false,
    });
    setShowModal(true);
  };

  const openEditModal = (strategy: FamilyStrategyData) => {
    setEditingStrategy(strategy);
    setFormData({
      name: strategy.name,
      description: strategy.description,
      emoji: strategy.emoji || '⭐',
      icon: strategy.icon || '',
      photo_base64: strategy.photo_base64 || '',
      zone: strategy.zone,
      assigned_member_ids: strategy.assigned_member_ids || [],
      share_with_teacher: strategy.share_with_teacher || false,
    });
    setShowModal(true);
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
      
      if (!result.canceled && result.assets[0].base64) {
        setFormData(prev => ({
          ...prev,
          photo_base64: `data:image/jpeg;base64,${result.assets[0].base64}`,
          emoji: '', // Clear emoji when photo is set
        }));
      }
    } catch (error) {
      Alert.alert(t('error') || 'Error', 'Failed to pick image');
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert(t('error') || 'Error', t('enter_strategy_name') || 'Please enter a strategy name');
      return;
    }
    
    setSaving(true);
    try {
      if (editingStrategy) {
        // Update existing
        await familyStrategiesApi.update(editingStrategy.id, {
          name: formData.name,
          description: formData.description,
          emoji: formData.emoji,
          icon: formData.icon || undefined,
          photo_base64: formData.photo_base64 || undefined,
          zone: formData.zone,
          assigned_member_ids: formData.assigned_member_ids,
          share_with_teacher: formData.share_with_teacher,
        });
        Alert.alert(t('success') || 'Success', t('strategy_updated') || 'Strategy updated!');
      } else {
        // Create new
        await familyStrategiesApi.create({
          name: formData.name,
          description: formData.description,
          emoji: formData.emoji,
          icon: formData.icon || undefined,
          photo_base64: formData.photo_base64 || undefined,
          zone: formData.zone,
          assigned_member_ids: formData.assigned_member_ids,
          share_with_teacher: formData.share_with_teacher,
        });
        Alert.alert(t('success') || 'Success', t('strategy_created') || 'Strategy created!');
      }
      
      setShowModal(false);
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || 'Failed to save strategy');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (strategy: FamilyStrategyData) => {
    Alert.alert(
      t('delete_strategy') || 'Delete Strategy',
      t('confirm_delete_strategy') || `Are you sure you want to delete "${strategy.name}"?`,
      [
        { text: t('cancel') || 'Cancel', style: 'cancel' },
        {
          text: t('delete') || 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await familyStrategiesApi.delete(strategy.id);
              fetchData();
            } catch (error: any) {
              Alert.alert(t('error') || 'Error', error.message);
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (strategy: FamilyStrategyData) => {
    try {
      await familyStrategiesApi.update(strategy.id, { is_active: !strategy.is_active });
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message);
    }
  };

  const toggleMemberAssignment = (memberId: string) => {
    setFormData(prev => {
      const current = prev.assigned_member_ids;
      if (current.includes(memberId)) {
        return { ...prev, assigned_member_ids: current.filter(id => id !== memberId) };
      } else {
        return { ...prev, assigned_member_ids: [...current, memberId] };
      }
    });
  };

  const isAssignedToAll = formData.assigned_member_ids.length === 0;

  const setAssignToAll = () => {
    setFormData(prev => ({ ...prev, assigned_member_ids: [] }));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>{t('loading') || 'Loading...'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('family_strategies') || 'Family Strategies'}</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <MaterialIcons name="add" size={24} color="#4CAF50" />
        </TouchableOpacity>
      </View>

      {/* Zone Tabs */}
      <View style={styles.zoneTabs}>
        {ZONE_CONFIG.map((zone) => (
          <TouchableOpacity
            key={zone.id}
            style={[
              styles.zoneTab,
              selectedZone === zone.id && { backgroundColor: zone.color },
            ]}
            onPress={() => setSelectedZone(zone.id)}
          >
            <Text style={[
              styles.zoneTabText,
              selectedZone === zone.id && styles.zoneTabTextActive,
            ]}>
              {zone.emoji}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Member Filter */}
      {allMembers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.memberFilter}>
          <TouchableOpacity
            style={[styles.memberChip, !filterMemberId && styles.memberChipActive]}
            onPress={() => setFilterMemberId(null)}
          >
            <Text style={[styles.memberChipText, !filterMemberId && styles.memberChipTextActive]}>
              {t('all_members') || 'All'}
            </Text>
          </TouchableOpacity>
          {allMembers.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={[styles.memberChip, filterMemberId === member.id && styles.memberChipActive]}
              onPress={() => setFilterMemberId(member.id)}
            >
              <Text style={[styles.memberChipText, filterMemberId === member.id && styles.memberChipTextActive]}>
                {member.name}
              </Text>
              {member.type === 'linked' && (
                <MaterialIcons name="school" size={12} color={filterMemberId === member.id ? '#fff' : '#5C6BC0'} />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Strategies List */}
      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredStrategies.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="lightbulb" size={48} color="#CCC" />
            <Text style={styles.emptyText}>{t('no_strategies_zone') || 'No strategies for this zone'}</Text>
            <TouchableOpacity style={styles.addFirstButton} onPress={openAddModal}>
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.addFirstText}>{t('add_strategy') || 'Add Strategy'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredStrategies.map((strategy) => (
            <TouchableOpacity
              key={strategy.id}
              style={styles.strategyCard}
              onPress={() => openEditModal(strategy)}
              onLongPress={() => handleDelete(strategy)}
            >
              <View style={styles.strategyIconContainer}>
                {strategy.photo_base64 ? (
                  <Image source={{ uri: strategy.photo_base64 }} style={styles.strategyPhoto} />
                ) : strategy.icon ? (
                  <MaterialIcons name={strategy.icon as any} size={32} color={ZONE_CONFIG.find(z => z.id === strategy.zone)?.color} />
                ) : (
                  <Text style={styles.strategyEmoji}>{strategy.emoji}</Text>
                )}
              </View>
              
              <View style={styles.strategyInfo}>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <Text style={styles.strategyDesc} numberOfLines={2}>{strategy.description}</Text>
                
                {/* Assignment info */}
                <View style={styles.assignmentInfo}>
                  {strategy.assigned_member_ids.length === 0 ? (
                    <Text style={styles.assignmentText}>
                      <MaterialIcons name="people" size={12} color="#999" /> {t('all_family') || 'All family'}
                    </Text>
                  ) : (
                    <Text style={styles.assignmentText}>
                      <MaterialIcons name="person" size={12} color="#999" /> {strategy.assigned_member_ids.length} {t('members') || 'members'}
                    </Text>
                  )}
                  
                  {strategy.share_with_teacher && (
                    <View style={styles.sharedBadge}>
                      <MaterialIcons name="school" size={12} color="#5C6BC0" />
                      <Text style={styles.sharedText}>{t('shared') || 'Shared'}</Text>
                    </View>
                  )}
                </View>
              </View>
              
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => handleToggleActive(strategy)}
              >
                <MaterialIcons
                  name={strategy.is_active ? 'check-circle' : 'radio-button-unchecked'}
                  size={24}
                  color={strategy.is_active ? '#4CAF50' : '#CCC'}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          ))
        )}
        
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <MaterialIcons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStrategy ? (t('edit_strategy') || 'Edit Strategy') : (t('add_strategy') || 'Add Strategy')}
              </Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Name */}
              <Text style={styles.inputLabel}>{t('strategy_name') || 'Strategy Name'} *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder={t('enter_name') || 'Enter strategy name'}
              />

              {/* Description */}
              <Text style={styles.inputLabel}>{t('description') || 'Description'}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder={t('enter_description') || 'Enter description'}
                multiline
              />

              {/* Zone */}
              <Text style={styles.inputLabel}>{t('zone') || 'Zone'}</Text>
              <View style={styles.zoneSelector}>
                {ZONE_CONFIG.map((zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    style={[
                      styles.zoneSelectorItem,
                      formData.zone === zone.id && { backgroundColor: zone.color },
                    ]}
                    onPress={() => setFormData(prev => ({ ...prev, zone: zone.id }))}
                  >
                    <Text style={{ fontSize: 20 }}>{zone.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Emoji/Icon/Photo */}
              <Text style={styles.inputLabel}>{t('visual') || 'Visual (Emoji, Icon, or Photo)'}</Text>
              <View style={styles.visualSelector}>
                {/* Current visual preview */}
                <View style={styles.visualPreview}>
                  {formData.photo_base64 ? (
                    <Image source={{ uri: formData.photo_base64 }} style={styles.previewPhoto} />
                  ) : formData.icon ? (
                    <MaterialIcons name={formData.icon as any} size={40} color="#4CAF50" />
                  ) : (
                    <Text style={styles.previewEmoji}>{formData.emoji}</Text>
                  )}
                </View>
                
                <View style={styles.visualButtons}>
                  <TouchableOpacity style={styles.visualButton} onPress={() => setShowEmojiPicker(true)}>
                    <Text style={styles.visualButtonEmoji}>😊</Text>
                    <Text style={styles.visualButtonLabel}>{t('emoji') || 'Emoji'}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.visualButton} onPress={() => setShowIconPicker(true)}>
                    <MaterialIcons name="star" size={24} color="#666" />
                    <Text style={styles.visualButtonLabel}>{t('icon') || 'Icon'}</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity style={styles.visualButton} onPress={handlePickImage}>
                    <MaterialIcons name="photo-camera" size={24} color="#666" />
                    <Text style={styles.visualButtonLabel}>{t('photo') || 'Photo'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Emoji Picker */}
              {showEmojiPicker && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('select_emoji') || 'Select Emoji'}</Text>
                  <View style={styles.pickerGrid}>
                    {EMOJI_OPTIONS.map((emoji) => (
                      <TouchableOpacity
                        key={emoji}
                        style={[styles.pickerItem, formData.emoji === emoji && styles.pickerItemActive]}
                        onPress={() => {
                          setFormData(prev => ({ ...prev, emoji, icon: '', photo_base64: '' }));
                          setShowEmojiPicker(false);
                        }}
                      >
                        <Text style={styles.pickerEmoji}>{emoji}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Icon Picker */}
              {showIconPicker && (
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerTitle}>{t('select_icon') || 'Select Icon'}</Text>
                  <View style={styles.pickerGrid}>
                    {ICON_OPTIONS.map((icon) => (
                      <TouchableOpacity
                        key={icon.id}
                        style={[styles.pickerItem, formData.icon === icon.id && styles.pickerItemActive]}
                        onPress={() => {
                          setFormData(prev => ({ ...prev, icon: icon.id, emoji: '', photo_base64: '' }));
                          setShowIconPicker(false);
                        }}
                      >
                        <MaterialIcons name={icon.id as any} size={28} color={formData.icon === icon.id ? '#fff' : '#666'} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Assign to Members */}
              <Text style={styles.inputLabel}>{t('assign_to') || 'Assign To'}</Text>
              <View style={styles.assignSection}>
                <TouchableOpacity
                  style={[styles.assignAllButton, isAssignedToAll && styles.assignAllButtonActive]}
                  onPress={setAssignToAll}
                >
                  <MaterialIcons name="people" size={20} color={isAssignedToAll ? '#fff' : '#666'} />
                  <Text style={[styles.assignAllText, isAssignedToAll && styles.assignAllTextActive]}>
                    {t('all_family_members') || 'All Family Members'}
                  </Text>
                </TouchableOpacity>
                
                <Text style={styles.orText}>{t('or_select_specific') || 'Or select specific members:'}</Text>
                
                <View style={styles.membersList}>
                  {allMembers.map((member) => (
                    <TouchableOpacity
                      key={member.id}
                      style={[
                        styles.memberSelectItem,
                        formData.assigned_member_ids.includes(member.id) && styles.memberSelectItemActive,
                      ]}
                      onPress={() => toggleMemberAssignment(member.id)}
                    >
                      <Text style={[
                        styles.memberSelectText,
                        formData.assigned_member_ids.includes(member.id) && styles.memberSelectTextActive,
                      ]}>
                        {member.name}
                      </Text>
                      {member.type === 'linked' && (
                        <MaterialIcons name="school" size={14} color={formData.assigned_member_ids.includes(member.id) ? '#fff' : '#5C6BC0'} />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Share with Teacher */}
              {linkedChildren.length > 0 && (
                <View style={styles.shareSection}>
                  <View style={styles.shareInfo}>
                    <MaterialIcons name="school" size={24} color="#5C6BC0" />
                    <View style={styles.shareTextContainer}>
                      <Text style={styles.shareTitle}>{t('share_with_teacher') || 'Share with Teacher'}</Text>
                      <Text style={styles.shareDesc}>
                        {t('teacher_can_see_strategy') || 'Linked teacher can see this strategy'}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={formData.share_with_teacher}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, share_with_teacher: value }))}
                    trackColor={{ false: '#ddd', true: '#81C784' }}
                    thumbColor={formData.share_with_teacher ? '#4CAF50' : '#999'}
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelButtonText}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>{t('save') || 'Save'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 16, fontSize: 16, color: '#666' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  addButton: { padding: 4 },
  zoneTabs: { flexDirection: 'row', padding: 12, backgroundColor: '#fff', gap: 8 },
  zoneTab: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  zoneTabText: { fontSize: 20 },
  zoneTabTextActive: { color: '#fff' },
  memberFilter: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  memberChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f5f5f5', marginRight: 8, gap: 4 },
  memberChipActive: { backgroundColor: '#4CAF50' },
  memberChipText: { fontSize: 13, color: '#666' },
  memberChipTextActive: { color: '#fff', fontWeight: '600' },
  content: { flex: 1, padding: 12 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12 },
  addFirstButton: { flexDirection: 'row', alignItems: 'center', marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#4CAF50', borderRadius: 20, gap: 6 },
  addFirstText: { color: '#fff', fontWeight: '600' },
  strategyCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 14, borderRadius: 14, marginBottom: 10 },
  strategyIconContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  strategyPhoto: { width: 50, height: 50, borderRadius: 25 },
  strategyEmoji: { fontSize: 28 },
  strategyInfo: { flex: 1, marginLeft: 12 },
  strategyName: { fontSize: 15, fontWeight: '600', color: '#333' },
  strategyDesc: { fontSize: 13, color: '#666', marginTop: 2 },
  assignmentInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 8 },
  assignmentText: { fontSize: 11, color: '#999' },
  sharedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8EAF6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, gap: 2 },
  sharedText: { fontSize: 10, color: '#5C6BC0' },
  toggleButton: { padding: 4 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#4CAF50', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalScroll: { padding: 16, maxHeight: 500 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 10, padding: 12, fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  zoneSelector: { flexDirection: 'row', gap: 10 },
  zoneSelectorItem: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#f5f5f5', alignItems: 'center' },
  visualSelector: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  visualPreview: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  previewPhoto: { width: 70, height: 70, borderRadius: 35 },
  previewEmoji: { fontSize: 36 },
  visualButtons: { flex: 1, flexDirection: 'row', gap: 8 },
  visualButton: { flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: '#f5f5f5', borderRadius: 10 },
  visualButtonEmoji: { fontSize: 20 },
  visualButtonLabel: { fontSize: 11, color: '#666', marginTop: 4 },
  pickerContainer: { marginTop: 12, padding: 12, backgroundColor: '#f9f9f9', borderRadius: 12 },
  pickerTitle: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 8 },
  pickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pickerItem: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#eee' },
  pickerItemActive: { backgroundColor: '#4CAF50', borderColor: '#4CAF50' },
  pickerEmoji: { fontSize: 22 },
  assignSection: { marginTop: 8 },
  assignAllButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, backgroundColor: '#f5f5f5', borderRadius: 10, gap: 8 },
  assignAllButtonActive: { backgroundColor: '#4CAF50' },
  assignAllText: { fontSize: 14, color: '#666' },
  assignAllTextActive: { color: '#fff', fontWeight: '600' },
  orText: { fontSize: 12, color: '#999', textAlign: 'center', marginVertical: 12 },
  membersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  memberSelectItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#f5f5f5', gap: 4 },
  memberSelectItemActive: { backgroundColor: '#4CAF50' },
  memberSelectText: { fontSize: 13, color: '#666' },
  memberSelectTextActive: { color: '#fff', fontWeight: '500' },
  shareSection: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, padding: 14, backgroundColor: '#E8EAF6', borderRadius: 12 },
  shareInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  shareTextContainer: { flex: 1 },
  shareTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  shareDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  modalActions: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#f5f5f5', alignItems: 'center' },
  cancelButtonText: { fontSize: 16, color: '#666', fontWeight: '600' },
  saveButton: { flex: 1, paddingVertical: 14, borderRadius: 10, backgroundColor: '#4CAF50', alignItems: 'center' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
