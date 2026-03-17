const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const API_URL = `${BACKEND_URL}/api`;

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
  name: string;
  description: string;
  zone: string;
  image_type: string;
  icon: string;
  custom_image?: string;
  is_active: boolean;
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
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
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
  getAll: (studentId?: string): Promise<Strategy[]> => 
    apiRequest(studentId ? `/strategies?student_id=${studentId}` : '/strategies'),
  
  getByZone: (zone: string, studentId?: string): Promise<Strategy[]> => 
    apiRequest(`/strategies?zone=${zone}${studentId ? `&student_id=${studentId}` : ''}`),
  
  getForStudent: (studentId: string, zone?: string): Promise<Strategy[]> =>
    apiRequest(`/strategies/student/${studentId}${zone ? `?zone=${zone}` : ''}`),
  
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
  create: (data: { student_id: string; zone: string; strategies_selected: string[] }): Promise<ZoneLog> => 
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
