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
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { resourcesApi, teacherResourcesApi, Resource, TeacherResource } from '../../src/utils/api';
import { useApp } from '../../src/context/AppContext';

const TOPICS = [
  { id: 'all', name: 'All', icon: 'apps' as const },
  { id: 'emotions', name: 'Emotions', icon: 'mood' as const },
  { id: 'healthy_relationships', name: 'Healthy Relationships', icon: 'people' as const },
  { id: 'leader_online', name: 'Leader Online', icon: 'computer' as const },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat', icon: 'restaurant' as const },
  { id: 'special_needs', name: 'Special Needs', icon: 'accessibility' as const },
];

export default function ResourcesScreen() {
  const router = useRouter();
  const { t } = useApp();
  const [resources, setResources] = useState<Resource[]>([]);
  const [teacherResources, setTeacherResources] = useState<TeacherResource[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'teacher'>('general');
  const [selectedTopic, setSelectedTopic] = useState('all');

  const fetchResources = async () => {
    try {
      const [generalData, teacherData] = await Promise.all([
        resourcesApi.getAll(),
        teacherResourcesApi.getAll()
      ]);
      setResources(generalData);
      setTeacherResources(teacherData);
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
    setSelectedResource(resource as Resource);
  };

  // Filter resources by topic
  const filteredTeacherResources = selectedTopic === 'all' 
    ? teacherResources 
    : teacherResources.filter(r => r.topic === selectedTopic);

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
          <MaterialIcons name="library-books" size={48} color="#5C6BC0" />
          <Text style={styles.headerTitle}>{t('resources')}</Text>
          <Text style={styles.headerSubtitle}>
            Articles and guides for emotional development
          </Text>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'general' && styles.tabActive]}
            onPress={() => setActiveTab('general')}
          >
            <MaterialIcons name="library-books" size={20} color={activeTab === 'general' ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'general' && styles.tabTextActive]}>
              General
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'teacher' && styles.tabActive]}
            onPress={() => setActiveTab('teacher')}
          >
            <MaterialIcons name="school" size={20} color={activeTab === 'teacher' ? '#5C6BC0' : '#999'} />
            <Text style={[styles.tabText, activeTab === 'teacher' && styles.tabTextActive]}>
              From Teacher ({teacherResources.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Topic Filter - Show for both tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.topicScroll}>
          {TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.id}
              style={[
                styles.topicChip,
                selectedTopic === topic.id && styles.topicChipActive
              ]}
              onPress={() => setSelectedTopic(topic.id)}
            >
              <MaterialIcons 
                name={topic.icon} 
                size={16} 
                color={selectedTopic === topic.id ? 'white' : '#666'} 
              />
              <Text style={[
                styles.topicChipText,
                selectedTopic === topic.id && styles.topicChipTextActive
              ]}>
                {topic.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Resources List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading resources...</Text>
          </View>
        ) : activeTab === 'general' ? (
          resources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="folder-open" size={64} color="#CCC" />
              <Text style={styles.emptyStateText}>No resources available yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Check back later for helpful articles and guides
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
                  <MaterialIcons
                    name={resource.content_type === 'pdf' ? 'picture-as-pdf' : 'article'}
                    size={32}
                    color={resource.content_type === 'pdf' ? '#F44336' : '#5C6BC0'}
                  />
                </View>
                <View style={styles.resourceContent}>
                  <Text style={styles.resourceTitle}>{resource.title}</Text>
                  <Text style={styles.resourceDescription} numberOfLines={2}>
                    {resource.description}
                  </Text>
                  <Text style={styles.resourceType}>
                    {resource.content_type === 'pdf' ? 'PDF Document' : 'Article'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#CCC" />
              </TouchableOpacity>
            ))
          )
        ) : (
          filteredTeacherResources.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="school" size={64} color="#CCC" />
              <Text style={styles.emptyStateText}>No teacher resources yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Your child's teacher will share resources here
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
                  <Text style={styles.resourceDescription} numberOfLines={2}>
                    {resource.description}
                  </Text>
                  <Text style={styles.resourceTopic}>
                    {TOPICS.find(t => t.id === resource.topic)?.name || resource.topic}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#CCC" />
              </TouchableOpacity>
            ))
          )
        )}

        {/* Info Card */}
        <View style={styles.infoCard}>
          <MaterialIcons name="info" size={24} color="#5C6BC0" />
          <Text style={styles.infoText}>
            These resources are provided to help you support your child's emotional development at home.
          </Text>
        </View>
      </ScrollView>

      {/* Resource Detail Modal */}
      <Modal
        visible={!!selectedResource}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedResource(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedResource?.title}</Text>
              <TouchableOpacity onPress={() => setSelectedResource(null)}>
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                {selectedResource?.description}
              </Text>
              
              {selectedResource?.content_type === 'text' && selectedResource?.content && (
                <Text style={styles.modalArticle}>
                  {selectedResource.content}
                </Text>
              )}
              
              {selectedResource?.content_type === 'pdf' && (
                <View style={styles.pdfNotice}>
                  <MaterialIcons name="picture-as-pdf" size={48} color="#F44336" />
                  <Text style={styles.pdfNoticeText}>
                    PDF Document: {selectedResource.pdf_filename || 'document.pdf'}
                  </Text>
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
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
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
    paddingHorizontal: 40,
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
    backgroundColor: '#F5F5F5',
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
    fontSize: 14,
    color: '#666',
    marginTop: 4,
    lineHeight: 20,
  },
  resourceType: {
    fontSize: 12,
    color: '#999',
    marginTop: 6,
    textTransform: 'uppercase',
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: '#E8EAF6',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#5C6BC0',
    lineHeight: 20,
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
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    paddingRight: 16,
  },
  modalBody: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  modalArticle: {
    fontSize: 16,
    color: '#333',
    lineHeight: 26,
  },
  pdfNotice: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFF3F3',
    borderRadius: 12,
  },
  pdfNoticeText: {
    fontSize: 14,
    color: '#666',
    marginTop: 12,
  },
  // Tab styles
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    gap: 6,
  },
  tabActive: {
    backgroundColor: '#E8EAF6',
  },
  tabText: {
    fontSize: 14,
    color: '#999',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#5C6BC0',
    fontWeight: '600',
  },
  // Topic filter styles
  topicScroll: {
    marginBottom: 16,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    marginRight: 8,
    gap: 6,
  },
  topicChipActive: {
    backgroundColor: '#5C6BC0',
  },
  topicChipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  topicChipTextActive: {
    color: 'white',
  },
  // Teacher resource styles
  teacherResourceCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  teacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  teacherBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
  },
  resourceTopic: {
    fontSize: 11,
    color: '#4CAF50',
    marginTop: 6,
    textTransform: 'capitalize',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
});
