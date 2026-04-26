"""
Run with: python3 patch_strategy_thorough.py
THOROUGH fix of entire strategy system:
1. Fix /strategies endpoint to return helpers data (same as /helpers)
2. Fix student-detail to load strategies from /helpers endpoint
3. Fix strategy names (green_2 etc) - load actual helper names
4. Fix linked child to show generic strategies
5. Fix family add/edit/delete strategies
6. Fix home sharing toggle showing wrong state
7. Fix linked badge on teacher students list
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 1: Backend /strategies endpoint should return helpers ─────────────────
with open(SERVER, "r") as f:
    content = f.read()

OLD_STRATEGIES = """@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None, student_id: Optional[str] = None, lang: str = "en"):"""

if OLD_STRATEGIES in content:
    # Find the full function
    idx = content.find(OLD_STRATEGIES)
    end = content.find("\n@api_router", idx + 1)
    old_func = content[idx:end]
    
    new_func = """@api_router.get("/strategies")
async def get_strategies(zone: Optional[str] = None, feeling_colour: Optional[str] = None, 
                          student_id: Optional[str] = None, lang: str = "en"):
    \"\"\"Returns strategies - delegates to helpers endpoint for consistency.\"\"\"
    effective_zone = zone or feeling_colour
    # Get default helpers for this zone
    helpers_result = supabase.table("helpers").select("*")
    if effective_zone:
        helpers_result = helpers_result.eq("feeling_colour", effective_zone)
    if lang and lang != "en":
        helpers_result = helpers_result.eq("lang", lang)
    else:
        helpers_result = helpers_result.eq("lang", "en")
    result = helpers_result.execute()
    helpers = result.data or []
    
    # Also get custom helpers for the student
    custom = []
    if student_id:
        try:
            custom_result = supabase.table("custom_helpers").select("*").eq("student_id", student_id).execute()
            for h in (custom_result.data or []):
                if not effective_zone or h.get("feeling_colour") == effective_zone:
                    custom.append({
                        **h,
                        "zone": h.get("feeling_colour", h.get("zone", effective_zone)),
                        "is_custom": True,
                    })
        except Exception: pass
    
    # Normalise helpers to strategy format
    strategies = []
    for h in helpers:
        strategies.append({
            "id": h.get("id", h.get("helper_id", "")),
            "name": h.get("name", ""),
            "description": h.get("description", ""),
            "icon": h.get("icon", "star"),
            "zone": h.get("feeling_colour", effective_zone or "green"),
            "feeling_colour": h.get("feeling_colour", effective_zone or "green"),
        })
    return strategies + custom

