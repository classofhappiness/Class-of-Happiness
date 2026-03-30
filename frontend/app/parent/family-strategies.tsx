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
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { familyMembersApi } from '../../src/utils/api';

interface FamilyStrategy {
  id: string;
  name: string;
  description: string;
  emoji: string;
  zone: string;
  assigned_members: string[];  // Family member IDs
  created_at: string;
  is_active: boolean;
}

// Default strategies by zone
const DEFAULT_STRATEGIES: Record<string, Array<{ name: string; emoji: string; description: string }>> = {
  blue: [
    { name: 'Deep Breathing', emoji: '🌊', description: 'Take 5 slow deep breaths' },
    { name: 'Talk to Someone', emoji: '💬', description: 'Share your feelings with someone you trust' },
    { name: 'Listen to Music', emoji: '🎵', description: 'Put on calming or happy music' },
    { name: 'Gentle Movement', emoji: '🚶', description: 'Take a slow walk or stretch' },
    { name: 'Quiet Time', emoji: '🤫', description: 'Find a quiet place to rest' },
  ],
  green: [
    { name: 'Stay Focused', emoji: '🎯', description: 'Keep doing what you\'re doing well!' },
    { name: 'Help Others', emoji: '🤝', description: 'Offer to help someone' },
    { name: 'Practice Gratitude', emoji: '🙏', description: 'Think of 3 things you\'re thankful for' },
    { name: 'Learn Something', emoji: '📚', description: 'Read or learn something new' },
    { name: 'Creative Time', emoji: '🎨', description: 'Draw, write, or create something' },
  ],
  yellow: [
    { name: 'Physical Activity', emoji: '🏃', description: 'Run, jump, or dance it out!' },
    { name: 'Squeeze Ball', emoji: '🔴', description: 'Squeeze a stress ball or pillow' },
    { name: 'Count Backwards', emoji: '🔢', description: 'Count from 10 to 1 slowly' },
    { name: 'Get Fresh Air', emoji: '🌳', description: 'Step outside for a moment' },
    { name: 'Drink Water', emoji: '💧', description: 'Have a glass of cold water' },
  ],
  red: [
    { name: 'STOP & Breathe', emoji: '🛑', description: 'Stop, close eyes, breathe deeply' },
    { name: 'Safe Space', emoji: '🏠', description: 'Go to your calm down spot' },
    { name: 'Muscle Squeeze', emoji: '💪', description: 'Squeeze and release your muscles' },
    { name: 'Cool Down', emoji: '❄️', description: 'Splash cold water on your face' },
    { name: 'Ask for Help', emoji: '🆘', description: 'Tell an adult you need help' },
  ],
};

const ZONE_CONFIG = [
  { id: 'blue', name: 'Blue - Sad/Tired', color: '#4A90D9', emoji: '💙' },
  { id: 'green', name: 'Green - Calm/Happy', color: '#4CAF50', emoji: '💚' },
  { id: 'yellow', name: 'Yellow - Anxious/Excited', color: '#FFC107', emoji: '💛' },
  { id: 'red', name: 'Red - Angry/Upset', color: '#F44336', emoji: '❤️' },
];

