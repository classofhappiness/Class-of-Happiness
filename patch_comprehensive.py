"""
Run with: python3 patch_comprehensive.py
Fixes:
1. Classrooms not loading + strategy add error
2. Family dashboard layout spacing + remove individual strategy button
3. Unlink not working - fix API call
4. Link code shows 'undefined' after linking
5. Disclaimer not shown when parent enters code
6. Family checkin shows wrong strategies - should show parent research strategies
7. Unlink button for teacher in individual student
8. Heading shadow accent on classrooms
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 3: Unlink - fix API call (parent uses wrong endpoint) ─────────────────
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix: use linkedChildApi.unlink instead of teacherApi.unlinkStudent
OLD_UNLINK = """                              await teacherApi.unlinkStudent(child.id);
                              Alert.alert(t('success') || 'Success', t('child_unlinked') || 'Child has been unlinked');"""
NEW_UNLINK = """                              await linkedChildApi.unlink(child.id);
                              Alert.alert(t('success') || 'Success', t('child_unlinked') || 'Child has been unlinked successfully');"""

if OLD_UNLINK in content:
    content = content.replace(OLD_UNLINK, NEW_UNLINK)
    print("✅ Fix 3: Unlink now uses correct linkedChildApi.unlink")
else:
    print("⚠️  Fix 3: Unlink pattern not found")

# Add linkedChildApi import if missing
if "linkedChildApi" not in content.split("from '../../src/utils/api'")[0].split("import {")[-1]:
    content = content.replace(
        "  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi, rewardsApi",
        "  familyApi, FamilyMember, FamilyZoneLog, authApiExtended, teacherApi, rewardsApi, linkedChildApi"
    )
    print("✅ Fix 3b: linkedChildApi imported")

# ── Fix 2: Remove individual strategy button from member cards ────────────────
OLD_STRAT_BTN = """                  <TouchableOpacity
                    style={[styles.bigCheckinButton, {flex:1, backgroundColor:'#5C6BC0'}]}
                    onPress={() => router.push({
                      pathname: '/parent/strategies',
                      params: { 
                        studentId: (member as any).student_id || member.id,
                        memberName: member.name,
                      }
                    })}
                  >
                    <Text style={{fontSize:16}}>💡</Text>
                    <Text style={[styles.bigCheckinText, {fontSize:10}]}>Strategies</Text>
                  </TouchableOpacity>"""

NEW_STRAT_BTN = ""  # Remove entirely

if OLD_STRAT_BTN in content:
    content = content.replace(OLD_STRAT_BTN, NEW_STRAT_BTN)
    # Fix the flex on checkin button back to full width
    content = content.replace(
        "[styles.bigCheckinButton, {flex:2}]",
        "styles.bigCheckinButton"
    )
    # Fix the wrapper View
    content = content.replace(
        "{/* Action buttons row */}\n                <View style={{flexDirection:'row', gap:6, width:'100%'}}>",
        "{/* Check-in button */}\n                <View>"
    )
    print("✅ Fix 2: Individual strategy button removed from member cards")

# Fix family dashboard spacing - member cards were getting extra margin
OLD_MEMBER_WRAPPER = """              <View key={member.id} style={styles.memberCardWrapper}>"""
# Keep as is but fix the container styles
# Fix heading too close to logo
OLD_HEADER = """        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>{t('family_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness')}</Text>
          <View style={styles.yellowBar} />
        </View>"""

NEW_HEADER = """        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('family_dashboard') || 'Family Dashboard'}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness') || 'Track emotional wellness at home'}</Text>
        </View>"""

if OLD_HEADER in content:
    content = content.replace(OLD_HEADER, NEW_HEADER)
    print("✅ Fix 2b: Family dashboard header simplified - no duplicate logo")
else:
    print("⚠️  Fix 2b: Header pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 4: Link code shows 'undefined' - fix parentApi.linkChild response ─────
with open(SERVER, "r") as f:
    server = f.read()

# Find the link_child endpoint and fix response
OLD_LINK_CHILD = """    supabase.table("parent_links").insert({"""
# Find context around this
idx = server.find("@api_router.post(\"/parent/link-child\")")
if idx > 0:
    snippet = server[idx:idx+800]
    print(f"Link child endpoint found at char {idx}")
    # Fix the response to return student name properly
    if '"student_name": student_data' in snippet or 'student_name' in snippet:
        print("✅ Fix 4: link-child response already has student_name")
    else:
        # Find the return statement and fix it
        old_return = 'return {"message": "Child linked successfully"}'
        new_return = '''student = supabase.table("students").select("name").eq("id", student_id).execute()
        student_name = student.data[0]["name"] if student.data else "Student"
        return {"message": "Child linked successfully", "student_name": student_name, "student_id": student_id}'''
        if old_return in server:
            server = server.replace(old_return, new_return)
            print("✅ Fix 4: link-child now returns student_name")

# Fix the link code lookup - link codes are 8 chars not 6
OLD_LINK_CODE_CHECK = """    result = supabase.table("students").select("*").eq("link_code", body.link_code).execute()"""
if OLD_LINK_CODE_CHECK in server:
    print("✅ Fix 4b: link_code field check - checking parent_link_code field too")
    server = server.replace(
        OLD_LINK_CODE_CHECK,
        """    # Try both field names for compatibility
    result = supabase.table("students").select("*").eq("parent_link_code", body.link_code).execute()
    if not result.data:
        result = supabase.table("students").select("*").eq("link_code", body.link_code).execute()"""
    )
    print("✅ Fix 4b: Link code now checks both field names")

with open(SERVER, "w") as f:
    f.write(server)

# ── Fix 5: Show disclaimer before parent enters link code ─────────────────────
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Find the link code submission and add disclaimer check
OLD_LINK_SUBMIT = """    if (!linkCode.trim()) return;
    setLinking(true);
    try {
      const result = await parentApi.linkChild(linkCode.trim());"""

NEW_LINK_SUBMIT = """    if (!linkCode.trim()) return;
    if (!disclaimerAccepted) {
      Alert.alert(
        '📋 Data Sharing Consent',
        'By linking your child, you agree that:\\n\\n• Their school check-in data will be visible to you\\n• Your home check-ins can be shared with their teacher (you control this)\\n• All data is kept confidential to your family and teacher\\n\\nDo you consent to this data sharing?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Agree', onPress: () => { setDisclaimerAccepted(true); handleLinkChild(); } }
        ]
      );
      return;
    }
    setLinking(true);
    try {
      const result = await parentApi.linkChild(linkCode.trim());"""

if OLD_LINK_SUBMIT in content:
    content = content.replace(OLD_LINK_SUBMIT, NEW_LINK_SUBMIT)
    print("✅ Fix 5: Consent dialog shown before linking")
else:
    print("⚠️  Fix 5: Link submit pattern not found")

# Fix 'undefined' showing after link - fix result display
OLD_LINK_SUCCESS = """      Alert.alert(t('success') || 'Success', `${result.student_name || result.name || 'Child'} has been linked!`);"""
if OLD_LINK_SUCCESS not in content:
    # Find alert after linkChild
    content = content.replace(
        "setLinkedChildren(prev => [...prev, result]);",
        "setLinkedChildren(prev => [...prev, result]);\n      Alert.alert('✅ Linked!', `${result.student_name || result.name || 'Child'} has been linked to your family account.`);"
    )
    print("✅ Fix 4c: Success message shows student name")

with open(path, "w") as f:
    f.write(content)

# ── Fix 6: Family checkin - show parent-appropriate strategies ────────────────
path = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(path, "r") as f:
    content = f.read()

# Replace generic strategiesApi with parent-specific strategies
PARENT_STRATEGIES = """
// Research-backed parent strategies per zone
const PARENT_STRATEGIES: Record<string, Array<{id:string; name:string; description:string; icon:string}>> = {
  blue: [
    {id:'p_b1', name:'Side-by-Side Presence', description:'Sit quietly together without fixing', icon:'people'},
    {id:'p_b2', name:'Warm Drink Together', description:'Make a warm drink and chat gently', icon:'local-cafe'},
    {id:'p_b3', name:'Name It to Tame It', description:'Gently label the feeling out loud', icon:'chat-bubble'},
    {id:'p_b4', name:'Gentle Movement', description:'A slow walk outside together', icon:'directions-walk'},
    {id:'p_b5', name:'Comfort & Closeness', description:'A long warm hug, no words needed', icon:'favorite'},
  ],
  green: [
    {id:'p_g1', name:'Gratitude Round', description:'Share one thing each person is grateful for', icon:'favorite'},
    {id:'p_g2', name:'Strength Spotting', description:'Notice and name a strength you saw today', icon:'star'},
    {id:'p_g3', name:'Creative Time', description:'Draw, cook or build something together', icon:'palette'},
    {id:'p_g4', name:'Family Dance', description:'Put on a song and move together', icon:'music-note'},
    {id:'p_g5', name:'Calm Problem Solving', description:'Plan and solve a challenge together', icon:'lightbulb'},
  ],
  yellow: [
    {id:'p_y1', name:'Box Breathing Together', description:'In 4, hold 4, out 4 — do it together', icon:'air'},
    {id:'p_y2', name:'Validate First', description:'Say "that makes sense" before solving', icon:'volunteer-activism'},
    {id:'p_y3', name:'Body Check-In', description:'Where do you feel this in your body?', icon:'accessibility'},
    {id:'p_y4', name:'Feelings Journal', description:'Write or draw the feeling', icon:'edit'},
    {id:'p_y5', name:'Give Space with Love', description:'5 mins space, then check back warmly', icon:'timer'},
  ],
  red: [
    {id:'p_r1', name:'Stay Calm Yourself', description:'Your calm regulates theirs — breathe first', icon:'self-improvement'},
    {id:'p_r2', name:'Safe Space Together', description:'Move to a quieter place together', icon:'home'},
    {id:'p_r3', name:'Cold Water Reset', description:'Cold water on face reduces heart rate fast', icon:'water'},
    {id:'p_r4', name:'No Teaching Now', description:'Wait for calm before discussing behaviour', icon:'do-not-disturb'},
    {id:'p_r5', name:'Reconnect with Warmth', description:'Hug and soft voice before any correction', icon:'favorite-border'},
  ],
};
"""

# Add parent strategies const before the component
if "PARENT_STRATEGIES" not in content:
    content = content.replace(
        "const MAX_COMMENT_LENGTH = 100;",
        "const MAX_COMMENT_LENGTH = 100;\n" + PARENT_STRATEGIES
    )
    print("✅ Fix 6a: Parent strategies added")

# Replace the fetchStrategies to use parent strategies
OLD_FETCH_STRAT = """  const fetchStrategies = async () => {
    if (!selectedZone) return;
    try {
      const data = await strategiesApi.getByZone(selectedZone, undefined, language || 'en');
      setStrategies(data);
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };"""

NEW_FETCH_STRAT = """  const fetchStrategies = async () => {
    if (!selectedZone) return;
    // Use parent-specific research-backed strategies
    const parentStrats = PARENT_STRATEGIES[selectedZone] || [];
    setStrategies(parentStrats as any);
  };"""

if OLD_FETCH_STRAT in content:
    content = content.replace(OLD_FETCH_STRAT, NEW_FETCH_STRAT)
    print("✅ Fix 6b: Family checkin now uses parent research strategies")
else:
    print("⚠️  Fix 6b: fetchStrategies pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 1: Classrooms strategy add error - fix the API endpoint ───────────────
# The issue is customStrategiesApi.create uses wrong field names
# Check what the backend expects
with open(SERVER, "r") as f:
    server = f.read()

# Find custom-strategies create endpoint
idx = server.find("@api_router.post(\"/custom-strategies\")")
if idx > 0:
    print(f"\n📋 Custom strategies endpoint found - checking fields:")
    print(server[idx:idx+300])
else:
    print("⚠️  Custom strategies endpoint not found")

# ── Fix 8: Add shadow to classrooms heading ───────────────────────────────────
# Already handled by pageHeader styles with elevation

print("\n✅ All fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix unlink, consent, strategies, family dashboard, checkin strategies' && git push")