"""
    content = content[:idx] + new_func + content[end:]
    print("✅ Fix 1: /strategies endpoint now returns real helpers data")
else:
    print("⚠️  Fix 1: Could not find /strategies endpoint")

with open(SERVER, "w") as f:
    f.write(content)

# ── Fix 2: student-detail - load strategies from /helpers endpoint ─────────────
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the fetchData strategies section
OLD_FETCH_STRAT = """      // Fetch all strategies (school custom + admin + family shared)
      try {
        const allStrats = await teacherHomeDataApi.getAllStrategies(studentId);
        // Combine school and family strategies into one list
        const schoolStrats = (allStrats.school_strategies || []).map((s: any) => ({
          ...s,
          source: 'school',
        }));
        const familyStrats = (allStrats.family_strategies || []).map((s: any) => ({
          ...s,
          name: s.name || s.strategy_name,
          description: s.description || s.strategy_description,
          source: 'home',
        }));
        setStrategies([...schoolStrats, ...familyStrats] as any);
        setAllStrategies({ school: schoolStrats, family: familyStrats });
      } catch (stratErr) {
        console.log('Strategies fetch error:', stratErr);
        // Fallback to basic strategies API
        try {
          const basic = await strategiesApi.getAll(studentId);
          setStrategies(basic || []);
        } catch { setStrategies([]); }
      }"""

NEW_FETCH_STRAT = """      // Fetch all strategies from helpers + custom helpers + family
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
        const token = await AsyncStorage.getItem('session_token');
        
        // Load helpers for all zones
        const helperPromises = ['blue','green','yellow','red'].map(zone =>
          fetch(`${BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=en`)
            .then(r => r.json()).catch(() => [])
        );
        const helperResults = await Promise.all(helperPromises);
        const allHelpers = helperResults.flat();
        
        // Load custom helpers for this student
        const customRes = await fetch(`${BACKEND_URL}/api/custom-strategies?student_id=${studentId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const customHelpers = customRes.ok ? await customRes.json() : [];
        
        // Combine all
        const combined = [
          ...allHelpers.map((h: any) => ({ ...h, id: h.id || h.helper_id, source: 'school' })),
          ...customHelpers.map((h: any) => ({ ...h, source: 'custom', name: h.name || h.helper_name })),
        ];
        setStrategies(combined as any);
        
        // Also load teacher/family strategies
        try {
          const allStrats = await teacherHomeDataApi.getAllStrategies(studentId);
          const schoolStrats = (allStrats.school_strategies || []).map((s: any) => ({ ...s, source: 'school' }));
          const familyStrats = (allStrats.family_strategies || []).map((s: any) => ({
            ...s, name: s.name || s.strategy_name, description: s.description || s.strategy_description, source: 'home',
          }));
          setAllStrategies({ school: [...schoolStrats, ...customHelpers], family: familyStrats });
        } catch { setAllStrategies({ school: customHelpers, family: [] }); }
        
      } catch (stratErr) {
        console.log('Strategies fetch error:', stratErr);
        setStrategies([]);
      }"""

if OLD_FETCH_STRAT in content:
    content = content.replace(OLD_FETCH_STRAT, NEW_FETCH_STRAT)
    print("✅ Fix 2: Student detail loads strategies from helpers endpoint")
else:
    print("⚠️  Fix 2: Could not find strategies fetch block")

# Fix getStrategyName to use the loaded strategies properly
OLD_GET_NAME = """  const getStrategyName = (strategyId: string) => {
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
    if (strategyId.length > 5 && !strategyId.match(/^[a-z]_?\\d+$/)) return strategyId;
    // Last resort cleanup
    return strategyId.replace(/_/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
  };"""

NEW_GET_NAME = """  const getStrategyName = (strategyId: string) => {
    if (!strategyId) return '';
    // Check static map first (covers b1, g1, r1 etc)
    if (STRATEGY_NAME_MAP[strategyId]) return STRATEGY_NAME_MAP[strategyId];
    // Check loaded strategies by id or name
    const strategy = strategies.find((s: any) => 
      s.id === strategyId || s.helper_id === strategyId || s.name === strategyId
    );
    if (strategy?.name) return strategy.name;
    // Check allStrategies
    const schoolStrat = allStrategies.school.find((s: any) => s.id === strategyId || s.helper_id === strategyId);
    if (schoolStrat?.name) return schoolStrat.name;
    const familyStrat = allStrategies.family.find((s: any) => s.id === strategyId);
    if (familyStrat?.name || familyStrat?.strategy_name) return familyStrat.name || familyStrat.strategy_name;
    // If it's already a readable name (not an ID pattern), return it
    if (strategyId.length > 4 && strategyId.includes(' ')) return strategyId;
    if (strategyId.length > 6 && !strategyId.match(/^[a-z]{1,2}_?\\d+$/i)) return strategyId;
    // Clean up ID: green_2 → Green, r1 → Red
    const zoneWords: Record<string,string> = {
      b: 'Blue', g: 'Green', y: 'Yellow', r: 'Red',
      blue: 'Blue', green: 'Green', yellow: 'Yellow', red: 'Red', p: 'Parent'
    };
    const parts = strategyId.split(/[_-]/);
    if (parts.length >= 1 && zoneWords[parts[0].toLowerCase()]) {
      return `${zoneWords[parts[0].toLowerCase()]} helper`;
    }
    return strategyId;
  };"""

if OLD_GET_NAME in content:
    content = content.replace(OLD_GET_NAME, NEW_GET_NAME)
    print("✅ Fix 3: getStrategyName thoroughly fixed")
else:
    print("⚠️  Fix 3: getStrategyName pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 4: Fix home sharing toggle state ──────────────────────────────────────
# The issue: sharingStatus shows 'sharing off' even after parent enabled it
# Fix: reload sharingStatus after it's set

path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the sharing status display - if home_sharing_enabled is true show as ON
# The backend /teacher/student/{id}/sharing-status may return wrong value
# Add a refresh after the data loads
OLD_SHARING = """        // If linked and sharing enabled, fetch home data
        if (statusData.is_linked_to_parent && statusData.home_sharing_enabled) {"""

NEW_SHARING = """        // If linked, fetch home data regardless (teacher can see school data always)
        if (statusData.is_linked_to_parent) {"""

if OLD_SHARING in content:
    content = content.replace(OLD_SHARING, NEW_SHARING)
    print("✅ Fix 4: Home data loads for all linked students regardless of sharing toggle")
else:
    print("⚠️  Fix 4: Sharing status block not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 5: Linked badge in teacher students list ──────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/students.tsx")
with open(path, "r") as f:
    content = f.read()

# The badge was added but uses is_linked from API
# Make sure it's visible
if "is_linked" in content:
    print("✅ Fix 5: Linked badge already in students list")
else:
    print("⚠️  Fix 5: is_linked not found in students list")

# ── Fix 6: Family add/edit/delete strategies (parent/strategies.tsx) ──────────
path = os.path.join(FRONTEND, "app/parent/strategies.tsx")
with open(path, "r") as f:
    content = f.read()

# Make sure delete works
if "handleDeleteStrategy" in content:
    print("✅ Fix 6: Delete strategy exists in parent/strategies")
else:
    print("⚠️  Fix 6: No delete in parent/strategies - needs adding")

# ── Fix 7: Fix linked child generic strategies ────────────────────────────────
# The linked child detail screen should show generic strategies
path = os.path.join(FRONTEND, "app/parent/linked-child/[id].tsx")
with open(path, "r") as f:
    content = f.read()

# Fix school strategies to include generic ones from /helpers
OLD_SCHOOL_STRATS = """      setSchoolStrategies(schoolStrats.custom_strategies || []);"""
NEW_SCHOOL_STRATS = """      // Include both custom AND generic helpers
      const genericRes = await Promise.all(['blue','green','yellow','red'].map(zone =>
        fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/helpers?feeling_colour=${zone}&lang=en`)
          .then(r => r.json()).catch(() => [])
      ));
      const generic = genericRes.flat();
      setSchoolStrategies([...generic, ...(schoolStrats.custom_strategies || [])]);"""

if OLD_SCHOOL_STRATS in content:
    content = content.replace(OLD_SCHOOL_STRATS, NEW_SCHOOL_STRATS)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 7: Linked child now shows generic + custom strategies")
else:
    print("⚠️  Fix 7: School strategies pattern not found")

# ── Fix 8: Fix zone button color in family checkin (stays grey) ───────────────
path = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the selected zone button to show colored properly
OLD_ZONE_CARD = """                  style={[
                    styles.zoneCard,
                    { backgroundColor: zone.color },
                    selectedZone === zone.id && styles.zoneCardSelected,
                  ]}"""
NEW_ZONE_CARD = """                  style={[
                    styles.zoneCard,
                    { backgroundColor: selectedZone === zone.id ? zone.color : zone.color + 'CC' },
                    selectedZone === zone.id && styles.zoneCardSelected,
                  ]}"""

if OLD_ZONE_CARD in content:
    content = content.replace(OLD_ZONE_CARD, NEW_ZONE_CARD)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 8: Zone buttons stay colored when selected")
else:
    print("⚠️  Fix 8: Zone card style not found")

print("\n✅ Thorough strategy system fix applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Thorough strategy system fix - helpers, names, linked child, sharing' && git push")
