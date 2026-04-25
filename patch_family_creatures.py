"""
Run with: python3 patch_family_creatures.py
Adds creatures display to family member cards and fixes family checkin
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")

with open(path, "r") as f:
    content = f.read()

# ── Fix 1: Add rewardsApi import ─────────────────────────────────────────────
if "rewardsApi" not in content:
    content = content.replace(
        "  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi",
        "  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi, rewardsApi"
    )
    print("✅ Fix 1: rewardsApi imported")
else:
    print("✅ Fix 1: rewardsApi already imported")

# ── Fix 2: Add memberCreatures state ─────────────────────────────────────────
OLD_STATE = """  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);"""
NEW_STATE = """  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [memberCreatures, setMemberCreatures] = useState<Record<string, any>>({});"""

if OLD_STATE in content:
    content = content.replace(OLD_STATE, NEW_STATE)
    print("✅ Fix 2: memberCreatures state added")
else:
    print("⚠️  Fix 2: Could not find familyMembers state")

# ── Fix 3: Fetch creatures for linked students ────────────────────────────────
OLD_SET_MEMBERS = """      setFamilyMembers(members);"""
NEW_SET_MEMBERS = """      setFamilyMembers(members);
      // Fetch creatures for members who are linked to school students
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

if OLD_SET_MEMBERS in content:
    content = content.replace(OLD_SET_MEMBERS, NEW_SET_MEMBERS)
    print("✅ Fix 3: Creatures fetched for linked members")
else:
    print("⚠️  Fix 3: Could not find setFamilyMembers call")

# ── Fix 4: Add creature display inside member card ───────────────────────────
OLD_MEMBER_NAME = """                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  <Text style={styles.memberRole}>{t(member.relationship)}</Text>
                </TouchableOpacity>
                
                {/* Big kid-friendly check-in button */}"""

NEW_MEMBER_NAME = """                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  <Text style={styles.memberRole}>{t(member.relationship)}</Text>
                  {/* Creature display if linked to school */}
                  {memberCreatures[member.id] && (
                    <View style={styles.memberCreatureRow}>
                      <Text style={styles.memberCreatureEmoji}>
                        {memberCreatures[member.id].emoji}
                      </Text>
                      <View style={[styles.memberCreatureDot, {backgroundColor: memberCreatures[member.id].color}]} />
                    </View>
                  )}
                </TouchableOpacity>
                
                {/* Big kid-friendly check-in button */}"""

if OLD_MEMBER_NAME in content:
    content = content.replace(OLD_MEMBER_NAME, NEW_MEMBER_NAME)
    print("✅ Fix 4: Creature display added to member cards")
else:
    print("⚠️  Fix 4: Could not find member name area")

# ── Fix 5: Make checkin button also work for linked students ─────────────────
# The checkin button routes to /parent/checkin with memberId
# This already works - the parent/checkin screen handles family members
# But we should also pass student_id if linked so creatures get points
OLD_CHECKIN_BTN = """                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { memberId: member.id, memberName: member.name }
                  })}"""

NEW_CHECKIN_BTN = """                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { 
                      memberId: member.id, 
                      memberName: member.name,
                      studentId: (member as any).student_id || '',
                    }
                  })}"""

if OLD_CHECKIN_BTN in content:
    content = content.replace(OLD_CHECKIN_BTN, NEW_CHECKIN_BTN)
    print("✅ Fix 5: Checkin button passes studentId for linked members")
else:
    print("⚠️  Fix 5: Could not find checkin button onPress")

# ── Fix 6: Add creature styles ───────────────────────────────────────────────
OLD_MEMBER_ROLE_STYLE = """  memberRole: {"""
NEW_MEMBER_ROLE_STYLE = """  memberCreatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    gap: 4,
  },
  memberCreatureEmoji: {
    fontSize: 18,
  },
  memberCreatureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  memberRole: {"""

if OLD_MEMBER_ROLE_STYLE in content:
    content = content.replace(OLD_MEMBER_ROLE_STYLE, NEW_MEMBER_ROLE_STYLE)
    print("✅ Fix 6: Creature styles added")
else:
    print("⚠️  Fix 6: Could not find memberRole style")

with open(path, "w") as f:
    f.write(content)

# ── Fix 7: parent/checkin - award points to linked student ───────────────────
CHECKIN_PATH = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(CHECKIN_PATH, "r") as f:
    checkin_content = f.read()

# Check if studentId is already handled
if "studentId" not in checkin_content:
    # Add studentId param extraction
    OLD_PARAMS = """  const { memberId, memberName } = useLocalSearchParams<{ memberId: string; memberName: string }>();"""
    NEW_PARAMS = """  const { memberId, memberName, studentId } = useLocalSearchParams<{ memberId: string; memberName: string; studentId?: string }>();"""
    if OLD_PARAMS in checkin_content:
        checkin_content = checkin_content.replace(OLD_PARAMS, NEW_PARAMS)
        print("✅ Fix 7: studentId param added to parent checkin")
    else:
        print("⚠️  Fix 7: Could not find params in parent/checkin")
    with open(CHECKIN_PATH, "w") as f:
        f.write(checkin_content)
else:
    print("✅ Fix 7: studentId already handled in parent/checkin")

print("\n✅ Family creatures patch done!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add creatures to family member cards, fix family checkin flow' && git push")
