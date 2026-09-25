import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Pressable, Image } from 'react-native';
// Real fix Sep 24 (item4, device report): the 20-22dp community-creature thumbnails on these
// cards were loading through plain RN <Image> - no memory/disk cache of its own, so every
// render (and every trip back to this screen) re-fetched the SAME full-resolution 1120x1120
// stageN_url PNG (confirmed against server.py's get_students - stage_image is exactly that
// field, no thumbnail-sized variant exists yet; reported, not built here per the investigation
// ask) from the network again. expo-image (already a dependency, previously unused anywhere in
// the app) actually caches the decoded bitmap - cachePolicy 'memory-disk' means a creature
// whose image was already shown once (here or elsewhere) renders instantly from memory/disk
// instead of a fresh decode. Aliased to avoid colliding with RN's Image, still used below for
// Image.prefetch on the reward-screen handoff.
import { Image as ExpoImage } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { Avatar } from '../../src/components/Avatar';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { EmotionColourLoader } from '../../src/components/EmotionColourLoader';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useDataGridColumns, gridCardWidth } from '../../src/utils/globalStyles';
import { playButtonFeedback, playSelectFeedback, preloadSounds } from '../../src/utils/sounds';

const COMMUNITY_ZONE_COLORS: Record<string, string> = {
  blue: '#4A90D9', green: '#4CAF73', yellow: '#FFC107', red: '#E05252',
};

