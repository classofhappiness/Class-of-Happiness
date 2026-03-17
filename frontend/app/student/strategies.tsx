import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { strategiesApi, zoneLogsApi, Strategy } from '../../src/utils/api';
import { StrategyCard } from '../../src/components/StrategyCard';
import { ZONE_CONFIG } from '../../src/components/ZoneButton';
import { CelebrationOverlay } from '../../src/components/CelebrationOverlay';

export default function StrategiesScreen() {
  const router = useRouter();
  const { zone } = useLocalSearchParams<{ zone: 'blue' | 'green' | 'yellow' | 'red' }>();
  const { currentStudent, presetAvatars } = useApp();
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const zoneConfig = zone ? ZONE_CONFIG[zone] : ZONE_CONFIG.green;

  useEffect(() => {
    fetchStrategies();
  }, [zone, currentStudent]);

  const fetchStrategies = async () => {
    if (!zone) return;
    try {
      // Fetch strategies including custom ones for this student
      const data = currentStudent 
        ? await strategiesApi.getForStudent(currentStudent.id, zone)
        : await strategiesApi.getByZone(zone);
      setStrategies(data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleStrategy = (strategyId: string) => {
    setSelectedStrategies(prev => 
      prev.includes(strategyId)
        ? prev.filter(id => id !== strategyId)
        : [...prev, strategyId]
    );
  };

  const handleDone = async () => {
    if (!currentStudent || !zone) return;
    
    setSaving(true);
    try {
      await zoneLogsApi.create({
        student_id: currentStudent.id,
        zone: zone,
        strategies_selected: selectedStrategies,
      });
      
      // Show celebration overlay if strategies were selected
      if (selectedStrategies.length > 0) {
        setShowCelebration(true);
      } else {
        // Just go back to home
        router.replace('/');
      }
    } catch (error) {
      console.error('Error saving zone log:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!currentStudent || !zone) return;
    
    setSaving(true);
    try {
      await zoneLogsApi.create({
        student_id: currentStudent.id,
        zone: zone,
        strategies_selected: [],
      });
      
      router.replace('/');
    } catch (error) {
      console.error('Error saving zone log:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    router.replace('/');
  };

  if (!zone) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>No zone selected</Text>
      </SafeAreaView>
    );
  }

  // Get current date and time for display
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const timeStr = now.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Celebration Overlay */}
      {currentStudent && (
        <CelebrationOverlay
          visible={showCelebration}
          studentName={currentStudent.name}
          avatarType={currentStudent.avatar_type as 'preset' | 'custom'}
          avatarPreset={currentStudent.avatar_preset}
          avatarCustom={currentStudent.avatar_custom}
          presetAvatars={presetAvatars}
          onComplete={handleCelebrationComplete}
        />
      )}

      {/* Zone Header */}
      <View style={[styles.header, { backgroundColor: zoneConfig.color }]}>
        <Text style={styles.zoneFace}>{zoneConfig.face}</Text>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{zoneConfig.label}</Text>
          <Text style={styles.headerSubtitle}>
            {zone === 'green' 
              ? "Great! Here are ways to stay in the green zone:" 
              : "Here are some strategies that might help:"}
          </Text>
        </View>
      </View>

      {/* Date/Time Banner */}
      <View style={styles.dateTimeBanner}>
        <MaterialIcons name="schedule" size={18} color="#666" />
        <Text style={styles.dateTimeText}>{dateStr} at {timeStr}</Text>
      </View>

      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <Text style={styles.loadingText}>Loading strategies...</Text>
        ) : (
          <>
            <Text style={styles.instruction}>
              {zone === 'green' 
                ? "Tap any strategies you'd like to try:" 
                : "Tap to select strategies that might help:"}
            </Text>
            
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                name={strategy.name}
                description={strategy.description}
                icon={strategy.icon}
                customImage={strategy.custom_image}
                imageType={strategy.image_type}
                selected={selectedStrategies.includes(strategy.id)}
                onPress={() => toggleStrategy(strategy.id)}
                zoneColor={zoneConfig.color}
              />
            ))}
          </>
        )}
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          disabled={saving}
        >
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.doneButton, { backgroundColor: zoneConfig.color }]}
          onPress={handleDone}
          disabled={saving}
        >
          <Text style={styles.doneButtonText}>
            {saving ? 'Saving...' : `Done ${selectedStrategies.length > 0 ? `(${selectedStrategies.length})` : ''}`}
          </Text>
          <MaterialIcons name="check" size={24} color="white" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  zoneFace: {
    fontSize: 40,
  },
  headerText: {
    marginLeft: 16,
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 4,
  },
  dateTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F4FD',
    paddingVertical: 10,
    gap: 8,
  },
  dateTimeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 20,
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  bottomButtons: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  skipButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
  },
  doneButton: {
    flex: 2,
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  doneButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});
