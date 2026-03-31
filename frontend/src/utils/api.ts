import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Backend URL from environment variable - required for all deployments
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
if (!BACKEND_URL) {
  console.warn('EXPO_PUBLIC_BACKEND_URL not configured, using fallback for development');
}
const API_URL = `${BACKEND_URL || ''}/api`;

// Store session token for mobile auth
let sessionToken: string | null = null;
let tokenInitialized = false;

export async function setSessionToken(token: string | null) {
  console.log('[API] Setting session token:', token ? 'token present' : 'null');
  sessionToken = token;
  tokenInitialized = true;
  if (token) {
    await AsyncStorage.setItem('session_token', token);
  } else {
    await AsyncStorage.removeItem('session_token');
  }
}

export async function getSessionToken(): Promise<string | null> {
  // If we have a token in memory, return it
  if (sessionToken) {
    return sessionToken;
  }
  
  // If not initialized yet, load from storage
  if (!tokenInitialized) {
    try {
      sessionToken = await AsyncStorage.getItem('session_token');
      tokenInitialized = true;
      console.log('[API] Loaded token from storage:', sessionToken ? 'token present' : 'null');
    } catch (error) {
      console.error('[API] Error loading token from storage:', error);
      tokenInitialized = true;
    }
  }
  
  return sessionToken;
}

// Initialize token on module load (non-blocking)
export async function initializeSessionToken(): Promise<void> {
  if (tokenInitialized) return;
  await getSessionToken();
}

export async function clearSessionToken() {
  console.log('[API] Clearing session token');
  sessionToken = null;
  tokenInitialized = true;
  await AsyncStorage.removeItem('session_token');
}

export interface User {
  user_id: string;
  email: string;
  name: string;
  picture?: string;
  role: string;
  language: string;
  subscription_status: string;
  subscription_plan?: string;
  subscription_expires_at?: string;
  trial_started_at?: string;
  created_at: string;
}

export interface Student {
  id: string;
  name: string;
  avatar_type: 'preset' | 'custom';
  avatar_preset?: string;
  avatar_custom?: string;
  classroom_id?: string;
  user_id?: string;
  created_at: string;
}

export interface Classroom {
  id: string;
  name: string;
  teacher_name?: string;
  user_id?: string;
  created_at: string;
}

export interface ZoneLog {
  id: string;
  student_id: string;
  zone: 'blue' | 'green' | 'yellow' | 'red';
  strategies_selected: string[];
  comment?: string;
  timestamp: string;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  zone: string;
  icon: string;
  image_type?: string;
  custom_image?: string;
  is_custom?: boolean;
}

export interface CustomStrategy {
  id: string;
  student_id?: string;
  user_id?: string;
  creator_role?: string;
  name: string;
  description: string;
  zone: string;
  image_type: string;
  icon: string;
  custom_image?: string;
  is_active: boolean;
  is_shared?: boolean;
  created_at: string;
}

export interface PresetAvatar {
  id: string;
  name: string;
  emoji: string;
}

export interface SubscriptionPlan {
  price: number;
  name: string;
  duration_days: number;
}

export interface Translations {
  [key: string]: string;
}

// API Helper
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  
  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  
  // Add Authorization header with session token for ALL platforms
  // This ensures mobile clients always send the token
  const token = await getSessionToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    console.log('[API] Request to', endpoint, '- Auth header added');
  } else {
    console.log('[API] Request to', endpoint, '- No auth token available');
  }
  
  const response = await fetch(url, {
    ...options,
    // Include credentials for web (cookies), omit for mobile (we use Bearer token)
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    console.error('[API] Request failed:', endpoint, response.status, error.detail);
    throw new Error(error.detail || 'Request failed');
  }
  
  return response.json();
}

// Auth API
export const authApi = {
  exchangeSession: (sessionId: string): Promise<User> =>
    apiRequest('/auth/session', { method: 'POST', body: JSON.stringify({ session_id: sessionId }) }),
  
  getMe: (): Promise<User> =>
    apiRequest('/auth/me'),
  
  logout: (): Promise<void> =>
    apiRequest('/auth/logout', { method: 'POST' }),
  
  updateLanguage: (language: string): Promise<{ language: string }> =>
    apiRequest('/auth/language', { method: 'PUT', body: JSON.stringify({ language }) }),
};

