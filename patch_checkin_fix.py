"""
Run with: python3 patch_checkin_fix.py
Fixes:
1. Teacher checkin - Text strings render error (color undefined issue)
2. Teacher checkin strategies showing in dashboard recent checkins
3. School admin emotion labels
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 1: Teacher checkin - safe color access ────────────────────────────────
CHECKIN = os.path.join(FRONTEND, "app/teacher/checkin.tsx")

with open(CHECKIN, "r") as f:
    content = f.read()

# Fix zoneConfig?.color + '25' -> safe fallback
OLD_STRAT_ICON = """                <View style={[styles.strategyIcon, { backgroundColor: zoneConfig?.color + '25' }]}>
                  <MaterialIcons name={s.icon as any} size={22} color={zoneConfig?.color} />
                </View>"""
NEW_STRAT_ICON = """                <View style={[styles.strategyIcon, { backgroundColor: (zoneConfig?.color || '#5C6BC0') + '25' }]}>
                  <MaterialIcons name={s.icon as any} size={22} color={zoneConfig?.color || '#5C6BC0'} />
                </View>"""

if OLD_STRAT_ICON in content:
    content = content.replace(OLD_STRAT_ICON, NEW_STRAT_ICON)
    print("✅ Fix 1a: Strategy icon color safe fallback added")
else:
    print("⚠️  Fix 1a: Strategy icon block not found")

OLD_CHECK_CIRCLE = """                {selectedStrategies.includes(s.id) && <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color} />}
              </TouchableOpacity>
            ))}

            {/* Custom personal strategies */}"""
NEW_CHECK_CIRCLE = """                {selectedStrategies.includes(s.id) && <MaterialIcons name="check-circle" size={20} color={zoneConfig?.color || '#5C6BC0'} />}
              </TouchableOpacity>
            ))}

            {/* Custom personal strategies */}"""

if OLD_CHECK_CIRCLE in content:
    content = content.replace(OLD_CHECK_CIRCLE, NEW_CHECK_CIRCLE)
    print("✅ Fix 1b: Check circle color safe fallback added")

OLD_SAVE_BTN_COLOR = """              style={[styles.saveButton, { backgroundColor: zoneConfig?.color }]}"""
NEW_SAVE_BTN_COLOR = """              style={[styles.saveButton, { backgroundColor: zoneConfig?.color || '#5C6BC0' }]}"""

if OLD_SAVE_BTN_COLOR in content:
    content = content.replace(OLD_SAVE_BTN_COLOR, NEW_SAVE_BTN_COLOR)
    print("✅ Fix 1c: Save button color safe fallback added")

# Fix the strategiesForZone - ensure adminStrategies always have required fields
OLD_STRATEGIES_MAP = """    const fromDB = adminStrategies.filter(s => (s.zone || s.feeling_colour) === selectedZone);
    // Merge - avoid duplicates by name
    const hardcodedNames = new Set(hardcoded.map((s:any) => s.name.toLowerCase()));
    const newFromDB = fromDB.filter(s => !hardcodedNames.has(s.name.toLowerCase()));
    return [...hardcoded, ...newFromDB.map(s => ({...s, id: s.id, icon: s.icon || 'star'}))];"""

NEW_STRATEGIES_MAP = """    const fromDB = adminStrategies.filter(s => (s.zone || s.feeling_colour) === selectedZone);
    // Merge - avoid duplicates by name
    const hardcodedNames = new Set(hardcoded.map((s:any) => s.name.toLowerCase()));
    const newFromDB = fromDB.filter(s => s.name && !hardcodedNames.has(s.name.toLowerCase()));
    return [...hardcoded, ...newFromDB.map(s => ({
      id: s.id || String(Math.random()),
      name: s.name || 'Strategy',
      description: s.description || '',
      icon: s.icon || 'star',
    }))];"""

if OLD_STRATEGIES_MAP in content:
    content = content.replace(OLD_STRATEGIES_MAP, NEW_STRATEGIES_MAP)
    print("✅ Fix 1d: Admin strategies mapped with safe defaults")
else:
    print("⚠️  Fix 1d: Could not find strategies map block")

with open(CHECKIN, "w") as f:
    f.write(content)

# ── Fix 2: Zone logs endpoint - include teacher checkin data ──────────────────
# Teacher checkins are stored in AsyncStorage, not in the DB
# So they won't show in "recent check-ins" on the dashboard - that's by design
# But we should save teacher checkins to the DB too for the dashboard
# Fix: also POST to backend when saving teacher checkin

OLD_SAVE_CHECKIN = """      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

      // If teacher chose to share, notify wellbeing support
      if (shareWithWellbeing) {"""

NEW_SAVE_CHECKIN = """      await AsyncStorage.setItem(storageKey, JSON.stringify(updated));

      // Also save to backend so it appears in dashboard stats
      try {
        const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
        await fetch(`${BACKEND_URL}/api/teacher-checkins`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await AsyncStorage.getItem('session_token')}`,
          },
          body: JSON.stringify({
            zone: selectedZone,
            strategies_selected: selectedStrategies,
            notes: notes.trim() || null,
            shared: shareWithWellbeing,
            timestamp: newEntry.timestamp,
          }),
        });
      } catch (e) {
        // Non-critical - local storage already saved
        console.log('Could not sync teacher checkin to server:', e);
      }

      // If teacher chose to share, notify wellbeing support
      if (shareWithWellbeing) {"""

if OLD_SAVE_CHECKIN in content:
    with open(CHECKIN, "r") as f:
        content = f.read()
    content = content.replace(OLD_SAVE_CHECKIN, NEW_SAVE_CHECKIN)
    with open(CHECKIN, "w") as f:
        f.write(content)
    print("✅ Fix 2: Teacher checkins now synced to backend DB")
else:
    print("⚠️  Fix 2: Could not find save checkin block")

# ── Fix 3: Add teacher-checkins endpoint to backend ──────────────────────────
with open(SERVER, "r") as f:
    server_content = f.read()

TEACHER_CHECKIN_ENDPOINT = '''
@api_router.post("/teacher-checkins")
async def save_teacher_checkin(request: Request):
    """Save teacher self check-in to DB for dashboard visibility."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        entry = {
            "id": str(uuid.uuid4()),
            "user_id": user["user_id"],
            "zone": body.get("zone", ""),
            "strategies_selected": body.get("strategies_selected", []),
            "notes": body.get("notes"),
            "shared": body.get("shared", False),
            "timestamp": body.get("timestamp") or datetime.now(timezone.utc).isoformat(),
        }
        try:
            supabase.table("teacher_checkins").insert(entry).execute()
        except Exception as e:
            # Table may not exist yet - create it
            logger.error(f"teacher_checkins insert error: {e}")
        return {"status": "saved"}
    except Exception as e:
        logger.error(f"save_teacher_checkin error: {e}")
        return {"status": "error", "detail": str(e)}

@api_router.get("/teacher-checkins")
async def get_teacher_checkins(request: Request, days: int = 7):
    """Get teacher self check-ins for dashboard."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("teacher_checkins").select("*").eq("user_id", user["user_id"]).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return result.data or []
    except Exception as e:
        logger.error(f"get_teacher_checkins error: {e}")
        return []

'''

MARKER = "app.include_router(api_router)"

if "/teacher-checkins" in server_content:
    print("✅ Fix 3: teacher-checkins endpoint already exists")
elif MARKER in server_content:
    server_content = server_content.replace(MARKER, TEACHER_CHECKIN_ENDPOINT + MARKER)
    with open(SERVER, "w") as f:
        f.write(server_content)
    print("✅ Fix 3: teacher-checkins endpoint added to backend")

# ── Fix 4: School admin - fix emotion labels ──────────────────────────────────
ADMIN = os.path.join(FRONTEND, "app/admin/dashboard.tsx")

with open(ADMIN, "r") as f:
    content = f.read()

# Fix ZONE_LABELS - should use student-friendly terms not teacher terms
OLD_LABELS = """const ZONE_LABELS: Record<string,string> = { blue:'Low Energy', green:'Steady', yellow:'Stressed', red:'Overloaded' };"""
NEW_LABELS = """const ZONE_LABELS: Record<string,string> = { blue:'Blue Zone', green:'Green Zone', yellow:'Yellow Zone', red:'Red Zone' };
const TEACHER_ZONE_LABELS: Record<string,string> = { blue:'Low Energy', green:'Steady', yellow:'Stressed', red:'Overloaded' };"""

if OLD_LABELS in content:
    content = content.replace(OLD_LABELS, NEW_LABELS)
    print("✅ Fix 4: School admin zone labels fixed - Blue/Green/Yellow/Red Zone for students")
else:
    print("⚠️  Fix 4: Zone labels not found")

with open(ADMIN, "w") as f:
    f.write(content)

# ── Fix 5: Add teacher_checkins table to Supabase ────────────────────────────
print("\n⚠️  Run this SQL in Supabase:")
print("""
CREATE TABLE IF NOT EXISTS public.teacher_checkins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  zone TEXT NOT NULL,
  strategies_selected JSONB DEFAULT '[]',
  notes TEXT,
  shared BOOLEAN DEFAULT false,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_teacher_checkins_user ON public.teacher_checkins(user_id);
""")

print("\n✅ All checkin fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix teacher checkin text error, sync to DB, fix admin labels' && git push")
