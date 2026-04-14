import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ExpoLinking from 'expo-linking';
import Constants from 'expo-constants';
import { 
  Student, Classroom, User, Translations,
  studentsApi, classroomsApi, avatarsApi, PresetAvatar,
  authApi, translationsApi, setSessionToken, clearSessionToken, initializeSessionToken
} from '../utils/api';

// Helper function to wrap any promise with timeout
function withTimeout(promise: Promise<any>, timeoutMs: number, fallback: any): Promise<any> {
  return Promise.race([
    promise,
    new Promise<any>((resolve) => setTimeout(() => resolve(fallback), timeoutMs))
  ]);
};

// Helper function to wrap AsyncStorage calls with timeout to prevent mobile hanging
const getStorageWithTimeout = async (key: string, timeoutMs: number = 3000): Promise<string | null> => {
  return Promise.race([
    AsyncStorage.getItem(key),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))
  ]);
};

const setStorageWithTimeout = async (key: string, value: string, timeoutMs: number = 3000): Promise<void> => {
  return Promise.race([
    AsyncStorage.setItem(key, value),
    new Promise<void>((resolve) => setTimeout(() => resolve(), timeoutMs))
  ]);
};

interface AppContextType {
  // Auth
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
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
  how_are_you_feeling: "How are you feeling?",
  i_am_a: "I am a...",
  student: "Student",
  teacher: "Teacher",
  parent: "Parent",
  check_in_feelings: "Check in with my feelings",
  view_progress: "View student progress",
  your_family_emotions: "Your family's emotions",
  blue_zone: "Blue Feelings",
  green_zone: "Green Feelings",
  yellow_zone: "Yellow Feelings",
  red_zone: "Red Feelings",
  blue_feelings: "Blue Feelings",
  green_feelings: "Green Feelings",
  yellow_feelings: "Yellow Feelings",
  red_feelings: "Red Feelings",
  blue_desc: "Sad, Tired, Need Rest",
  green_desc: "Calm, Happy, Focused",
  yellow_desc: "Worried, Frustrated, Silly",
  red_desc: "Angry, Scared, Out of Control",
  blue_feeling: "Quiet Energy",
  green_feeling: "Balanced Energy",
  yellow_feeling: "Fizzing Energy",
  red_feeling: "Big Energy",
  blue_description: "Your body is moving slowly. You might feel tired, a bit sad, or need some rest.",
  green_description: "You feel calm, happy and ready. This is a great feeling!",
  yellow_description: "You are starting to feel wobbly. You might feel silly, worried or frustrated.",
  red_description: "Your body has big feelings right now. You might feel very upset or out of control.",
  loading_helpers: "Loading helpers...",
  tap_helpers_green: "Tap any helpers you would like to try:",
  tap_helpers_other: "Tap to select helpers that might help:",
  great_job_title: "Amazing Work!",
  keep_it_up: "Keep it up!",
  day_streak: "days in a row!",
  points: "Points",
  continue: "Continue",
  my_creatures: "My Creatures",
  loading_creature: "Loading your creature...",
  evolved: "EVOLVED!",
  amazing_continue: "Amazing! Continue",
  keep_growing: "Keep Growing!",
  grow_creature_hint: "Use helpers and share your feelings to evolve your creature!",
  want_to_say: "Want to say something?",
  write_sentence: "Write one sentence about how you feel...",
  loading_strategies: "Loading helpers...",
  tap_strategies_green: "Tap any helpers you would like to try:",
  tap_strategies_help: "Tap to select helpers that might help:",
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
  hi: "Hi",
  which_zone: "Which zone are you in?",
  tap_zone_help: "Tap the color that matches how you feel",
  choose_strategies: "Choose helpful strategies",
  want_to_say: "Want to say how you feel?",
  write_sentence: "Write one sentence about how you feel...",
  save_checkin: "Save Check-in",
  well_done: "Well Done!",
  great_job: "Great job choosing strategies!",
  // New translations
  no_profiles_yet: "No profiles yet!",
  create_first_profile: "Create your first profile to get started",
  loading_strategies: "Loading strategies...",
  green_zone_help: "Great! Here are ways to stay in the green zone:",
  other_zone_help: "Here are some strategies that might help:",
  tap_strategies_green: "Tap any strategies you'd like to try:",
  tap_strategies_other: "Tap to select strategies that might help:",
  no_zone_selected: "No zone selected",
  filter_by_classroom: "Filter by Classroom",
  all_students: "All Students",
  days_7: "7 Days",
  days_14: "2 Weeks",
  days_30: "30 Days",
  no_recent_checkins: "No recent check-ins",
  search_students: "Search students...",
  add_new_student: "Add New Student",
  delete_student: "Delete Student",
  delete_student_confirm: "Are you sure you want to delete this student?",
  no_students_found: "No students found",
  no_students_yet: "No students yet",
  try_different_search: "Try a different search",
  add_first_student: "Add your first student to get started",
  student_not_found: "Student not found",
  zone_distribution: "Zone Distribution",
  zone_comparison: "Zone Comparison",
  no_data_period: "No data for this period",
  most_used_strategies: "Most Used Strategies",
  no_checkins_yet: "No check-ins yet",
  share_with_parent: "Share with Parent",
  generate_code: "Generate Code",
  generating: "Generating...",
  parent_link_code: "Parent Link Code:",
  code_expires_7_days: "This code expires in 7 days.",
  share_code: "Share Code",
  create_new_classroom: "Create New Classroom",
  classroom_name: "Classroom Name",
  teacher_name_optional: "Teacher Name (Optional)",
  create_classroom: "Create Classroom",
  creating: "Creating...",
  no_classrooms_yet: "No classrooms yet",
  create_classroom_organize: "Create a classroom to organize your students",
  no_classroom: "No Classroom",
  loading_resources: "Loading resources...",
  no_resources_yet: "No resources yet",
  be_first_upload: "Be the first to upload a resource!",
  title: "Title",
  description: "Description",
  uploading: "Uploading...",
  submit_rating: "Submit Rating",
  submitting: "Submitting...",
  manage_strategies: "Manage Strategies",
  add_custom_strategy: "Add Custom Strategy",
  custom_strategies: "Custom Strategies",
  default_strategies: "Default Strategies",
  default: "Default",
  saving: "Saving...",
  name: "Name",
  choose_avatar: "Choose an Avatar",
  gallery: "Gallery",
  camera: "Camera",
  your_photo: "Your Photo",
  or_choose_character: "Or choose a character:",
  create_profile: "Create Profile",
  save_changes: "Save Changes",
  delete_profile: "Delete Profile",
  avatar: "Avatar",
  classroom: "Classroom",
  link_child_school: "Link Child from School",
  enter_code: "Enter the 6-character code from your child's teacher.",
  linking: "Linking...",
  add_member: "Add Member",
  adding: "Adding...",
  relationship: "Relationship",
  self: "Self",
  partner: "Partner",
  child: "Child",
  school: "School",
  add_family_to_track: "Add family members to track",
  link_children_school: "Link children from school",
  no_checkins_week: "No check-ins this week",
  no_recent_activity: "No recent activity",
  share_with_teacher: "Share with Teacher",
  generate_teacher_code: "Generate a code that teachers can use to link to your child's profile.",
  expires_7_days: "Expires in 7 days",
  teacher_link_code: "Teacher Link Code:",
  checkin_for: "Check-in for",
  how_everyone_feeling: "How is everyone feeling?",
  change: "Change",
  select_helpful_strategies: "Select helpful strategies:",
  add_note_optional: "Add a note (optional)",
  edit_note: "Edit note",
  write_short_note: "Write a short note...",
  skip_strategies: "Skip strategies",
  articles_guides: "Articles and guides on emotional intelligence development",
  download_report: "Download Report",
  by: "By",
  // Rewards system
  great_job_title: "Great Job!",
  keep_it_up: "Keep it up!",
  day_streak: "day streak!",
  points: "Points",
  my_creatures: "My Creatures",
  continue: "Continue",
  loading_creature: "Loading your creature...",
  more_points_until: "more points until",
  evolves: "evolves!",
  collected: "Collected",
  current_friend: "Current Friend",
  fully_evolved: "Fully Evolved",
  keep_growing: "Keep Growing!",
  grow_creature_hint: "Use strategies and write about your feelings to evolve your creature and start collecting!",
  complete: "Complete!",
  evolved: "EVOLVED!",
  evolving: "EVOLVING...",
  amazing_continue: "Amazing! Continue",
  enter_name: "Enter name",
  select_classroom: "Select classroom",
  updating: "Updating...",
  deleting: "Deleting...",
  no_resources_topic: "No resources for this topic yet",
  upload_first: "Be the first to upload!",
  comments: "Comments",
  no_comments_yet: "No comments yet",
  add_comment: "Add a comment...",
  no_strategies_yet: "No strategies yet",
  add_first_strategy: "Add your first custom strategy",
  create_manage_strategies: "Create and manage coping strategies for your child",
  your_custom_strategies: "Your Custom Strategies",
  shared_with_teacher: "Shared with teacher",
  not_shared: "Not shared",
  // Language settings
  change_language: "Change Language",
  change_language_confirm: "Set",
  as_default_language: "as your default language?",
  language_changed: "Language Changed",
  is_now_default: "is now your default language. The app will remember this choice.",
  // Sharing disclaimer
  sharing_disclaimer_title: "Consent to Share Access",
  sharing_disclaimer_text: "By choosing to generate and share an access code, you acknowledge and agree to the following:\n\nThe access code you share allows the receiving parent, teacher, or therapist to view the child's emotional Colour of Emotion information within the app. This access is provided solely for the purpose of supporting the child's emotional understanding, identifying patterns, and coordinating strategies across home, school, and therapeutic environments.\n\nThe access code may be used only for the purposes described above. It may not be shared, transferred, or used for any unrelated purpose, including evaluation, discipline, or decision-making outside the child's emotional and behavioral support.\n\nAccess granted through this code is time-limited and will automatically expire after one month unless you request earlier revocation. You may withdraw access at any time, for any reason. Once access is revoked or expired, the receiving party will no longer be able to view the child's information.\n\nBy proceeding, you confirm that you have the authority to share this information, that you understand the nature of the access being granted, and that you consent to provide this limited, temporary access to the child's emotional data.",
  i_agree_and_continue: "I Agree & Continue",
  cancel: "Cancel",
  access_expires_30_days: "Access expires in 30 days",
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [translationsLoaded, setTranslationsLoaded] = useState(false);
  
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
      setTranslationsLoaded(true);
    } catch (error) {
      console.error('Error fetching translations:', error);
      setTranslations(defaultTranslations);
      setTranslationsLoaded(true);
    }
  };

  const setLanguage = async (lang: string) => {
    setLanguageState(lang);
    await fetchTranslations(lang);
    // Persist language to AsyncStorage with timeout
    try {
      await setStorageWithTimeout('app_language', lang, 3000);
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
      const savedLang = await getStorageWithTimeout('app_language', 3000);
      if (savedLang) {
        setLanguageState(savedLang);
        await fetchTranslations(savedLang);
      } else {
        // No saved language, use default English
        setTranslationsLoaded(true);
      }
    } catch (error) {
      console.error('Error loading saved language:', error);
      setTranslationsLoaded(true);
    }
  };

  const t = (key: string): string => {
    if (translations[key]) {
      return translations[key];
    }
    // Fallback: convert key to readable text (replace underscores with spaces, capitalize)
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const checkAuth = useCallback(async () => {
    // Skip if URL has session_id on web (let AuthCallback handle it)
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
      setIsLoading(false);
      return;
    }
    
    try {
      const userData = await authApi.getMe();
      setUser(userData);
      setIsAuthenticated(true);
      // Only use user's server-side language if no local preference is saved
      const localLang = await getStorageWithTimeout('app_language', 3000);
      if (!localLang && userData.language) {
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

  const login = async () => {
    // Simple email-based login - no external auth dependency
    try {
      const { Alert } = require('react-native');
      
      // Show email input dialog
      Alert.prompt(
        'Sign In',
        'Enter your email address to sign in:',
        async (email: string) => {
          if (!email || !email.includes('@')) {
            Alert.alert('Error', 'Please enter a valid email address');
            return;
          }
          await loginWithEmail(email.trim().toLowerCase());
        },
        'plain-text',
        '',
        'email-address'
      );
    } catch (error) {
      console.error('[Login] Error:', error);
    }
  };

  const loginWithEmail = async (email: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/auth/email-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      
      if (!response.ok) {
        throw new Error('Login failed');
      }
      
      const data = await response.json();
      const { user, session_token } = data;
      
      // Save session
      await AsyncStorage.setItem('session_token', session_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(user));
      
      setUser(user);
      setIsAuthenticated(true);
      
      console.log('[Login] Success:', user.email);
    } catch (error) {
      console.error('[Login] Email login error:', error);
      const { Alert } = require('react-native');
      Alert.alert('Sign In Failed', 'Could not sign in. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
;

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      // Clear session token on mobile
      await clearSessionToken();
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const hasActiveSubscription = user ? (
    user.subscription_status === 'active' || user.subscription_status === 'trial'
  ) : false;

  // Pre-warm the browser for faster OAuth (mobile only)
  useEffect(() => {
    if (Platform.OS !== 'web') {
      WebBrowser.warmUpAsync().catch(console.warn);
    }
    return () => {
      if (Platform.OS !== 'web') {
        WebBrowser.coolDownAsync().catch(console.warn);
      }
    };
  }, []);

  useEffect(() => {
    const initialize = async () => {
      console.log('[AppContext] Starting initialization...');
      setIsLoading(true);
      
      // Create abort controller for cleanup
      const abortController = new AbortController();
      
      try {
        // Step 0: Initialize session token from storage FIRST (critical for mobile auth)
        console.log('[AppContext] Initializing session token...');
        await initializeSessionToken();
        console.log('[AppContext] Session token initialized');
        
        // Step 1: Load language from storage (fast local operation)
        console.log('[AppContext] Loading saved language...');
        try {
          const savedLang = await getStorageWithTimeout('app_language', 2000);
          if (savedLang) {
            setLanguageState(savedLang);
          }
          console.log('[AppContext] Language loaded:', savedLang || 'default');
        } catch (e) {
          console.log('[AppContext] Language load skipped:', e);
        }
        
        // Step 2: Set translations loaded immediately (use defaults)
        // This ensures the app can render even without network
        setTranslationsLoaded(true);
        
        // Step 3: Check auth - but don't block on it
        console.log('[AppContext] Checking auth...');
        try {
          // Skip if URL has session_id on web (let AuthCallback handle it)
          if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
            console.log('[AppContext] Session ID detected, skipping auth check');
          } else {
            const userData = await Promise.race([
              authApi.getMe(),
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000))
            ]);
            if (userData) {
              setUser(userData);
              setIsAuthenticated(true);
              console.log('[AppContext] Auth success');
            }
          }
        } catch (e) {
          console.log('[AppContext] Auth check skipped:', e);
        }
        
      } catch (error) {
        console.error('[AppContext] Initialization error:', error);
      } finally {
        // CRITICAL: Always set loading to false
        console.log('[AppContext] Initialization complete, setting loading false');
        setIsLoading(false);
        setTranslationsLoaded(true);
      }
      
      // Step 4: Load non-critical data in background (don't block UI)
      // These are nice-to-have but app works without them
      setTimeout(async () => {
        if (abortController.signal.aborted) return;
        console.log('[AppContext] Loading background data...');
        try {
          await Promise.allSettled([
            refreshStudents(),
            refreshClassrooms(), 
            fetchPresetAvatars(),
          ]);
          console.log('[AppContext] Background data loaded');
        } catch (e) {
          console.log('[AppContext] Background data load failed:', e);
        }
      }, 100);
    };
    
    initialize();
  }, []);

  // Combined loading state - simple check
  // translationsLoaded is set true immediately now for fast startup
  const isAppLoading = isLoading;

  return (
    <AppContext.Provider
      value={{
        // Auth
        user,
        isAuthenticated,
        isLoading: isAppLoading,
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