// Subscription API
export const subscriptionApi = {
  getPlans: (): Promise<{ plans: Record<string, SubscriptionPlan>; trial_days: number }> =>
    apiRequest('/subscription/plans'),
  
  startTrial: (): Promise<{ message: string; trial_days: number }> =>
    apiRequest('/subscription/start-trial', { method: 'POST' }),
  
  createCheckout: (plan: string, originUrl: string): Promise<{ url: string; session_id: string }> =>
    apiRequest('/subscription/checkout', { 
      method: 'POST', 
      body: JSON.stringify({ plan, origin_url: originUrl }) 
    }),
  
  getPaymentStatus: (sessionId: string): Promise<{ status: string; plan?: string; expires_at?: string }> =>
    apiRequest(`/subscription/status/${sessionId}`),
    
  redeemTrialCode: (code: string): Promise<{ message: string; trial_days: number; trial_ends_at: string }> =>
    apiRequest('/subscription/redeem-trial-code', { 
      method: 'POST', 
      body: JSON.stringify({ code }) 
    }),
};

// Translations API
export const translationsApi = {
  get: (lang: string): Promise<Translations> =>
    apiRequest(`/translations/${lang}`),
  
  getAll: (): Promise<Record<string, Translations>> =>
    apiRequest('/translations'),
  
  getLanguages: (): Promise<{ code: string; name: string }[]> =>
    apiRequest('/languages'),
};

