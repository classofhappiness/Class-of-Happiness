import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApp } from '../../../src/context/AppContext';
import { linkedChildApi, LinkedChild, FamilyAssignedStrategy } from '../../../src/utils/api';

const ZONE_CONFIG: Record<string, { color: string; emoji: string; label: string }> = {
  blue: { color: '#4A90D9', emoji: '😢', label: 'Blue Zone' },
  green: { color: '#4CAF50', emoji: '😊', label: 'Green Zone' },
  yellow: { color: '#FFC107', emoji: '😰', label: 'Yellow Zone' },
  red: { color: '#F44336', emoji: '😠', label: 'Red Zone' },
};

const STRATEGY_ICONS = [
  { id: 'star', name: 'star', label: 'Star' },
  { id: 'favorite', name: 'favorite', label: 'Heart' },
  { id: 'self-improvement', name: 'self-improvement', label: 'Calm' },
  { id: 'music-note', name: 'music-note', label: 'Music' },
  { id: 'sports-soccer', name: 'sports-soccer', label: 'Sports' },
  { id: 'pets', name: 'pets', label: 'Pet' },
  { id: 'nature', name: 'nature', label: 'Nature' },
  { id: 'book', name: 'book', label: 'Reading' },
];

export default function LinkedChildDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useApp();
  
  const [child, setChild] = useState<LinkedChild | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // View tabs
  const [activeTab, setActiveTab] = useState<'combined' | 'home' | 'school'>('combined');
  
  // Check-ins data
  const [allCheckIns, setAllCheckIns] = useState<any[]>([]);
  const [homeCheckIns, setHomeCheckIns] = useState<any[]>([]);
  const [schoolCheckIns, setSchoolCheckIns] = useState<any[]>([]);
  
  // Strategies
  const [schoolStrategies, setSchoolStrategies] = useState<any[]>([]);
  const [familyStrategies, setFamilyStrategies] = useState<FamilyAssignedStrategy[]>([]);
  
  // Check-in modal
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  
  // Add strategy modal
  const [showAddStrategyModal, setShowAddStrategyModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    name: '',
    description: '',
    zone: 'green',
    icon: 'star',
    shareWithTeacher: false,
  });
  
  // Permission state
  const [homeSharingEnabled, setHomeSharingEnabled] = useState(false);

  const fetchData = useCallback(async () => {
    if (!id) return;
    
    try {
      // Get linked children and find this one
      const children = await linkedChildApi.getAll();
      const foundChild = children.find(c => c.id === id);
      if (foundChild) {
        setChild(foundChild);
        setHomeSharingEnabled(foundChild.home_sharing_enabled);
      }
      
      // Get check-ins
      const [allData, homeData, schoolData] = await Promise.all([
        linkedChildApi.getAllCheckIns(id, 30),
        linkedChildApi.getHomeCheckIns(id, 30),
        linkedChildApi.getSchoolCheckIns(id, 30),
      ]);
      
      setAllCheckIns(allData);
      setHomeCheckIns(homeData);
      setSchoolCheckIns(schoolData.checkins || []);
      
      // Get strategies
      const [schoolStrats, familyStrats] = await Promise.all([
        linkedChildApi.getSchoolStrategies(id),
        linkedChildApi.getFamilyStrategies(id),
      ]);
      
      // Include both custom AND generic helpers
      const genericRes = await Promise.all(['blue','green','yellow','red'].map(zone =>
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=en`)
          .then(r => r.json()).catch(() => [])
      ));
      const generic = genericRes.flat();
      setSchoolStrategies([...generic, ...(schoolStrats.custom_strategies || [])]);
      setFamilyStrategies(familyStrats);
      
    } catch (error) {
      console.error('Error fetching linked child data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleCheckIn = async () => {
    if (!selectedZone || !id) return;
    
    setSubmitting(true);
    try {
      await linkedChildApi.createCheckIn(id, {
        zone: selectedZone,
        strategies_selected: selectedStrategies,
        comment: comment.trim() || undefined,
      });
      
      Alert.alert(t('success') || 'Success', t('checkin_saved') || 'Check-in saved!');
      setShowCheckInModal(false);
      setSelectedZone('');
      setSelectedStrategies([]);
      setComment('');
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || 'Failed to save check-in');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddStrategy = async () => {
    if (!newStrategy.name.trim() || !id) return;
    
    try {
      await linkedChildApi.createFamilyStrategy(id, {
        strategy_name: newStrategy.name,
        strategy_description: newStrategy.description,
        zone: newStrategy.zone,
        icon: newStrategy.icon,
        share_with_teacher: newStrategy.shareWithTeacher,
      });
      
      Alert.alert(t('success') || 'Success', t('strategy_added') || 'Strategy added!');
      setShowAddStrategyModal(false);
      setNewStrategy({ name: '', description: '', zone: 'green', icon: 'star', shareWithTeacher: false });
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || 'Failed to add strategy');
    }
  };

  const handleToggleStrategySharing = async (strategyId: string) => {
    if (!id) return;
    
    try {
      const result = await linkedChildApi.toggleStrategySharing(id, strategyId);
      Alert.alert(
        t('success') || 'Success',
        result.share_with_teacher 
          ? (t('strategy_shared') || 'Strategy is now shared with teacher')
          : (t('strategy_unshared') || 'Strategy is no longer shared with teacher')
      );
      fetchData();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message);
    }
  };

  const handleToggleHomeSharing = async () => {
    if (!id) return;
    
    try {
      const result = await linkedChildApi.toggleHomeSharing(id);
      setHomeSharingEnabled(result.home_sharing_enabled);
      Alert.alert(
        t('success') || 'Success',
        result.home_sharing_enabled
          ? (t('home_sharing_enabled') || 'Teacher can now see home check-ins')
          : (t('home_sharing_disabled') || 'Teacher can no longer see home check-ins')
      );
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const getCurrentCheckIns = () => {
    switch (activeTab) {
      case 'home': return homeCheckIns;
      case 'school': return schoolCheckIns;
      default: return allCheckIns;
    }
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

  if (!child) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <MaterialIcons name="error" size={48} color="#F44336" />
          <Text style={styles.errorText}>{t('child_not_found') || 'Linked child not found'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>{t('go_back') || 'Go Back'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Image source={require('../../../assets/images/logo_coh.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>{child.name}</Text>
          <View style={styles.headerBadge}>
            <MaterialIcons name="link" size={14} color="#5C6BC0" />
            <Text style={styles.headerBadgeText}>{t('linked') || 'Linked'}</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Child Info Card */}
        <View style={styles.childCard}>
          <View style={styles.childAvatar}>
            <Text style={styles.childAvatarEmoji}>👧</Text>
          </View>
          <View style={styles.childInfo}>
            <Text style={styles.childName}>{child.name}</Text>
            {child.classroom_name && (
              <Text style={styles.childClassroom}>
                <MaterialIcons name="class" size={14} color="#666" /> {child.classroom_name}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.checkInButton}
            onPress={() => setShowCheckInModal(true)}
          >
            <MaterialIcons name="add-circle" size={24} color="#fff" />
            <Text style={styles.checkInButtonText}>{t('check_in') || 'Check In'}</Text>
          </TouchableOpacity>
        </View>

        {/* Permission Toggle */}
        <View style={styles.permissionCard}>
          <View style={styles.permissionInfo}>
            <MaterialIcons name="share" size={24} color="#5C6BC0" />
            <View style={styles.permissionTextContainer}>
              <Text style={styles.permissionTitle}>{t('share_with_teacher') || 'Share Home Data with Teacher'}</Text>
              <Text style={styles.permissionDesc}>
                {homeSharingEnabled 
                  ? (t('teacher_can_see') || 'Teacher can see home check-ins and shared strategies')
                  : (t('teacher_cannot_see') || 'Teacher cannot see home data')
                }
              </Text>
            </View>
          </View>
          <Switch
            value={homeSharingEnabled}
            onValueChange={handleToggleHomeSharing}
            trackColor={{ false: '#ddd', true: '#81C784' }}
            thumbColor={homeSharingEnabled ? '#4CAF50' : '#999'}
          />
        </View>

        {/* Check-ins Section */}
        <Text style={styles.sectionTitle}>{t('check_ins') || 'Check-ins'}</Text>
        
        {/* Tab Selector */}
        <View style={styles.tabSelector}>
          {['combined', 'home', 'school'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab as any)}
            >
              <MaterialIcons
                name={tab === 'combined' ? 'merge-type' : tab === 'home' ? 'home' : 'school'}
                size={16}
                color={activeTab === tab ? '#fff' : '#666'}
              />
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'combined' ? (t('all') || 'All') : tab === 'home' ? (t('home') || 'Home') : (t('school') || 'School')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Check-ins List */}
        <View style={styles.checkInsList}>
          {getCurrentCheckIns().length === 0 ? (
            <Text style={styles.emptyText}>{t('no_checkins') || 'No check-ins yet'}</Text>
          ) : (
            getCurrentCheckIns().slice(0, 10).map((checkIn, index) => (
              <View key={checkIn.id || index} style={styles.checkInItem}>
                <View style={[styles.checkInZone, { backgroundColor: ZONE_CONFIG[checkIn.zone]?.color || '#999' }]}>
                  {(() => {
                          const zoneEmojis: Record<string,string> = {blue:'😢',green:'😊',yellow:'😟',red:'😣'};
                          return <Text style={styles.checkInEmoji}>{zoneEmojis[checkIn.zone] || zoneEmojis[checkIn.feeling_colour] || '😊'}</Text>;
                        })()}
                </View>
                <View style={styles.checkInDetails}>
                  <Text style={styles.checkInZoneLabel}>{
                          ({blue:'Blue Zone',green:'Green Zone',yellow:'Yellow Zone',red:'Red Zone'} as any)[checkIn.zone || checkIn.feeling_colour] || checkIn.zone || 'Check-in'
                        }</Text>
                  <Text style={styles.checkInTime}>{formatDate(checkIn.timestamp)}</Text>
                  {checkIn.strategies_selected?.length > 0 && (
                    <Text style={styles.checkInStrategies}>
                      {t('strategies') || 'Strategies'}: {checkIn.strategies_selected.join(', ')}
                    </Text>
                  )}
                </View>
                <View style={[styles.locationBadge, { backgroundColor: checkIn.location === 'home' ? '#E8F5E9' : '#E3F2FD' }]}>
                  <MaterialIcons
                    name={checkIn.location === 'home' ? 'home' : 'school'}
                    size={14}
                    color={checkIn.location === 'home' ? '#4CAF50' : '#2196F3'}
                  />
                </View>
              </View>
            ))
          )}
        </View>

        {/* Strategies Section */}
        <View style={styles.strategiesHeader}>
          <Text style={styles.sectionTitle}>{t('strategies') || 'Strategies'}</Text>
          <TouchableOpacity
            style={styles.addStrategyBtn}
            onPress={() => setShowAddStrategyModal(true)}
          >
            <MaterialIcons name="add" size={20} color="#fff" />
            <Text style={styles.addStrategyBtnText}>{t('add_family_strategy') || 'Add Family Strategy'}</Text>
          </TouchableOpacity>
        </View>

        {/* School Strategies */}
        {schoolStrategies.length > 0 && (
          <View style={styles.strategySection}>
            <Text style={styles.strategySubtitle}>
              <MaterialIcons name="school" size={16} color="#5C6BC0" /> {t('school_strategies') || 'School Strategies'}
            </Text>
            {schoolStrategies.map((strategy, index) => (
              <View key={strategy.id || index} style={styles.strategyItem}>
                <MaterialIcons name={strategy.icon || 'star'} size={24} color="#5C6BC0" />
                <View style={styles.strategyInfo}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.description}</Text>
                </View>
                <View style={[styles.zoneBadge, { backgroundColor: ZONE_CONFIG[strategy.zone]?.color + '30' }]}>
                  <Text style={{ color: ZONE_CONFIG[strategy.zone]?.color }}>{strategy.zone}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Family Strategies */}
        <View style={styles.strategySection}>
          <Text style={styles.strategySubtitle}>
            <MaterialIcons name="home" size={16} color="#4CAF50" /> {t('family_strategies') || 'Family Strategies'}
          </Text>
          {familyStrategies.length === 0 ? (
            <Text style={styles.emptyText}>{t('no_family_strategies') || 'No family strategies yet'}</Text>
          ) : (
            familyStrategies.map((strategy) => (
              <View key={strategy.id} style={styles.strategyItem}>
                <MaterialIcons name={strategy.icon as any || 'star'} size={24} color="#4CAF50" />
                <View style={styles.strategyInfo}>
                  <Text style={styles.strategyName}>{strategy.strategy_name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.strategy_description}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.shareToggle, strategy.share_with_teacher && styles.shareToggleActive]}
                  onPress={() => handleToggleStrategySharing(strategy.id)}
                >
                  <MaterialIcons
                    name={strategy.share_with_teacher ? 'visibility' : 'visibility-off'}
                    size={18}
                    color={strategy.share_with_teacher ? '#fff' : '#666'}
                  />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Check-in Modal */}
      <Modal
        visible={showCheckInModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCheckInModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('home_check_in') || 'Home Check-in'}</Text>
              <TouchableOpacity onPress={() => setShowCheckInModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>{t('how_feeling') || 'How is your child feeling?'}</Text>
              <View style={styles.zoneSelector}>
                {Object.entries(ZONE_CONFIG).map(([zone, config]) => (
                  <TouchableOpacity
                    key={zone}
                    style={[
                      styles.zoneOption,
                      { borderColor: config.color },
                      selectedZone === zone && { backgroundColor: config.color }
                    ]}
                    onPress={() => setSelectedZone(zone)}
                  >
                    <Text style={styles.zoneEmoji}>{config.emoji}</Text>
                    <Text style={[styles.zoneLabel, selectedZone === zone && { color: '#fff' }]}>
                      {config.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('comment_optional') || 'Comment (optional)'}</Text>
              <TextInput
                style={styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder={t('add_comment') || 'Add a comment...'}
                multiline
                maxLength={100}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCheckInModal(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !selectedZone && styles.submitBtnDisabled]}
                onPress={handleCheckIn}
                disabled={!selectedZone || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitBtnText}>{t('save_check_in') || 'Save Check-in'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Add Strategy Modal */}
      <Modal
        visible={showAddStrategyModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAddStrategyModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('add_family_strategy') || 'Add Family Strategy'}</Text>
              <TouchableOpacity onPress={() => setShowAddStrategyModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>{t('strategy_name') || 'Strategy Name'} *</Text>
              <TextInput
                style={styles.input}
                value={newStrategy.name}
                onChangeText={(text) => setNewStrategy({ ...newStrategy, name: text })}
                placeholder={t('enter_name') || 'Enter strategy name'}
              />

              <Text style={styles.inputLabel}>{t('description') || 'Description'}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newStrategy.description}
                onChangeText={(text) => setNewStrategy({ ...newStrategy, description: text })}
                placeholder={t('enter_description') || 'Enter description'}
                multiline
              />

              <Text style={styles.inputLabel}>{t('zone') || 'Zone'}</Text>
              <View style={styles.zoneSelector}>
                {Object.entries(ZONE_CONFIG).map(([zone, config]) => (
                  <TouchableOpacity
                    key={zone}
                    style={[
                      styles.zoneOption,
                      { borderColor: config.color },
                      newStrategy.zone === zone && { backgroundColor: config.color }
                    ]}
                    onPress={() => setNewStrategy({ ...newStrategy, zone })}
                  >
                    <Text style={styles.zoneEmoji}>{config.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>{t('icon') || 'Icon'}</Text>
              <View style={styles.iconSelector}>
                {STRATEGY_ICONS.map((icon) => (
                  <TouchableOpacity
                    key={icon.id}
                    style={[
                      styles.iconOption,
                      newStrategy.icon === icon.id && styles.iconOptionActive
                    ]}
                    onPress={() => setNewStrategy({ ...newStrategy, icon: icon.id })}
                  >
                    <MaterialIcons
                      name={icon.name as any}
                      size={24}
                      color={newStrategy.icon === icon.id ? '#fff' : '#666'}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.shareOption}>
                <View style={styles.shareOptionText}>
                  <Text style={styles.shareOptionTitle}>{t('share_with_teacher') || 'Share with Teacher'}</Text>
                  <Text style={styles.shareOptionDesc}>{t('teacher_can_see_strategy') || 'Teacher will be able to see this strategy'}</Text>
                </View>
                <Switch
                  value={newStrategy.shareWithTeacher}
                  onValueChange={(value) => setNewStrategy({ ...newStrategy, shareWithTeacher: value })}
                  trackColor={{ false: '#ddd', true: '#81C784' }}
                  thumbColor={newStrategy.shareWithTeacher ? '#4CAF50' : '#999'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowAddStrategyModal(false)}>
                <Text style={styles.cancelBtnText}>{t('cancel') || 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, !newStrategy.name.trim() && styles.submitBtnDisabled]}
                onPress={handleAddStrategy}
                disabled={!newStrategy.name.trim()}
              >
                <Text style={styles.submitBtnText}>{t('add_strategy') || 'Add Strategy'}</Text>
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
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  errorText: { marginTop: 16, fontSize: 16, color: '#666', textAlign: 'center' },
  backBtn: { marginTop: 16, padding: 12, backgroundColor: '#4CAF50', borderRadius: 8 },
  backBtnText: { color: '#fff', fontWeight: '600' },
  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', paddingTop: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  headerLogo: { width: 26, height: 26 },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  headerBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8EAF6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  headerBadgeText: { fontSize: 12, color: '#5C6BC0', fontWeight: '600' },
  content: { flex: 1 },
  childCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', margin: 16, padding: 16, borderRadius: 16 },
  childAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  childAvatarEmoji: { fontSize: 32 },
  childInfo: { flex: 1, marginLeft: 12 },
  childName: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  childClassroom: { fontSize: 14, color: '#666', marginTop: 4 },
  checkInButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 6 },
  checkInButtonText: { color: '#fff', fontWeight: '600' },
  permissionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 12 },
  permissionInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  permissionTextContainer: { flex: 1 },
  permissionTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  permissionDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#333', marginHorizontal: 16, marginBottom: 12 },
  tabSelector: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#fff', borderRadius: 12, padding: 4 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 8, gap: 4 },
  tabActive: { backgroundColor: '#4CAF50' },
  tabText: { fontSize: 14, color: '#666' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  checkInsList: { marginHorizontal: 16, marginBottom: 24 },
  emptyText: { textAlign: 'center', color: '#999', paddingVertical: 24 },
  checkInItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8 },
  checkInZone: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  checkInEmoji: { fontSize: 20 },
  checkInDetails: { flex: 1, marginLeft: 12 },
  checkInZoneLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  checkInTime: { fontSize: 12, color: '#999', marginTop: 2 },
  checkInStrategies: { fontSize: 12, color: '#666', marginTop: 4 },
  locationBadge: { width: 28, height: 28, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  strategiesHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 12 },
  addStrategyBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 4 },
  addStrategyBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  strategySection: { marginHorizontal: 16, marginBottom: 16 },
  strategySubtitle: { fontSize: 14, fontWeight: '600', color: '#666', marginBottom: 8 },
  strategyItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 12, marginBottom: 8 },
  strategyInfo: { flex: 1, marginLeft: 12 },
  strategyName: { fontSize: 14, fontWeight: '600', color: '#333' },
  strategyDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  zoneBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  shareToggle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  shareToggleActive: { backgroundColor: '#4CAF50' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  modalScroll: { padding: 16, maxHeight: 400 },
  inputLabel: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 80, textAlignVertical: 'top' },
  zoneSelector: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  zoneOption: { flex: 1, minWidth: 70, alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2 },
  zoneEmoji: { fontSize: 24 },
  zoneLabel: { fontSize: 11, marginTop: 4, color: '#333' },
  commentInput: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 12, fontSize: 16, height: 80, textAlignVertical: 'top' },
  iconSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconOption: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f5f5f5', justifyContent: 'center', alignItems: 'center' },
  iconOptionActive: { backgroundColor: '#4CAF50' },
  shareOption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f5f5f5', padding: 16, borderRadius: 12, marginTop: 16 },
  shareOptionText: { flex: 1 },
  shareOptionTitle: { fontSize: 14, fontWeight: '600', color: '#333' },
  shareOptionDesc: { fontSize: 12, color: '#666', marginTop: 2 },
  modalActions: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#eee' },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#f5f5f5', alignItems: 'center' },
  cancelBtnText: { fontSize: 16, color: '#666', fontWeight: '600' },
  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 8, backgroundColor: '#4CAF50', alignItems: 'center' },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { fontSize: 16, color: '#fff', fontWeight: '600' },
});