export default function FamilyStrategiesScreen() {
  const router = useRouter();
  const { user, t, language } = useApp();
  
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [strategies, setStrategies] = useState<FamilyStrategy[]>([]);
  const [selectedZone, setSelectedZone] = useState('blue');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Add/Edit Strategy Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<FamilyStrategy | null>(null);
  const [strategyForm, setStrategyForm] = useState({
    name: '',
    description: '',
    emoji: '⭐',
    zone: 'blue',
    assigned_members: [] as string[],
  });
  const [saving, setSaving] = useState(false);

  // Emoji picker options
  const emojiOptions = ['⭐', '🌟', '💪', '🧘', '🎯', '🌊', '🔥', '🌈', '🎵', '🏃', '🧸', '📖', '🎨', '🌳', '💧', '🤝', '🙏', '💬'];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch family members
      const members = await familyMembersApi.getAll();
      setFamilyMembers(members);
      
      // Load strategies from AsyncStorage or backend
      // For now, we'll initialize with defaults if empty
      const savedStrategies = await loadStrategies();
      if (savedStrategies.length === 0) {
        // Initialize with default strategies
        const initialStrategies = initializeDefaultStrategies(members);
        setStrategies(initialStrategies);
        await saveStrategies(initialStrategies);
      } else {
        setStrategies(savedStrategies);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load strategies from AsyncStorage
  const loadStrategies = async (): Promise<FamilyStrategy[]> => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const stored = await AsyncStorage.getItem('family_strategies');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      return [];
    }
  };

  // Save strategies to AsyncStorage
  const saveStrategies = async (strats: FamilyStrategy[]) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      await AsyncStorage.setItem('family_strategies', JSON.stringify(strats));
    } catch (error) {
      console.error('Error saving strategies:', error);
    }
  };

  // Initialize default strategies with all family members assigned
  const initializeDefaultStrategies = (members: any[]): FamilyStrategy[] => {
    const memberIds = members.map(m => m.id);
    const allStrategies: FamilyStrategy[] = [];
    
    Object.entries(DEFAULT_STRATEGIES).forEach(([zone, zoneStrategies]) => {
      zoneStrategies.forEach((strat, index) => {
        allStrategies.push({
          id: `${zone}_${index}`,
          name: strat.name,
          description: strat.description,
          emoji: strat.emoji,
          zone: zone,
          assigned_members: memberIds, // Assign to all members by default
          created_at: new Date().toISOString(),
          is_active: true,
        });
      });
    });
    
    return allStrategies;
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const filteredStrategies = strategies.filter(s => s.zone === selectedZone && s.is_active);

  const handleOpenAddModal = (zoneId?: string) => {
    setEditingStrategy(null);
    setStrategyForm({
      name: '',
      description: '',
      emoji: '⭐',
      zone: zoneId || selectedZone,
      assigned_members: familyMembers.map(m => m.id), // Default all members
    });
    setShowAddModal(true);
  };

  const handleEditStrategy = (strategy: FamilyStrategy) => {
    setEditingStrategy(strategy);
    setStrategyForm({
      name: strategy.name,
      description: strategy.description,
      emoji: strategy.emoji,
      zone: strategy.zone,
      assigned_members: strategy.assigned_members,
    });
    setShowAddModal(true);
  };

  const handleSaveStrategy = async () => {
    if (!strategyForm.name.trim()) {
      Alert.alert('Error', 'Please enter a strategy name');
      return;
    }
    
    setSaving(true);
    try {
      let updatedStrategies: FamilyStrategy[];
      
      if (editingStrategy) {
        // Update existing
        updatedStrategies = strategies.map(s => 
          s.id === editingStrategy.id 
            ? { ...s, ...strategyForm }
            : s
        );
      } else {
        // Add new
        const newStrategy: FamilyStrategy = {
          id: `custom_${Date.now()}`,
          name: strategyForm.name.trim(),
          description: strategyForm.description.trim(),
          emoji: strategyForm.emoji,
          zone: strategyForm.zone,
          assigned_members: strategyForm.assigned_members,
          created_at: new Date().toISOString(),
          is_active: true,
        };
        updatedStrategies = [...strategies, newStrategy];
      }
      
      setStrategies(updatedStrategies);
      await saveStrategies(updatedStrategies);
      setShowAddModal(false);
      Alert.alert('Success', editingStrategy ? 'Strategy updated!' : 'Strategy added!');
    } catch (error) {
      Alert.alert('Error', 'Failed to save strategy');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStrategy = (strategy: FamilyStrategy) => {
    Alert.alert(
      'Delete Strategy',
      `Are you sure you want to delete "${strategy.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const updatedStrategies = strategies.map(s =>
              s.id === strategy.id ? { ...s, is_active: false } : s
            );
            setStrategies(updatedStrategies);
            await saveStrategies(updatedStrategies);
          },
        },
      ]
    );
  };

  const toggleMemberAssignment = (memberId: string) => {
    setStrategyForm(prev => ({
      ...prev,
      assigned_members: prev.assigned_members.includes(memberId)
        ? prev.assigned_members.filter(id => id !== memberId)
        : [...prev.assigned_members, memberId],
    }));
  };

  const getMemberById = (id: string) => familyMembers.find(m => m.id === id);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('family_strategies') || "Family's Strategies"}</Text>
        <TouchableOpacity onPress={() => handleOpenAddModal()} style={styles.addButton}>
          <MaterialIcons name="add" size={24} color="#5C6BC0" />
        </TouchableOpacity>
      </View>

      {/* Zone Tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneTabs}>
        {ZONE_CONFIG.map((zone) => (
          <TouchableOpacity
            key={zone.id}
            style={[
              styles.zoneTab,
              selectedZone === zone.id && { backgroundColor: zone.color },
            ]}
            onPress={() => setSelectedZone(zone.id)}
          >
            <Text style={styles.zoneTabEmoji}>{zone.emoji}</Text>
            <Text style={[
              styles.zoneTabText,
              selectedZone === zone.id && styles.zoneTabTextActive,
            ]}>
              {zone.name.split(' - ')[0]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Strategies List */}
      <ScrollView
        style={styles.strategiesList}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text style={styles.zoneDescription}>
          {ZONE_CONFIG.find(z => z.id === selectedZone)?.name}
        </Text>

        {filteredStrategies.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="lightbulb-outline" size={48} color="#CCC" />
            <Text style={styles.emptyText}>No strategies for this emotion yet</Text>
            <TouchableOpacity style={styles.addFirstButton} onPress={() => handleOpenAddModal()}>
              <Text style={styles.addFirstButtonText}>+ Add Strategy</Text>
            </TouchableOpacity>
          </View>
        ) : (
          filteredStrategies.map((strategy) => (
            <View key={strategy.id} style={styles.strategyCard}>
              <View style={styles.strategyHeader}>
                <Text style={styles.strategyEmoji}>{strategy.emoji}</Text>
                <View style={styles.strategyInfo}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDescription}>{strategy.description}</Text>
                </View>
                <TouchableOpacity onPress={() => handleEditStrategy(strategy)} style={styles.editButton}>
                  <MaterialIcons name="edit" size={20} color="#5C6BC0" />
                </TouchableOpacity>
              </View>
              
              {/* Assigned Members */}
              <View style={styles.assignedSection}>
                <Text style={styles.assignedLabel}>Assigned to:</Text>
                <View style={styles.assignedMembers}>
                  {strategy.assigned_members.length === familyMembers.length ? (
                    <View style={styles.assignedBadge}>
                      <MaterialIcons name="groups" size={14} color="#4CAF50" />
                      <Text style={styles.assignedBadgeText}>Everyone</Text>
                    </View>
                  ) : strategy.assigned_members.length === 0 ? (
                    <Text style={styles.noAssigned}>No one assigned</Text>
                  ) : (
                    strategy.assigned_members.map(memberId => {
                      const member = getMemberById(memberId);
                      return member ? (
                        <View key={memberId} style={styles.memberChip}>
                          <Text style={styles.memberChipText}>{member.name}</Text>
                        </View>
                      ) : null;
                    })
                  )}
                </View>
              </View>
            </View>
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Add/Edit Strategy Modal */}
      <Modal visible={showAddModal} transparent animationType="slide" onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStrategy ? 'Edit Strategy' : 'Add New Strategy'}
              </Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Emoji Selection */}
              <Text style={styles.inputLabel}>Icon</Text>
              <View style={styles.emojiGrid}>
                {emojiOptions.map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiOption,
                      strategyForm.emoji === emoji && styles.emojiOptionSelected,
                    ]}
                    onPress={() => setStrategyForm({ ...strategyForm, emoji })}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Name */}
              <Text style={styles.inputLabel}>Strategy Name *</Text>
              <TextInput
                style={styles.textInput}
                value={strategyForm.name}
                onChangeText={(text) => setStrategyForm({ ...strategyForm, name: text })}
                placeholder="e.g., Take a walk"
                placeholderTextColor="#999"
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={strategyForm.description}
                onChangeText={(text) => setStrategyForm({ ...strategyForm, description: text })}
                placeholder="Describe how to do this strategy"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />

              {/* Zone Selection */}
              <Text style={styles.inputLabel}>Emotion Colour</Text>
              <View style={styles.zoneSelector}>
                {ZONE_CONFIG.map((zone) => (
                  <TouchableOpacity
                    key={zone.id}
                    style={[
                      styles.zoneSelectorItem,
                      strategyForm.zone === zone.id && { backgroundColor: zone.color, borderColor: zone.color },
                    ]}
                    onPress={() => setStrategyForm({ ...strategyForm, zone: zone.id })}
                  >
                    <Text style={styles.zoneSelectorEmoji}>{zone.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Family Member Assignment */}
              <Text style={styles.inputLabel}>Assign to Family Members</Text>
              <Text style={styles.inputHint}>Select who should use this strategy</Text>
              
              {familyMembers.map((member) => (
                <TouchableOpacity
                  key={member.id}
                  style={styles.memberRow}
                  onPress={() => toggleMemberAssignment(member.id)}
                >
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberAvatar}>
                      {member.avatar_type === 'preset' ? '👤' : '📷'}
                    </Text>
                    <Text style={styles.memberName}>{member.name}</Text>
                    <Text style={styles.memberRelation}>({member.relationship})</Text>
                  </View>
                  <View style={[
                    styles.checkbox,
                    strategyForm.assigned_members.includes(member.id) && styles.checkboxChecked,
                  ]}>
                    {strategyForm.assigned_members.includes(member.id) && (
                      <MaterialIcons name="check" size={18} color="white" />
                    )}
                  </View>
                </TouchableOpacity>
              ))}

              {/* Actions */}
              <View style={styles.modalActions}>
                {editingStrategy && (
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => {
                      setShowAddModal(false);
                      handleDeleteStrategy(editingStrategy);
                    }}
                  >
                    <MaterialIcons name="delete" size={20} color="#F44336" />
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                  onPress={handleSaveStrategy}
                  disabled={saving}
                >
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save Strategy'}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#EEE' },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '600', color: '#333', marginLeft: 12 },
  addButton: { padding: 4 },
  zoneTabs: { backgroundColor: 'white', paddingVertical: 12, paddingHorizontal: 8 },
  zoneTab: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, marginHorizontal: 4, backgroundColor: '#F0F0F0' },
  zoneTabEmoji: { fontSize: 16, marginRight: 6 },
  zoneTabText: { fontSize: 14, fontWeight: '500', color: '#666' },
  zoneTabTextActive: { color: 'white' },
  strategiesList: { flex: 1, padding: 16 },
  zoneDescription: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 16, color: '#999', marginTop: 12 },
  addFirstButton: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#5C6BC0', borderRadius: 8 },
  addFirstButtonText: { color: 'white', fontWeight: '600' },
  strategyCard: { backgroundColor: 'white', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2 },
  strategyHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  strategyEmoji: { fontSize: 32, marginRight: 12 },
  strategyInfo: { flex: 1 },
  strategyName: { fontSize: 16, fontWeight: '600', color: '#333' },
  strategyDescription: { fontSize: 13, color: '#666', marginTop: 4 },
  editButton: { padding: 4 },
  assignedSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EEE' },
  assignedLabel: { fontSize: 12, color: '#888', marginBottom: 6 },
  assignedMembers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  assignedBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  assignedBadgeText: { fontSize: 12, color: '#4CAF50', fontWeight: '500' },
  noAssigned: { fontSize: 12, color: '#999', fontStyle: 'italic' },
  memberChip: { backgroundColor: '#E3F2FD', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  memberChipText: { fontSize: 12, color: '#1976D2' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modalTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  modalBody: { padding: 20 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  inputHint: { fontSize: 12, color: '#888', marginBottom: 12, marginTop: -4 },
  textInput: { borderWidth: 1, borderColor: '#DDD', borderRadius: 12, padding: 14, fontSize: 15, color: '#333', backgroundColor: '#FAFAFA' },
  textArea: { height: 80, textAlignVertical: 'top' },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiOption: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E0E0E0' },
  emojiOptionSelected: { borderColor: '#5C6BC0', backgroundColor: '#E8EAF6' },
  emojiText: { fontSize: 22 },
  zoneSelector: { flexDirection: 'row', gap: 8 },
  zoneSelectorItem: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#F5F5F5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#E0E0E0' },
  zoneSelectorEmoji: { fontSize: 20 },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  memberInfo: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  memberAvatar: { fontSize: 24 },
  memberName: { fontSize: 15, fontWeight: '500', color: '#333' },
  memberRelation: { fontSize: 13, color: '#888' },
  checkbox: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#DDD', alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  modalActions: { flexDirection: 'row', marginTop: 24, marginBottom: 40, gap: 12 },
  deleteButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#F44336', gap: 6 },
  deleteButtonText: { color: '#F44336', fontWeight: '600' },
  saveButton: { flex: 1, backgroundColor: '#5C6BC0', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveButtonDisabled: { backgroundColor: '#CCC' },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
