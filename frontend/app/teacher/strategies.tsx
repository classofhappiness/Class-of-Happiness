import React, { useState, useEffect } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, Alert, Modal, Image, KeyboardAvoidingView, Platform
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../src/context/AppContext';
import { strategiesApi, customStrategiesApi, strategySyncApi, CustomStrategy, Strategy } from '../../src/utils/api';
import { ZONE_CONFIG } from '../../src/components/ZoneButton';

const ZONES = ['blue', 'green', 'yellow', 'red'] as const;

const AVAILABLE_ICONS = [
  'fitness-center', 'chat', 'local-drink', 'weekend', 'music-note', 
  'wb-sunny', 'thumb-up', 'air', 'visibility', 'pan-tool', 'favorite',
  'sentiment-very-satisfied', 'filter-9-plus', 'sports-baseball', 
  'directions-walk', 'exposure-neg-1', 'home', 'support-agent',
  'self-improvement', 'spa', 'psychology', 'volunteer-activism',
  'emoji-emotions', 'lightbulb', 'star', 'pets', 'nature'
];

export default function ManageStrategiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { students, t } = useApp();
  
  const student = students.find(s => s.id === studentId);
  
  const [selectedZone, setSelectedZone] = useState<typeof ZONES[number]>('blue');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [sharedStrategies, setSharedStrategies] = useState<CustomStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<CustomStrategy | null>(null);
  const [strategyName, setStrategyName] = useState('');
  const [strategyDesc, setStrategyDesc] = useState('');
  const [strategyZone, setStrategyZone] = useState<typeof ZONES[number]>('blue');
  const [imageType, setImageType] = useState<'icon' | 'custom'>('icon');
  const [selectedIcon, setSelectedIcon] = useState('star');
  const [customImage, setCustomImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [supportMessage, setSupportMessage] = useState('');
  const [loadingMessage, setLoadingMessage] = useState(false);

  // Load existing support message for this student
  useEffect(() => {
    if (studentId) {
      AsyncStorage.getItem(`support_message_${studentId}`).then(msg => {
        if (msg) setSupportMessage(msg);
      });
    }
  }, [studentId]);

  const saveSupportMessage = async () => {
    if (!studentId) return;
    await AsyncStorage.setItem(`support_message_${studentId}`, supportMessage.trim());
    Alert.alert('✅ Saved', 'Support message saved for ' + student?.name);
  };

  useEffect(() => {
    fetchStrategies();
  }, [studentId, selectedZone]);

  // Fallback strategies matching student app
  const FALLBACK_STRATEGIES: Record<string, Strategy[]> = {
    blue: [
      {id:'b1', name:'Gentle Stretch', description:'Move your body slowly and gently', icon:'fitness-center', zone:'blue'},
      {id:'b2', name:'Favourite Song', description:'Listen to a calming favourite song', icon:'music-note', zone:'blue'},
      {id:'b3', name:'Tell Someone', description:'Share how you feel with a trusted person', icon:'chat', zone:'blue'},
      {id:'b4', name:'Slow Breathing', description:'Breathe in slowly, hold, breathe out', icon:'air', zone:'blue'},
    ],
    green: [
      {id:'g1', name:'Keep Going!', description:'You are in a great zone — keep it up!', icon:'thumb-up', zone:'green'},
      {id:'g2', name:'Help a Friend', description:'Use your good energy to help someone else', icon:'favorite', zone:'green'},
      {id:'g3', name:'Set a Goal', description:'Plan something you want to achieve today', icon:'lightbulb', zone:'green'},
      {id:'g4', name:'Gratitude', description:'Think of three things you are grateful for', icon:'star', zone:'green'},
    ],
    yellow: [
      {id:'y1', name:'Bubble Breathing', description:'Breathe out slowly like blowing a bubble', icon:'air', zone:'yellow'},
      {id:'y2', name:'Count to 10', description:'Count slowly from 1 to 10 before reacting', icon:'filter-9-plus', zone:'yellow'},
      {id:'y3', name:'5 Senses', description:'Name 5 things you can see, hear, feel', icon:'visibility', zone:'yellow'},
      {id:'y4', name:'Talk About It', description:'Find a safe person to share your feelings', icon:'chat', zone:'yellow'},
    ],
    red: [
      {id:'r1', name:'Freeze', description:'Stop and hold very still for 10 seconds', icon:'pan-tool', zone:'red'},
      {id:'r2', name:'Big Breaths', description:'Take 3 big deep breaths right now', icon:'air', zone:'red'},
      {id:'r3', name:'Safe Space', description:'Move to a quiet safe place to calm down', icon:'home', zone:'red'},
      {id:'r4', name:'Ask for Help', description:'Tell an adult you need support right now', icon:'support-agent', zone:'red'},
    ],
  };

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const [defaultStrats, customStrats, sharedStrats] = await Promise.all([
        strategiesApi.getByZone(selectedZone).catch(() => []),
        studentId ? customStrategiesApi.getAll(studentId).catch(() => []) : Promise.resolve([]),
        studentId ? strategySyncApi.getShared(studentId) : Promise.resolve([])
      ]);
      setStrategies(defaultStrats.filter(s => !s.is_custom));
      setCustomStrategies(customStrats.filter(s => s.zone === selectedZone));
      // Filter shared strategies by zone and exclude ones we created (to avoid duplicates)
      setSharedStrategies(sharedStrats.filter(s => 
        s.zone === selectedZone && s.creator_role === 'parent'
      ));
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditingStrategy(null);
    setStrategyName('');
    setStrategyDesc('');
    setStrategyZone(selectedZone);
    setImageType('icon');
    setSelectedIcon('star');
    setCustomImage(null);
    setModalVisible(true);
  };

  const openEditModal = (strategy: CustomStrategy) => {
    setEditingStrategy(strategy);
    setStrategyName(strategy.name);
    setStrategyDesc(strategy.description);
    setStrategyZone(strategy.zone as typeof ZONES[number]);
    setImageType(strategy.image_type as 'icon' | 'custom');
    setSelectedIcon(strategy.icon);
    setCustomImage(strategy.custom_image || null);
    setModalVisible(true);
  };

  const pickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setCustomImage(`data:image/jpeg;base64,${result.assets[0].base64}`);
      setImageType('custom');
    }
  };

  const handleSave = async () => {
    if (!strategyName.trim()) {
      Alert.alert('Error', 'Please enter a strategy name');
      return;
    }

    setSaving(true);
    try {
      const data: any = {
        student_id: studentId,
        name: strategyName.trim(),
        description: strategyDesc.trim(),
        zone: strategyZone,
        image_type: imageType,
        icon: selectedIcon,
      };
      
      if (imageType === 'custom' && customImage) {
        data.custom_image = customImage;
      }

      if (editingStrategy) {
        await customStrategiesApi.update(editingStrategy.id, data);
      } else {
        await customStrategiesApi.create(data);
      }

      setModalVisible(false);
      await fetchStrategies();
      Alert.alert('Success', editingStrategy ? 'Strategy updated!' : 'Strategy added!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to save strategy');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (strategy: CustomStrategy) => {
    Alert.alert(
      'Delete Strategy',
      `Are you sure you want to delete "${strategy.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await customStrategiesApi.delete(strategy.id);
              await fetchStrategies();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete strategy');
            }
          },
        },
      ]
    );
  };

  const zoneConfig = ZONE_CONFIG[selectedZone];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>Manage Strategies</Text>
          {student && <Text style={styles.subtitle}>for {student.name}</Text>}
        </View>
      </View>

      {/* Zone Tabs */}
      <View style={styles.zoneTabs}>
        {ZONES.map((zone) => (
          <TouchableOpacity
            key={zone}
            style={[
              styles.zoneTab,
              { backgroundColor: selectedZone === zone ? ZONE_CONFIG[zone].color : '#E0E0E0' }
            ]}
            onPress={() => setSelectedZone(zone)}
          >
            <Text style={[
              styles.zoneTabText,
              { color: selectedZone === zone ? 'white' : '#666' }
            ]}>
              {zone.charAt(0).toUpperCase() + zone.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Support Message */}
        <View style={styles.supportMessageBox}>
          <Text style={styles.supportMessageLabel}>💬 Personal Support Message for {student?.name}</Text>
          <TextInput
            style={styles.supportMessageInput}
            placeholder="e.g. You are a star! Keep going!"
            value={supportMessage}
            onChangeText={setSupportMessage}
            multiline
            numberOfLines={2}
            placeholderTextColor="#AAA"
          />
          <TouchableOpacity style={styles.saveMessageBtn} onPress={saveSupportMessage}>
            <Text style={styles.saveMessageText}>Save Message</Text>
          </TouchableOpacity>
          <Text style={styles.supportMessageHint}>
            This message will appear on {student?.name}'s reward screen after checking in.
            If empty, a rotating motivational message will show instead.
          </Text>
        </View>

        {/* Add Button */}
        <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
          <MaterialIcons name="add" size={24} color="white" />
          <Text style={styles.addButtonText}>Add Custom Strategy</Text>
        </TouchableOpacity>

        {/* Custom Strategies */}
        {customStrategies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Custom Strategies for {student?.name}</Text>
            {customStrategies.map((strategy) => (
              <View key={strategy.id} style={styles.strategyCard}>
                <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color }]}>
                  {strategy.image_type === 'custom' && strategy.custom_image ? (
                    <Image source={{ uri: strategy.custom_image }} style={styles.customImageSmall} />
                  ) : (
                    <MaterialIcons name={strategy.icon as any} size={28} color="white" />
                  )}
                </View>
                <View style={styles.strategyInfo}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.description}</Text>
                </View>
                <TouchableOpacity style={styles.editIcon} onPress={() => openEditModal(strategy)}>
                  <MaterialIcons name="edit" size={20} color="#5C6BC0" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteIcon} onPress={() => handleDelete(strategy)}>
                  <MaterialIcons name="delete" size={20} color="#F44336" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Shared Strategies from Parents */}
        {sharedStrategies.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sharedHeader}>
              <MaterialIcons name="home" size={20} color="#9C27B0" />
              <Text style={[styles.sectionTitle, { color: '#9C27B0', marginLeft: 8 }]}>
                {t('shared_strategies')} ({t('parent')})
              </Text>
            </View>
            {sharedStrategies.map((strategy) => (
              <View key={strategy.id} style={[styles.strategyCard, styles.sharedCard]}>
                <View style={[styles.strategyIcon, { backgroundColor: '#9C27B0' }]}>
                  <MaterialIcons name={strategy.icon as any || 'star'} size={28} color="white" />
                </View>
                <View style={styles.strategyInfo}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.description}</Text>
                  <View style={styles.syncBadge}>
                    <MaterialIcons name="sync" size={14} color="#9C27B0" />
                    <Text style={styles.syncText}>{t('synced')}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Default Strategies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default {zoneConfig.label} Strategies</Text>
          {strategies.map((strategy) => (
            <View key={strategy.id} style={[styles.strategyCard, styles.defaultCard]}>
              <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color }]}>
                <MaterialIcons name={strategy.icon as any} size={28} color="white" />
              </View>
              <View style={styles.strategyInfo}>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <Text style={styles.strategyDesc}>{strategy.description}</Text>
              </View>
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Default</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView 
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingStrategy ? 'Edit Strategy' : 'Add Strategy'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              {/* Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Deep Breathing"
                  value={strategyName}
                  onChangeText={setStrategyName}
                  placeholderTextColor="#999"
                />
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="e.g., Take 5 slow deep breaths"
                  value={strategyDesc}
                  onChangeText={setStrategyDesc}
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Zone */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Zone</Text>
                <View style={styles.zoneSelector}>
                  {ZONES.map((zone) => (
                    <TouchableOpacity
                      key={zone}
                      style={[
                        styles.zoneSelectorItem,
                        { backgroundColor: strategyZone === zone ? ZONE_CONFIG[zone].color : '#E0E0E0' }
                      ]}
                      onPress={() => setStrategyZone(zone)}
                    >
                      <Text style={{ color: strategyZone === zone ? 'white' : '#666', fontWeight: '600' }}>
                        {zone.charAt(0).toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Image Type */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Image</Text>
                <View style={styles.imageTypeSelector}>
                  <TouchableOpacity
                    style={[styles.imageTypeOption, imageType === 'icon' && styles.imageTypeActive]}
                    onPress={() => setImageType('icon')}
                  >
                    <MaterialIcons name="emoji-symbols" size={24} color={imageType === 'icon' ? '#5C6BC0' : '#999'} />
                    <Text style={[styles.imageTypeText, imageType === 'icon' && styles.imageTypeTextActive]}>Icon</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.imageTypeOption, imageType === 'custom' && styles.imageTypeActive]}
                    onPress={pickImage}
                  >
                    <MaterialIcons name="photo" size={24} color={imageType === 'custom' ? '#5C6BC0' : '#999'} />
                    <Text style={[styles.imageTypeText, imageType === 'custom' && styles.imageTypeTextActive]}>Photo</Text>
                  </TouchableOpacity>
                </View>

                {/* Icon Selector */}
                {imageType === 'icon' && (
                  <View style={styles.iconGrid}>
                    {AVAILABLE_ICONS.map((icon) => (
                      <TouchableOpacity
                        key={icon}
                        style={[
                          styles.iconOption,
                          selectedIcon === icon && styles.iconOptionActive
                        ]}
                        onPress={() => setSelectedIcon(icon)}
                      >
                        <MaterialIcons 
                          name={icon as any} 
                          size={24} 
                          color={selectedIcon === icon ? '#5C6BC0' : '#666'} 
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {/* Custom Image Preview */}
                {imageType === 'custom' && customImage && (
                  <View style={styles.imagePreview}>
                    <Image source={{ uri: customImage }} style={styles.previewImage} />
                    <TouchableOpacity style={styles.changeImageBtn} onPress={pickImage}>
                      <Text style={styles.changeImageText}>Change Photo</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveButtonText}>
                {saving ? 'Saving...' : (editingStrategy ? 'Update Strategy' : 'Add Strategy')}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  zoneTabs: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    backgroundColor: 'white',
  },
  zoneTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  zoneTabText: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginBottom: 20,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
  },
  strategyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  defaultCard: {
    opacity: 0.8,
  },
  strategyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  customImageSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  strategyInfo: {
    flex: 1,
    marginLeft: 12,
  },
  strategyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  strategyDesc: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  editIcon: {
    padding: 8,
  },
  deleteIcon: {
    padding: 8,
  },
  defaultBadge: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  defaultBadgeText: {
    fontSize: 11,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  modalScroll: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  zoneSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  zoneSelectorItem: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  imageTypeSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  imageTypeOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  imageTypeActive: {
    backgroundColor: '#EDE7F6',
    borderWidth: 2,
    borderColor: '#5C6BC0',
  },
  imageTypeText: {
    fontSize: 14,
    color: '#666',
  },
  imageTypeTextActive: {
    color: '#5C6BC0',
    fontWeight: '600',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  iconOption: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptionActive: {
    backgroundColor: '#EDE7F6',
    borderWidth: 2,
    borderColor: '#5C6BC0',
  },
  imagePreview: {
    alignItems: 'center',
  },
  previewImage: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginBottom: 12,
  },
  changeImageBtn: {
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  changeImageText: {
    fontSize: 14,
    color: '#666',
  },
  saveButton: {
    backgroundColor: '#5C6BC0',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#B39DDB',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  sharedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sharedCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#9C27B0',
  },
  supportMessageBox: { backgroundColor: 'white', borderRadius: 14, padding: 16, marginBottom: 16, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  supportMessageLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8 },
  supportMessageInput: { backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, fontSize: 15, color: '#333', minHeight: 60 },
  saveMessageBtn: { backgroundColor: '#5C6BC0', borderRadius: 10, padding: 10, alignItems: 'center', marginTop: 8 },
  saveMessageText: { color: 'white', fontWeight: '600', fontSize: 14 },
  supportMessageHint: { fontSize: 11, color: '#AAA', marginTop: 6, lineHeight: 16 },
  syncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  syncText: {
    fontSize: 12,
    color: '#9C27B0',
    fontWeight: '500',
  },
});
