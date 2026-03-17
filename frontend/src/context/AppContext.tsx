import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  Student, Classroom, User, Translations,
  studentsApi, classroomsApi, avatarsApi, PresetAvatar,
  authApi, translationsApi
} from '../utils/api';

interface AppContextType {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => void;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  
  // Data
  students: Student[];
  classrooms: Classroom[];
  presetAvatars: PresetAvatar[];
  currentStudent: Student | null;
  currentClassroom: Classroom | null;
  
  // Translations
  language: string;
  translations: Translations;
  setLanguage: (lang: string) => Promise<void>;
  t: (key: string) => string;
  
  // Actions
  setCurrentStudent: (student: Student | null) => void;
  setCurrentClassroom: (classroom: Classroom | null) => void;
  refreshStudents: () => Promise<void>;
  refreshClassrooms: () => Promise<void>;
  
  // Subscription
  hasActiveSubscription: boolean;
}

const defaultTranslations: Translations = {
  app_name: "Class of Happiness",
  how_are_you_feeling: "How are you feeling today?",
  i_am_a: "I am a...",
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
  check_in_feelings: "Check in with my feelings",
  view_progress: "View student progress",
  your_family_emotions: "Your family's emotions",
  blue_zone: "Blue Zone",
  green_zone: "Green Zone",
  yellow_zone: "Yellow Zone",
  red_zone: "Red Zone",
  blue_desc: "Sad, Tired, Bored",
  green_desc: "Calm, Happy, Focused",
  yellow_desc: "Worried, Frustrated, Silly",
  red_desc: "Angry, Scared, Out of Control",
  select_profile: "Select Your Profile",
  tap_to_check_in: "Tap your picture to check in!",
  add_profile: "Add Profile",
  strategies: "Helpful Strategies",
  skip: "Skip",
  done: "Done",
  settings: "Settings",
  language: "Language",
  subscription: "Subscription",
  logout: "Logout",
  login: "Login",
  login_required: "Login required",
  sign_in_google: "Sign in with Google",
  trial: "Free Trial",
  trial_desc: "7 days free trial",
  monthly: "Monthly",
  six_months: "6 Months",
  annual: "Annual",
  subscribe: "Subscribe",
  per_month: "/month",
  save: "Save",
  dashboard: "Dashboard",
  students: "Students",
  classrooms: "Classrooms",
  teacher_resources: "Teacher Resources",
  upload_share_materials: "Upload & share educational materials",
  recent_activity: "Recent Activity",
  week_overview: "Week Overview",
  check_ins: "Check-ins",
  no_data_yet: "No data yet",
  family_dashboard: "Family Dashboard",
  track_emotional_wellness: "Track emotional wellness at home",
  my_family: "My Family",
  children_school: "Children (School)",
  link_child: "Link Child",
  add_family_member: "Add Family Member",
  resources: "Resources",
  recent_check_ins: "Recent Check-ins",
  loading: "Loading...",
  error: "Error",
  success: "Success",
  cancel: "Cancel",
  confirm: "Confirm",
  delete: "Delete",
  edit: "Edit",
  add: "Add",
  back: "Back",
  next: "Next",
  submit: "Submit",
  upload: "Upload",
  download: "Download",
  share: "Share",
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  
  // Data state
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [presetAvatars, setPresetAvatars] = useState<PresetAvatar[]>([]);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [currentClassroom, setCurrentClassroom] = useState<Classroom | null>(null);
  
  // Translations state
  const [language, setLanguageState] = useState<string>('en');
  const [translations, setTranslations] = useState<Translations>(defaultTranslations);

  const refreshStudents = async () => {
    try {
      const data = await studentsApi.getAll();
      setStudents(data);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const refreshClassrooms = async () => {
    try {
      const data = await classroomsApi.getAll();
      setClassrooms(data);
    } catch (error) {
      console.error('Error fetching classrooms:', error);
    }
  };

  const fetchPresetAvatars = async () => {
    try {
      const data = await avatarsApi.getPresets();
      setPresetAvatars(data);
    } catch (error) {
      console.error('Error fetching avatars:', error);
    }
  };

  const fetchTranslations = async (lang: string) => {
    try {
      const data = await translationsApi.get(lang);
      setTranslations(data);
    } catch (error) {
      console.error('Error fetching translations:', error);
      setTranslations(defaultTranslations);
    }
  };

  const setLanguage = async (lang: string) => {
    setLanguageState(lang);
    await fetchTranslations(lang);
    // Persist language to AsyncStorage
    try {
      await AsyncStorage.setItem('app_language', lang);
    } catch (error) {
      console.error('Error saving language preference:', error);
    }
    if (user) {
      try {
        await authApi.updateLanguage(lang);
      } catch (error) {
        console.error('Error updating language:', error);
      }
    }
  };

  // Load saved language on app start
  const loadSavedLanguage = async () => {
    try {
      const savedLang = await AsyncStorage.getItem('app_language');
      if (savedLang) {
        setLanguageState(savedLang);
        await fetchTranslations(savedLang);
      }
    } catch (error) {
      console.error('Error loading saved language:', error);
    }
  };

  const t = (key: string): string => {
    return translations[key] || key;
  };

  const checkAuth = useCallback(async () => {
    // Skip if URL has session_id (let AuthCallback handle it)
    if (typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
      setIsLoading(false);
      return;
    }
    
    try {
      const userData = await authApi.getMe();
      setUser(userData);
      setIsAuthenticated(true);
      if (userData.language) {
        setLanguageState(userData.language);
        await fetchTranslations(userData.language);
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (typeof window !== 'undefined') {
      const redirectUrl = window.location.origin + '/auth/callback';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const hasActiveSubscription = user ? (
    user.subscription_status === 'active' || user.subscription_status === 'trial'
  ) : false;

  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      // Load saved language first
      await loadSavedLanguage();
      await Promise.all([
        refreshStudents(),
        refreshClassrooms(),
        fetchPresetAvatars(),
      ]);
      await checkAuth();
    };
    initialize();
  }, []);

  return (
    <AppContext.Provider
      value={{
        // Auth
        user,
        isAuthenticated,
        isLoading,
        login,
        logout,
        checkAuth,
        
        // Data
        students,
        classrooms,
        presetAvatars,
        currentStudent,
        currentClassroom,
        
        // Translations
        language,
        translations,
        setLanguage,
        t,
        
        // Actions
        setCurrentStudent,
        setCurrentClassroom,
        refreshStudents,
        refreshClassrooms,
        
        // Subscription
        hasActiveSubscription,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};
