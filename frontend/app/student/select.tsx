import React, { useLayoutEffect, useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useNavigation, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { rewardsApi, creaturesApi, StudentCollection, StudentRewards, Creature } from '../../src/utils/api';
import { useDataGridColumns, gridCardWidth } from '../../src/utils/globalStyles';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';

const COMMUNITY_ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF73', yellow: '#FFC107', red: '#E05252',
};

interface StudentCreatureData {
  currentCreature: Creature;
  currentStage: number;
  collectedCreatures: Creature[];
  totalPoints: number;
}

export default function StudentSelectScreen() {
  const gridColumns = useDataGridColumns();
  const cardWidth = gridCardWidth(gridColumns);
  const router = useRouter();
  const navigation = useNavigation();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { students, classrooms, presetAvatars, setCurrentStudent, currentStudent, refreshStudents, t, language, translations, user } = useApp();
  const isAdult = user && (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin' || user.role === 'school_admin');
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [localClassrooms, setLocalClassrooms] = useState<any[]>([]);

  // Fetch classrooms independently so teacher login shows filter
  useEffect(() => {
    const fetchClassrooms = async () => {
      try {
        const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const tok = await AsyncStorage.getItem('session_token');
        if (!tok) return;
        const res = await fetch(`${BURL}/api/classrooms`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) { const data = await res.json(); setLocalClassrooms(Array.isArray(data) ? data : []); }
      } catch {}
    };
    fetchClassrooms();
  }, []);
  const [studentCreatures, setStudentCreatures] = useState<Record<string, StudentCreatureData>>({});
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  // Real feature Aug 22 (item 7): the tick/completion row here only ever reflected the 4
  // default per-colour creatures - a Family/Class/School/Global creature a student actively
  // selected to work on (via world-creatures.tsx's "Set as Active") never showed up here at
  // all, only inside "My Creatures" itself. This fetches each student's actively-selected
  // community creatures (per /students/{id}/my-creatures, filtered to is_active community
  // entries) so they render alongside the defaults with the same tick/in-progress treatment.
  const [studentActiveCommunity, setStudentActiveCommunity] = useState<Record<string, any[]>>({});
  // Real feature Aug 23 (item 6): the card only ever reflected default-creature completion
  // status - a student with all 4 defaults done had no way to know there were new
  // Family/Class/School/Global creatures they hadn't started yet. Counts eligible creatures
  // (per /creatures/eligible, same real scope/classroom/school matching the browse screen
  // uses) with zero progress so far.
  const [studentNewEligibleCount, setStudentNewEligibleCount] = useState<Record<string, number>>({});

  // Hide default header and use custom translated header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: false,
    });
  }, [navigation]);

  // Refresh students every time this screen loads
  useEffect(() => {
    refreshStudents();
  }, []);

  // Preload sounds once
  useEffect(() => { preloadSounds(); }, []);

  // Load ALL creatures in parallel - much faster than one by one
  useEffect(() => {
    if (students.length === 0) return;
// Batch fetch all collections in ONE api call
    const ids = students.map(s => s.id).join(',');
    const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
    AsyncStorage.getItem('session_token').then(tok => {
    const token = tok || '';
    fetch(`${BURL}/api/rewards/batch/collections?student_ids=${ids}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => { console.log('[Creatures] batch response status:', r.status); return r.ok ? r.json() : {}; })
    .then((batchResults: Record<string,any>) => {
      const data: Record<string, StudentCreatureData> = {};
      students.forEach(s => {
        const c = batchResults[s.id];
        if (c === null || c === undefined) {
          // No rewards yet — show default egg
          data[s.id] = {
            currentCreature: { id:'egg', name:'Egg', color:'#E0E0E0', stages:[{emoji:'🥚'},{emoji:'🥚'},{emoji:'🥚'},{emoji:'🥚'}] } as any,
            currentStage: 0,
            collectedCreatures: [],
            totalPoints: 0,
            allCreatures: [],
          } as any;
        } else if (c?.current_creature) {
          data[s.id] = {
            currentCreature: c.current_creature,
            currentStage: c.current_stage || 0,
            collectedCreatures: c.collected_creatures || [],
            totalPoints: c.current_points || 0,
            allCreatures: c.all_creatures || [],
          } as any;
        }
      });
      setStudentCreatures(data);
    }); }).catch(() => {
      // Fallback to parallel individual calls
      Promise.allSettled(
        students.map(s => rewardsApi.getCollection(s.id).then(c => ({ id: s.id, c })))
      ).then(results => {
        const data: Record<string, StudentCreatureData> = {};
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.c?.current_creature) {
            const { id, c } = r.value;
            data[id] = { currentCreature: c.current_creature, currentStage: c.current_stage || 0, collectedCreatures: c.collected_creatures || [], totalPoints: c.current_points || 0, allCreatures: c.all_creatures || [] } as any;
          }
        });
        setStudentCreatures(data);
      });
    });
  }, [students]);

  // Real feature Aug 22 (item 7): fetch each student's actively-selected community creatures
  // in parallel - one call per student (no batch endpoint exists for this yet, matching the
  // same fallback pattern already used above), tolerant of individual failures.
  useEffect(() => {
    if (students.length === 0) return;
    Promise.allSettled(
      students.map(s => creaturesApi.getMyCreatures(s.id).then(data => ({ id: s.id, data })))
    ).then(results => {
      const active: Record<string, any[]> = {};
      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { id, data } = r.value;
        const entries: any[] = [];
        Object.entries(data?.colours || {}).forEach(([colour, bucket]) => {
          (bucket as any[]).forEach(entry => {
            if (entry.type === 'community' && entry.is_active) {
              entries.push({ ...entry, colour });
            }
          });
        });
        if (entries.length) active[id] = entries;
      });
      setStudentActiveCommunity(active);
    }).catch(() => {});
  }, [students]);

  useEffect(() => {
    if (students.length === 0) return;
    Promise.allSettled(
      students.map(s => creaturesApi.getEligible(s.id).then(data => ({ id: s.id, data })))
    ).then(results => {
      const counts: Record<string, number> = {};
      results.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { id, data } = r.value;
        const notYetStarted = (data?.creatures || []).filter((c: any) => !c.my_stages_unlocked).length;
        if (notYetStarted > 0) counts[id] = notYetStarted;
      });
      setStudentNewEligibleCount(counts);
    }).catch(() => {});
  }, [students]);

  const handleSelectStudent = useCallback((student: typeof students[0]) => {
    playSelectFeedback();
    setSelectedStudentId(student.id);
    // Tag family members so strategies screen routes correctly
    const enriched = {
      ...student,
      is_family_member: !!(student as any).is_family_member,
      family_member_id: (student as any).family_member_id || null,
    };
    setCurrentStudent(enriched as any);
    setTimeout(() => {
      router.push({ pathname: '/student/zone', params: { returnTo: returnTo || '' } });
    }, 200);
  }, [setCurrentStudent, router]);

  // Real bug fix Aug 22: this used to open the old defaults-only CreatureCollection modal -
  // completely disconnected from the real, unified "My Creatures" screen (browse by scope,
  // preview, start, permanent collection). This button already lived in the right place (the
  // student's card) - it just pointed at the wrong destination. Now navigates to the real one.
  const handleViewCreatures = (student: typeof students[0]) => {
    playButtonFeedback();
    const enriched = {
      ...student,
      is_family_member: !!(student as any).is_family_member,
      family_member_id: (student as any).family_member_id || null,
    };
    setCurrentStudent(enriched as any);
    router.push('/student/creatures');
  };

  const handleCreateProfile = () => {
    playButtonFeedback(); // Sound effect for button press
    router.push('/profiles/create');
  };

  // Render mini creature icons for a student
  const renderCreatureIcons = (studentId: string) => {
    const data = studentCreatures[studentId];
    const activeCommunity = studentActiveCommunity[studentId] || [];
    if (!data) return null;

    const { currentCreature, currentStage, collectedCreatures } = data;

    const renderActiveCommunityIcons = () => activeCommunity.map((entry: any) => {
      const zoneColor = COMMUNITY_ZONE_COLORS[entry.colour] || '#5C6BC0';
      return (
        <View
          key={`community-${entry.id}`}
          style={[styles.collectedCreatureIcon, { backgroundColor: zoneColor + '30', borderWidth: 1.5, borderColor: zoneColor }]}
        >
          {entry.stage_image ? (
            <Image source={{ uri: entry.stage_image }} style={styles.communityThumb} />
          ) : (
            <Text style={styles.collectedEmoji}>🐾</Text>
          )}
          {entry.is_complete && (
            <View style={[styles.completeBadge, { backgroundColor: zoneColor }]}>
              <Text style={styles.completeBadgeText}>✓</Text>
            </View>
          )}
        </View>
      );
    });
    
    // Get ALL 4 creatures with progress from collection data
    const allCreatures = (data as any).allCreatures || [];
    
    // If we have all creatures data, show all 4
    if (allCreatures.length > 0) {
      // Calculate total points needed across all creatures
      const totalNeeded = allCreatures.reduce((sum: number, c: any) => {
        return sum + (c.total_points_needed || 0);
      }, 0);
      const currentPts = allCreatures.reduce((sum: number, c: any) => sum + Number(c.current_points || 0), 0);
      const allComplete = allCreatures.every((c: any) => c.is_complete);
      return (
        <View style={styles.creatureIconsContainer}>
          {totalNeeded > 0 && !allComplete && (
            <Text style={{ fontSize: 9, color: '#888', textAlign: 'center', marginBottom: 2 }}>
              ⭐ {currentPts}/{totalNeeded} pts to complete all
            </Text>
          )}
          {allComplete && (
            <Text style={{ fontSize: 9, color: '#4CAF50', textAlign: 'center', marginBottom: 2, fontWeight: '600' }}>
              ✅ All creatures complete!
            </Text>
          )}
          {!!studentNewEligibleCount[studentId] && (
            <Text style={{ fontSize: 9, color: '#9C27B0', textAlign: 'center', marginBottom: 2, fontWeight: '700' }}>
              🌟 New creatures to evolve!
            </Text>
          )}
          <View style={styles.collectedIcons}>
            {allCreatures.slice(0, 4).map((creature: any) => {
              const cStage = Number(creature.current_stage || 0);
              const cColor = creature.color || '#CCC';
              const cEmoji = creature.stages?.[cStage]?.emoji || '🥚';
              const hasPoints = Number(creature.current_points || 0) > 0;
              return (
                <View
                  key={creature.id}
                  style={[styles.collectedCreatureIcon, { 
                    backgroundColor: hasPoints ? cColor + '30' : '#F0F0F0',
                    borderWidth: 1,
                    borderColor: hasPoints ? cColor : '#DDD',
                  }]}
                >
                  <Text style={[styles.collectedEmoji, { opacity: hasPoints ? 1 : 0.4 }]}>
                    {cEmoji}
                  </Text>
                  {cStage >= 3 && (
                    <View style={[styles.completeBadge, { backgroundColor: cColor }]}>
                      <Text style={styles.completeBadgeText}>✓</Text>
                    </View>
                  )}
                </View>
              );
            })}
            {renderActiveCommunityIcons()}
          </View>
        </View>
      );
    }

    return (
      <View style={styles.creatureIconsContainer}>
        {/* Current creature (animated) */}
        <View style={[styles.currentCreatureIcon, { borderColor: currentCreature.color }]}>
          <Text style={styles.miniCreatureEmoji}>
            {currentCreature.stages![currentStage].emoji}
          </Text>
          <View style={styles.stageDots}>
            {[0, 1, 2, 3].map((s) => (
              <View 
                key={s} 
                style={[styles.stageDot, { backgroundColor: s <= currentStage ? currentCreature.color : '#DDD' }]} 
              />
            ))}
          </View>
        </View>

        {/* Collected creatures (smaller) */}
        {collectedCreatures.length > 0 && (
          <View style={styles.collectedIcons}>
            {collectedCreatures.slice(0, 3).map((creature) => (
              <View 
                key={creature.id} 
                style={[styles.collectedCreatureIcon, { backgroundColor: creature.color + '30' }]}
              >
                <Text style={styles.collectedEmoji}>
                  {creature.stages![3].emoji}
                </Text>
                <View style={[styles.completeBadge, { backgroundColor: creature.color }]}>
                  <Text style={styles.completeBadgeText}>✓</Text>
                </View>
              </View>
            ))}
            {collectedCreatures.length > 3 && (
              <View style={styles.moreCreatures}>
                <Text style={styles.moreText}>+{collectedCreatures.length - 3}</Text>
              </View>
            )}
          </View>
        )}
        {activeCommunity.length > 0 && (
          <View style={styles.collectedIcons}>{renderActiveCommunityIcons()}</View>
        )}

        {/* Total points badge */}
        {data.totalPoints > 0 && (
          <View style={styles.pointsBadge}>
            <Text style={styles.pointsText}>⭐ {data.totalPoints}</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <TranslatedHeader title={t('select_profile')} backTo="/" />
      {/* Classroom filter — fixed, never scrolls away, matches teacher flow */}
      {(localClassrooms.length > 0 || (classrooms && classrooms.length > 1)) && (
        <View style={{ backgroundColor:'white', borderBottomWidth:1, borderBottomColor:'#F0F0F0' }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal:12, paddingVertical:8, flexDirection:'row', gap:8, alignItems:'center' }}>
            <TouchableOpacity
              style={{ paddingHorizontal:14, paddingVertical:7, borderRadius:16,
                backgroundColor: !selectedClassroom ? '#5C6BC0' : '#EEEEEE',
                borderWidth:1, borderColor: !selectedClassroom ? '#5C6BC0' : '#DDD' }}
              onPress={() => setSelectedClassroom(null)}>
              <Text style={{ fontSize:13, fontWeight:'600', color: !selectedClassroom ? 'white' : '#555' }}>
                {t('all') || 'All'}
              </Text>
            </TouchableOpacity>
            {(localClassrooms.length > 0 ? localClassrooms : classrooms).map((cl: any) => (
              <TouchableOpacity key={cl.id}
                style={{ paddingHorizontal:14, paddingVertical:7, borderRadius:16,
                  backgroundColor: selectedClassroom === cl.id ? '#5C6BC0' : '#EEEEEE',
                  borderWidth:1, borderColor: selectedClassroom === cl.id ? '#5C6BC0' : '#DDD' }}
                onPress={() => setSelectedClassroom(cl.id)}>
                <Text style={{ fontSize:13, fontWeight:'600',
                  color: selectedClassroom === cl.id ? 'white' : '#555' }}>{cl.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent}>


        <View style={styles.studentsGrid}>
          {(selectedClassroom ? students.filter(s => s.classroom_id === selectedClassroom) : students)
            .slice()
            .sort((a: any, b: any) => {
              const aDate = a.last_checkin_date || a.updated_at || '';
              const bDate = b.last_checkin_date || b.updated_at || '';
              if (aDate && bDate) return bDate.localeCompare(aDate);
              if (aDate) return -1;
              if (bDate) return 1;
              return (a.name || '').localeCompare(b.name || '');
            })
            .map((student: any) => (
            <Pressable
              key={student.id}
              style={({ pressed }) => [
                styles.studentCard,
                { width: cardWidth },
                selectedStudentId === student.id && styles.studentCardSelected,
                pressed && styles.studentCardPressed
              ]}
              onPress={() => handleSelectStudent(student)}
              android_ripple={{ color: 'rgba(76, 175, 80, 0.2)' }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              delayLongPress={200}
            >
              {/* Real feature Aug 23 (item 7): same "genuinely linked between a school and
                  home account" indicator the Family Dashboard's cards already have
                  (parent/dashboard.tsx's linkedBadge), added here so the teacher's side
                  shows it too - disappears automatically since is_linked is computed fresh
                  from real parent_links/family_members rows on every /students fetch, not a
                  stored flag that could go stale if a link is removed. */}
              {(student as any).is_linked && (
                <View style={styles.linkedIndicator}>
                  <MaterialIcons name="link" size={11} color="#4CAF50" />
                </View>
              )}
              <View style={styles.studentMain}>
                {/* Selection indicator */}
                {selectedStudentId === student.id && (
                  <View style={styles.selectionIndicator}>
                    <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
                  </View>
                )}
                <Avatar
                  type={student.avatar_type}
                  preset={student.avatar_preset}
                  custom={student.avatar_custom}
                  size={60}
                  presetAvatars={presetAvatars}
                />
                <Text style={styles.studentName} numberOfLines={1}>
                  {student.name}
                </Text>
                {(student as any).is_family_member && (
                  <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, marginTop: 2, alignSelf: 'center' }}>
                    <Text style={{ fontSize: 9, color: '#4CAF50', fontWeight: '700' }}>🏠 Family</Text>
                  </View>
                )}
              </View>
              
              {/* Mini Creature Display */}
              {renderCreatureIcons(student.id)}
              
              <TouchableOpacity
                style={styles.creaturesButton}
                onPress={() => handleViewCreatures(student)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="pets" size={14} color="#FF9800" />
                <Text style={styles.creaturesButtonText}>{t('my_creatures') || 'My Creatures'}</Text>
              </TouchableOpacity>
            </Pressable>
          ))}

          {/* Add profile — adults can create, students see ask adult message */}
          {isAdult ? (
            <TouchableOpacity
              style={[styles.studentCard, { width: cardWidth, borderStyle:'dashed', borderColor:'#4CAF50', backgroundColor:'#F1F8F1', justifyContent:'center', alignItems:'center', gap:8 }]}
              onPress={handleCreateProfile} activeOpacity={0.7}>
              <MaterialIcons name="add-circle-outline" size={36} color="#4CAF50" />
              <Text style={{ fontSize:11, color:'#4CAF50', textAlign:'center', fontWeight:'700', lineHeight:16 }}>
                {'Add Profile'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={[styles.studentCard, { width: cardWidth, borderStyle:'dashed', borderColor:'#CCC', backgroundColor:'#FAFAFA', justifyContent:'center', alignItems:'center', gap:8, opacity:0.8 }]}>
              <MaterialIcons name="supervisor-account" size={32} color="#BDBDBD" />
              <Text style={{ fontSize:11, color:'#999', textAlign:'center', fontWeight:'600', lineHeight:16 }}>
                {'Ask your teacher\nor parent to\nadd a profile'}
              </Text>
            </View>
          )}
        </View>

        {students.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name={isAdult ? 'person-add' : 'supervisor-account'} size={64} color="#CCC" />
            <Text style={styles.emptyText}>{t('no_profiles_yet') || 'No profiles yet'}</Text>
            {isAdult ? (
              <TouchableOpacity onPress={handleCreateProfile}
                style={{ marginTop:16, backgroundColor:'#4CAF50', paddingHorizontal:24, paddingVertical:12, borderRadius:12 }}>
                <Text style={{ color:'white', fontWeight:'700', fontSize:15 }}>Create First Profile</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.emptySubtext}>{'Ask your teacher or parent\nto add a profile for you'}</Text>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  scrollContent: {
    padding: 12,
    paddingTop: 20,
    paddingBottom: 30,
  },
  instruction: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    marginTop: 8,
  },
  studentsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  studentCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  linkedIndicator: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  studentCardSelected: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  studentCardPressed: {
    backgroundColor: '#F0F0F0',
    transform: [{ scale: 0.98 }],
  },
  selectionIndicator: {
    position: 'absolute',
    top: -12,
    right: -12,
    backgroundColor: 'white',
    borderRadius: 12,
    zIndex: 1,
  },
  studentMain: {
    alignItems: 'center',
    position: 'relative',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 6,
    textAlign: 'center',
  },
  creaturesButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFF3E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 2,
    borderColor: '#333',
  },
  creaturesButtonText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: 'bold',
  },
  // Creature icons styles
  creatureIconsContainer: {
    alignItems: 'center',
    marginTop: 6,
    width: '100%',
  },
  currentCreatureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  miniCreatureEmoji: {
    fontSize: 22,
  },
  stageDots: {
    flexDirection: 'row',
    marginTop: 3,
    gap: 2,
  },
  stageDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  collectedIcons: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 3,
  },
  collectedCreatureIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  collectedEmoji: {
    fontSize: 12,
  },
  communityThumb: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  completeBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 10,
    height: 10,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  completeBadgeText: {
    color: 'white',
    fontSize: 6,
    fontWeight: 'bold',
  },
  moreCreatures: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    fontSize: 8,
    fontWeight: 'bold',
    color: '#666',
  },
  pointsBadge: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 1,
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
  },
  pointsText: {
    fontSize: 11,
    color: '#333',
    fontWeight: '600',
  },
  addCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    backgroundColor: '#F1F8F1',
  },
  addIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
    marginTop: 12,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 8,
  },
});
