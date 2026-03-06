const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
const API_URL = `${BACKEND_URL}/api`;

export interface Student {
  id: string;
  name: string;
  avatar_type: 'preset' | 'custom';
  avatar_preset?: string;
  avatar_custom?: string;
  classroom_id?: string;
  created_at: string;
}

export interface Classroom {
  id: string;
  name: string;
  teacher_name?: string;
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
}

export interface PresetAvatar {
  id: string;
  name: string;
  emoji: string;
}

// API Helper
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
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
  getAll: (): Promise<Strategy[]> => 
    apiRequest('/strategies'),
  
  getByZone: (zone: string): Promise<Strategy[]> => 
    apiRequest(`/strategies?zone=${zone}`),
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
};

// Avatars API
export const avatarsApi = {
  getPresets: (): Promise<PresetAvatar[]> => 
    apiRequest('/avatars'),
};
