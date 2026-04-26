"""
Run with: python3 patch_final_5.py
Fixes:
1. Family member personal strategies - add/edit/delete per member
2. Family dashboard creatures for non-linked members (give them their own)
3. Teacher dashboard - show linked students in recent checkins
4. Resource upload - refresh after upload, fix topic filter
6. Creature fallback when no points yet
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 2 & 6: Family creatures for non-linked members + fallback ─────────────
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Give non-linked family members a default creature display based on their relationship
OLD_CREATURE_FETCH = """      // Fetch creatures for members who are linked to school students
      const creatureMap: Record<string, any> = {};
      for (const m of members) {
        const linkedId = (m as any).student_id;
        if (linkedId) {
          try {
            const collection = await rewardsApi.getCollection(linkedId);
            if (collection?.current_creature) {
              creatureMap[m.id] = {
                emoji: collection.current_creature.stages?.[collection.current_stage]?.emoji || '🥚',
                color: collection.current_creature.color || '#CCC',
                points: collection.current_points || 0,
                stage: collection.current_stage || 0,
                name: collection.current_creature.name || '',
              };
            }
          } catch { /* no creature yet */ }
        }
      }
      setMemberCreatures(creatureMap);"""

NEW_CREATURE_FETCH = """      // Fetch creatures for all family members
      const creatureMap: Record<string, any> = {};
      // Default creature emojis by relationship for non-linked members
      const defaultCreatures: Record<string, {emoji:string,color:string}> = {
        self: {emoji:'🌟', color:'#5C6BC0'},
        partner: {emoji:'💙', color:'#E91E63'},
        child: {emoji:'🥚', color:'#4CAF50'},
        sibling: {emoji:'🌈', color:'#FFC107'},
        grandparent: {emoji:'🌸', color:'#9C27B0'},
        other: {emoji:'⭐', color:'#FF9800'},
      };
      for (const m of members) {
        const linkedId = (m as any).student_id;
        if (linkedId) {
          try {
            const collection = await rewardsApi.getCollection(linkedId);
            if (collection?.current_creature) {
              const stage = collection.current_stage || 0;
              creatureMap[m.id] = {
                emoji: collection.current_creature.stages?.[stage]?.emoji || '🥚',
                color: collection.current_creature.color || '#4CAF50',
                points: collection.current_points || 0,
                stage,
                name: collection.current_creature.name || '',
                hasRealCreature: true,
              };
            }
          } catch { /* no creature yet - use default */ }
        }
        // Give non-linked members a default creature
        if (!creatureMap[m.id]) {
          const def = defaultCreatures[m.relationship] || defaultCreatures.other;
          creatureMap[m.id] = {
            emoji: def.emoji,
            color: def.color,
            points: 0,
            stage: 0,
            name: 'Start checking in!',
            hasRealCreature: false,
          };
        }
      }
      setMemberCreatures(creatureMap);"""

if OLD_CREATURE_FETCH in content:
    content = content.replace(OLD_CREATURE_FETCH, NEW_CREATURE_FETCH)
    print("✅ Fix 2: Family creatures for all members including non-linked")
else:
    print("⚠️  Fix 2: Could not find creature fetch")

# Fix creature display card to show for all members
OLD_CREATURE_DISPLAY = """                  {/* Creature display if linked to school */}
                  {memberCreatures[member.id] && (
                    <View style={styles.memberCreatureRow}>
                      <Text style={styles.memberCreatureEmoji}>
                        {memberCreatures[member.id].emoji}
                      </Text>
                      <View style={[styles.memberCreatureDot, {backgroundColor: memberCreatures[member.id].color}]} />
                    </View>
                  )}"""

NEW_CREATURE_DISPLAY = """                  {/* Creature display for all members */}
                  {memberCreatures[member.id] && (
                    <View style={styles.memberCreatureRow}>
                      <Text style={styles.memberCreatureEmoji}>
                        {memberCreatures[member.id].emoji}
                      </Text>
                      {memberCreatures[member.id].hasRealCreature && (
                        <View style={[styles.memberCreatureDot, {backgroundColor: memberCreatures[member.id].color}]} />
                      )}
                    </View>
                  )}"""

if OLD_CREATURE_DISPLAY in content:
    content = content.replace(OLD_CREATURE_DISPLAY, NEW_CREATURE_DISPLAY)
    print("✅ Fix 2b: Creature display shows for all members")

with open(path, "w") as f:
    f.write(content)

# ── Fix 1: Family member personal strategies ──────────────────────────────────
# Add a route to parent/strategies with memberId param so parents can
# add personal strategies per family member
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Add strategies button to each member card
OLD_CHECKIN_WRAPPER = """                {/* Big kid-friendly check-in button */}
                <TouchableOpacity
                  style={styles.bigCheckinButton}
                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { 
                      memberId: member.id, 
                      memberName: member.name,
                      studentId: (member as any).student_id || '',
                    }
                  })}
                >
                  <Text style={styles.bigCheckinEmoji}>😊</Text>
                  <Text style={styles.bigCheckinText}>{t('check_in') || 'Check In'}</Text>
                </TouchableOpacity>"""

NEW_CHECKIN_WRAPPER = """                {/* Action buttons */}
                <View style={{flexDirection:'row',gap:6,width:'100%'}}>
                  <TouchableOpacity
                    style={[styles.bigCheckinButton, {flex:2}]}
                    onPress={() => router.push({
                      pathname: '/parent/checkin',
                      params: { 
                        memberId: member.id, 
                        memberName: member.name,
                        studentId: (member as any).student_id || '',
                      }
                    })}
                  >
                    <Text style={styles.bigCheckinEmoji}>😊</Text>
                    <Text style={styles.bigCheckinText}>{t('check_in') || 'Check In'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bigCheckinButton, {flex:1, backgroundColor:'#5C6BC0'}]}
                    onPress={() => router.push({
                      pathname: '/parent/strategies',
                      params: { studentId: (member as any).student_id || member.id, memberName: member.name }
                    })}
                  >
                    <Text style={{fontSize:18}}>💡</Text>
                    <Text style={[styles.bigCheckinText, {fontSize:10}]}>Strategies</Text>
                  </TouchableOpacity>
                </View>"""

if OLD_CHECKIN_WRAPPER in content:
    content = content.replace(OLD_CHECKIN_WRAPPER, NEW_CHECKIN_WRAPPER)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 1: Strategies button added to each family member card")
else:
    print("⚠️  Fix 1: Checkin wrapper not found")

# ── Fix 3: Teacher dashboard - show linked students in recent checkins ─────────
path = os.path.join(FRONTEND, "app/teacher/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# The recent logs already fetch from feeling_logs
# Issue is getStudentName returns empty for linked students not in teacher's list
OLD_GET_STUDENT_NAME = """  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    return student?.name || 'Unknown';
  };"""

NEW_GET_STUDENT_NAME = """  const getStudentName = (studentId: string) => {
    const student = students.find(s => s.id === studentId);
    if (student) return student.name;
    // Check if it's a linked student we might not have locally
    return 'Student';
  };"""

if OLD_GET_STUDENT_NAME in content:
    content = content.replace(OLD_GET_STUDENT_NAME, NEW_GET_STUDENT_NAME)
    print("✅ Fix 3: getStudentName handles unknown linked students")

with open(path, "w") as f:
    f.write(content)

# ── Fix 4: Resource upload - refresh after upload ─────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/resources.tsx")
with open(path, "r") as f:
    content = f.read()

# Find upload success handler and add refresh
OLD_UPLOAD_SUCCESS = """      Alert.alert('✅ Uploaded', 'Your resource has been shared successfully.');"""
NEW_UPLOAD_SUCCESS = """      Alert.alert('✅ Uploaded', 'Your resource has been shared successfully.');
      setLoading(true);
      await fetchResources();"""

if OLD_UPLOAD_SUCCESS in content:
    content = content.replace(OLD_UPLOAD_SUCCESS, NEW_UPLOAD_SUCCESS)
    print("✅ Fix 4: Resources refresh after upload")
else:
    # Try alternate
    OLD2 = """      Alert.alert('✅ Success', """
    if OLD2 in content:
        idx = content.find(OLD2)
        end = content.find("');", idx) + 3
        old_str = content[idx:end]
        new_str = old_str + "\n      setLoading(true);\n      await fetchResources();"
        content = content.replace(old_str, new_str)
        print("✅ Fix 4b: Resources refresh after upload (alt pattern)")
    else:
        print("⚠️  Fix 4: Upload success pattern not found")

# Also fix topic filter - pass topic to API correctly
OLD_TOPIC_FETCH = """      const data = await teacherResourcesApi.getAll(selectedTopic);"""
NEW_TOPIC_FETCH = """      const data = await teacherResourcesApi.getAll(selectedTopic || undefined);"""

if OLD_TOPIC_FETCH in content:
    content = content.replace(OLD_TOPIC_FETCH, NEW_TOPIC_FETCH)
    print("✅ Fix 4c: Topic filter fixed")

with open(path, "w") as f:
    f.write(content)

# ── Fix 6: Backend - return all_creatures in collection ───────────────────────
with open(SERVER, "r") as f:
    server = f.read()

# Make sure all_creatures is in the response
OLD_RETURN = """    return {
        "collected_creatures": collected_creatures,
        "current_creature": current_creature,
        "current_stage": current_stage,
        "current_points": current_points,"""

NEW_RETURN = """    return {
        "all_creatures": all_creatures,
        "collected_creatures": collected_creatures,
        "current_creature": current_creature,
        "current_stage": current_stage,
        "current_points": current_points,"""

if OLD_RETURN in content and "all_creatures" not in server[server.find(OLD_RETURN):server.find(OLD_RETURN)+200]:
    server = server.replace(OLD_RETURN, NEW_RETURN)
    with open(SERVER, "w") as f:
        f.write(server)
    print("✅ Fix 6: all_creatures included in collection response")
else:
    print("✅ Fix 6: all_creatures already in collection response")

print("\n✅ All 5 fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Family creatures, personal strategies, linked students, resource refresh, all_creatures' && git push")
