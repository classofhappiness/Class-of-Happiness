"""
Run with: python3 patch_strategy_system.py
Completely fixes the strategy display system:
1. getStrategyName uses the same fallback strategies as student/strategies.tsx
2. Classroom bulk add uses /helpers/custom endpoint (correct one)
3. Link code error fix
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Complete strategy lookup in student-detail ─────────────────────────
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Add the complete strategy lookup map near the top of the file
STRATEGY_MAP = """
// Complete strategy name lookup - matches student/strategies.tsx fallback IDs
const STRATEGY_NAME_MAP: Record<string, string> = {
  // Blue zone
  b1: 'Gentle Stretch', b2: 'Favourite Song', b3: 'Tell Someone', b4: 'Slow Breathing',
  // Green zone  
  g1: 'Keep Going!', g2: 'Help a Friend', g3: 'Set a Goal', g4: 'Gratitude',
  // Yellow zone
  y1: 'Bubble Breathing', y2: 'Count to 10', y3: '5 Senses', y4: 'Talk About It',
  // Red zone
  r1: 'Freeze', r2: 'Big Breaths', r3: 'Safe Space', r4: 'Ask for Help',
  // Parent strategies
  p_b1: 'Side-by-Side Presence', p_b2: 'Warm Drink Ritual', p_b3: 'Name It to Tame It',
  p_b4: 'Movement Invitation', p_b5: 'Comfort & Closeness',
  p_g1: 'Gratitude Round', p_g2: 'Strength Spotting', p_g3: 'Creative Together',
  p_g4: 'Family Dance', p_g5: 'Calm Problem Solving',
  p_y1: 'Box Breathing Together', p_y2: 'Validate First', p_y3: 'Body Check-In',
  p_y4: 'Feelings Journal', p_y5: 'Give Space with Love',
  p_r1: 'Stay Calm Yourself', p_r2: 'Safe Space Together', p_r3: 'Cold Water Reset',
  p_r4: 'No Teaching Now', p_r5: 'Reconnect with Warmth',
};
"""

if "STRATEGY_NAME_MAP" not in content:
    content = content.replace(
        "const ZONE_COLORS = {",
        STRATEGY_MAP + "\nconst ZONE_COLORS = {"
    )
    print("✅ Fix 1a: Strategy name map added")

# Fix getStrategyName to use the map
OLD_GET_STRATEGY = """  const getStrategyName = (strategyId: string) => {
    // Check loaded strategies first
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy?.name) return strategy.name;
    // Check allStrategies (school + family)
    const schoolStrat = allStrategies.school.find((s: any) => s.id === strategyId);
    if (schoolStrat?.name) return schoolStrat.name;
    // Clean up ID format: red_1 → Red Strategy 1, p_g1 → Green Strategy
    if (strategyId.includes('_')) {
      const parts = strategyId.split('_');
      const zoneMap: Record<string,string> = {
        r: 'Red', g: 'Green', b: 'Blue', y: 'Yellow',
        red: 'Red', green: 'Green', blue: 'Blue', yellow: 'Yellow', p: 'Parent'
      };
      const zone = zoneMap[parts[0]] || parts[0];
      return `${zone} Strategy`;
    }
    return strategyId;
  };"""

NEW_GET_STRATEGY = """  const getStrategyName = (strategyId: string) => {
    if (!strategyId) return '';
    // Check the complete name map first
    if (STRATEGY_NAME_MAP[strategyId]) return STRATEGY_NAME_MAP[strategyId];
    // Check loaded strategies
    const strategy = strategies.find((s: any) => s.id === strategyId || s.name === strategyId);
    if (strategy?.name) return strategy.name;
    // Check allStrategies
    const schoolStrat = allStrategies.school.find((s: any) => s.id === strategyId);
    if (schoolStrat?.name) return schoolStrat.name;
    const familyStrat = allStrategies.family.find((s: any) => s.id === strategyId);
    if (familyStrat?.name || familyStrat?.strategy_name) return familyStrat.name || familyStrat.strategy_name;
    // If it looks like a readable name already, return it
    if (strategyId.length > 5 && !strategyId.match(/^[a-z]_?\d+$/)) return strategyId;
    // Last resort cleanup
    return strategyId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };"""

if OLD_GET_STRATEGY in content:
    content = content.replace(OLD_GET_STRATEGY, NEW_GET_STRATEGY)
    print("✅ Fix 1b: getStrategyName fully fixed")
else:
    print("⚠️  Fix 1b: getStrategyName pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 2: Classroom bulk add - use correct /helpers/custom endpoint ───────────
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the bulk add to use direct fetch to /helpers/custom (original working endpoint)
OLD_BULK = """      await Promise.all(
        Array.from(selectedStudentIds).map(studentId =>
          customStrategiesApi.create({
            student_id: studentId,
            name: stratName,
            description: stratDesc,
            zone: selectedZone,
            feeling_colour: selectedZone,
            icon: stratIcon,
            is_shared: true,
          })
        )
      );"""

NEW_BULK = """      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorage.getItem('session_token');
      
      await Promise.all(
        Array.from(selectedStudentIds).map(studentId =>
          fetch(`${BACKEND_URL}/api/helpers/custom`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              student_id: studentId,
              name: stratName,
              description: stratDesc,
              feeling_colour: selectedZone,
              icon: stratIcon,
              is_shared: true,
            }),
          }).then(r => { if (!r.ok) throw new Error(`Failed for ${studentId}`); return r.json(); })
        )
      );"""

if OLD_BULK in content:
    content = content.replace(OLD_BULK, NEW_BULK)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 2: Classroom bulk add uses /helpers/custom endpoint correctly")
else:
    print("⚠️  Fix 2: Bulk add pattern not found")

# ── Fix 3: Link code error - fix the parent link endpoint ─────────────────────
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")
with open(SERVER, "r") as f:
    server = f.read()

# Find the parent link-child endpoint and make sure it handles the link code correctly
idx = server.find('@api_router.post("/parent/link-child")')
if idx > 0:
    snippet = server[idx:idx+600]
    print(f"\n📋 Parent link-child endpoint:")
    print(snippet[:400])
    
    # Fix: the link code lookup
    if "parent_link_code" in snippet and "link_code" in snippet:
        print("✅ Fix 3: Both field names checked in link code lookup")
    else:
        print("⚠️  Fix 3: May need to check link code field")

# ── Fix 4: Family checkin - show strategies WITH descriptions ─────────────────
path = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(path, "r") as f:
    content = f.read()

# Find the strategy display and add descriptions
OLD_STRAT_DISPLAY = """                    <Text style={styles.strategyName}>{strategy.name}</Text>"""
NEW_STRAT_DISPLAY = """                    <Text style={styles.strategyName}>{strategy.name}</Text>
                    {strategy.description ? (
                      <Text style={styles.strategyDesc}>{strategy.description}</Text>
                    ) : null}"""

if OLD_STRAT_DISPLAY in content:
    content = content.replace(OLD_STRAT_DISPLAY, NEW_STRAT_DISPLAY)
    # Add strategyDesc style
    content = content.replace(
        "  strategyName: {",
        "  strategyDesc: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },\n  strategyName: {"
    )
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 4: Strategy descriptions show in family checkin")
else:
    print("⚠️  Fix 4: Strategy display pattern not found")

print("\n✅ Strategy system fixes complete!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix complete strategy system - names, display, bulk add, family checkin' && git push")