export default function StudentSelectScreen() {
  const gridColumns = useDataGridColumns();
  const cardWidth = gridCardWidth(gridColumns);
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const {
    students, classrooms, presetAvatars, setCurrentStudent, currentStudent, refreshStudents, t, language, translations, user,
    // Real fix Sep 24 (item4, device report): the batch creature fetch (and its per-student
    // fallback) now lives in AppContext, deduped by the real student-id-list content rather
    // than re-derived by this screen's own effect on every `students` reference change - see
    // AppContext's matching comment for the full root cause. This screen just reads the result.
    studentCreatureData, studentCreaturesLoading,
    // Real fix Sep 24 (item1, second device-log pass): the full per-student My Creatures
    // collection is now fetched once, in a batch, by AppContext (GET /students/creatures-
    // batch) - see that context's matching comment for the full root cause (a Metro log
    // showed 257x GET /students/{id}/my-creatures fired from this screen's own per-student
    // loop). studentActiveCommunity/studentAllCreatureData below are now derived from this
    // instead of independently fetched.
    studentMyCreaturesData,
  } = useApp();
  const isAdult = user && (user.role === 'teacher' || user.role === 'parent' || user.role === 'admin' || user.role === 'school_admin');
  const [selectedClassroom, setSelectedClassroom] = useState<string | null>(null);
  const [localClassrooms, setLocalClassrooms] = useState<any[]>([]);

  // Build 27: root-caused a real bug here - this fetched the teacher-only GET /classrooms
  // unconditionally, same call-site-audit pattern as A90's refreshStudents/refreshClassrooms
  // crash fix, just manifesting differently: a bare `catch {}` here (not console.error) meant
  // a parent-role 403 failed silently instead of LogBoxing, leaving `localClassrooms` empty.
  // Combined with the render gate below (which used to require classroom data to exist before
  // showing the row AT ALL), this made the entire filter row - including "All" - vanish for
  // every parent-role session, confirmed as the real cause of "classroom filter tab not
  // coming up" seen on the PT device pass (that account is parent-role). Only fetch for
  // teacher-tier roles now; parent role never had real classrooms to filter by anyway.
  const isTeacherTierRole = user?.role === 'teacher' || user?.role === 'school_admin' || user?.role === 'superadmin';
  useEffect(() => {
    if (!isTeacherTierRole) return;
    const fetchClassrooms = async () => {
      try {
        const BURL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const tok = await AsyncStorage.getItem('session_token');
        if (!tok) return;
        const res = await fetch(`${BURL}/api/classrooms`, { headers: { Authorization: `Bearer ${tok}` } });
        if (res.ok) { const data = await res.json(); setLocalClassrooms(Array.isArray(data) ? data : []); }
      } catch (e) { console.error('[student/select:72]', e); }
    };
    fetchClassrooms();
  }, [isTeacherTierRole]);
  // Real fix Sep 24 (item4, device report): studentCreatures/creaturesLoading are now the
  // context-provided studentCreatureData/studentCreaturesLoading (aliased to these names so
  // the rest of this screen - renderCreatureIcons, JSX below - needed no further changes).
  // The batch fetch itself (and its Sep 16 loading-indicator rationale, still valid) moved to
  // AppContext - see its matching comment for why (deduping the 4x-per-screen duplicate calls).
  const studentCreatures = studentCreatureData;
  const creaturesLoading = studentCreaturesLoading;
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  // Real feature Aug 22 (item 7): the tick/completion row here only ever reflected the 4
  // default per-colour creatures - a Family/Class/School/Global creature a student actively
  // selected to work on (via world-creatures.tsx's "Set as Active") never showed up here at
  // all, only inside "My Creatures" itself. Derived from studentMyCreaturesData (the batched
  // fetch now owned by AppContext) instead of independently fetched.
  const studentActiveCommunity = useMemo(() => {
    const active: Record<string, any[]> = {};
    Object.entries(studentMyCreaturesData).forEach(([id, data]) => {
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
    return active;
  }, [studentMyCreaturesData]);

  // Round 3 (Sep 5), item 16: redesigned card display - up to 4 minis (most recent first) +
  // a "xN" total-collection chip, and a milestone-only border. Same source data as
  // studentActiveCommunity above (studentMyCreaturesData), just kept as the FULL per-colour
  // data (default + every community creature, not just active ones) instead of discarding
  // everything but the active subset.
  const studentAllCreatureData = useMemo(() => {
    const allData: Record<string, Record<string, any[]>> = {};
    Object.entries(studentMyCreaturesData).forEach(([id, data]) => {
      if (data?.colours) allData[id] = data.colours;
    });
    return allData;
  }, [studentMyCreaturesData]);

  // Real fix Sep 24 (item2, second device-log pass): unforced - refreshStudents now has its
  // own 30s TTL (AppContext), so this is a no-op when AppContext's own boot-time fetch is
  // still fresh (the common case: reaching this screen shortly after app launch) and a real
  // fetch otherwise (e.g. revisiting this screen well into a session, or after a mutation
  // elsewhere force-refreshed and this then correctly sees fresh data too).
  useEffect(() => {
    refreshStudents();
  }, []);

  // Preload sounds once
  useEffect(() => { preloadSounds(); }, []);

  // Real fix Sep 24 (item4, device report): warm expo-image's cache for every
  // community-creature stage_image the moment studentMyCreaturesData arrives, so the
  // ExpoImage thumbnails below (cachePolicy 'memory-disk') are normally already decoded by
  // the time renderCreatureIcons actually renders them, instead of each card triggering its
  // own first-render fetch of the same full-resolution PNG.
  useEffect(() => {
    const stageImageUrls = new Set<string>();
    Object.values(studentAllCreatureData).forEach(colours => {
      Object.values(colours).forEach((bucket: any) => {
        (bucket as any[]).forEach(entry => { if (entry?.stage_image) stageImageUrls.add(entry.stage_image); });
      });
    });
    stageImageUrls.forEach(url => { ExpoImage.prefetch(url).catch(() => {}); });
  }, [studentAllCreatureData]);

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
    // Real fix Sep 24 (item1c, load-speed investigation): community creatures (photo-based,
    // 1120x1120) render cold on the reward screen with no prefetch anywhere in the app - the
    // exact image URL is already sitting in studentCreatures from this screen's own earlier
    // collection fetch, unused for this. Warms the native image cache for the student's
    // current stage during the zone->strategies interaction time that follows, so it's
    // normally already decoded by the time rewards.tsx actually renders it. Fire-and-forget:
    // a failed/slow prefetch just means that one image loads cold later, same as before.
    const creature = studentCreatures[student.id]?.currentCreature;
    if (creature?.creature_type === 'community') {
      const stage = studentCreatures[student.id]?.currentStage || 0;
      const urls: Record<number, string | undefined> = {
        1: creature.stage1_url, 2: creature.stage2_url, 3: creature.stage3_url, 4: creature.stage4_url,
      };
      const imgUrl = urls[Math.max(1, Math.min(stage, 4))] || creature.stage1_url;
      if (imgUrl) Image.prefetch(imgUrl).catch(() => {});
    }
    setTimeout(() => {
      router.push({ pathname: '/student/zone', params: { returnTo: returnTo || '' } });
    }, 200);
  }, [setCurrentStudent, router, studentCreatures]);

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

  // Round 3 (Sep 5), item 16b: milestone-only border - one side per original colour, filled in
  // only once that colour's DEFAULT creature is fully evolved (stage 3). A full rainbow (all
  // 4 sides coloured) means the core journey - the 4 originals - is complete, independent of
  // however many submitted creatures have been added since. Deliberately never encodes
  // anything else (not "has any progress", not community completion), so it reads the same
  // way at 4 creatures or 40. Plain View border-side colours, no extra library.
  const MILESTONE_BORDER_COLOUR: Record<string, string> = { blue: '#4A90D9', green: '#4CAF73', yellow: '#FFC107', red: '#E05252' };
  const getMilestoneBorderStyle = (studentId: string) => {
    const colours = studentAllCreatureData[studentId];
    const sideFor = (colour: string) => {
      const bucket = colours?.[colour] || [];
      const isDefaultComplete = bucket.find((e: any) => e.type === 'default')?.is_complete;
      return isDefaultComplete ? MILESTONE_BORDER_COLOUR[colour] : '#E5E5E5';
    };
    return {
      borderWidth: 2,
      borderTopColor: sideFor('blue'),
      borderRightColor: sideFor('green'),
      borderBottomColor: sideFor('yellow'),
      borderLeftColor: sideFor('red'),
    };
  };

  // Round 3 (Sep 5), item 16c: chip tint hooks for milestone tiers - implemented now even
  // though most students won't hit these yet, so the thresholds don't need revisiting later.
  // Bronze/silver/gold are placeholders for whatever real tier styling gets designed - the
  // threshold logic itself (10/25/50) is the part worth having cheaply in place early.
  const getCountChipTint = (count: number) => {
    if (count >= 50) return { backgroundColor: '#FFF8E1', borderColor: '#D4AF37' }; // gold
    if (count >= 25) return { backgroundColor: '#F5F5F5', borderColor: '#A8A8A8' }; // silver
    if (count >= 10) return { backgroundColor: '#FBEEE6', borderColor: '#CD7F32' }; // bronze
    return { backgroundColor: '#F0F0F0', borderColor: '#DDD' };
  };

  // Round 3 (Sep 5), item 16a: up to 4 minis, most recent first, then a "xN" chip for the real
  // total (defaults + every submitted creature, matching what /my-creatures actually returns -
  // "Matilda (7)" is her real 4 defaults + 3 community creatures, not a mocked number).
  // "Most recent" is a real limitation, disclosed rather than faked: community creatures have
  // a genuine started_at timestamp, defaults don't (no per-creature "last touched" field exists
  // in the data model today) - so the sort is is_active first (a real, live recency signal),
  // then real started_at/completed_at where it exists, with defaults (no timestamp) sinking to
  // the end unless they're the active one. Exactly right once any community creature exists;
  // for an all-defaults collection it's really just "active first, then colour order".
  const getSortedCreatureEntries = (studentId: string) => {
    const colours = studentAllCreatureData[studentId];
    if (!colours) return null;
    const flat: any[] = [];
    Object.entries(colours).forEach(([colour, bucket]) => {
      (bucket as any[]).forEach(entry => flat.push({ ...entry, colour }));
    });
    flat.sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      const aTs = a.completed_at || a.started_at || '';
      const bTs = b.completed_at || b.started_at || '';
      return bTs.localeCompare(aTs);
    });
    return flat;
  };

  // Render mini creature icons for a student
  const renderCreatureIcons = (studentId: string) => {
    const data = studentCreatures[studentId];
    const activeCommunity = studentActiveCommunity[studentId] || [];
    // Real fix Sep 16 (live-test bug): this used to return null with zero feedback while the
    // batch fetch was pending, indistinguishable from "stuck" during a slow/cold-start load.
    // EmotionColourLoader - the app's one canonical loading indicator - same component used
    // on the reward screen and My Creatures, not a second/different spinner.
    if (!data) {
      return creaturesLoading ? (
        <View style={styles.creatureIconsContainer}>
          <EmotionColourLoader visible size={28} />
        </View>
      ) : null;
    }

    const { currentCreature, currentStage, collectedCreatures } = data;

    const renderActiveCommunityIcons = () => activeCommunity.map((entry: any) => {
      const zoneColor = COMMUNITY_ZONE_COLORS[entry.colour] || '#5C6BC0';
      return (
        <View
          key={`community-${entry.id}`}
          style={[styles.collectedCreatureIcon, { backgroundColor: zoneColor + '30', borderWidth: 1.5, borderColor: zoneColor }]}
        >
          {entry.stage_image ? (
            <ExpoImage source={{ uri: entry.stage_image }} style={styles.communityThumb} cachePolicy="memory-disk" />
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
          {/* Real fix Sep 24 (item1, second device-log pass): the "New creatures to evolve!"
              hint (GET /creatures/eligible, once per student) is removed per explicit
              instruction - that endpoint is only meaningful for a single student actively
              checking in (it answers "what could THIS student start next"), not a list
              screen rendering 15+ cards at once. It was also a real, unnecessary contributor
              to the per-student request storm this screen was generating (see AppContext's
              studentMyCreaturesData comment for the my-creatures half of that same fix). */}
          {(() => {
            // Round 3 (Sep 5), item 16a: replaces the old "first 4 defaults + separately-
            // appended active community icons" layout with one merged, recency-sorted list
            // (see getSortedCreatureEntries above) plus a real total-collection count chip.
            // Falls back to the pre-existing defaults-only rendering if the richer
            // /my-creatures data for this student hasn't loaded yet, so nothing regresses
            // during that brief window.
            const sorted = getSortedCreatureEntries(studentId);
            if (!sorted) {
              return (
                <View style={styles.collectedIcons}>
                  {allCreatures.slice(0, 4).map((creature: any) => {
                    const cStage = Number(creature.current_stage || 0);
                    const cColor = creature.color || '#CCC';
                    const cEmoji = creature.stages?.[cStage]?.emoji || '🥚';
                    const hasPoints = Number(creature.current_points || 0) > 0;
                    return (
                      <View key={creature.id} style={[styles.collectedCreatureIcon, {
                        backgroundColor: hasPoints ? cColor + '30' : '#F0F0F0', borderWidth: 1,
                        borderColor: hasPoints ? cColor : '#DDD',
                      }]}>
                        <Text style={[styles.collectedEmoji, { opacity: hasPoints ? 1 : 0.4 }]}>{cEmoji}</Text>
                        {cStage >= 3 && (
                          <View style={[styles.completeBadge, { backgroundColor: cColor }]}>
                            <Text style={styles.completeBadgeText}>✓</Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              );
            }
            const totalCount = sorted.length;
            const visible = sorted.slice(0, 4);
            return (
              <View style={styles.collectedIcons}>
                {visible.map((entry: any) => {
                  const zoneColor = COMMUNITY_ZONE_COLORS[entry.colour] || '#5C6BC0';
                  const hasProgress = entry.type === 'default' ? Number(entry.points || 0) > 0 : true;
                  return (
                    <View
                      key={`${entry.type}-${entry.id}`}
                      style={[styles.collectedCreatureIcon, {
                        backgroundColor: hasProgress ? zoneColor + '30' : '#F0F0F0',
                        borderWidth: 1, borderColor: hasProgress ? zoneColor : '#DDD',
                      }]}
                    >
                      {entry.type === 'community' ? (
                        entry.stage_image ? <ExpoImage source={{ uri: entry.stage_image }} style={styles.communityThumb} cachePolicy="memory-disk" /> : <Text style={styles.collectedEmoji}>🐾</Text>
                      ) : (
                        <Text style={[styles.collectedEmoji, { opacity: hasProgress ? 1 : 0.4 }]}>{entry.emoji || '🥚'}</Text>
                      )}
                      {entry.is_complete && (
                        <View style={[styles.completeBadge, { backgroundColor: zoneColor }]}>
                          <Text style={styles.completeBadgeText}>✓</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
                {/* Jono's decision (Sep 6): chip only when there's more to show than the 4
                    minis already display - at exactly 4 (the real minimum, all students
                    start here), the minis speak for themselves, no redundant "×4". */}
                {totalCount > 4 && (
                  <View style={[styles.collectedCreatureIcon, getCountChipTint(totalCount), { borderWidth: 1, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#555' }}>×{totalCount}</Text>
                  </View>
                )}
              </View>
            );
          })()}
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
            {collectedCreatures.slice(0, 3).map((creature: any) => (
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
      {/* Build 27: filter row now always renders All + Linked, matching the teacher
          dashboard's own filter-pill component/style exactly - previously this whole row
          (including "All") was gated on classroom data existing at all, which is exactly
          what made it disappear for parent-role sessions once classroom data legitimately
          became unavailable for that role (see the fetch fix above). Order: All -> Linked
          (chain icon, students with a real family link) -> classrooms alphabetically. */}
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
          <TouchableOpacity
            style={{ flexDirection:'row', alignItems:'center', gap:4, paddingHorizontal:14, paddingVertical:7, borderRadius:16,
              backgroundColor: selectedClassroom === 'linked' ? '#5C6BC0' : '#EEEEEE',
              borderWidth:1, borderColor: selectedClassroom === 'linked' ? '#5C6BC0' : '#DDD' }}
            onPress={() => setSelectedClassroom('linked')}>
            <MaterialIcons name="link" size={14} color={selectedClassroom === 'linked' ? 'white' : '#555'} />
            <Text style={{ fontSize:13, fontWeight:'600', color: selectedClassroom === 'linked' ? 'white' : '#555' }}>
              {t('select_filter_linked') || 'Linked'}
            </Text>
          </TouchableOpacity>
          {(localClassrooms.length > 0 ? localClassrooms : classrooms)
            .slice()
            .sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
            .map((cl: any) => (
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
      <ScrollView contentContainerStyle={styles.scrollContent}>


        <View style={styles.studentsGrid}>
          {(selectedClassroom === 'linked' ? students.filter((s: any) => s.is_linked)
            : selectedClassroom ? students.filter(s => s.classroom_id === selectedClassroom)
            : students)
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
                getMilestoneBorderStyle(student.id),
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
    end: 6,
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
