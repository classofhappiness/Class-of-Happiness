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
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import { useApp } from '../../src/context/AppContext';
import { 
  parentApi, Student, zoneLogsApi, ZoneLog, analyticsApi,
  familyApi, FamilyMember, FamilyZoneLog, authApiExtended
} from '../../src/utils/api';
import { Avatar } from '../../src/components/Avatar';

const screenWidth = Dimensions.get('window').width;

const ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

const ZONE_LABELS: Record<string, string> = {
  blue: 'Blue Zone',
  green: 'Green Zone',
  yellow: 'Yellow Zone',
  red: 'Red Zone',
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
  const [linkCode, setLinkCode] = useState('');
  const [linking, setLinking] = useState(false);
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  
  // New family member form
  const [newMember, setNewMember] = useState({
    name: '',
    relationship: 'child' as 'child' | 'partner' | 'self',
  });
  const [savingMember, setSavingMember] = useState(false);

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
          analyticsApi.getByStudent((selectedMember as Student).id, 7),
        ]);
        setRecentLogs(logsData);
        setAnalytics(analyticsData);
      } else {
        // Fetch family data
        const [logsData, analyticsData] = await Promise.all([
          familyApi.getZoneLogs((selectedMember as FamilyMember).id, 7),
          familyApi.getAnalytics((selectedMember as FamilyMember).id, 7),
        ]);
        setRecentLogs(logsData);
        setAnalytics(analyticsData);
      }
    } catch (error) {
      console.error('Error fetching member data:', error);
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
      });
      Alert.alert('Success', `${newMember.name} has been added to your family!`);
      setShowAddFamilyModal(false);
      setNewMember({ name: '', relationship: 'child' });
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
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
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
          <Text style={styles.headerTitle}>Family Dashboard</Text>
          <Text style={styles.headerSubtitle}>Track emotional wellness at home</Text>
        </View>

        {/* Family Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Family</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddFamilyModal(true)}
            >
              <MaterialIcons name="add" size={20} color="white" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.membersScroll}>
            {familyMembers.map((member) => (
              <TouchableOpacity
                key={member.id}
                style={[
                  styles.memberCard,
                  selectedMember?.id === member.id && selectedType === 'family' && styles.memberCardSelected,
                ]}
                onPress={() => {
                  setSelectedMember(member);
                  setSelectedType('family');
                }}
              >
                <View style={styles.memberAvatar}>
                  <MaterialIcons 
                    name={member.relationship === 'self' ? 'person' : member.relationship === 'partner' ? 'favorite' : 'child-care'} 
                    size={32} 
                    color="#5C6BC0" 
                  />
                </View>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberRole}>{member.relationship}</Text>
                <TouchableOpacity
                  style={styles.checkinButton}
                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { memberId: member.id, memberName: member.name }
                  })}
                >
                  <MaterialIcons name="add-circle" size={20} color="#4CAF50" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
            
            {familyMembers.length === 0 && (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyText}>Add family members to track</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Linked Children from School */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Children (School)</Text>
            <TouchableOpacity
              style={styles.linkButton}
              onPress={() => setShowLinkModal(true)}
            >
              <MaterialIcons name="link" size={18} color="white" />
              <Text style={styles.linkButtonText}>Link</Text>
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
                  setSelectedMember(child);
                  setSelectedType('linked');
                }}
              >
                <Avatar
                  type={child.avatar_type}
                  preset={child.avatar_preset}
                  custom={child.avatar_custom}
                  size={50}
                  presetAvatars={presetAvatars}
                />
                <Text style={styles.memberName}>{child.name}</Text>
                <Text style={styles.memberRole}>School</Text>
                <TouchableOpacity
                  style={styles.shareToTeacherButton}
                  onPress={() => {
                    setSelectedMember(child);
                    setShowShareModal(true);
                  }}
                >
                  <MaterialIcons name="qr-code" size={16} color="#4A90D9" />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}

            {linkedChildren.length === 0 && (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyText}>Link children from school</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Selected Member Analytics */}
        {selectedMember && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {(selectedMember as any).name}'s Week Overview
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
                        <Text style={styles.chartCenterLabel}>Check-ins</Text>
                      </View>
                    )}
                  />
                  <View style={styles.legendContainer}>
                    {Object.entries(ZONE_COLORS).map(([zone, color]) => (
                      <View key={zone} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: color }]} />
                        <Text style={styles.legendText}>{ZONE_LABELS[zone]}</Text>
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
                  <Text style={styles.noDataText}>No check-ins this week</Text>
                </View>
              )}
            </View>

            {/* Recent Activity */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Check-ins</Text>
              
              {recentLogs.length > 0 ? (
                recentLogs.slice(0, 10).map((log) => (
                  <View key={log.id} style={styles.logItem}>
                    <View style={[styles.logZone, { backgroundColor: ZONE_COLORS[log.zone] }]}>
                      <Text style={styles.logZoneText}>{log.zone[0].toUpperCase()}</Text>
                    </View>
                    <View style={styles.logDetails}>
                      <Text style={styles.logZoneName}>{ZONE_LABELS[log.zone]}</Text>
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
                  <Text style={styles.noDataText}>No recent activity</Text>
                </View>
              )}
            </View>

            {/* Quick Actions */}
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push({
                  pathname: '/parent/strategies',
                  params: { studentId: selectedMember.id }
                })}
              >
                <MaterialIcons name="lightbulb" size={24} color="#FFC107" />
                <Text style={styles.actionButtonText}>Strategies</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => router.push('/parent/resources')}
              >
                <MaterialIcons name="library-books" size={24} color="#5C6BC0" />
                <Text style={styles.actionButtonText}>Resources</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Link Child Modal */}
      <Modal visible={showLinkModal} transparent animationType="slide" onRequestClose={() => setShowLinkModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Link Child from School</Text>
              <TouchableOpacity onPress={() => setShowLinkModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalText}>
              Enter the 6-character code from your child's teacher.
            </Text>
            <TextInput
              style={styles.codeInput}
              value={linkCode}
              onChangeText={(text) => setLinkCode(text.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              maxLength={6}
            />
            <TouchableOpacity
              style={[styles.submitButton, linking && styles.submitButtonDisabled]}
              onPress={handleLinkChild}
              disabled={linking || linkCode.length !== 6}
            >
              <Text style={styles.submitButtonText}>
                {linking ? 'Linking...' : 'Link Child'}
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
              <Text style={styles.modalTitle}>Add Family Member</Text>
              <TouchableOpacity onPress={() => setShowAddFamilyModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={newMember.name}
              onChangeText={(text) => setNewMember({ ...newMember, name: text })}
              placeholder="Enter name"
            />
            
            <Text style={styles.inputLabel}>Relationship</Text>
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
                    {rel.charAt(0).toUpperCase() + rel.slice(1)}
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
                {savingMember ? 'Adding...' : 'Add Member'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Share to Teacher Modal */}
      <Modal visible={showShareModal} transparent animationType="slide" onRequestClose={() => { setShowShareModal(false); setGeneratedCode(null); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share with Teacher</Text>
              <TouchableOpacity onPress={() => { setShowShareModal(false); setGeneratedCode(null); }}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            {!generatedCode ? (
              <>
                <View style={styles.shareInfo}>
                  <MaterialIcons name="qr-code-2" size={64} color="#4A90D9" />
                  <Text style={styles.modalText}>
                    Generate a code that teachers can use to link to your child's profile.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.submitButton}
                  onPress={() => selectedMember && handleGenerateTeacherCode(selectedMember.id)}
                >
                  <Text style={styles.submitButtonText}>Generate Code</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.codeDisplay}>
                  <MaterialIcons name="check-circle" size={48} color="#4CAF50" />
                  <Text style={styles.codeLabel}>Teacher Link Code:</Text>
                  <Text style={styles.codeValue}>{generatedCode}</Text>
                  <Text style={styles.codeExpiry}>Expires in 7 days</Text>
                </View>
                <TouchableOpacity
                  style={[styles.submitButton, { backgroundColor: '#4CAF50' }]}
                  onPress={handleShareCode}
                >
                  <MaterialIcons name="share" size={20} color="white" />
                  <Text style={styles.submitButtonText}> Share Code</Text>
                </TouchableOpacity>
              </>
            )}
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
    marginHorizontal: 6,
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
    minWidth: 90,
  },
  memberCardSelected: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#4A90D9',
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
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 16,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
});
