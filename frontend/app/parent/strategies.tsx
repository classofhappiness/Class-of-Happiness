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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { customStrategiesApi, strategiesApi, CustomStrategy, Strategy } from '../../src/utils/api';

export default function ParentStrategiesScreen() {
  const router = useRouter();
  const { studentId } = useLocalSearchParams<{ studentId: string }>();
  const { user, students, presetAvatars, t } = useApp();
  
  const student = students.find(s => s.id === studentId);
  
  const ZONES = [
    { id: 'blue', name: t('blue_zone'), color: '#4A90D9' },
    { id: 'green', name: t('green_zone'), color: '#4CAF50' },
    { id: 'yellow', name: t('yellow_zone'), color: '#FFC107' },
    { id: 'red', name: t('red_zone'), color: '#F44336' },
  ];
  
  const [selectedZone, setSelectedZone] = useState('blue');
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [customStrategies, setCustomStrategies] = useState<CustomStrategy[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    description: '',
    zone: 'blue',
    is_shared: true,
  });
  const [saving, setSaving] = useState(false);

  const fetchStrategies = async () => {
    if (!studentId) return;
    try {
      const [defaultStrats, customStrats] = await Promise.all([
        strategiesApi.getByZone(selectedZone),
        customStrategiesApi.getAll(studentId),
      ]);
      setStrategies(defaultStrats);
      setCustomStrategies(customStrats.filter(s => s.zone === selectedZone));
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };

  useEffect(() => {
    fetchStrategies();
  }, [studentId, selectedZone]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchStrategies();
    setRefreshing(false);
  };

  const handleAddStrategy = async () => {
    if (!newStrategy.name.trim() || !newStrategy.description.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    
    setSaving(true);
    try {
      await customStrategiesApi.create({
        student_id: studentId,
        name: newStrategy.name,
        description: newStrategy.description,
        zone: newStrategy.zone,
        is_shared: newStrategy.is_shared,
      });
      setShowAddModal(false);
      setNewStrategy({ name: '', description: '', zone: selectedZone, is_shared: true });
      fetchStrategies();
      Alert.alert('Success', 'Strategy added successfully');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add strategy');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleShare = async (strategy: CustomStrategy) => {
    try {
      await customStrategiesApi.update(strategy.id, {
        is_shared: !strategy.is_shared,
      });
      fetchStrategies();
    } catch (error) {
      console.error('Error updating strategy:', error);
    }
  };

  const zoneConfig = ZONES.find(z => z.id === selectedZone)!;

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
          <Text style={styles.headerTitle}>
            My Family's Strategies
          </Text>
          <Text style={styles.headerSubtitle}>
            Create and manage coping strategies for your child
          </Text>
        </View>

        {/* Zone Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneTabs}>
          {ZONES.map((zone) => (
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
                {zone.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Add Strategy Button */}
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: zoneConfig.color }]}
          onPress={() => {
            setNewStrategy({ ...newStrategy, zone: selectedZone });
            setShowAddModal(true);
          }}
        >
          <MaterialIcons name="add" size={24} color="white" />
          <Text style={styles.addButtonText}>Add Custom Strategy</Text>
        </TouchableOpacity>

        {/* Custom Strategies */}
        {customStrategies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Custom Strategies</Text>
            {customStrategies.map((strategy) => (
              <View key={strategy.id} style={styles.strategyCard}>
                <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color }]}>
                  <MaterialIcons name="star" size={24} color="white" />
                </View>
                <View style={styles.strategyContent}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.description}</Text>
                  <TouchableOpacity
                    style={styles.shareToggle}
                    onPress={() => handleToggleShare(strategy)}
                  >
                    <MaterialIcons
                      name="share"
                      size={18}
                      color={strategy.is_shared ? '#4CAF50' : '#999'}
                    />
                    <Text style={[
                      styles.shareText,
                      strategy.is_shared && styles.shareTextActive,
                    ]}>
                      {strategy.is_shared ? 'Shared with teacher' : 'Not shared'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Default Strategies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Strategies</Text>
          {strategies.map((strategy) => (
            <View key={strategy.id} style={styles.strategyCard}>
              <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color + '40' }]}>
                <MaterialIcons name={strategy.icon as any} size={24} color={zoneConfig.color} />
              </View>
              <View style={styles.strategyContent}>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <Text style={styles.strategyDesc}>{strategy.description}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Add Strategy Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Custom Strategy</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Strategy Name</Text>
              <TextInput
                style={styles.input}
                value={newStrategy.name}
                onChangeText={(text) => setNewStrategy({ ...newStrategy, name: text })}
                placeholder="e.g., Count backwards"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStrategy.description}
                onChangeText={(text) => setNewStrategy({ ...newStrategy, description: text })}
                placeholder="Describe what the child should do..."
                multiline
                numberOfLines={3}
              />

              <View style={styles.shareOption}>
                <TouchableOpacity
                  style={styles.shareCheckbox}
                  onPress={() => setNewStrategy({ ...newStrategy, is_shared: !newStrategy.is_shared })}
                >
                  <MaterialIcons
                    name={newStrategy.is_shared ? 'check-box' : 'check-box-outline-blank'}
                    size={24}
                    color={newStrategy.is_shared ? '#4CAF50' : '#999'}
                  />
                  <Text style={styles.shareLabel}>Share with teacher</Text>
                </TouchableOpacity>
                <Text style={styles.shareHint}>
                  When shared, your child's teacher can also see and use this strategy
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.saveButton, { backgroundColor: zoneConfig.color }]}
                onPress={handleAddStrategy}
                disabled={saving}
              >
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : 'Add Strategy'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
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
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  zoneTabs: {
    marginBottom: 16,
    marginHorizontal: -8,
  },
  zoneTab: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    marginHorizontal: 4,
    backgroundColor: '#E0E0E0',
  },
  zoneTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  zoneTabTextActive: {
    color: 'white',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  strategyCard: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  strategyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  strategyContent: {
    flex: 1,
    marginLeft: 12,
  },
  strategyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  strategyDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  shareToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  shareText: {
    fontSize: 12,
    color: '#999',
  },
  shareTextActive: {
    color: '#4CAF50',
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  shareOption: {
    marginBottom: 20,
  },
  shareCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareLabel: {
    fontSize: 16,
    color: '#333',
  },
  shareHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    marginLeft: 32,
  },
  saveButton: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
