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
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { parentApi, Student, analyticsApi, zoneLogsApi, ZoneLog } from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

export default function ParentDashboard() {
  const router = useRouter();
  const { user, presetAvatars } = useApp();
  const [children, setChildren] = useState<Student[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [selectedChild, setSelectedChild] = useState<Student | null>(null);
  const [childLogs, setChildLogs] = useState<ZoneLog[]>([]);

  const fetchChildren = async () => {
    try {
      const data = await parentApi.getChildren();
      setChildren(data);
      if (data.length > 0 && !selectedChild) {
        setSelectedChild(data[0]);
      }
    } catch (error) {
      console.error('Error fetching children:', error);
    }
  };

  const fetchChildLogs = async () => {
    if (!selectedChild) return;
    try {
      const logs = await zoneLogsApi.getByStudent(selectedChild.id, 7);
      setChildLogs(logs);
    } catch (error) {
      console.error('Error fetching logs:', error);
    }
  };

  useEffect(() => {
    fetchChildren();
  }, []);

  useEffect(() => {
    if (selectedChild) {
      fetchChildLogs();
    }
  }, [selectedChild]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchChildren();
    await fetchChildLogs();
    setRefreshing(false);
  };

  const handleLinkChild = async () => {
    if (!linkCode.trim()) return;
    setLinking(true);
    try {
      const result = await parentApi.linkChild(linkCode.trim());
      Alert.alert('Success', `${result.student_name} has been linked to your account!`);
      setShowLinkModal(false);
      setLinkCode('');
      fetchChildren();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Invalid or expired link code');
    } finally {
      setLinking(false);
    }
  };

  const ZONE_COLORS: Record<string, string> = {
    blue: '#4A90D9',
    green: '#4CAF50',
    yellow: '#FFC107',
    red: '#F44336',
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

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
          <Text style={styles.headerTitle}>Parent Dashboard</Text>
          <Text style={styles.headerSubtitle}>Monitor your child's emotional wellness</Text>
        </View>

        {/* Children Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Children</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowLinkModal(true)}
            >
              <MaterialIcons name="add" size={20} color="white" />
              <Text style={styles.addButtonText}>Link Child</Text>
            </TouchableOpacity>
          </View>

          {children.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="child-care" size={64} color="#CCC" />
              <Text style={styles.emptyStateText}>No children linked yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Ask your child's teacher for a link code
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.childrenScroll}>
              {children.map((child) => (
                <TouchableOpacity
                  key={child.id}
                  style={[
                    styles.childCard,
                    selectedChild?.id === child.id && styles.childCardSelected,
                  ]}
                  onPress={() => setSelectedChild(child)}
                >
                  <Avatar
                    type={child.avatar_type}
                    preset={child.avatar_preset}
                    custom={child.avatar_custom}
                    size={60}
                    presetAvatars={presetAvatars}
                  />
                  <Text style={styles.childName}>{child.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Selected Child's Recent Activity */}
        {selectedChild && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{selectedChild.name}'s Recent Check-ins</Text>
            
            {childLogs.length === 0 ? (
              <View style={styles.emptyLogs}>
                <MaterialIcons name="history" size={48} color="#CCC" />
                <Text style={styles.emptyLogsText}>No recent check-ins</Text>
              </View>
            ) : (
              childLogs.slice(0, 10).map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                    <Text style={styles.logZoneText}>{log.zone[0].toUpperCase()}</Text>
                  </View>
                  <View style={styles.logDetails}>
                    <Text style={styles.logZoneName}>{log.zone.charAt(0).toUpperCase() + log.zone.slice(1)} Zone</Text>
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
            )}

            {/* Strategies Button */}
            <TouchableOpacity
              style={styles.strategiesButton}
              onPress={() => router.push({
                pathname: '/parent/strategies',
                params: { studentId: selectedChild.id }
              })}
            >
              <MaterialIcons name="lightbulb" size={24} color="#FFC107" />
              <Text style={styles.strategiesButtonText}>Manage Strategies</Text>
              <MaterialIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
          </View>
        )}

        {/* Resources Section */}
        <TouchableOpacity
          style={styles.resourcesCard}
          onPress={() => router.push('/parent/resources')}
        >
          <MaterialIcons name="library-books" size={40} color="#5C6BC0" />
          <View style={styles.resourcesContent}>
            <Text style={styles.resourcesTitle}>Resources</Text>
            <Text style={styles.resourcesSubtitle}>Articles & guides on emotional intelligence</Text>
          </View>
          <MaterialIcons name="chevron-right" size={24} color="#666" />
        </TouchableOpacity>
      </ScrollView>

      {/* Link Child Modal */}
      <Modal
        visible={showLinkModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowLinkModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Your Child</Text>
              <TouchableOpacity onPress={() => setShowLinkModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.modalText}>
              Enter the 6-character code provided by your child's teacher.
            </Text>
            
            <TextInput
              style={styles.codeInput}
              value={linkCode}
              onChangeText={(text) => setLinkCode(text.toUpperCase())}
              placeholder="Enter code (e.g., ABC123)"
              autoCapitalize="characters"
              maxLength={6}
            />
            
            <TouchableOpacity
              style={[styles.linkButton, linking && styles.linkButtonDisabled]}
              onPress={handleLinkChild}
              disabled={linking || linkCode.length !== 6}
            >
              <Text style={styles.linkButtonText}>
                {linking ? 'Linking...' : 'Link Child'}
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
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
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
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4A90D9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  childrenScroll: {
    marginHorizontal: -8,
  },
  childCard: {
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 8,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    minWidth: 100,
  },
  childCardSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#4A90D9',
  },
  childName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyLogs: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  emptyLogsText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
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
  strategiesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    marginTop: 16,
    gap: 12,
  },
  strategiesButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  resourcesCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  resourcesContent: {
    flex: 1,
  },
  resourcesTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  resourcesSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
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
  linkButton: {
    backgroundColor: '#4A90D9',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  linkButtonDisabled: {
    backgroundColor: '#CCC',
  },
  linkButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
