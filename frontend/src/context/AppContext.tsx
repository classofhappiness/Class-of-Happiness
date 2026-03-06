import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Student, Classroom, studentsApi, classroomsApi, avatarsApi, PresetAvatar } from '../utils/api';

interface AppContextType {
  students: Student[];
  classrooms: Classroom[];
  presetAvatars: PresetAvatar[];
  currentStudent: Student | null;
  currentClassroom: Classroom | null;
  loading: boolean;
  setCurrentStudent: (student: Student | null) => void;
  setCurrentClassroom: (classroom: Classroom | null) => void;
  refreshStudents: () => Promise<void>;
  refreshClassrooms: () => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [students, setStudents] = useState<Student[]>([]);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [presetAvatars, setPresetAvatars] = useState<PresetAvatar[]>([]);
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null);
  const [currentClassroom, setCurrentClassroom] = useState<Classroom | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const initialize = async () => {
      setLoading(true);
      await Promise.all([
        refreshStudents(),
        refreshClassrooms(),
        fetchPresetAvatars(),
      ]);
      setLoading(false);
    };
    initialize();
  }, []);

  return (
    <AppContext.Provider
      value={{
        students,
        classrooms,
        presetAvatars,
        currentStudent,
        currentClassroom,
        loading,
        setCurrentStudent,
        setCurrentClassroom,
        refreshStudents,
        refreshClassrooms,
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
