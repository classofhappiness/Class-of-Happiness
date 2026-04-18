import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useApp } from '../../src/context/AppContext';
import { adminApi, AdminStats, AdminAnalytics, classroomsApi, Classroom } from '../../src/utils/api';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Resource categories matching Teacher/Parent resource pages
const RESOURCE_CATEGORIES = [
  { id: 'emotions', name: 'Emotions', icon: 'mood', color: '#4CAF50' },
  { id: 'healthy_relationships', name: 'Healthy Relationships', icon: 'favorite', color: '#E91E63' },
  { id: 'leader_online', name: 'Leader Online', icon: 'computer', color: '#2196F3' },
  { id: 'you_are_what_you_eat', name: 'You Are What You Eat', icon: 'restaurant', color: '#FF9800' },
  { id: 'special_needs_education', name: 'Special Needs Education', icon: 'accessibility', color: '#9C27B0' },
  { id: 'general', name: 'General Resources', icon: 'folder', color: '#607D8B' },
];

const TARGET_AUDIENCES = [
  { id: 'teachers', name: 'Teachers', icon: 'school' },
  { id: 'parents', name: 'Parents', icon: 'family-restroom' },
  { id: 'both', name: 'Both', icon: 'groups' },
];

const PERIOD_OPTIONS = [
  { value: '1', label: 'Today' },
  { value: '7', label: '7 Days' },
  { value: '14', label: '14 Days' },
  { value: '30', label: '30 Days' },
];

