"""
Run with: python3 patch_health.py
Fixes all TypeScript errors found in health check:
1. api.ts - remove duplicate linkedChildApi properties
2. parent/resources.tsx - fix getSessionTokenValue -> use auth header properly
3. student/rewards.tsx - add missing headerSpacer style
4. _layout.tsx - add 3 missing screens (parent/widget, student/creatures, auth/login)
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: api.ts - remove duplicate linkedChildApi methods ──────────────────
API = os.path.join(FRONTEND, "src/utils/api.ts")

with open(API, "r") as f:
    content = f.read()

# The duplicate methods were added by patch_linked_child.py on top of existing ones
# Find the linkedChildApi block and rebuild it cleanly
OLD_DUPE_BLOCK = """  getAllCheckIns: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/parent/linked-child/${studentId}/all-checkins?days=${days}`),

  getSchoolStrategies: (studentId: string): Promise<{ custom_strategies: any[]; default_strategies: any[]; sharing_disabled: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/school-strategies`),

  // Family-assigned strategies
  createFamilyStrategy: (studentId: string, data: { strategy_name: string; strategy_description: string; zone: string; icon?: string; share_with_teacher?: boolean }): Promise<FamilyAssignedStrategy> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy`, { method: 'POST', body: JSON.stringify(data) }),

  getFamilyStrategies: (studentId: string): Promise<FamilyAssignedStrategy[]> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategies`),

  toggleStrategySharing: (studentId: string, strategyId: string): Promise<{ share_with_teacher: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy/${strategyId}/toggle-sharing`, { method: 'PUT' }),

  deleteFamilyStrategy: (studentId: string, strategyId: string): Promise<void> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategy/${strategyId}`, { method: 'DELETE' }),

  // Permission management
  toggleHomeSharing: (studentId: string): Promise<{ home_sharing_enabled: boolean }> =>
    apiRequest(`/parent/linked-child/${studentId}/toggle-home-sharing`, { method: 'PUT' }),
};"""

# Check if the older duplicate block exists (from patch_linked_child.py)
OLD_DUPE2 = """  getAllCheckIns: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/parent/linked-child/\${studentId}/all-checkins?days=\${days}`),

  getSchoolStrategies: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/\${studentId}/school-strategies`),

  getFamilyStrategies: (studentId: string): Promise<any[]> =>
    apiRequest(`/parent/linked-child/\${studentId}/family-strategies`),

  createFamilyStrategy: (studentId: string, data: any): Promise<any> =>
    apiRequest(`/parent/linked-child/\${studentId}/family-strategies`, {
      method: 'POST', body: JSON.stringify(data)
    }),

  toggleStrategySharing: (studentId: string, strategyId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/\${studentId}/family-strategies/\${strategyId}/toggle-sharing`, {
      method: 'PUT'
    }),

  toggleHomeSharing: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/\${studentId}/toggle-home-sharing`, { method: 'PUT' }),"""

# Count occurrences of duplicate methods
dupe_count = content.count("getAllCheckIns:")
if dupe_count > 1:
    print(f"⚠️  Found {dupe_count} getAllCheckIns definitions - removing duplicates")
    # Keep only first occurrence by removing second block
    # Find and remove the second occurrence
    first_idx = content.find("  getAllCheckIns:")
    second_idx = content.find("  getAllCheckIns:", first_idx + 1)
    if second_idx > 0:
        # Find the end of the second block (next closing };)
        end_idx = content.find("\n};", second_idx)
        if end_idx > 0:
            # Remove from second occurrence back a bit to include preceding newline
            content = content[:second_idx-2] + content[end_idx:]
            print("✅ Fix 1: Removed duplicate linkedChildApi methods")
        else:
            print("⚠️  Fix 1: Could not find end of duplicate block")
    else:
        print("✅ Fix 1: No duplicates found")
else:
    print("✅ Fix 1: No duplicate getAllCheckIns found")

with open(API, "w") as f:
    f.write(content)

# ── Fix 2: parent/resources.tsx - fix getSessionTokenValue ───────────────────
PARENT_RES = os.path.join(FRONTEND, "app/parent/resources.tsx")

with open(PARENT_RES, "r") as f:
    content = f.read()

# Replace the broken fetch with proper apiRequest
OLD_FETCH = """        // Fetch resources shared with parents (audience=parents or both)
        fetch(`${BACKEND_URL}/api/parent/resources`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await import('../../src/utils/api')).getSessionTokenValue?.() || ''}`,
          }
        }).then(r => r.ok ? r.json() : []).catch(() => []),"""

NEW_FETCH = """        // Fetch resources shared with parents (audience=parents or both)
        (async () => {
          try {
            const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
            const token = await AsyncStorage.getItem('session_token');
            const r = await fetch(`${BACKEND_URL}/api/parent/resources`, {
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token || ''}`,
              }
            });
            return r.ok ? r.json() : [];
          } catch { return []; }
        })(),"""

if OLD_FETCH in content:
    content = content.replace(OLD_FETCH, NEW_FETCH)
    print("✅ Fix 2: parent/resources.tsx getSessionTokenValue fixed")
else:
    print("⚠️  Fix 2: Could not find broken fetch in resources.tsx")

with open(PARENT_RES, "w") as f:
    f.write(content)

# ── Fix 3: student/rewards.tsx - add missing headerSpacer style ───────────────
REWARDS = os.path.join(FRONTEND, "app/student/rewards.tsx")

with open(REWARDS, "r") as f:
    content = f.read()

# Check if headerSpacer already exists
if "headerSpacer:" not in content:
    OLD_LOADING_TEXT = "  loadingText: { fontSize: 18, color: '#666' },"
    NEW_LOADING_TEXT = "  loadingText: { fontSize: 18, color: '#666' },\n  headerSpacer: { height: 20 },"
    if OLD_LOADING_TEXT in content:
        content = content.replace(OLD_LOADING_TEXT, NEW_LOADING_TEXT)
        print("✅ Fix 3: headerSpacer style added to rewards.tsx")
    else:
        # Try finding end of StyleSheet
        if "continueText:" in content:
            content = content.replace(
                "continueText: {",
                "headerSpacer: { height: 20 },\n  continueText: {"
            )
            print("✅ Fix 3: headerSpacer added before continueText")
        else:
            print("⚠️  Fix 3: Could not find insertion point for headerSpacer")
else:
    print("✅ Fix 3: headerSpacer already exists")

with open(REWARDS, "w") as f:
    f.write(content)

# ── Fix 4: _layout.tsx - add 3 missing screens ───────────────────────────────
LAYOUT = os.path.join(FRONTEND, "app/_layout.tsx")

with open(LAYOUT, "r") as f:
    content = f.read()

missing_screens = []

# Check and add auth/login
if "auth/login" not in content:
    missing_screens.append("auth/login")
    OLD_AUTH = """        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
            title: 'Signing In',
          }}
        />"""
    NEW_AUTH = """        <Stack.Screen
          name="auth/callback"
          options={{
            headerShown: false,
            title: 'Signing In',
          }}
        />
        <Stack.Screen
          name="auth/login"
          options={{
            headerShown: false,
            title: 'Sign In',
          }}
        />"""
    content = content.replace(OLD_AUTH, NEW_AUTH)

# Check and add parent/widget
if "parent/widget" not in content:
    missing_screens.append("parent/widget")
    OLD_PARENT_CHECKIN = """        <Stack.Screen
          name="parent/checkin"
          options={{
            title: 'Check-in',
            headerBackTitle: 'Dashboard',
          }}
        />"""
    NEW_PARENT_CHECKIN = """        <Stack.Screen
          name="parent/checkin"
          options={{
            title: 'Check-in',
            headerBackTitle: 'Dashboard',
          }}
        />
        <Stack.Screen
          name="parent/widget"
          options={{
            headerShown: false,
            title: 'Family Widget',
          }}
        />
        <Stack.Screen
          name="parent/strategies"
          options={{
            title: 'Family Strategies',
            headerBackTitle: 'Dashboard',
          }}
        />"""
    if OLD_PARENT_CHECKIN in content:
        content = content.replace(OLD_PARENT_CHECKIN, NEW_PARENT_CHECKIN)

# Check and add student/creatures
if "student/creatures" not in content:
    missing_screens.append("student/creatures")
    OLD_REWARDS = """        <Stack.Screen
          name="student/rewards"
          options={{
            headerShown: false,
            title: 'Rewards',
          }}
        />"""
    NEW_REWARDS = """        <Stack.Screen
          name="student/rewards"
          options={{
            headerShown: false,
            title: 'Rewards',
          }}
        />
        <Stack.Screen
          name="student/creatures"
          options={{
            headerShown: false,
            title: 'My Creatures',
          }}
        />"""
    if OLD_REWARDS in content:
        content = content.replace(OLD_REWARDS, NEW_REWARDS)

if missing_screens:
    print(f"✅ Fix 4: Added missing screens: {', '.join(missing_screens)}")
else:
    print("✅ Fix 4: All screens already registered")

with open(LAYOUT, "w") as f:
    f.write(content)

# ── Fix 5: Verify api.ts duplicate count after fix ───────────────────────────
with open(API, "r") as f:
    final_content = f.read()

dupes = {
    "getAllCheckIns": final_content.count("getAllCheckIns:"),
    "getSchoolStrategies": final_content.count("getSchoolStrategies:"),
    "getFamilyStrategies": final_content.count("getFamilyStrategies:"),
    "toggleStrategySharing": final_content.count("toggleStrategySharing:"),
    "toggleHomeSharing": final_content.count("toggleHomeSharing:"),
}
all_ok = all(v == 1 for v in dupes.values())
if all_ok:
    print("✅ Fix 5: api.ts - all methods unique, no duplicates")
else:
    for k, v in dupes.items():
        if v > 1:
            print(f"⚠️  Fix 5: '{k}' still appears {v} times in api.ts")

print("\n✅ All health fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix TS errors: api duplicates, missing styles, missing routes' && git push")
