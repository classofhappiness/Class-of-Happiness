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

export async function setSessionToken(token: string | null) {
  sessionToken = token;
  if (token) {
    await AsyncStorage.setItem('session_token', token);
  } else {
    await AsyncStorage.removeItem('session_token');
  }
}

export async function getSessionToken(): Promise<string | null> {
  if (sessionToken) return sessionToken;
  sessionToken = await AsyncStorage.getItem('session_token');
  return sessionToken;
}

export async function clearSessionToken() {
  sessionToken = null;
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
  
  // On mobile, add Authorization header with session token
  if (Platform.OS !== 'web') {
    const token = await getSessionToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }
  
  const response = await fetch(url, {
    ...options,
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    headers,
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
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
    `${API_URL}/reports/pdf/student/${studentId}/month/${year}/${month}`,
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
    `${API_URL}/reports/classroom/${classroomId}/pdf?year=${year}&month=${month}`,
};

// ================== CREATURE REWARDS API ==================

export interface CreatureStage {
  stage: number;
  name: string;
  emoji: string;
  description: string;
  required_points: number;
}

export interface Creature {
  id: string;
  name: string;
  description: string;
  color: string;
  stages: CreatureStage[];
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