// Students API
export const studentsApi = {
  getAll: (classroomId?: string): Promise<Student[]> => 
    apiRequest(classroomId ? `/students?classroom_id=${classroomId}` : '/students'),
  
  get: (id: string): Promise<Student> => 
    apiRequest(`/students/${id}`),
  
  create: (data: Partial<Student>): Promise<Student> => 
    apiRequest('/students', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: Partial<Student>): Promise<Student> => 
    apiRequest(`/students/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> => 
    apiRequest(`/students/${id}`, { method: 'DELETE' }),
};

// Classrooms API
export const classroomsApi = {
  getAll: (): Promise<Classroom[]> => 
    apiRequest('/classrooms'),
  
  get: (id: string): Promise<Classroom> => 
    apiRequest(`/classrooms/${id}`),
  
  create: (data: Partial<Classroom>): Promise<Classroom> => 
    apiRequest('/classrooms', { method: 'POST', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> => 
    apiRequest(`/classrooms/${id}`, { method: 'DELETE' }),
};

// Strategies API
export const strategiesApi = {
  getAll: (studentId?: string, lang: string = 'en'): Promise<Strategy[]> => 
    apiRequest(studentId ? `/strategies?student_id=${studentId}&lang=${lang}` : `/strategies?lang=${lang}`),
  
  getByZone: (zone: string, studentId?: string, lang: string = 'en'): Promise<Strategy[]> => 
    apiRequest(`/strategies?zone=${zone}&lang=${lang}${studentId ? `&student_id=${studentId}` : ''}`),
  
  getForStudent: (studentId: string, zone?: string, lang: string = 'en'): Promise<Strategy[]> =>
    apiRequest(`/strategies/student/${studentId}?lang=${lang}${zone ? `&zone=${zone}` : ''}`),
  
  getIcons: (): Promise<string[]> =>
    apiRequest('/strategy-icons'),
};

// Custom Strategies API
export const customStrategiesApi = {
  getAll: (studentId?: string): Promise<CustomStrategy[]> =>
    apiRequest(studentId ? `/custom-strategies?student_id=${studentId}` : '/custom-strategies'),
  
  get: (id: string): Promise<CustomStrategy> =>
    apiRequest(`/custom-strategies/${id}`),
  
  create: (data: Partial<CustomStrategy>): Promise<CustomStrategy> =>
    apiRequest('/custom-strategies', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: Partial<CustomStrategy>): Promise<CustomStrategy> =>
    apiRequest(`/custom-strategies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> =>
    apiRequest(`/custom-strategies/${id}`, { method: 'DELETE' }),
};

// Zone Logs API
export const zoneLogsApi = {
  create: (data: { student_id: string; zone: string; strategies_selected: string[]; comment?: string }): Promise<ZoneLog> => 
    apiRequest('/zone-logs', { method: 'POST', body: JSON.stringify(data) }),
  
  getByStudent: (studentId: string, days?: number): Promise<ZoneLog[]> => 
    apiRequest(`/zone-logs/student/${studentId}${days ? `?days=${days}` : ''}`),
  
  getAll: (studentId?: string, classroomId?: string, days?: number): Promise<ZoneLog[]> => {
    const params = new URLSearchParams();
    if (studentId) params.append('student_id', studentId);
    if (classroomId) params.append('classroom_id', classroomId);
    if (days) params.append('days', days.toString());
    return apiRequest(`/zone-logs?${params.toString()}`);
  },
};

// Analytics API
export const analyticsApi = {
  getStudent: (studentId: string, days: number = 7) => 
    apiRequest(`/analytics/student/${studentId}?days=${days}`),
  
  getClassroom: (classroomId: string, days: number = 7) => 
    apiRequest(`/analytics/classroom/${classroomId}?days=${days}`),
  
  getStudentMonthly: (studentId: string, year: number, month: number) =>
    apiRequest(`/analytics/student/${studentId}/month/${year}/${month}`),
};

// Reports API
export const reportsApi = {
  getAvailableMonths: (studentId: string): Promise<string[]> =>
    apiRequest(`/reports/available-months/${studentId}`),
  
  getPdfUrl: (studentId: string, year: number, month: number): string =>
    `/api/reports/pdf/student/${studentId}/month/${year}/${month}`,
};

// Avatars API
export const avatarsApi = {
  getPresets: (): Promise<PresetAvatar[]> => 
    apiRequest('/avatars'),
};

// Parent API
export const parentApi = {
  getChildren: (): Promise<Student[]> =>
    apiRequest('/parent/children'),
  
  linkChild: (linkCode: string): Promise<{ message: string; student_id: string; student_name: string }> =>
    apiRequest('/students/link', { method: 'POST', body: JSON.stringify({ link_code: linkCode }) }),
};

// Teacher API
export const teacherApi = {
  // Teacher generates code to share student with parent
  generateLinkCode: (studentId: string): Promise<{ link_code: string; expires_at: string }> =>
    apiRequest(`/students/${studentId}/generate-link-code`, { method: 'POST' }),
};

// Resources API
export interface Resource {
  id: string;
  title: string;
  description: string;
  content_type: 'text' | 'pdf';
  content?: string;
  pdf_filename?: string;
  created_at: string;
}

export const resourcesApi = {
  getAll: (): Promise<Resource[]> =>
    apiRequest('/resources'),
  
  get: (id: string): Promise<Resource> =>
    apiRequest(`/resources/${id}`),
  
  create: (data: Partial<Resource>): Promise<Resource> =>
    apiRequest('/resources', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: Partial<Resource>): Promise<Resource> =>
    apiRequest(`/resources/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> =>
    apiRequest(`/resources/${id}`, { method: 'DELETE' }),
};

// Auth API - Extended
export const authApiExtended = {
  updateRole: (role: 'teacher' | 'parent'): Promise<{ role: string }> =>
    apiRequest('/auth/role', { method: 'PUT', body: JSON.stringify({ role }) }),
  
  promoteToAdmin: (adminCode: string): Promise<{ role: string; message: string }> =>
    apiRequest('/auth/promote-admin', { method: 'POST', body: JSON.stringify({ admin_code: adminCode }) }),
};

// Admin API
export interface AdminStats {
  total_users: number;
  total_teachers: number;
  total_parents: number;
  total_students: number;
  total_checkins: number;
  total_resources: number;
}

export interface AdminAnalytics {
  period_days: number;
  summary: {
    total_checkins: number;
    active_students: number;
    avg_checkins_per_student: number;
    retention_rate: number;
  };
  daily_checkins: Array<{ date: string; count: number }>;
  zone_distribution: Record<string, number>;
  hourly_distribution: Record<string, number>;
  top_strategies: Array<{ strategy: string; count: number }>;
  classroom_stats: Array<{
    id: string;
    name: string;
    student_count: number;
    checkin_count: number;
    avg_per_student: number;
  }>;
  resource_engagement: Array<{ title: string; download_count: number }>;
  user_growth: Array<{ date: string; new_users: number }>;
}

export const adminApi = {
  getStats: (): Promise<AdminStats> =>
    apiRequest('/admin/stats'),
  
  getResources: (): Promise<Resource[]> =>
    apiRequest('/admin/resources'),
  
  createResource: (data: {
    title: string;
    description: string;
    content_type: string;
    content?: string;
    pdf_filename?: string;
    pdf_data?: string;
    category?: string;
    target_audience?: string;
    topic?: string;
  }): Promise<Resource> =>
    apiRequest('/admin/resources', { method: 'POST', body: JSON.stringify(data) }),
  
  getAnalytics: (period: string = '30', classroomId?: string): Promise<AdminAnalytics> =>
    apiRequest(`/admin/analytics?period=${period}${classroomId ? `&classroom_id=${classroomId}` : ''}`),
  
  getSchools: (): Promise<Array<{ name: string; classroom_count: number }>> =>
    apiRequest('/admin/schools'),
  
  exportData: (type: string, format: string = 'json'): Promise<any> =>
    apiRequest(`/admin/export?type=${type}&format=${format}`),
};

// Family Member types and API
export interface FamilyMember {
  id: string;
  parent_user_id: string;
  name: string;
  relationship: 'partner' | 'self' | 'child';
  avatar_type: string;
  avatar_preset?: string;
  avatar_custom?: string;
  linked_student_id?: string;
  created_at: string;
}

export interface FamilyZoneLog {
  id: string;
  family_member_id: string;
  parent_user_id: string;
  zone: string;
  strategies_selected: string[];
  comment?: string;
  timestamp: string;
}

export const familyApi = {
  getMembers: (): Promise<FamilyMember[]> =>
    apiRequest('/family/members'),
  
  createMember: (data: Partial<FamilyMember>): Promise<FamilyMember> =>
    apiRequest('/family/members', { method: 'POST', body: JSON.stringify(data) }),
  
  updateMember: (id: string, data: Partial<FamilyMember>): Promise<FamilyMember> =>
    apiRequest(`/family/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  deleteMember: (id: string): Promise<void> =>
    apiRequest(`/family/members/${id}`, { method: 'DELETE' }),
  
  // Zone logs
  createZoneLog: (data: { family_member_id: string; zone: string; strategies_selected: string[]; comment?: string }): Promise<FamilyZoneLog> =>
    apiRequest('/family/zone-logs', { method: 'POST', body: JSON.stringify(data) }),
  
  getZoneLogs: (memberId: string, days: number = 7): Promise<FamilyZoneLog[]> =>
    apiRequest(`/family/zone-logs/${memberId}?days=${days}`),
  
  getAnalytics: (memberId: string, days: number = 7): Promise<{ zone_counts: Record<string, number>; strategy_counts: Record<string, number>; total_logs: number }> =>
    apiRequest(`/family/analytics/${memberId}?days=${days}`),
  
  // Teacher link code (parent generates for teacher)
  generateTeacherCode: (studentId: string): Promise<{ link_code: string; expires_at: string }> =>
    apiRequest(`/parent/generate-teacher-code/${studentId}`, { method: 'POST' }),
};

// Family Strategies API
export interface FamilyStrategyData {
  id: string;
  parent_user_id: string;
  name: string;
  description: string;
  emoji: string;
  icon?: string;
  photo_base64?: string;
  zone: string;
  assigned_member_ids: string[];
  is_default: boolean;
  is_active: boolean;
  share_with_teacher: boolean;
  created_at: string;
}

export const familyStrategiesApi = {
  getAll: (): Promise<FamilyStrategyData[]> =>
    apiRequest('/family/strategies'),
  
  create: (data: {
    name: string;
    description: string;
    emoji?: string;
    icon?: string;
    photo_base64?: string;
    zone: string;
    assigned_member_ids?: string[];
    share_with_teacher?: boolean;
  }): Promise<FamilyStrategyData> =>
    apiRequest('/family/strategies', { method: 'POST', body: JSON.stringify(data) }),
  
  update: (id: string, data: Partial<FamilyStrategyData>): Promise<FamilyStrategyData> =>
    apiRequest(`/family/strategies/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> =>
    apiRequest(`/family/strategies/${id}`, { method: 'DELETE' }),
  
  toggleMember: (strategyId: string, memberId: string): Promise<{ assigned_member_ids: string[] }> =>
    apiRequest(`/family/strategies/${strategyId}/toggle-member/${memberId}`, { method: 'PUT' }),
};

// Linked Children API (school-linked children in family)
export interface LinkedChild {
  id: string;
  name: string;
  avatar_type: string;
  avatar_preset?: string;
  avatar_custom?: string;
  classroom_id?: string;
  classroom_name?: string;
  home_sharing_enabled: boolean;
  school_sharing_enabled: boolean;
  is_linked_from_school: boolean;
}

export interface FamilyAssignedStrategy {
  id: string;
  student_id: string;
  parent_user_id: string;
  strategy_name: string;
  strategy_description: string;
  zone: string;
  icon: string;
  share_with_teacher: boolean;
  is_active: boolean;
  created_at: string;
}

export const linkedChildApi = {
  // Get all linked children from school
  getAll: (): Promise<LinkedChild[]> =>
    apiRequest('/parent/linked-children'),
  
  // Home check-ins
  createCheckIn: (studentId: string, data: { zone: string; strategies_selected: string[]; comment?: string }): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/check-in`, { 
      method: 'POST', 
      body: JSON.stringify({ student_id: studentId, ...data }) 
    }),
  
  getHomeCheckIns: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/parent/linked-child/${studentId}/home-checkins?days=${days}`),
  
  getSchoolCheckIns: (studentId: string, days: number = 30): Promise<{ checkins: any[]; sharing_disabled: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/school-checkins?days=${days}`),
  
  getAllCheckIns: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/parent/linked-child/${studentId}/all-checkins?days=${days}`),
  
  // School strategies
  getSchoolStrategies: (studentId: string): Promise<{ custom_strategies: any[]; default_strategies: any[]; sharing_disabled: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/school-strategies`),
  
  // Family-assigned strategies
  createFamilyStrategy: (studentId: string, data: { strategy_name: string; strategy_description: string; zone: string; icon?: string; share_with_teacher?: boolean }): Promise<FamilyAssignedStrategy> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy`, { method: 'POST', body: JSON.stringify(data) }),
  
  getFamilyStrategies: (studentId: string): Promise<FamilyAssignedStrategy[]> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategies`),
  
  toggleStrategySharing: (studentId: string, strategyId: string): Promise<{ share_with_teacher: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy/${strategyId}/toggle-sharing`, { method: 'PUT' }),
  
  deleteFamilyStrategy: (studentId: string, strategyId: string): Promise<void> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy/${strategyId}`, { method: 'DELETE' }),
  
  // Permission management
  toggleHomeSharing: (studentId: string): Promise<{ home_sharing_enabled: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/toggle-home-sharing`, { method: 'PUT' }),
};

// Teacher API for viewing home data
export const teacherHomeDataApi = {
  getStudentHomeData: (studentId: string, days: number = 30): Promise<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    message?: string;
  }> =>
    apiRequest(`/teacher/student/${studentId}/home-data?days=${days}`),
  
  getSharingStatus: (studentId: string): Promise<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    school_sharing_enabled: boolean;
  }> =>
    apiRequest(`/teacher/student/${studentId}/sharing-status`),
};

// Teacher API for linking from parent
export const teacherLinkApi = {
  linkFromParent: (linkCode: string): Promise<{ message: string; student_id: string; student_name: string }> =>
    apiRequest('/teacher/link-from-parent', { method: 'POST', body: JSON.stringify({ link_code: linkCode }) }),
};

// Strategy sync API
export const strategySyncApi = {
  toggleSync: (strategyId: string): Promise<{ is_shared: boolean }> =>
    apiRequest(`/strategies/sync/${strategyId}`, { method: 'PUT' }),
  
  getShared: (studentId: string): Promise<CustomStrategy[]> =>
    apiRequest(`/strategies/shared/${studentId}`),
};

// Teacher Resources API
export interface TeacherResourceTopic {
  id: string;
  name: string;
}

export interface TeacherResource {
  id: string;
  title: string;
  description: string;
  topic: string;
  content_type: string;
  content?: string;
  pdf_filename?: string;
  created_by: string;
  created_by_name?: string;
  average_rating: number;
  total_ratings: number;
  created_at: string;
}

export interface TeacherResourceRating {
  id: string;
  resource_id: string;
  user_id: string;
  user_name?: string;
  rating: number;
  comment?: string;
  created_at: string;
}

export const teacherResourcesApi = {
  getTopics: (): Promise<TeacherResourceTopic[]> =>
    apiRequest('/teacher-resources/topics'),
  
  getAll: (topic?: string): Promise<TeacherResource[]> =>
    apiRequest(topic ? `/teacher-resources?topic=${topic}` : '/teacher-resources'),
  
  get: (id: string): Promise<TeacherResource> =>
    apiRequest(`/teacher-resources/${id}`),
  
  create: (data: Partial<TeacherResource>): Promise<TeacherResource> =>
    apiRequest('/teacher-resources', { method: 'POST', body: JSON.stringify(data) }),
  
  delete: (id: string): Promise<void> =>
    apiRequest(`/teacher-resources/${id}`, { method: 'DELETE' }),
  
  rate: (resourceId: string, rating: number, comment?: string): Promise<void> =>
    apiRequest(`/teacher-resources/${resourceId}/rate`, { 
      method: 'POST', 
      body: JSON.stringify({ rating, comment }) 
    }),
  
  getRatings: (resourceId: string): Promise<TeacherResourceRating[]> =>
    apiRequest(`/teacher-resources/${resourceId}/ratings`),
};

// Classroom Reports API
export const classroomReportsApi = {
  getAvailableMonths: (classroomId: string): Promise<string[]> =>
    apiRequest(`/reports/classroom/${classroomId}/available-months`),
  
  getPdfUrl: (classroomId: string, year: number, month: number): string =>
    `/api/reports/classroom/${classroomId}/pdf?year=${year}&month=${month}`,
};

// ================== CREATURE REWARDS API ==================

export interface CreatureStage {
  stage: number;
  name: string;
  emoji: string;
  description: string;
  required_points: number;
}

export interface CreatureMove {
  id: string;
  name: string;
  emoji: string;
  unlocks_at_stage: number;
}

export interface CreatureOutfit {
  id: string;
  name: string;
  emoji: string;
  unlocks_at_stage: number;
}

export interface CreatureFood {
  id: string;
  name: string;
  emoji: string;
  unlocks_at_stage: number;
}

export interface CreatureHome {
  id: string;
  name: string;
  emoji: string;
  unlocks_at_stage: number;
}

export interface Creature {
  id: string;
  name: string;
  zone: string;
  description: string;
  color: string;
  stages: CreatureStage[];
  moves?: CreatureMove[];
  outfits?: CreatureOutfit[];
  foods?: CreatureFood[];
  homes?: CreatureHome[];
}

export interface StudentRewards {
  student_id: string;
  current_creature: Creature;
  current_stage: number;
  current_stage_info: CreatureStage;
  current_points: number;
  total_points_earned: number;
  points_for_next_evolution: number | null;
  collected_creatures: string[];
  streak_days: number;
  is_fully_evolved: boolean;
}

export interface AddPointsResponse {
  points_added: number;
  streak_bonus: number;
  current_points: number;
  total_points_earned: number;
  current_stage: number;
  current_creature: Creature;
  current_stage_info: CreatureStage;
  points_for_next_evolution: number | null;
  evolved: boolean;
  evolution_info: any;
  completed_creature: boolean;
  new_creature_started: boolean;
  collected_creatures: string[];
  streak_days: number;
}

export interface StudentCollection {
  collected_creatures: Creature[];
  current_creature: Creature;
  current_stage: number;
  current_points: number;
  total_creatures: number;
  total_collected: number;
  unlocked_moves: string[];
  unlocked_outfits: string[];
  unlocked_foods: string[];
  unlocked_homes: string[];
}

export interface PointsConfig {
  strategy_used: number;
  comment_added: number;
  daily_streak_bonus: number;
  evolution_thresholds: number[];
}

export const rewardsApi = {
  getCreatures: (): Promise<{ creatures: Creature[]; points_config: PointsConfig }> =>
    apiRequest('/creatures'),
  
  getStudentRewards: (studentId: string): Promise<StudentRewards> =>
    apiRequest(`/rewards/${studentId}`),
  
  addPoints: (studentId: string, pointsType: 'strategy' | 'comment' | 'streak' | 'checkin', strategyCount: number = 1): Promise<AddPointsResponse> =>
    apiRequest(`/rewards/${studentId}/add-points`, {
      method: 'POST',
      body: JSON.stringify({ points_type: pointsType, strategy_count: strategyCount })
    }),
  
  getCollection: (studentId: string): Promise<StudentCollection> =>
    apiRequest(`/rewards/${studentId}/collection`),
};

