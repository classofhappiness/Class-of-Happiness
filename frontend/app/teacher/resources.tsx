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
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useApp } from '../../src/context/AppContext';
import { 
  teacherResourcesApi, 
  TeacherResource, 
  TeacherResourceTopic,
  TeacherResourceRating,
  authApiExtended
} from '../../src/utils/api';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function TeacherResourcesScreen() {
  const router = useRouter();
  const { user, t } = useApp();
  
  const TOPICS = [
    { id: 'emotions', name: t('emotions_topic') || 'Emotions', icon: 'mood' },
    { id: 'healthy_relationships', name: t('healthy_relationships') || 'Healthy Relationships', icon: 'favorite' },
    { id: 'leader_online', name: t('leader_online') || 'Leader Online', icon: 'computer' },
    { id: 'you_are_what_you_eat', name: t('you_are_what_you_eat') || 'You Are What You Eat', icon: 'restaurant' },
    { id: 'special_needs_education', name: t('special_needs_education') || 'Special Needs', icon: 'accessibility' },
  ];
  
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
    audience: 'teachers',
  });
  const [uploading, setUploading] = useState(false);
  
  // Rating modal
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedResource, setSelectedResource] = useState<TeacherResource | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [ratings, setRatings] = useState<TeacherResourceRating[]>([]);
  const [submittingRating, setSubmittingRating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  
  // View resource modal
  const [showViewModal, setShowViewModal] = useState(false);
  const [viewingResource, setViewingResource] = useState<TeacherResource | null>(null);

  // Set teacher role on page load
  useEffect(() => {
    const setTeacherRole = async () => {
      try {
        await authApiExtended.updateRole('teacher');
      } catch (error) {
        console.log('Could not update role:', error);
      }
    };
    setTeacherRole();
  }, []);

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
        
        let base64 = '';
        try {
          // Try FileSystem first (most reliable)
          base64 = await FileSystem.readAsStringAsync(file.uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
        } catch (fsError) {
          // Fallback: use fetch + blob
          const response = await fetch(file.uri);
          const blob = await response.blob();
          base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1] || '');
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        }

        if (!base64) {
          Alert.alert('Error', 'Could not read PDF file. Please try again.');
          return;
        }
        
        setUploadData({
          ...uploadData,
          content: base64,
          pdf_filename: file.name,
          title: uploadData.title || file.name.replace('.pdf', ''),
        });
        
        Alert.alert('✅ Selected', `Ready to upload: ${file.name}`);
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

    setUploading(true);
    try {
      // If PDF selected, upload as base64 content
      // If no PDF, upload as text resource
      const payload: any = {
        title: uploadData.title,
        description: uploadData.description,
        topic: selectedTopic,
        audience: uploadData.audience || 'teachers',
      };

      if (uploadData.content && uploadData.pdf_filename) {
        // Limit PDF size to 1.5MB base64 (~1MB file)
        if (uploadData.content.length > 2000000) {
          Alert.alert('File Too Large', 'Please use a PDF under 1MB. Tip: compress it at smallpdf.com first.');
          setUploading(false);
          return;
        }
        payload.content_type = 'pdf';
        payload.content = uploadData.content;
        payload.pdf_filename = uploadData.pdf_filename;
      } else {
        payload.content_type = 'text';
        payload.content = uploadData.description;
      }

      await teacherResourcesApi.create(payload);
      Alert.alert('✅ Success', 'Resource uploaded successfully!');
      setShowUploadModal(false);
      setUploadData({ title: '', description: '', content: '', pdf_filename: '', audience: 'teachers' });
      fetchResources();
    } catch (error: any) {
      const msg = error.message || 'Failed to upload resource';
      if (msg.includes('too large') || msg.includes('413')) {
        Alert.alert('File Too Large', 'Please compress your PDF first at smallpdf.com');
      } else {
        Alert.alert('Upload Failed', msg);
      }
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

  const handleViewResource = (resource: TeacherResource) => {
    setViewingResource(resource);
    setShowViewModal(true);
  };

  const handleDownloadPdf = async (resource: TeacherResource) => {
    if (!resource.pdf_filename && !resource.id) {
      Alert.alert('Error', 'No PDF available for download');
      return;
    }

    setDownloading(true);
    
    try {
      // Use the download endpoint
      const pdfUrl = `${BACKEND_URL}/api/teacher-resources/${resource.id}/download`;
      const filename = resource.pdf_filename || `${resource.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      
      console.log('Teacher resource download URL:', pdfUrl);
      
      if (Platform.OS === 'web') {
        // Web: Open in new tab
        Linking.openURL(pdfUrl);
      } else {
        // Use unique filename to avoid 'destination already exists' error
        const timestamp = Date.now();
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const localUri = `${FileSystem.cacheDirectory}${timestamp}_${safeFilename}`;
        
        console.log('Downloading to:', localUri);
        
        const downloadResult = await FileSystem.downloadAsync(pdfUrl, localUri);
        
        if (downloadResult.status !== 200) {
          throw new Error(`Download failed with status ${downloadResult.status}`);
        }
        
        // Check if sharing is available
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Share ${resource.title}`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Success', 'PDF downloaded successfully to your device');
        }
      }
    } catch (error: any) {
      console.error('Download error:', error);
      Alert.alert(
        'Download Error', 
        `Failed to download PDF: ${error.message || 'Unknown error'}. Please check your internet connection.`
      );
    } finally {
      setDownloading(false);
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
          onPress={() => {
            if (interactive) {
              console.log('[Rating] Star tapped:', i);
              setUserRating(i);
            }
          }}
          style={interactive ? styles.interactiveStar : undefined}
          activeOpacity={interactive ? 0.6 : 1}
          hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}
        >
          <MaterialIcons
            name={i <= rating ? 'star' : 'star-border'}
            size={size}
            color={interactive ? (i <= rating ? '#4CAF50' : '#E0E0E0') : '#4CAF50'}
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
              onPress={() => handleViewResource(resource)}
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

              {/* Audience Selector */}
              <Text style={styles.inputLabel}>Share With</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { id: 'teachers', label: '👩‍🏫 Teachers' },
                  { id: 'parents', label: '👨‍👩‍👧 Parents' },
                  { id: 'both', label: '🌐 Both' },
                  { id: 'admin', label: '🔐 Admin Review' },
                ].map(opt => (
                  <TouchableOpacity
                    key={opt.id}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
                      backgroundColor: uploadData.audience === opt.id ? '#5C6BC0' : '#F0F0F0',
                      borderWidth: 1, borderColor: uploadData.audience === opt.id ? '#5C6BC0' : '#E0E0E0',
                    }}
                    onPress={() => setUploadData({ ...uploadData, audience: opt.id })}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '500', color: uploadData.audience === opt.id ? 'white' : '#666' }}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

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

      {/* View Resource Modal */}
      <Modal
        visible={showViewModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowViewModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {viewingResource?.title}
              </Text>
              <TouchableOpacity onPress={() => setShowViewModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Resource Info */}
              <View style={styles.resourceInfo}>
                <MaterialIcons name="picture-as-pdf" size={48} color="#F44336" />
                <Text style={styles.resourceInfoTitle}>{viewingResource?.title}</Text>
                <Text style={styles.resourceInfoDesc}>{viewingResource?.description}</Text>
                <View style={styles.currentRating}>
                  {renderStars(viewingResource?.average_rating || 0, 24)}
                  <Text style={styles.currentRatingText}>
                    {(viewingResource?.average_rating || 0).toFixed(1)} ({viewingResource?.total_ratings || 0} ratings)
                  </Text>
                </View>
              </View>

              {/* Download Button */}
              {viewingResource?.pdf_filename && (
                <View style={styles.downloadSection}>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleDownloadPdf(viewingResource)}
                    disabled={downloading}
                  >
                    <MaterialIcons 
                      name={downloading ? 'hourglass-empty' : 'file-download'} 
                      size={24} 
                      color="white" 
                    />
                    <Text style={styles.downloadButtonText}>
                      {downloading ? 'Preparing...' : 'Download & Share PDF'}
                    </Text>
                  </TouchableOpacity>
                  
                  {/* Sharing options info */}
                  <View style={styles.sharingInfo}>
                    <MaterialIcons name="share" size={16} color="#666" />
                    <Text style={styles.sharingInfoText}>
                      Save to phone, email, Google Drive, WhatsApp & more
                    </Text>
                  </View>
                  
                  {/* IP Disclaimer */}
                  <Text style={styles.ipDisclaimer}>
                    © {new Date().getFullYear()} Class of Happiness. All rights reserved. 
                    This material is protected intellectual property. Unauthorized reproduction, 
                    distribution, or commercial use is strictly prohibited.
                  </Text>
                </View>
              )}

              {/* Rate Button */}
              <TouchableOpacity
                style={styles.rateButton}
                onPress={() => {
                  setShowViewModal(false);
                  handleOpenRating(viewingResource!);
                }}
              >
                <MaterialIcons name="rate-review" size={20} color="#5C6BC0" />
                <Text style={styles.rateButtonText}>Rate this Resource</Text>
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
  tabsWrapper: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 8,
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
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  interactiveStar: {
    padding: 6,
    borderRadius: 8,
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
  downloadSection: {
    alignItems: 'center',
    marginVertical: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0F0F0',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 10,
  },
  downloadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  sharingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 6,
  },
  sharingInfoText: {
    fontSize: 12,
    color: '#666',
  },
  ipDisclaimer: {
    fontSize: 10,
    fontStyle: 'italic',
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 14,
    paddingHorizontal: 20,
  },
  rateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8EAF6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    marginTop: 20,
  },
  rateButtonText: {
    color: '#5C6BC0',
    fontSize: 15,
    fontWeight: '600',
  },
});
