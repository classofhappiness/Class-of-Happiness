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
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useApp } from '../../src/context/AppContext';
import { 
  teacherResourcesApi, 
  TeacherResource, 
  TeacherResourceTopic,
  TeacherResourceRating 
} from '../../src/utils/api';

const TOPICS = [
  { id: 'emotions', name: 'Emotions', icon: 'mood' },
  { id: 'healthy_relationships', name: 'Healthy Relationships', icon: 'favorite' },
  { id: 'leader_online', name: 'Leader Online', icon: 'computer' },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat', icon: 'restaurant' },
  { id: 'special_needs_education', name: 'Special Needs Education', icon: 'accessibility' },
];

export default function TeacherResourcesScreen() {
  const router = useRouter();
  const { user } = useApp();
  
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0].id);
  const [resources, setResources] = useState<TeacherResource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Upload modal
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    description: '',
    content: '',
    pdf_filename: '',
  });
  const [uploading, setUploading] = useState(false);
  
  // Rating modal
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState<TeacherResource | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [ratings, setRatings] = useState<TeacherResourceRating[]>([]);
  const [submittingRating, setSubmittingRating] = useState(false);

  const fetchResources = async () => {
    try {
      const data = await teacherResourcesApi.getAll(selectedTopic);
      setResources(data);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchResources();
  }, [selectedTopic]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchResources();
    setRefreshing(false);
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        
        // Read file as base64
        const base64 = await FileSystem.readAsStringAsync(file.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        setUploadData({
          ...uploadData,
          content: base64,
          pdf_filename: file.name,
          title: uploadData.title || file.name.replace('.pdf', ''),
        });
        
        Alert.alert('Success', `Selected: ${file.name}`);
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const handleUpload = async () => {
    if (!uploadData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    if (!uploadData.description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }
    if (!uploadData.content) {
      Alert.alert('Error', 'Please select a PDF file');
      return;
    }
    
    setUploading(true);
    try {
      await teacherResourcesApi.create({
        title: uploadData.title,
        description: uploadData.description,
        topic: selectedTopic,
        content_type: 'pdf',
        content: uploadData.content,
        pdf_filename: uploadData.pdf_filename,
      });
      
      Alert.alert('Success', 'Resource uploaded successfully!');
      setShowUploadModal(false);
      setUploadData({ title: '', description: '', content: '', pdf_filename: '' });
      fetchResources();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload resource');
    } finally {
      setUploading(false);
    }
  };

  const handleOpenRating = async (resource: TeacherResource) => {
    setSelectedResource(resource);
    setUserRating(0);
    setUserComment('');
    setShowRatingModal(true);
    
    try {
      const ratingsData = await teacherResourcesApi.getRatings(resource.id);
      setRatings(ratingsData);
    } catch (error) {
      console.error('Error fetching ratings:', error);
    }
  };

  const handleSubmitRating = async () => {
    if (userRating === 0) {
      Alert.alert('Error', 'Please select a star rating');
      return;
    }
    
    if (!selectedResource) return;
    
    setSubmittingRating(true);
    try {
      await teacherResourcesApi.rate(selectedResource.id, userRating, userComment.trim() || undefined);
      Alert.alert('Success', 'Rating submitted!');
      setShowRatingModal(false);
      fetchResources();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit rating');
    } finally {
      setSubmittingRating(false);
    }
  };

  const renderStars = (rating: number, size: number = 16, interactive: boolean = false) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity
          key={i}
          disabled={!interactive}
          onPress={() => interactive && setUserRating(i)}
        >
          <MaterialIcons
            name={i <= rating ? 'star' : 'star-border'}
            size={size}
            color="#FFC107"
          />
        </TouchableOpacity>
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const currentTopic = TOPICS.find(t => t.id === selectedTopic);

  return (
    <SafeAreaView style={styles.container}>
      {/* Topic Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.tabsContainer}
        >
          {TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.id}
              style={[
                styles.tab,
                selectedTopic === topic.id && styles.tabSelected,
              ]}
              onPress={() => setSelectedTopic(topic.id)}
            >
              <MaterialIcons
                name={topic.icon as any}
                size={20}
                color={selectedTopic === topic.id ? 'white' : '#666'}
              />
              <Text style={[
                styles.tabText,
                selectedTopic === topic.id && styles.tabTextSelected,
              ]} numberOfLines={1}>
                {topic.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>{currentTopic?.name}</Text>
              <Text style={styles.headerSubtitle}>
                {resources.length} resource{resources.length !== 1 ? 's' : ''} available
              </Text>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => setShowUploadModal(true)}
            >
              <MaterialIcons name="cloud-upload" size={20} color="white" />
              <Text style={styles.uploadButtonText}>Upload</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Resources List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading resources...</Text>
          </View>
        ) : resources.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="folder-open" size={64} color="#CCC" />
            <Text style={styles.emptyStateText}>No resources yet</Text>
            <Text style={styles.emptyStateSubtext}>
              Be the first to upload a resource for this topic!
            </Text>
          </View>
        ) : (
          resources.map((resource) => (
            <TouchableOpacity
              key={resource.id}
              style={styles.resourceCard}
              onPress={() => handleOpenRating(resource)}
            >
              <View style={styles.resourceIcon}>
                <MaterialIcons name="picture-as-pdf" size={32} color="#F44336" />
              </View>
              <View style={styles.resourceContent}>
                <Text style={styles.resourceTitle}>{resource.title}</Text>
                <Text style={styles.resourceDescription} numberOfLines={2}>
                  {resource.description}
                </Text>
                <View style={styles.resourceMeta}>
                  {renderStars(resource.average_rating)}
                  <Text style={styles.ratingText}>
                    {resource.average_rating.toFixed(1)} ({resource.total_ratings})
                  </Text>
                </View>
                <Text style={styles.uploadedBy}>
                  By {resource.created_by_name || 'Teacher'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={24} color="#CCC" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Upload Resource</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Title</Text>
              <TextInput
                style={styles.textInput}
                value={uploadData.title}
                onChangeText={(text) => setUploadData({ ...uploadData, title: text })}
                placeholder="Resource title"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={uploadData.description}
                onChangeText={(text) => setUploadData({ ...uploadData, description: text })}
                placeholder="Brief description of this resource..."
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>PDF File</Text>
              <TouchableOpacity style={styles.filePickerButton} onPress={handlePickDocument}>
                <MaterialIcons name="attach-file" size={24} color="#5C6BC0" />
                <Text style={styles.filePickerText}>
                  {uploadData.pdf_filename || 'Select PDF file'}
                </Text>
              </TouchableOpacity>

              <Text style={styles.topicLabel}>
                Topic: <Text style={styles.topicValue}>{currentTopic?.name}</Text>
              </Text>

              <TouchableOpacity
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}
              >
                <Text style={styles.submitButtonText}>
                  {uploading ? 'Uploading...' : 'Upload Resource'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rating Modal */}
      <Modal
        visible={showRatingModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowRatingModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {selectedResource?.title}
              </Text>
              <TouchableOpacity onPress={() => setShowRatingModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Resource Info */}
              <View style={styles.resourceInfo}>
                <MaterialIcons name="picture-as-pdf" size={48} color="#F44336" />
                <Text style={styles.resourceInfoTitle}>{selectedResource?.title}</Text>
                <Text style={styles.resourceInfoDesc}>{selectedResource?.description}</Text>
                <View style={styles.currentRating}>
                  {renderStars(selectedResource?.average_rating || 0, 24)}
                  <Text style={styles.currentRatingText}>
                    {selectedResource?.average_rating.toFixed(1)} ({selectedResource?.total_ratings} ratings)
                  </Text>
                </View>
              </View>

              {/* Rate This Resource */}
              <View style={styles.rateSection}>
                <Text style={styles.rateSectionTitle}>Rate This Resource</Text>
                <View style={styles.starRating}>
                  {renderStars(userRating, 40, true)}
                </View>
                
                <Text style={styles.inputLabel}>Comment (optional, max 100 chars)</Text>
                <TextInput
                  style={styles.textInput}
                  value={userComment}
                  onChangeText={(text) => setUserComment(text.slice(0, 100))}
                  placeholder="Share your feedback..."
                  maxLength={100}
                />
                <Text style={styles.charCounter}>{userComment.length}/100</Text>

                <TouchableOpacity
                  style={[styles.submitButton, submittingRating && styles.submitButtonDisabled]}
                  onPress={handleSubmitRating}
                  disabled={submittingRating}
                >
                  <Text style={styles.submitButtonText}>
                    {submittingRating ? 'Submitting...' : 'Submit Rating'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Previous Ratings */}
              {ratings.length > 0 && (
                <View style={styles.ratingsSection}>
                  <Text style={styles.rateSectionTitle}>Teacher Reviews</Text>
                  {ratings.map((rating) => (
                    <View key={rating.id} style={styles.ratingItem}>
                      <View style={styles.ratingHeader}>
                        <Text style={styles.ratingUser}>{rating.user_name || 'Teacher'}</Text>
                        {renderStars(rating.rating, 14)}
                      </View>
                      {rating.comment && (
                        <Text style={styles.ratingComment}>"{rating.comment}"</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
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
  tabsWrapper: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tabsContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    gap: 6,
  },
  tabSelected: {
    backgroundColor: '#5C6BC0',
  },
  tabText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  tabTextSelected: {
    color: 'white',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 20,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#5C6BC0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    backgroundColor: 'white',
    borderRadius: 16,
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
  resourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  resourceIcon: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceContent: {
    flex: 1,
    marginLeft: 16,
  },
  resourceTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  resourceDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  resourceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  ratingText: {
    fontSize: 12,
    color: '#888',
  },
  uploadedBy: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
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
    maxHeight: '85%',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    paddingRight: 16,
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
  textInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  filePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#5C6BC0',
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  filePickerText: {
    fontSize: 14,
    color: '#5C6BC0',
    flex: 1,
  },
  topicLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  topicValue: {
    fontWeight: '600',
    color: '#5C6BC0',
  },
  submitButton: {
    backgroundColor: '#5C6BC0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#CCC',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  resourceInfo: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    marginBottom: 20,
  },
  resourceInfoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    textAlign: 'center',
  },
  resourceInfoDesc: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  currentRating: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  currentRatingText: {
    fontSize: 14,
    color: '#666',
  },
  rateSection: {
    marginBottom: 24,
  },
  rateSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  starRating: {
    alignItems: 'center',
    marginBottom: 20,
  },
  charCounter: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: -12,
    marginBottom: 16,
  },
  ratingsSection: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 20,
  },
  ratingItem: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  ratingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ratingUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  ratingComment: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 8,
  },
});
