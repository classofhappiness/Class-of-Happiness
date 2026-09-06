import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView, KeyboardAvoidingView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Platform,
  Linking,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';
import {
  teacherResourcesApi,
  TeacherResource,
  TeacherResourceTopic,
  TeacherResourceRating,
} from '../../src/utils/api';
import { orderPrimaryTopicsFirst } from '../../src/constants/resourceTopics';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

export default function TeacherResourcesScreen() {
  const router = useRouter();
  const navigation = useNavigation() as any;
  useEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  const { user, t } = useApp();
  
  // Real feature Aug 28: fixed order for the 4 primary categories (Emotions, Healthy
  // Relationships, Leader Online, You Are What You Eat), confirmed with Jono before building
  // - reordered here rather than hand-listing them first, so the portal and every app screen
  // stay in sync from one shared source of truth. Every other existing topic still follows,
  // unchanged - this only changes ORDER, not which topics exist or are selectable.
  const TOPICS = orderPrimaryTopicsFirst([
    { id: 'general', name: t('general_topic') || 'General', icon: 'apps' },
    { id: 'emotions_program', name: t('emotions_topic') || 'Emotions Program', icon: 'mood' },
    { id: 'healthy_relationships', name: t('healthy_relationships') || 'Healthy Relationships', icon: 'favorite' },
    { id: 'leader_online', name: t('leader_online') || 'Leader Online', icon: 'computer' },
    { id: 'you_are_what_you_eat', name: t('you_are_what_you_eat') || 'You Are What You Eat', icon: 'restaurant' },
    { id: 'special_needs_education', name: t('special_needs_education') || 'Special Needs', icon: 'accessibility' },
    { id: 'teacher_hub', name: t('teacher_hub') || 'Teacher Hub', icon: 'groups' },
    { id: 'parent_hub', name: t('parent_hub') || 'Parent Hub', icon: 'family-restroom' },
  ]);
  
  const [selectedTopic, setSelectedTopic] = useState(TOPICS[0].id);
  const [bannerDismissed, setBannerDismissed] = useState(false);
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

  // Real fix Aug 26 (item 1, silent role auto-sync): removed - this silently overwrote the
  // account's real role field to 'teacher' every time this screen mounted, no confirmation.
  // See parent/dashboard.tsx for the full reasoning. Role now only changes via an explicit
  // "Switch account type" action in Settings, with confirmation.

  const fetchResources = async () => {
    try {
      // Fetch all teacher resources + own uploads (in case is_active filter misses them)
      const token = await AsyncStorage.getItem('session_token');
      const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const [data, myUploads] = await Promise.all([
        teacherResourcesApi.getAll(selectedTopic || undefined, 'teachers'),
        fetch(`${BURL}/api/teacher-resources/my-uploads`, {
          headers: { Authorization: `Bearer ${token || ''}` }
        }).then(r => r.ok ? r.json() : []).catch(() => []),
      ]);
      // Merge, dedup by id
      const seen = new Set(data.map((r: any) => r.id));
      let merged: any[] = [...data, ...(Array.isArray(myUploads) ? myUploads.filter((r: any) => !seen.has(r.id)) : [])];
      // Real bug fix Aug 30: this screen never sorted resources at all - raw, unspecified
      // fetch order, same architectural gap found and fixed in parent/resources.tsx (item 2,
      // Aug 29). Teacher's own fetch already deduped correctly (the "seen" Set above), so
      // only the missing sort applies here. Matches the portal's own real-data sort: any
      // topic where at least one resource carries a real week_number sorts by week ascending
      // (999 sentinel for null/0, order_index as tiebreak); everything else falls back to a
      // plain order_index sort.
      const weekSortable = merged.some((r: any) => r.week_number != null && r.week_number > 0);
      if (weekSortable) {
        merged = merged.slice().sort((a: any, b: any) => {
          const wa = (a.week_number != null && a.week_number > 0) ? a.week_number : 999;
          const wb = (b.week_number != null && b.week_number > 0) ? b.week_number : 999;
          if (wa !== wb) return wa - wb;
          return (a.order_index || 0) - (b.order_index || 0);
        });
      } else {
        merged = merged.slice().sort((a: any, b: any) => (a.order_index || 0) - (b.order_index || 0));
      }
      const userId = user?.user_id || '';
      // Real bug fixed Aug 14: this previously computed "merged" (data + my-uploads fallback)
      // above but then only ever used "data" here, silently discarding the fallback that was
      // specifically built to catch resources the main query missed — e.g. a just-created
      // upload not yet visible. Now actually uses the merged list.
      setResources(Array.isArray(merged) ? merged.map((r: any) => ({ ...r, uploaded_by_me: r.user_id === userId || r.created_by === userId })) : []);
    } catch (error) {
      console.error('Error fetching resources:', error);
      // Try without topic filter as fallback
      try {
        const fallback = await teacherResourcesApi.getAll(undefined, 'teachers');
        setResources(Array.isArray(fallback) ? fallback : []);
      } catch { setResources([]); }
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
            encoding: 'base64',
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
          Alert.alert(t('error') || 'Error', t('pdf_read_error') || 'Could not read PDF file. Please try again.');
          return;
        }

        setUploadData({
          ...uploadData,
          content: base64,
          pdf_filename: file.name,
          title: uploadData.title || file.name.replace('.pdf', ''),
        });

        Alert.alert('✅ ' + (t('selected_title') || 'Selected'), (t('ready_to_upload') || 'Ready to upload: {name}').replace('{name}', file.name));
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert(t('error') || 'Error', t('pick_document_error') || 'Failed to pick document');
    }
  };

  const handleUpload = async () => {
    if (!uploadData.title.trim()) {
      Alert.alert(t('error') || 'Error', t('enter_title_prompt') || 'Please enter a title');
      return;
    }
    if (!uploadData.description.trim()) {
      Alert.alert(t('error') || 'Error', t('enter_description_prompt') || 'Please enter a description');
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
        target_audience: uploadData.audience || 'teachers',
        audience: uploadData.audience || 'teachers',
      };

      if (uploadData.content && uploadData.pdf_filename) {
        // Limit PDF size to 1.5MB base64 (~1MB file)
        if (uploadData.content.length > 2000000) {
          Alert.alert(t('file_too_large_title') || 'File Too Large', t('pdf_too_large_desc') || 'Please use a PDF under 1MB. Tip: compress it at smallpdf.com first.');
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
      Alert.alert('✅ ' + (t('success') || 'Success'), t('resource_uploaded_success') || 'Resource uploaded successfully!');
      setLoading(true);
      await fetchResources();
      setShowUploadModal(false);
      setUploadData({ title: '', description: '', content: '', pdf_filename: '', audience: 'teachers' });
      fetchResources();
    } catch (error: any) {
      const msg = error.message || (t('upload_resource_error') || 'Failed to upload resource');
      if (msg.includes('too large') || msg.includes('413')) {
        Alert.alert(t('file_too_large_title') || 'File Too Large', t('compress_pdf_desc') || 'Please compress your PDF first at smallpdf.com');
      } else {
        Alert.alert(t('upload_failed_title') || 'Upload Failed', msg);
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
      Alert.alert(t('error') || 'Error', t('no_pdf_available') || 'No PDF available for download');
      return;
    }

    setDownloading(true);
    
    try {
      // Use the download endpoint. Real bug fixed Aug 14: FileSystem.downloadAsync sends a
      // plain GET with no Authorization header at all, so this always 401'd. The backend's
      // get_current_user() already supports a token-as-query-param fallback specifically
      // for this case — append it here rather than relying on a header that never arrives.
      const dlToken = await AsyncStorage.getItem('session_token');
      const pdfUrl = `${BACKEND_URL}/api/teacher-resources/${resource.id}/download?token=${encodeURIComponent(dlToken || '')}`;
      const filename = resource.pdf_filename || `${resource.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;
      
      console.log('Teacher resource download URL:', pdfUrl);
      
      if (Platform.OS === 'web') {
        // Web: Open in new tab
        Linking.openURL(pdfUrl);
      } else {
        // Use unique filename to avoid 'destination already exists' error
        const timestamp = Date.now();
        const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const localUri = `${(FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory}${timestamp}_${safeFilename}`;
        
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
          Alert.alert(t('success') || 'Success', t('pdf_downloaded_success') || 'PDF downloaded successfully to your device');
        }
      }
    } catch (error: any) {
      console.error('Download error:', error);
      Alert.alert(
        t('download_error') || 'Download Error',
        (t('pdf_download_error_detail') || 'Failed to download PDF: {error}. Please check your internet connection.').replace('{error}', error.message || (t('unknown_error') || 'Unknown error'))
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleSubmitRating = async () => {
    if (userRating === 0) {
      Alert.alert(t('error') || 'Error', t('select_star_rating') || 'Please select a star rating');
      return;
    }

    if (!selectedResource) return;

    setSubmittingRating(true);
    try {
      await teacherResourcesApi.rate(selectedResource.id, userRating, userComment.trim() || undefined);
      Alert.alert(t('success') || 'Success', t('rating_submitted_excl') || 'Rating submitted!');
      setShowRatingModal(false);
      fetchResources();
    } catch (error: any) {
      Alert.alert(t('error') || 'Error', error.message || (t('rating_submit_error') || 'Failed to submit rating'));
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
            color={interactive ? (i <= rating ? '#FFD700' : '#E0E0E0') : '#FFD700'}
          />
        </TouchableOpacity>
      );
    }
    return <View style={styles.starsContainer}>{stars}</View>;
  };

  const currentTopic = TOPICS.find(t => t.id === selectedTopic);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <SafeAreaView style={styles.container}>
      {/* Header with back button */}
      {/* Real bug fix Aug 28 (item 3): this screen imported TranslatedHeader (which is where
          the COH logo actually comes from - see its own logo Image) but never once rendered
          it - it has always used this separate, custom-built top bar instead, which never had
          a logo of its own. Added directly here rather than swapping in TranslatedHeader
          wholesale, to avoid changing this bar's existing back/title/home layout - same real
          asset and sizing TranslatedHeader itself uses, for visual consistency. */}
      <View style={styles.resourcesTopBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.resourcesBackBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Image
          source={require('../../assets/images/logo_coh.png')}
          style={{ width: 24, height: 24, marginRight: 8 }}
          resizeMode="contain"
        />
        <Text style={styles.resourcesTopBarTitle}>{t('teacher_resources') || 'Teacher Resources'}</Text>
        <TouchableOpacity onPress={() => router.replace('/teacher/dashboard')} style={{ padding: 6, width: 40, alignItems: 'center' }}>
          <MaterialIcons name="home" size={22} color="#333" />
        </TouchableOpacity>
      </View>

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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5C6BC0" colors={['#5C6BC0']} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.headerTitle}>{currentTopic?.name}</Text>
              <Text style={styles.headerSubtitle}>
                {resources.length === 1
                  ? (t('resources_available_count_one') || '1 resource available')
                  : (t('resources_available_count_other') || '{count} resources available').replace('{count}', String(resources.length))}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.uploadButton}
              onPress={() => setShowUploadModal(true)}
            >
              <MaterialIcons name="cloud-upload" size={20} color="white" />
              <Text style={styles.uploadButtonText}>{t('upload_label') || 'Upload'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Freemium notice banner — dismissible, reappears each visit unless subscribed */}
        {!bannerDismissed && !(user?.subscription_status === 'active' || user?.subscription_status === 'trial') && (
          <View style={{ backgroundColor: '#FFF8E1', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FFE082', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialIcons name="info" size={20} color="#F9A825" />
            <Text style={{ flex: 1, fontSize: 12, color: '#5D4037', lineHeight: 17 }}>
              {t('freemium_banner_desc') || "The Emotion Program is completely free! Every other program's first 2 weeks are free too — subscribe to unlock everything."}
            </Text>
            <TouchableOpacity onPress={() => setBannerDismissed(true)} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color="#8D6E63" />
            </TouchableOpacity>
          </View>
        )}

        {/* Resources List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>{t('loading_resources') || 'Loading resources...'}</Text>
          </View>
        ) : resources.length === 0 ? (
          // Real feature Aug 28, broadened Aug 29 (item 4): originally gated to only the 4
          // primary topics - Jono explicitly confirmed this should apply to ANY topic with
          // zero real resources. Driven entirely by real data (this topic currently has 0
          // resources) - disappears automatically the moment one is uploaded.
          <View style={styles.emptyState}>
            <Image
              source={require('../../assets/images/logo_coh.png')}
              style={{ width: 64, height: 64, opacity: 0.5 }}
              resizeMode="contain"
            />
            <Text style={[styles.emptyStateText, { fontStyle: 'italic' }]}>
              {t('coming_soon') || 'Coming soon'}
            </Text>
          </View>
        ) : (
          resources.map((resource) => (
            <TouchableOpacity
              key={resource.id}
              style={[styles.resourceCard, (resource as any).is_locked && { opacity: 0.65 }]}
              onPress={() => {
                if ((resource as any).is_locked) {
                  Alert.alert(
                    '🔒 ' + (t('subscribe_to_unlock_title') || 'Subscribe to Unlock'),
                    t('freemium_banner_desc') || "The Emotion Program is completely free! Every other program's first 2 weeks are free too — subscribe to unlock everything.",
                    [
                      { text: t('not_now') || 'Not Now', style: 'cancel' },
                      { text: t('see_plans') || 'See Plans', onPress: () => router.push('/subscription') },
                    ]
                  );
                  return;
                }
                handleViewResource(resource);
              }}
            >
              <View style={styles.resourceIcon}>
                <MaterialIcons name={(resource as any).is_locked ? 'lock' : 'picture-as-pdf'} size={32} color={(resource as any).is_locked ? '#AAA' : '#F44336'} />
              </View>
              <View style={styles.resourceContent}>
                <Text style={styles.resourceTitle}>{resource.title}</Text>
                <Text style={styles.resourceDescription} numberOfLines={2}>
                  {resource.description}
                </Text>
                {(resource as any).is_locked ? (
                  <Text style={{ fontSize: 12, color: '#999', fontWeight: '600', marginTop: 2 }}>🔒 {t('subscribe_to_unlock') || 'Subscribe to unlock'}</Text>
                ) : (
                <View style={styles.resourceMeta}>
                  {renderStars(resource.average_rating)}
                  <Text style={styles.ratingText}>
                    {resource.average_rating.toFixed(1)} ({resource.total_ratings})
                  </Text>
                </View>
                )}
                <Text style={styles.uploadedBy}>
                  {/* Real bug fix Aug 28 (items 4/7): fell back to the generic word "Teacher"
                      whenever created_by_name was missing, regardless of who actually
                      uploaded it - confirmed live this mislabels real COH-admin-curated
                      content (Emotions Program, Healthy Relationships) as if a random
                      teacher had made it. All real admin-curated resources are is_global
                      (confirmed: superadmin uploads always set this), so that's the correct
                      signal to distinguish "COH App Admin" from a genuinely
                      teacher/school_admin-uploaded resource lacking a captured name. */}
                  {t('by') || 'By'} {resource.created_by_name || (resource.is_global ? (t('coh_app_admin') || 'COH App Admin') : (t('teacher') || 'Teacher'))}
                  {resource.uploaded_by_me && (
                    <TouchableOpacity
                      onPress={async () => {
                        Alert.alert(
                          t('delete') || 'Delete',
                          t('confirm_delete_resource') || 'Delete this resource?',
                          [
                            { text: t('cancel') || 'Cancel', style: 'cancel' },
                            { text: t('delete') || 'Delete', style: 'destructive', onPress: async () => {
                              try {
                                await teacherResourcesApi.delete(resource.id);
                                await fetchResources();
                              } catch (e) {
                                Alert.alert(t('error') || 'Error', t('could_not_delete_resource') || 'Could not delete resource');
                              }
                            }}
                          ]
                        );
                      }}
                      style={{ marginTop: 4 }}
                    >
                      <Text style={{ fontSize: 12, color: '#F44336', fontWeight: '600' }}>🗑️ {t('delete') || 'Delete'}</Text>
                    </TouchableOpacity>
                  )}
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
              <Text style={styles.modalTitle}>{t('upload_resource_title') || 'Upload Resource'}</Text>
              <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>{t('title_label') || 'Title'}</Text>
              <TextInput
                style={styles.textInput}
                value={uploadData.title}
                onChangeText={(text) => setUploadData({ ...uploadData, title: text })}
                placeholder={t('resource_title_placeholder') || 'Resource title'}
              />

              <Text style={styles.inputLabel}>{t('description_label') || 'Description'}</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                value={uploadData.description}
                onChangeText={(text) => setUploadData({ ...uploadData, description: text })}
                placeholder={t('resource_desc_placeholder') || 'Brief description of this resource...'}
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>{t('pdf_file_label') || 'PDF File'}</Text>
              <TouchableOpacity style={styles.filePickerButton} onPress={handlePickDocument}>
                <MaterialIcons name="attach-file" size={24} color="#5C6BC0" />
                <Text style={styles.filePickerText}>
                  {uploadData.pdf_filename || (t('select_pdf') || 'Select PDF file')}
                </Text>
              </TouchableOpacity>

              {/* Audience Selector */}
              <Text style={styles.inputLabel}>{t('share_toggle_label') || 'Share'}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                {[
                  { id: 'teachers', label: '👩‍🏫 ' + (t('audience_teachers') || 'Teachers') },
                  { id: 'parents', label: '👨‍👩‍👧 ' + (t('audience_parents') || 'Parents') },
                  { id: 'both', label: '🌐 ' + (t('audience_both') || 'Both') },
                  { id: 'admin', label: '🔐 ' + (t('audience_admin_review') || 'Admin Review') },
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
                {t('topic_label') || 'Topic:'} <Text style={styles.topicValue}>{currentTopic?.name}</Text>
              </Text>

              <TouchableOpacity
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}
              >
                <Text style={styles.submitButtonText}>
                  {uploading ? (t('uploading') || 'Uploading...') : (t('upload_resource_btn') || 'Upload Resource')}
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
                <Text style={styles.rateSectionTitle}>{t('research_basis') || 'Rate'}</Text>
                <View style={styles.starRating}>
                  {renderStars(userRating, 40, true)}
                </View>
                
                <Text style={styles.inputLabel}>{t('comment_optional_max_chars') || 'Comment (optional, max 100 chars)'}</Text>
                <TextInput
                  style={styles.textInput}
                  value={userComment}
                  onChangeText={(text) => setUserComment(text.slice(0, 100))}
                  placeholder={t('share_feedback_placeholder') || 'Share your feedback...'}
                  maxLength={100}
                />
                <Text style={styles.charCounter}>{userComment.length}/100</Text>

                <TouchableOpacity
                  style={[styles.submitButton, submittingRating && styles.submitButtonDisabled]}
                  onPress={handleSubmitRating}
                  disabled={submittingRating}
                >
                  <Text style={styles.submitButtonText}>
                    {submittingRating ? (t('submitting') || 'Submitting...') : (t('submit_rating_btn') || 'Submit Rating')}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Previous Ratings */}
              {ratings.length > 0 && (
                <View style={styles.ratingsSection}>
                  <Text style={styles.rateSectionTitle}>{t('reviews_section_title') || 'Reviews'}</Text>
                  {ratings.map((rating) => (
                    <View key={rating.id} style={styles.ratingItem}>
                      <View style={styles.ratingHeader}>
                        <Text style={styles.ratingUser}>{rating.user_name || (t('teacher') || 'Teacher')}</Text>
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
                      {downloading ? (t('preparing') || 'Preparing...') : (t('download_report') || 'Download & Share PDF')}
                    </Text>
                  </TouchableOpacity>

                  {/* Sharing options info */}
                  <View style={styles.sharingInfo}>
                    <MaterialIcons name="share" size={16} color="#666" />
                    <Text style={styles.sharingInfoText}>
                      {t('sharing_info_text') || 'Save to phone, email, Google Drive, WhatsApp & more'}
                    </Text>
                  </View>

                  {/* IP Disclaimer */}
                  <Text style={styles.ipDisclaimer}>
                    {(t('ip_disclaimer_extended') || '© {year} Class of Happiness. All rights reserved. This material is protected intellectual property. Unauthorized reproduction, distribution, or commercial use is strictly prohibited.').replace('{year}', String(new Date().getFullYear()))}
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
                <Text style={styles.rateButtonText}>{t('research_basis') || 'Rate'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  resourcesTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 20,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  resourcesBackBtn: { padding: 4 },
  resourcesTopBarTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  tabsWrapper: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 4,
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
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    width: '100%',
    maxWidth: 480,
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