const ZONE_COLORS: Record<string, string> = {
  blue: '#2196F3',
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

export default function AdminDashboard() {
  const router = useRouter();
  const { user, t, logout } = useApp();
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'resources' | 'users'>('overview');
  
  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filters
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  
  // Resource upload
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({
    title: '',
    description: '',
    content_type: 'text' as 'text' | 'pdf',
    content: '',
    pdf_filename: '',
    pdf_data: '',
    category: 'emotions',
    target_audience: 'both',
  });
  const [uploading, setUploading] = useState(false);
  
  // Export state
  const [exporting, setExporting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [statsData, analyticsData, classroomsData] = await Promise.all([
        adminApi.getStats(),
        adminApi.getAnalytics(selectedPeriod, selectedClassroom || undefined),
        classroomsApi.getAll(),
      ]);
      setStats(statsData);
      setAnalytics(analyticsData);
      setClassrooms(classroomsData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod, selectedClassroom]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'com.adobe.pdf', '.pdf'],
        copyToCacheDirectory: true,
      });
      
      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' as any });
        
        setUploadData(prev => ({
          ...prev,
          content_type: 'pdf',
          pdf_filename: file.name,
          pdf_data: base64,
        }));
      }
    } catch (error) {
      console.error('PDF picker error:', error);
      Alert.alert('Error', 'Failed to pick PDF file. Please try selecting a .pdf document again.');
    }
  };

  const handleUpload = async () => {
    if (!uploadData.title.trim()) {
      Alert.alert('Error', 'Please enter a title');
      return;
    }
    
    if (uploadData.content_type === 'text' && !uploadData.content.trim()) {
      Alert.alert('Error', 'Please enter content');
      return;
    }
    
    if (uploadData.content_type === 'pdf' && !uploadData.pdf_data) {
      Alert.alert('Error', 'Please select a PDF file');
      return;
    }
    
    setUploading(true);
    try {
      await adminApi.createResource({
        title: uploadData.title,
        description: uploadData.description,
        content_type: uploadData.content_type,
        content: uploadData.content_type === 'text' ? uploadData.content : undefined,
        pdf_filename: uploadData.pdf_filename || undefined,
        pdf_data: uploadData.pdf_data || undefined,
        category: uploadData.category,
        target_audience: uploadData.target_audience,
        topic: uploadData.category, // Also set topic for Teacher Resources compatibility
      });
      
      Alert.alert('Success', 'Resource uploaded successfully!');
      setShowUploadModal(false);
      setUploadData({
        title: '',
        description: '',
        content_type: 'text',
        content: '',
        pdf_filename: '',
        pdf_data: '',
        category: 'emotions',
        target_audience: 'both',
      });
      fetchData();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to upload resource');
    } finally {
      setUploading(false);
    }
  };

  const handleExport = async (type: string) => {
    setExporting(true);
    try {
      const data = await adminApi.exportData(type, 'json');
      Alert.alert(
        'Export Complete',
        `Exported ${data.count || data.data?.length || 0} ${type} records.\n\nIn a production app, this would download as a file.`
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  // Simple bar chart component
  const BarChart = ({ data, maxValue, color = '#4CAF50' }: { data: { label: string; value: number }[]; maxValue: number; color?: string }) => (
    <View style={styles.barChart}>
      {data.map((item, index) => (
        <View key={index} style={styles.barContainer}>
          <View style={styles.barWrapper}>
            <View
              style={[
                styles.bar,
                {
                  height: `${Math.max((item.value / maxValue) * 100, 2)}%`,
                  backgroundColor: color,
                },
              ]}
            />
          </View>
          <Text style={styles.barLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.barValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
          <MaterialIcons name="people" size={32} color="#1976D2" />
          <Text style={styles.statValue}>{stats?.total_users || 0}</Text>
          <Text style={styles.statLabel}>Total Users</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
          <MaterialIcons name="school" size={32} color="#388E3C" />
          <Text style={styles.statValue}>{stats?.total_teachers || 0}</Text>
          <Text style={styles.statLabel}>Teachers</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
          <MaterialIcons name="family-restroom" size={32} color="#F57C00" />
          <Text style={styles.statValue}>{stats?.total_parents || 0}</Text>
          <Text style={styles.statLabel}>Parents</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}>
          <MaterialIcons name="child-care" size={32} color="#7B1FA2" />
          <Text style={styles.statValue}>{stats?.total_students || 0}</Text>
          <Text style={styles.statLabel}>Students</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#FFEBEE' }]}>
          <MaterialIcons name="check-circle" size={32} color="#D32F2F" />
          <Text style={styles.statValue}>{stats?.total_checkins || 0}</Text>
          <Text style={styles.statLabel}>Check-ins</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#E0F7FA' }]}>
          <MaterialIcons name="library-books" size={32} color="#0097A7" />
          <Text style={styles.statValue}>{stats?.total_resources || 0}</Text>
          <Text style={styles.statLabel}>Resources</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setShowUploadModal(true)}
        >
          <MaterialIcons name="cloud-upload" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>Upload Resource</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: '#FF9800' }]}
          onPress={() => setActiveTab('analytics')}
        >
          <MaterialIcons name="analytics" size={24} color="#fff" />
          <Text style={styles.actionButtonText}>View Analytics</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Cards */}
      {analytics && (
        <>
          <Text style={styles.sectionTitle}>Period Summary ({selectedPeriod} days)</Text>
          <View style={styles.summaryCards}>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{analytics.summary.active_students}</Text>
              <Text style={styles.summaryLabel}>Active Students</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{analytics.summary.avg_checkins_per_student}</Text>
              <Text style={styles.summaryLabel}>Avg Check-ins/Student</Text>
            </View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryValue}>{analytics.summary.retention_rate}%</Text>
              <Text style={styles.summaryLabel}>Retention Rate</Text>
            </View>
          </View>
        </>
      )}
    </View>
  );

  const renderAnalyticsTab = () => (
    <View style={styles.tabContent}>
      {/* Period Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Period:</Text>
        <View style={styles.periodButtons}>
          {PERIOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                selectedPeriod === option.value && styles.periodButtonActive,
              ]}
              onPress={() => setSelectedPeriod(option.value)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === option.value && styles.periodButtonTextActive,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Classroom Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Classroom:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classroomScroll}>
          <TouchableOpacity
            style={[
              styles.classroomChip,
              !selectedClassroom && styles.classroomChipActive,
            ]}
            onPress={() => setSelectedClassroom(null)}
          >
            <Text style={[styles.classroomChipText, !selectedClassroom && styles.classroomChipTextActive]}>
              All
            </Text>
          </TouchableOpacity>
          {classrooms.map((classroom) => (
            <TouchableOpacity
              key={classroom.id}
              style={[
                styles.classroomChip,
                selectedClassroom === classroom.id && styles.classroomChipActive,
              ]}
              onPress={() => setSelectedClassroom(classroom.id)}
            >
              <Text style={[styles.classroomChipText, selectedClassroom === classroom.id && styles.classroomChipTextActive]}>
                {classroom.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {analytics && (
        <>
          {/* Zone Distribution */}
          <Text style={styles.chartTitle}>Zone Distribution</Text>
          <View style={styles.zoneDistribution}>
            {Object.entries(analytics.zone_distribution).map(([zone, count]) => (
              <View key={zone} style={styles.zoneItem}>
                <View style={[styles.zoneDot, { backgroundColor: ZONE_COLORS[zone] || '#999' }]} />
                <Text style={styles.zoneText}>{zone}: {count}</Text>
              </View>
            ))}
          </View>

          {/* Daily Check-ins Chart */}
          <Text style={styles.chartTitle}>Daily Check-ins</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={analytics.daily_checkins.slice(-7).map((d) => ({
                label: d.date.split('-').slice(1).join('/'),
                value: d.count,
              }))}
              maxValue={Math.max(...analytics.daily_checkins.map((d) => d.count), 1)}
              color="#4CAF50"
            />
          </View>

          {/* Classroom Comparison */}
          {analytics.classroom_stats.length > 0 && (
            <>
              <Text style={styles.chartTitle}>Classroom Comparison</Text>
              <View style={styles.classroomStatsContainer}>
                {analytics.classroom_stats.slice(0, 5).map((cls) => (
                  <View key={cls.id} style={styles.classroomStatRow}>
                    <View style={styles.classroomStatInfo}>
                      <Text style={styles.classroomStatName}>{cls.name}</Text>
                      <Text style={styles.classroomStatDetail}>
                        {cls.student_count} students · {cls.checkin_count} check-ins
                      </Text>
                    </View>
                    <View style={styles.classroomStatBar}>
                      <View
                        style={[
                          styles.classroomStatBarFill,
                          {
                            width: `${Math.min((cls.avg_per_student / 10) * 100, 100)}%`,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.classroomStatAvg}>{cls.avg_per_student}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Top Strategies */}
          {analytics.top_strategies.length > 0 && (
            <>
              <Text style={styles.chartTitle}>Top Strategies Used</Text>
              <View style={styles.strategiesList}>
                {analytics.top_strategies.slice(0, 5).map((strategy, index) => (
                  <View key={index} style={styles.strategyItem}>
                    <Text style={styles.strategyRank}>#{index + 1}</Text>
                    <Text style={styles.strategyName} numberOfLines={1}>{strategy.strategy}</Text>
                    <Text style={styles.strategyCount}>{strategy.count}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Export Section */}
          <Text style={styles.chartTitle}>Export Data</Text>
          <View style={styles.exportButtons}>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('checkins')}
              disabled={exporting}
            >
              <MaterialIcons name="download" size={20} color="#fff" />
              <Text style={styles.exportButtonText}>Check-ins</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('users')}
              disabled={exporting}
            >
              <MaterialIcons name="download" size={20} color="#fff" />
              <Text style={styles.exportButtonText}>Users</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.exportButton}
              onPress={() => handleExport('resources')}
              disabled={exporting}
            >
              <MaterialIcons name="download" size={20} color="#fff" />
              <Text style={styles.exportButtonText}>Resources</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const renderResourcesTab = () => (
    <View style={styles.tabContent}>
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => setShowUploadModal(true)}
      >
        <MaterialIcons name="add" size={24} color="#fff" />
        <Text style={styles.uploadButtonText}>Upload New Resource</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Resource Categories</Text>
      <View style={styles.categoriesGrid}>
        {RESOURCE_CATEGORIES.map((category) => (
          <View key={category.id} style={[styles.categoryCard, { borderLeftColor: category.color }]}>
            <MaterialIcons name={category.icon as any} size={28} color={category.color} />
            <Text style={styles.categoryName}>{category.name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Target Audiences</Text>
      <View style={styles.audienceInfo}>
        {TARGET_AUDIENCES.map((audience) => (
          <View key={audience.id} style={styles.audienceItem}>
            <MaterialIcons name={audience.icon as any} size={24} color="#666" />
            <Text style={styles.audienceText}>{audience.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderUsersTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>User Breakdown</Text>
      <View style={styles.userBreakdown}>
        <View style={styles.userTypeCard}>
          <MaterialIcons name="school" size={40} color="#1976D2" />
          <Text style={styles.userTypeCount}>{stats?.total_teachers || 0}</Text>
          <Text style={styles.userTypeLabel}>Teachers</Text>
        </View>
        <View style={styles.userTypeCard}>
          <MaterialIcons name="family-restroom" size={40} color="#388E3C" />
          <Text style={styles.userTypeCount}>{stats?.total_parents || 0}</Text>
          <Text style={styles.userTypeLabel}>Parents</Text>
        </View>
        <View style={styles.userTypeCard}>
          <MaterialIcons name="child-care" size={40} color="#F57C00" />
          <Text style={styles.userTypeCount}>{stats?.total_students || 0}</Text>
          <Text style={styles.userTypeLabel}>Students</Text>
        </View>
      </View>

      {analytics && analytics.user_growth.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>User Growth (Last {selectedPeriod} days)</Text>
          <View style={styles.chartContainer}>
            <BarChart
              data={analytics.user_growth.slice(-7).map((d) => ({
                label: d.date.split('-').slice(1).join('/'),
                value: d.new_users,
              }))}
              maxValue={Math.max(...analytics.user_growth.map((d) => d.new_users), 1)}
              color="#2196F3"
            />
          </View>
        </>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading admin dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Admin Dashboard</Text>
        <TouchableOpacity onPress={logout} style={styles.logoutButton}>
          <MaterialIcons name="logout" size={24} color="#F44336" />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {[
          { id: 'overview', icon: 'dashboard', label: 'Overview' },
          { id: 'analytics', icon: 'analytics', label: 'Analytics' },
          { id: 'resources', icon: 'folder', label: 'Resources' },
          { id: 'users', icon: 'people', label: 'Users' },
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id as any)}
          >
            <MaterialIcons
              name={tab.icon as any}
              size={20}
              color={activeTab === tab.id ? '#4CAF50' : '#999'}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'overview' && renderOverviewTab()}
        {activeTab === 'analytics' && renderAnalyticsTab()}
        {activeTab === 'resources' && renderResourcesTab()}
        {activeTab === 'users' && renderUsersTab()}
      </ScrollView>

      {/* Upload Modal */}
      <Modal
        visible={showUploadModal}
        animationType="slide"
        transparent={true}
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

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={uploadData.title}
                onChangeText={(text) => setUploadData((prev) => ({ ...prev, title: text }))}
                placeholder="Enter resource title"
              />

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={uploadData.description}
                onChangeText={(text) => setUploadData((prev) => ({ ...prev, description: text }))}
                placeholder="Enter description"
                multiline
                numberOfLines={3}
              />

              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categorySelector}>
                {RESOURCE_CATEGORIES.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categorySelectorItem,
                      uploadData.category === category.id && styles.categorySelectorItemActive,
                    ]}
                    onPress={() => setUploadData((prev) => ({ ...prev, category: category.id }))}
                  >
                    <MaterialIcons
                      name={category.icon as any}
                      size={20}
                      color={uploadData.category === category.id ? '#fff' : category.color}
                    />
                    <Text
                      style={[
                        styles.categorySelectorText,
                        uploadData.category === category.id && styles.categorySelectorTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Target Audience *</Text>
              <View style={styles.audienceSelector}>
                {TARGET_AUDIENCES.map((audience) => (
                  <TouchableOpacity
                    key={audience.id}
                    style={[
                      styles.audienceSelectorItem,
                      uploadData.target_audience === audience.id && styles.audienceSelectorItemActive,
                    ]}
                    onPress={() => setUploadData((prev) => ({ ...prev, target_audience: audience.id }))}
                  >
                    <MaterialIcons
                      name={audience.icon as any}
                      size={20}
                      color={uploadData.target_audience === audience.id ? '#fff' : '#666'}
                    />
                    <Text
                      style={[
                        styles.audienceSelectorText,
                        uploadData.target_audience === audience.id && styles.audienceSelectorTextActive,
                      ]}
                    >
                      {audience.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>Content Type *</Text>
              <View style={styles.contentTypeSelector}>
                <TouchableOpacity
                  style={[
                    styles.contentTypeButton,
                    uploadData.content_type === 'text' && styles.contentTypeButtonActive,
                  ]}
                  onPress={() => setUploadData((prev) => ({ ...prev, content_type: 'text' }))}
                >
                  <MaterialIcons
                    name="article"
                    size={20}
                    color={uploadData.content_type === 'text' ? '#fff' : '#666'}
                  />
                  <Text
                    style={[
                      styles.contentTypeText,
                      uploadData.content_type === 'text' && styles.contentTypeTextActive,
                    ]}
                  >
                    Text
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.contentTypeButton,
                    uploadData.content_type === 'pdf' && styles.contentTypeButtonActive,
                  ]}
                  onPress={() => setUploadData((prev) => ({ ...prev, content_type: 'pdf' }))}
                >
                  <MaterialIcons
                    name="picture-as-pdf"
                    size={20}
                    color={uploadData.content_type === 'pdf' ? '#fff' : '#666'}
                  />
                  <Text
                    style={[
                      styles.contentTypeText,
                      uploadData.content_type === 'pdf' && styles.contentTypeTextActive,
                    ]}
                  >
                    PDF
                  </Text>
                </TouchableOpacity>
              </View>

              {uploadData.content_type === 'text' ? (
                <>
                  <Text style={styles.inputLabel}>Content *</Text>
                  <TextInput
                    style={[styles.input, styles.contentArea]}
                    value={uploadData.content}
                    onChangeText={(text) => setUploadData((prev) => ({ ...prev, content: text }))}
                    placeholder="Enter content text..."
                    multiline
                    numberOfLines={6}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.inputLabel}>PDF File *</Text>
                  <TouchableOpacity style={styles.pdfPicker} onPress={handlePickPDF}>
                    <MaterialIcons
                      name={uploadData.pdf_filename ? 'check-circle' : 'cloud-upload'}
                      size={32}
                      color={uploadData.pdf_filename ? '#4CAF50' : '#999'}
                    />
                    <Text style={styles.pdfPickerText}>
                      {uploadData.pdf_filename || 'Tap to select PDF file'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowUploadModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, uploading && styles.submitButtonDisabled]}
                onPress={handleUpload}
                disabled={uploading}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitButtonText}>Upload</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  logoutButton: {
    padding: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#4CAF50',
  },
  tabText: {
    fontSize: 12,
    color: '#999',
  },
  tabTextActive: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  tabContent: {
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    width: (SCREEN_WIDTH - 56) / 3,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryCards: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  filterRow: {
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  periodButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  periodButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  periodButtonText: {
    fontSize: 14,
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  classroomScroll: {
    flexGrow: 0,
  },
  classroomChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
  },
  classroomChipActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  classroomChipText: {
    fontSize: 14,
    color: '#666',
  },
  classroomChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  zoneDistribution: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  zoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoneDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  zoneText: {
    fontSize: 14,
    color: '#333',
    textTransform: 'capitalize',
  },
  chartContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    height: 200,
  },
  barChart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
  },
  barContainer: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  barWrapper: {
    flex: 1,
    width: '60%',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 4,
  },
  barValue: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333',
  },
  classroomStatsContainer: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  classroomStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  classroomStatInfo: {
    flex: 1,
  },
  classroomStatName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  classroomStatDetail: {
    fontSize: 12,
    color: '#666',
  },
  classroomStatBar: {
    width: 80,
    height: 8,
    backgroundColor: '#eee',
    borderRadius: 4,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  classroomStatBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  classroomStatAvg: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    width: 40,
    textAlign: 'right',
  },
  strategiesList: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  strategyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  strategyRank: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
    width: 30,
  },
  strategyName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  strategyCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginBottom: 24,
  },
  uploadButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  categoryCard: {
    width: (SCREEN_WIDTH - 56) / 2,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryName: {
    flex: 1,
    fontSize: 14,
    color: '#333',
  },
  audienceInfo: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
  },
  audienceItem: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  audienceText: {
    fontSize: 14,
    color: '#333',
  },
  userBreakdown: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  userTypeCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  userTypeCount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  userTypeLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalScroll: {
    padding: 16,
    maxHeight: 500,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  contentArea: {
    height: 120,
    textAlignVertical: 'top',
  },
  categorySelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categorySelectorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
    gap: 6,
  },
  categorySelectorItemActive: {
    backgroundColor: '#4CAF50',
  },
  categorySelectorText: {
    fontSize: 12,
    color: '#666',
  },
  categorySelectorTextActive: {
    color: '#fff',
  },
  audienceSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  audienceSelectorItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  audienceSelectorItemActive: {
    backgroundColor: '#4CAF50',
  },
  audienceSelectorText: {
    fontSize: 14,
    color: '#666',
  },
  audienceSelectorTextActive: {
    color: '#fff',
  },
  contentTypeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  contentTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    gap: 8,
  },
  contentTypeButtonActive: {
    backgroundColor: '#4CAF50',
  },
  contentTypeText: {
    fontSize: 14,
    color: '#666',
  },
  contentTypeTextActive: {
    color: '#fff',
  },
  pdfPicker: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  pdfPickerText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  modalActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
