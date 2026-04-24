"""
Run with: python3 patch_bulk_checkin.py
Adds:
1. /api/checkins/bulk endpoint to backend
2. Quick check-in button to each classroom card in classrooms.tsx
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")
CLASSROOMS = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/classrooms.tsx")

# ── Fix 1: Add bulk checkin endpoint to backend ──────────────────────────────
with open(SERVER, "r") as f:
    content = f.read()

BULK_ENDPOINT = '''
@api_router.post("/checkins/bulk")
async def bulk_checkin(request: Request):
    """Bulk check-in for an entire class at once. No points awarded."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        logs = body.get("logs", [])
        if not logs:
            raise HTTPException(status_code=400, detail="No logs provided")
        results = []
        for log in logs:
            entry = {
                "id": str(uuid.uuid4()),
                "student_id": log.get("student_id"),
                "feeling_colour": log.get("feeling_colour", ""),
                "helpers_selected": log.get("helpers_selected", []),
                "comment": log.get("comment"),
                "logged_by": "teacher_bulk",
                "timestamp": log.get("timestamp") or datetime.now(timezone.utc).isoformat(),
                # No points awarded for bulk check-in
            }
            if not entry["student_id"]:
                continue
            result = supabase.table("feeling_logs").insert(entry).execute()
            if result.data:
                results.append(result.data[0])
        return {"saved": len(results), "logs": results}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bulk checkin error: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk checkin failed: {str(e)}")

'''

MARKER = "app.include_router(api_router)"

if "/checkins/bulk" in content:
    print("✅ Fix 1: Bulk checkin endpoint already exists")
elif MARKER in content:
    content = content.replace(MARKER, BULK_ENDPOINT + MARKER)
    print("✅ Fix 1: Bulk checkin endpoint added to backend")
else:
    print("❌ Fix 1: Could not find insertion marker")

with open(SERVER, "w") as f:
    f.write(content)

# ── Fix 2: Add bulk check-in button to classrooms screen ────────────────────
with open(CLASSROOMS, "r") as f:
    content = f.read()

# Add the bulk checkin button alongside the existing buttons in the classroom card
OLD_CARD_ACTIONS = """              <View style={styles.cardActions}>
                {/* Edit / manage students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setEditModalVisible(true); }}
                >
                  <MaterialIcons name="edit" size={22} color="#5C6BC0" />
                </TouchableOpacity>
                {/* Add strategy to all students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setStrategyModalVisible(true); }}
                >
                  <MaterialIcons name="lightbulb" size={22} color="#FFC107" />
                </TouchableOpacity>
                {/* Delete */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => handleDeleteClassroom(classroom)}
                >
                  <MaterialIcons name="delete" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>"""

NEW_CARD_ACTIONS = """              <View style={styles.cardActions}>
                {/* Bulk check-in - quick B/G/Y/R */}
                <TouchableOpacity
                  style={[styles.iconButton, styles.bulkCheckinBtn]}
                  onPress={() => router.push({
                    pathname: '/teacher/bulk-checkin',
                    params: { classroomId: classroom.id, classroomName: classroom.name }
                  })}
                >
                  <MaterialIcons name="how-to-reg" size={22} color="white" />
                </TouchableOpacity>
                {/* Edit / manage students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setEditModalVisible(true); }}
                >
                  <MaterialIcons name="edit" size={22} color="#5C6BC0" />
                </TouchableOpacity>
                {/* Add strategy to all students */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => { setEditingClassroom(classroom); setStrategyModalVisible(true); }}
                >
                  <MaterialIcons name="lightbulb" size={22} color="#FFC107" />
                </TouchableOpacity>
                {/* Delete */}
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => handleDeleteClassroom(classroom)}
                >
                  <MaterialIcons name="delete" size={22} color="#F44336" />
                </TouchableOpacity>
              </View>"""

if OLD_CARD_ACTIONS in content:
    content = content.replace(OLD_CARD_ACTIONS, NEW_CARD_ACTIONS)
    print("✅ Fix 2: Bulk check-in button added to classroom cards")
else:
    print("⚠️  Fix 2: Could not find card actions block")

# Add bulkCheckinBtn style
OLD_STYLES_END = "  selectAllText: { fontSize: 13, color: '#5C6BC0', fontWeight: '600' },"
NEW_STYLES_END = """  selectAllText: { fontSize: 13, color: '#5C6BC0', fontWeight: '600' },
  bulkCheckinBtn: { backgroundColor: '#4CAF50', borderRadius: 8, padding: 6 },"""

if OLD_STYLES_END in content:
    content = content.replace(OLD_STYLES_END, NEW_STYLES_END)
    print("✅ Fix 3: bulkCheckinBtn style added")

with open(CLASSROOMS, "w") as f:
    f.write(content)

# ── Fix 3: Add bulk-checkin to _layout.tsx stack ────────────────────────────
LAYOUT = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/_layout.tsx")

with open(LAYOUT, "r") as f:
    content = f.read()

OLD_LAST_SCREEN = """        <Stack.Screen
          name="admin/dashboard"
          options={{
            headerShown: false,
            title: 'Admin Dashboard',
          }}
        />"""

NEW_LAST_SCREEN = """        <Stack.Screen
          name="admin/dashboard"
          options={{
            headerShown: false,
            title: 'Admin Dashboard',
          }}
        />
        <Stack.Screen
          name="teacher/bulk-checkin"
          options={{
            headerShown: false,
            title: 'Quick Class Check-in',
          }}
        />"""

if "teacher/bulk-checkin" in content:
    print("✅ Fix 4: bulk-checkin already in layout")
elif OLD_LAST_SCREEN in content:
    content = content.replace(OLD_LAST_SCREEN, NEW_LAST_SCREEN)
    print("✅ Fix 4: bulk-checkin added to _layout.tsx stack")
else:
    print("⚠️  Fix 4: Could not find insertion point in _layout.tsx")

with open(LAYOUT, "w") as f:
    f.write(content)

print("\n✅ All bulk check-in patches applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add bulk class check-in feature' && git push")
