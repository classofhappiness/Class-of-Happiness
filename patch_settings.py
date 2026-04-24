"""
Run with: python3 patch_settings.py
Fixes:
1. Removes duplicate Join School section
2. Fixes invite code button to always show for school_admin and admin roles
3. Cleans up messy conditional logic
"""
import os

SETTINGS = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/settings.tsx")

with open(SETTINGS, "r") as f:
    content = f.read()

# Fix 1: Remove the second duplicate "Join School" block that appears after admin code entry
OLD_DUPE = """        {/* Join School - teachers without school */}
        {isAuthenticated && user?.role === 'teacher' && !(user as any)?.school_name && (
          <View style={styles.section}>
            <View style={styles.settingItem}>
              <View style={styles.settingLeft}>
                <MaterialIcons name="school" size={24} color="#5C6BC0" />
                <View style={styles.settingText}>
                  <Text style={styles.settingLabel}>Join Your School</Text>
                  <Text style={styles.settingValue}>Enter the invite code from your school admin</Text>
                </View>
              </View>
            </View>
            <View style={{ paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
              <TextInput
                style={[styles.trialCodeInputWithIcon, { borderRadius: 10, padding: 12, backgroundColor: '#F5F5F5' }]}
                placeholder="e.g. SCH-X7K2-M9P4"
                value={schoolInviteCode}
                onChangeText={setSchoolInviteCode}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={{ backgroundColor: '#5C6BC0', borderRadius: 10, padding: 12, alignItems: 'center' }}
                onPress={handleJoinSchool}
                disabled={joiningSchool}
              >
                <Text style={{ color: 'white', fontWeight: 'bold' }}>{joiningSchool ? 'Joining...' : t('join_school') || 'Join School'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}"""

if OLD_DUPE in content:
    content = content.replace(OLD_DUPE, "        {/* Join School section consolidated above */}")
    print("✅ Fix 1: Removed duplicate Join School section")
else:
    print("⚠️  Fix 1: Duplicate section not found - may already be removed")

# Fix 2: Fix the invite code button condition to also include 'superadmin'
OLD_INVITE_CONDITION = """        {/* School Invite Code Generator - for school admins */}
        {isAuthenticated && (user?.role === 'school_admin' || user?.role === 'admin') && ("""
NEW_INVITE_CONDITION = """        {/* School Invite Code Generator - for school admins */}
        {isAuthenticated && (user?.role === 'school_admin' || user?.role === 'admin' || user?.role === 'superadmin') && ("""

if OLD_INVITE_CONDITION in content:
    content = content.replace(OLD_INVITE_CONDITION, NEW_INVITE_CONDITION)
    print("✅ Fix 2: Invite code button now also shown for superadmin")
else:
    print("⚠️  Fix 2: Invite condition not found - may already be fixed")

# Fix 3: Fix the admin dashboard description that overflows
OLD_DESC = """                <Text style={styles.settingValue}>{user?.role === 'superadmin' ? 'Super Admin — manage all schools' : 'School Admin — manage and support your school'}</Text>"""
NEW_DESC = """                <Text style={styles.settingValue} numberOfLines={2}>{user?.role === 'superadmin' ? 'Super Admin' : 'School Admin'}</Text>"""

if OLD_DESC in content:
    content = content.replace(OLD_DESC, NEW_DESC)
    print("✅ Fix 3: Admin dashboard description shortened to prevent overflow")
else:
    print("⚠️  Fix 3: Admin description not found")

# Fix 4: Fix duplicate color property in trialCodeInput style
OLD_DUPE_COLOR = """  trialCodeInput: {
    color: '#333',
    color: '#333',"""
NEW_DUPE_COLOR = """  trialCodeInput: {
    color: '#333',"""

if OLD_DUPE_COLOR in content:
    content = content.replace(OLD_DUPE_COLOR, NEW_DUPE_COLOR)
    print("✅ Fix 4: Fixed duplicate color property in styles")
else:
    print("⚠️  Fix 4: Duplicate color not found")

with open(SETTINGS, "w") as f:
    f.write(content)

print("\n✅ Settings patch complete!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix settings invite code button and cleanup' && git push")
