import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Modal,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { File, Directory, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { resourcesApi, teacherResourcesApi, Resource, TeacherResource, TeacherResourceRating } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';

const TOPICS = [
  { id: 'all', name: 'All', icon: 'apps' as const },
  { id: 'emotions', name: 'Emotions', icon: 'mood' as const },
  { id: 'healthy_relationships', name: 'Healthy Relationships', icon: 'people' as const },
  { id: 'leader_online', name: 'Leader Online', icon: 'computer' as const },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat', icon: 'restaurant' as const },
  { id: 'special_needs', name: 'Special Needs', icon: 'accessibility' as const },
];

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function ResourcesScreen() {
  const router = useRouter();
  const { t, isAuthenticated } = useApp();
  const [resources, setResources] = useState<Resource[]>([]);
  // Parent-targeted teacher resources (audience=parents or both)
  const [parentTeacherResources, setParentTeacherResources] = useState<TeacherResource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | TeacherResource | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'teacher'>('general');
  const [selectedTopic, setSelectedTopic] = useState('all');
  const [downloading, setDownloading] = useState(false);

  // Rating state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratings, setRatings] = useState<TeacherResourceRating[]>([]);
  const [loadingRatings, setLoadingRatings] = useState(false);

  const fetchResources = async () => {
    try {
      const [generalData, parentResourcesData] = await Promise.all([
        resourcesApi.getAll(),
        // Fetch resources shared with parents (audience=parents or both)
        fetch(`${BACKEND_URL}/api/parent/resources`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await import('../../src/utils/api')).getSessionTokenValue?.() || ''}`,
          }
        }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      setResources(generalData);
      setParentTeacherResources(parentResourcesData);
    } catch (error) {
      console.error('Error fetching resources:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResources();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchResources();
    setRefreshing(false);
  };

  const handleViewResource = async (resource: Resource | TeacherResource) => {
    setSelectedResource(resource);

    if ('topic' in resource) {
      setLoadingRatings(true);
      try {
        const resourceRatings = await teacherResourcesApi.getRatings(resource.id);
        setRatings(resourceRatings);
      } catch (error) {
        console.error('Error loading ratings:', error);
      } finally {
        setLoadingRatings(false);
      }
    }
  };

  const handleDownloadPdf = async (resource: Resource | TeacherResource) => {
    const isTeacherResource = 'topic' in resource;
    const isGeneralResource = 'content_type' in resource && (resource as Resource).content_type === 'pdf';

    if (!isTeacherResource && !isGeneralResource) {
      Alert.alert('Error', 'No PDF available for download');
      return;
    }

    setDownloading(true);

    try {
      const resourceId = resource.id;
      const endpoint = isTeacherResource
        ? `/api/teacher-resources/${resourceId}/download`
        : `/api/resources/${resourceId}/download`;
      const downloadUrl = `${BACKEND_URL}${endpoint}`;

      if (Platform.OS === 'web') {
        Linking.openURL(downloadUrl);
      } else {
        const timestamp = Date.now();
        const cacheDir = new Directory(Paths.cache);
        const downloadedFile = await File.downloadFileAsync(downloadUrl, cacheDir);

        if (!downloadedFile.exists) {
          throw new Error('Downloaded file does not exist');
        }

        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadedFile.uri, {
            mimeType: 'application/pdf',
            dialogTitle: `Share ${resource.title}`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('Success', `PDF saved to: ${downloadedFile.uri}`);
        }
      }
    } catch (error: any) {
      console.error('Download error:', error);
      Alert.alert('Download Error', `Failed to download PDF: ${error.message || 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenRatingModal = () => {
    setSelectedRating(0);
    setRatingComment('');
    setShowRatingModal(true);
  };

  const handleSubmitRating = async () => {
    if (!selectedResource || selectedRating === 0) {
      Alert.alert('Error', 'Please select a rating');
      return;
    }

    setSubmittingRating(true);
    try {
      await teacherResourcesApi.rate(selectedResource.id, selectedRating, ratingComment.trim() || undefined);
      const newRatings = await teacherResourcesApi.getRatings(selectedResource.id);
      setRatings(newRatings);
      setShowRatingModal(false);
      Alert.alert('Thank you!', 'Your rating has been submitted.');
    } catch (error) {
      Alert.alert('Error', 'Failed to submit rating. Please try again.');
    } finally {
      setSubmittingRating(false);
    }
  };

  const getAverageRating = () => {
    if (ratings.length === 0) return 0;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    return (sum / ratings.length).toFixed(1);
  };

  const filteredResources = resources;
  const filteredTeacherResources = selectedTopic === 'all'
    ? parentTeacherResources
    : parentTeacherResources.filter(r => r.topic === selectedTopic);

  const isTeacherResource = (resource: Resource | TeacherResource | null): resource is TeacherResource => {
    return resource !== null && 'topic' in resource;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Back button */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
          <Text style={styles.backText}>{t('back') || 'Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{t('resources') || 'Resources'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'general' && styles.tabActive]}
            onPress={() => setActiveTab('general')}
          >
            <MaterialIcons name="library-books" size={20} color={activeTab === 'general' ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>
              {t('resources') || 'General'} ({filteredResources.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'teacher' && styles.tabActive]}
            onPress={() => setActiveTab('teacher')}
          >
            <MaterialIcons name="school" size={20} color={activeTab === 'teacher' ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'teacher' && styles.tabTextActive]}>
              {t('from_teacher') || 'From Teacher'} ({filteredTeacherResources.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Topic Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topicScroll}>
          {TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.id}
              style={[styles.topicChip, selectedTopic === topic.id && styles.topicChipActive]}
              onPress={() => setSelectedTopic(topic.id)}
            >
              <MaterialIcons name={topic.icon} size={16} color={selectedTopic === topic.id ? 'white' : '#666'} />
              <Text style={[styles.topicChipText, selectedTopic === topic.id && styles.topicChipTextActive]}>
                {topic.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Resources List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t('loading_resources') || 'Loading resources...'}</Text>
          </View>
        ) : activeTab === 'general' ? (
          filteredResources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={64} color="#CCC" />
              <Text style={styles.emptyStateText}>{t('no_resources_yet') || 'No resources available yet'}</Text>
              <Text style={styles.emptyStateSubtext}>Check back later for helpful articles and guides</Text>
            </View>
          ) : (
            filteredResources.map((resource) => (
              <TouchableOpacity
                key={resource.id}
                style={styles.resourceCard}
                onPress={() => handleViewResource(resource)}
              >
                <View style={styles.resourceIcon}>
                  <MaterialIcons
                    name={resource.content_type === 'pdf' ? 'picture-as-pdf' : 'article'}
                    size={32}
                    color={resource.content_type === 'pdf' ? '#F44336' : '#5C6BC0'}
                  />
                </View>
                <View style={styles.resourceContent}>
                  <Text style={styles.resourceTitle}>{resource.title}</Text>
                  <Text style={styles.resourceDescription} numberOfLines={2}>{resource.description}</Text>
                  <View style={styles.resourceMeta}>
                    <Text style={styles.resourceType}>
                      {resource.content_type === 'pdf' ? 'PDF Document' : 'Article'}
                    </Text>
                    {resource.content_type === 'pdf' && (
                      <View style={styles.downloadBadge}>
                        <MaterialIcons name="download" size={12} color="#4CAF50" />
                        <Text style={styles.downloadBadgeText}>Download</Text>
                      </View>
                    )}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#CCC" />
              </TouchableOpacity>
            ))
          )
        ) : (
          filteredTeacherResources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="school" size={64} color="#CCC" />
              <Text style={styles.emptyStateText}>No resources shared yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Your child's teacher will share resources here. Teachers upload and set audience to "Parents" or "Both".
              </Text>
            </View>
          ) : (
            filteredTeacherResources.map((resource) => (
              <TouchableOpacity
                key={resource.id}
                style={[styles.resourceCard, styles.teacherResourceCard]}
                onPress={() => handleViewResource(resource)}
              >
                <View style={[styles.resourceIcon, { backgroundColor: '#E8F5E9' }]}>
                  <MaterialIcons
                    name={resource.content_type === 'pdf' ? 'picture-as-pdf' : 'article'}
                    size={32}
                    color={resource.content_type === 'pdf' ? '#F44336' : '#4CAF50'}
                  />
                </View>
                <View style={styles.resourceContent}>
                  <View style={styles.teacherBadge}>
                    <MaterialIcons name="verified" size={14} color="#4CAF50" />
                    <Text style={styles.teacherBadgeText}>From Teacher</Text>
                  </View>
                  <Text style={styles.resourceTitle}>{resource.title}</Text>
                  <Text style={styles.resourceDescription} numberOfLines={2}>{resource.description}</Text>
                  <View style={styles.resourceMeta}>
                    <Text style={styles.resourceTopic}>
                      {TOPICS.find(t => t.id === resource.topic)?.name || resource.topic}
                    </Text>
                    {resource.content_type === 'pdf' && (
                      <View style={styles.downloadBadge}>
                        <MaterialIcons name="download" size={12} color="#4CAF50" />
                        <Text style={styles.downloadBadgeText}>Download</Text>
                      </View>
                    )}
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#CCC" />
              </TouchableOpacity>
            ))
          )
        )}

        <View style={styles.infoCard}>
          <MaterialIcons name="info" size={24} color="#5C6BC0" />
          <Text style={styles.infoText}>
            These resources are provided to help you support your child's emotional development at home.
          </Text>
        </View>
      </ScrollView>

      {/* Resource Detail Modal */}
      <Modal visible={!!selectedResource} transparent animationType="slide" onRequestClose={() => setSelectedResource(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle} numberOfLines={2}>{selectedResource?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedResource(null)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalDescription}>{selectedResource?.description}</Text>
              {selectedResource?.content_type === 'text' && selectedResource?.content && (
                <Text style={styles.modalArticle}>{selectedResource.content}</Text>
              )}
              {selectedResource?.content_type === 'pdf' && (
                <View style={styles.pdfSection}>
                  <View style={styles.pdfNotice}>
                    <MaterialIcons name="picture-as-pdf" size={48} color="#F44336" />
                    <Text style={styles.pdfNoticeText}>{selectedResource.pdf_filename || 'document.pdf'}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.downloadButton}
                    onPress={() => handleDownloadPdf(selectedResource)}
                    disabled={downloading}
                  >
                    <MaterialIcons name={downloading ? 'hourglass-empty' : 'file-download'} size={24} color="white" />
                    <Text style={styles.downloadButtonText}>{downloading ? 'Preparing...' : 'Download & Share PDF'}</Text>
                  </TouchableOpacity>
                  <View style={styles.sharingInfo}>
                    <MaterialIcons name="share" size={16} color="#666" />
                    <Text style={styles.sharingInfoText}>Save to phone, email, Google Drive, WhatsApp & more</Text>
                  </View>
                  <Text style={styles.ipDisclaimer}>
                    © {new Date().getFullYear()} Class of Happiness. All rights reserved.
                    This material is protected intellectual property.
                  </Text>
                </View>
              )}
              {isTeacherResource(selectedResource) && (
                <View style={styles.ratingsSection}>
                  <View style={styles.ratingsSummary}>
                    <Text style={styles.ratingsTitle}>Ratings & Reviews</Text>
                    {ratings.length > 0 ? (
                      <View style={styles.averageRating}>
                        <MaterialIcons name="star" size={24} color="#FFB300" />
                        <Text style={styles.averageRatingText}>{getAverageRating()}</Text>
                        <Text style={styles.ratingsCount}>({ratings.length} reviews)</Text>
                      </View>
                    ) : (
                      <Text style={styles.noRatingsText}>No ratings yet</Text>
                    )}
                  </View>
                  {isAuthenticated && (
                    <TouchableOpacity style={styles.rateButton} onPress={handleOpenRatingModal}>
                      <MaterialIcons name="rate-review" size={20} color="#5C6BC0" />
                      <Text style={styles.rateButtonText}>Rate this resource</Text>
                    </TouchableOpacity>
                  )}
                  {ratings.length > 0 && (
                    <View style={styles.reviewsList}>
                      {ratings.slice(0, 5).map((rating, index) => (
                        <View key={index} style={styles.reviewCard}>
                          <View style={styles.reviewHeader}>
                            <View style={styles.reviewStars}>
                              {[1,2,3,4,5].map((star) => (
                                <MaterialIcons key={star} name={star <= rating.rating ? 'star' : 'star-border'} size={16} color="#4CAF50" />
                              ))}
                            </View>
                            <Text style={styles.reviewDate}>{new Date(rating.created_at).toLocaleDateString()}</Text>
                          </View>
                          {rating.comment && <Text style={styles.reviewComment}>{rating.comment}</Text>}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rating Modal */}
      <Modal visible={showRatingModal} transparent animationType="fade" onRequestClose={() => setShowRatingModal(false)}>
        <TouchableOpacity style={styles.ratingModalOverlay} activeOpacity={1} onPress={() => setShowRatingModal(false)}>
          <View style={styles.ratingModalContent} onStartShouldSetResponder={() => true}>
            <Text style={styles.ratingModalTitle}>Rate this resource</Text>
            <View style={styles.starRating}>
              {[1,2,3,4,5].map((star) => (
                <TouchableOpacity key={star} onPress={() => setSelectedRating(star)} style={styles.interactiveStar} activeOpacity={0.6} hitSlop={{ top: 10, bottom: 10, left: 5, right: 5 }}>
                  <MaterialIcons name={star <= selectedRating ? 'star' : 'star-border'} size={44} color={star <= selectedRating ? '#4CAF50' : '#E0E0E0'} />
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.ratingInput}
              placeholder="Add a comment (optional)"
              placeholderTextColor="#999"
              value={ratingComment}
              onChangeText={setRatingComment}
              multiline
              maxLength={200}
            />
            <View style={styles.ratingButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowRatingModal(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, selectedRating === 0 && styles.submitButtonDisabled]}
                onPress={handleSubmitRating}
                disabled={selectedRating === 0 || submittingRating}
              >
                <Text style={styles.submitButtonText}>{submittingRating ? 'Submitting...' : 'Submit'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  backText: { fontSize: 14, color: '#333' },
  topBarTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  scrollContent: { padding: 16, paddingBottom: 40 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', paddingVertical: 12, borderRadius: 10, gap: 6,
  },
  tabActive: { backgroundColor: '#E8EAF6' },
  tabText: { fontSize: 14, color: '#999', fontWeight: '500' },
  tabTextActive: { color: '#5C6BC0' },
  topicScroll: { marginBottom: 16 },
  topicChip: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, marginRight: 8,
    gap: 6, borderWidth: 1, borderColor: '#E0E0E0',
  },
  topicChipActive: { backgroundColor: '#5C6BC0', borderColor: '#5C6BC0' },
  topicChipText: { fontSize: 13, color: '#666' },
  topicChipTextActive: { color: 'white' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { color: '#999' },
  emptyState: { alignItems: 'center', padding: 40 },
  emptyStateText: { fontSize: 18, fontWeight: '600', color: '#666', marginTop: 16 },
  emptyStateSubtext: { fontSize: 14, color: '#999', marginTop: 8, textAlign: 'center' },
  resourceCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'white',
    borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  teacherResourceCard: { borderLeftWidth: 4, borderLeftColor: '#4CAF50' },
  resourceIcon: {
    width: 56, height: 56, borderRadius: 12, backgroundColor: '#F5F5F5',
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  resourceContent: { flex: 1 },
  resourceTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 4 },
  resourceDescription: { fontSize: 13, color: '#666', lineHeight: 18, marginBottom: 6 },
  resourceMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resourceType: { fontSize: 12, color: '#999' },
  resourceTopic: { fontSize: 12, color: '#5C6BC0', fontWeight: '500' },
  downloadBadge: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#E8F5E9',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, gap: 4,
  },
  downloadBadgeText: { fontSize: 11, color: '#4CAF50', fontWeight: '500' },
  teacherBadge: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  teacherBadgeText: { fontSize: 11, color: '#4CAF50', fontWeight: '500' },
  infoCard: {
    flexDirection: 'row', backgroundColor: '#E8EAF6', borderRadius: 12,
    padding: 16, marginTop: 16, alignItems: 'center', gap: 12,
  },
  infoText: { flex: 1, fontSize: 13, color: '#5C6BC0', lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: 'white', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '90%', padding: 20,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 16, gap: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', flex: 1 },
  modalBody: { maxHeight: 500 },
  modalDescription: { fontSize: 15, color: '#666', lineHeight: 22, marginBottom: 16 },
  modalArticle: { fontSize: 15, color: '#333', lineHeight: 24 },
  pdfSection: { alignItems: 'center', marginVertical: 16 },
  pdfNotice: {
    alignItems: 'center', backgroundColor: '#FFF3E0', borderRadius: 16,
    padding: 24, marginBottom: 16, width: '100%',
  },
  pdfNoticeText: { marginTop: 12, fontSize: 14, color: '#666', textAlign: 'center' },
  downloadButton: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50',
    paddingHorizontal: 24, paddingVertical: 14, borderRadius: 30, gap: 8,
  },
  downloadButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  sharingInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 6 },
  sharingInfoText: { fontSize: 12, color: '#666' },
  ipDisclaimer: {
    fontSize: 10, fontStyle: 'italic', color: '#999', textAlign: 'center',
    marginTop: 16, lineHeight: 14, paddingHorizontal: 10,
  },
  ratingsSection: { marginTop: 24, borderTopWidth: 1, borderTopColor: '#E0E0E0', paddingTop: 20 },
  ratingsSummary: { marginBottom: 16 },
  ratingsTitle: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 8 },
  averageRating: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  averageRatingText: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  ratingsCount: { fontSize: 14, color: '#999', marginLeft: 4 },
  noRatingsText: { fontSize: 14, color: '#999' },
  rateButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E8EAF6', paddingVertical: 12, borderRadius: 12, gap: 8, marginBottom: 16,
  },
  rateButtonText: { color: '#5C6BC0', fontSize: 15, fontWeight: '600' },
  reviewsList: { marginTop: 8 },
  reviewCard: { backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginBottom: 8 },
  reviewHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  reviewStars: { flexDirection: 'row' },
  reviewDate: { fontSize: 12, color: '#999' },
  reviewComment: { fontSize: 14, color: '#666', lineHeight: 20 },
  ratingModalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  ratingModalContent: {
    backgroundColor: 'white', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340,
  },
  ratingModalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', textAlign: 'center', marginBottom: 20 },
  starRating: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 20 },
  interactiveStar: { padding: 6, borderRadius: 8 },
  ratingInput: {
    backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 15,
    color: '#333', minHeight: 80, textAlignVertical: 'top', marginBottom: 20,
  },
  ratingButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F5F5F5', alignItems: 'center' },
  cancelButtonText: { color: '#666', fontSize: 16, fontWeight: '600' },
  submitButton: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#5C6BC0', alignItems: 'center' },
  submitButtonDisabled: { backgroundColor: '#CCC' },
  submitButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});
