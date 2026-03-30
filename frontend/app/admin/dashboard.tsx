import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { adminApi, AdminStats, Resource, resourcesApi } from '../../src/utils/api';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

export default function AdminDashboard() {
  const router = useRouter();
  const { user, t } = useApp();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  // New resource form
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newContentType, setNewContentType] = useState<'text' | 'pdf'>('text');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [selectedPdf, setSelectedPdf] = useState<{ name: string; base64: string } | null>(null);

  const categories = [
    { id: 'general', name: 'General', icon: 'folder' },
    { id: 'emotions', name: 'Emotions', icon: 'emoji-emotions' },
    { id: 'strategies', name: 'Strategies', icon: 'lightbulb' },
    { id: 'parents', name: 'For Parents', icon: 'family-restroom' },
    { id: 'teachers', name: 'For Teachers', icon: 'school' },
  ];

  useEffect(() => {
    if (user?.role !== 'admin') {
      Alert.alert('Access Denied', 'Admin access required');
      router.back();
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [statsData, resourcesData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getResources(),
      ]);
      setStats(statsData);
      setResources(resourcesData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const pickPdf = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        setSelectedPdf({ name: file.name, base64 });
        setNewContentType('pdf');
      }
    } catch (error) {
      console.error('Error picking PDF:', error);
      Alert.alert('Error', 'Failed to select PDF');
    }
  };

  const createResource = async () => {
    if (!newTitle.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (!newDescription.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    if (newContentType === 'text' && !newContent.trim()) {
      Alert.alert('Error', 'Please enter content');
      return;
    }
    if (newContentType === 'pdf' && !selectedPdf) {
      Alert.alert('Error', 'Please select a PDF file');
      return;
    }

    setCreating(true);
    try {
      await adminApi.createResource({
        title: newTitle.trim(),
        description: newDescription.trim(),
        content_type: newContentType,
        content: newContentType === 'pdf' ? selectedPdf?.base64 : newContent.trim(),
        pdf_filename: selectedPdf?.name,
        category: newCategory,
      });

      Alert.alert('Success', 'Resource created successfully');
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error creating resource:', error);
      Alert.alert('Error', error.message || 'Failed to create resource');
    } finally {
      setCreating(false);
    }
  };

  const deleteResource = async (resourceId: string) => {
    Alert.alert(
      'Delete Resource',
      'Are you sure you want to delete this resource?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await resourcesApi.delete(resourceId);
              Alert.alert('Success', 'Resource deleted');
              fetchData();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete resource');
            }
          },
        },
      ]
    );
  };

  const resetForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewContentType('text');
    setNewContent('');
    setNewCategory('general');
    setSelectedPdf(null);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#5C6BC0" />
          <Text style={styles.loadingText}>Loading admin dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <View style={styles.adminBadge}>
            <MaterialIcons name="admin-panel-settings" size={16} color="#fff" />
            <Text style={styles.adminBadgeText}>Admin</Text>
          </View>
        </View>

        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <MaterialIcons name="people" size={32} color="#1976D2" />
            <Text style={styles.statValue}>{stats?.total_users || 0}</Text>
            <Text style={styles.statLabel}>Total Users</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}>
            <MaterialIcons name="school" size={32} color="#FFA000" />
            <Text style={styles.statValue}>{stats?.total_teachers || 0}</Text>
            <Text style={styles.statLabel}>Teachers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <MaterialIcons name="family-restroom" size={32} color="#388E3C" />
            <Text style={styles.statValue}>{stats?.total_parents || 0}</Text>
            <Text style={styles.statLabel}>Parents</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FCE4EC' }]}>
            <MaterialIcons name="child-care" size={32} color="#C2185B" />
            <Text style={styles.statValue}>{stats?.total_students || 0}</Text>
            <Text style={styles.statLabel}>Students</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}>
            <MaterialIcons name="check-circle" size={32} color="#7B1FA2" />
            <Text style={styles.statValue}>{stats?.total_checkins || 0}</Text>
            <Text style={styles.statLabel}>Check-ins</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E0F7FA' }]}>
            <MaterialIcons name="library-books" size={32} color="#00838F" />
            <Text style={styles.statValue}>{stats?.total_resources || 0}</Text>
            <Text style={styles.statLabel}>Resources</Text>
          </View>
        </View>

        {/* Global Resources Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Global Resources</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowCreateModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add Resource</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionSubtitle}>
            These resources appear in the "General" tab for all teachers and parents
          </Text>

          {resources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={48} color="#CCC" />
              <Text style={styles.emptyText}>No global resources yet</Text>
              <Text style={styles.emptySubtext}>
                Add resources for teachers and parents to access
              </Text>
            </View>
          ) : (
            resources.map((resource) => (
              <View key={resource.id} style={styles.resourceCard}>
                <View style={styles.resourceIcon}>
                  <MaterialIcons
                    name={resource.content_type === 'pdf' ? 'picture-as-pdf' : 'article'}
                    size={24}
                    color={resource.content_type === 'pdf' ? '#E53935' : '#5C6BC0'}
                  />
                </View>
                <View style={styles.resourceInfo}>
                  <Text style={styles.resourceTitle}>{resource.title}</Text>
                  <Text style={styles.resourceDescription} numberOfLines={2}>
                    {resource.description}
                  </Text>
                  <View style={styles.resourceMeta}>
                    <Text style={styles.resourceType}>
                      {resource.content_type === 'pdf' ? 'PDF' : 'Text'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => deleteResource(resource.id)}
                >
                  <MaterialIcons name="delete" size={20} color="#E53935" />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Create Resource Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Global Resource</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Title */}
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.textInput}
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Enter resource title"
                placeholderTextColor="#999"
              />

              {/* Description */}
              <Text style={styles.inputLabel}>Description *</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Enter a brief description"
                placeholderTextColor="#999"
                multiline
                numberOfLines={3}
              />

              {/* Category */}
              <Text style={styles.inputLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      newCategory === cat.id && styles.categoryChipActive,
                    ]}
                    onPress={() => setNewCategory(cat.id)}
                  >
                    <MaterialIcons
                      name={cat.icon as any}
                      size={16}
                      color={newCategory === cat.id ? '#fff' : '#666'}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        newCategory === cat.id && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Content Type Toggle */}
              <Text style={styles.inputLabel}>Content Type</Text>
              <View style={styles.toggleRow}>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newContentType === 'text' && styles.toggleButtonActive,
                  ]}
                  onPress={() => {
                    setNewContentType('text');
                    setSelectedPdf(null);
                  }}
                >
                  <MaterialIcons
                    name="article"
                    size={20}
                    color={newContentType === 'text' ? '#fff' : '#666'}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      newContentType === 'text' && styles.toggleTextActive,
                    ]}
                  >
                    Text
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    newContentType === 'pdf' && styles.toggleButtonActive,
                  ]}
                  onPress={() => setNewContentType('pdf')}
                >
                  <MaterialIcons
                    name="picture-as-pdf"
                    size={20}
                    color={newContentType === 'pdf' ? '#fff' : '#666'}
                  />
                  <Text
                    style={[
                      styles.toggleText,
                      newContentType === 'pdf' && styles.toggleTextActive,
                    ]}
                  >
                    PDF
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Content based on type */}
              {newContentType === 'text' ? (
                <>
                  <Text style={styles.inputLabel}>Content *</Text>
                  <TextInput
                    style={[styles.textInput, styles.contentArea]}
                    value={newContent}
                    onChangeText={setNewContent}
                    placeholder="Enter the resource content..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={6}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>PDF File *</Text>
                  <TouchableOpacity style={styles.pdfPicker} onPress={pickPdf}>
                    {selectedPdf ? (
                      <View style={styles.pdfSelected}>
                        <MaterialIcons name="picture-as-pdf" size={24} color="#E53935" />
                        <Text style={styles.pdfName} numberOfLines={1}>
                          {selectedPdf.name}
                        </Text>
                        <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
                      </View>
                    ) : (
                      <View style={styles.pdfPlaceholder}>
                        <MaterialIcons name="upload-file" size={32} color="#999" />
                        <Text style={styles.pdfPlaceholderText}>
                          Tap to select PDF file
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Create Button */}
              <TouchableOpacity
                style={[styles.createButton, creating && styles.createButtonDisabled]}
                onPress={createResource}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.createButtonText}>Create Resource</Text>
                  </>
                )}
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
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  headerTitle: {
    flex: 1,
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  adminBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: '31%',
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 13,
    color: '#BBB',
    marginTop: 4,
    textAlign: 'center',
  },
  resourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    marginBottom: 8,
  },
  resourceIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resourceInfo: {
    flex: 1,
  },
  resourceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
  },
  resourceDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  resourceMeta: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  resourceType: {
    fontSize: 11,
    color: '#888',
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  deleteButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
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
    borderBottomColor: '#EEE',
  },
  modalTitle: {
    fontSize: 18,
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
    marginTop: 16,
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#333',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  contentArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
    gap: 4,
  },
  categoryChipActive: {
    backgroundColor: '#5C6BC0',
  },
  categoryChipText: {
    fontSize: 13,
    color: '#666',
  },
  categoryChipTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F0F0F0',
    gap: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#5C6BC0',
  },
  toggleText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#666',
  },
  toggleTextActive: {
    color: '#fff',
  },
  pdfPicker: {
    borderWidth: 2,
    borderColor: '#DDD',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  pdfPlaceholder: {
    alignItems: 'center',
  },
  pdfPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  pdfSelected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pdfName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
    marginBottom: 40,
    gap: 8,
  },
  createButtonDisabled: {
    backgroundColor: '#CCC',
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
