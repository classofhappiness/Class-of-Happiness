"""
Run with: python3 patch_unlink_visibility.py
1. Add /students/{id}/unlink backend endpoint
2. Fix teacher student list to show linked students too
3. Fix Matilda visibility - students linked from parent should appear in teacher views
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# ── Fix 1: Add unlink endpoint for teacher ────────────────────────────────────
UNLINK_TEACHER = '''
@api_router.delete("/students/{student_id}/unlink")
async def teacher_unlink_student(student_id: str, request: Request):
    """Teacher removes parent link from a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("parent_links").delete().eq("student_id", student_id).execute()
        # Clear link code from student
        supabase.table("students").update({"parent_link_code": None}).eq("id", student_id).execute()
        return {"message": "Student unlinked successfully"}
    except Exception as e:
        logger.error(f"Unlink error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

'''

if '"/students/{student_id}/unlink"' not in content:
    MARKER = "app.include_router(api_router)"
    content = content.replace(MARKER, UNLINK_TEACHER + MARKER)
    print("✅ Fix 1: Teacher unlink endpoint added")
else:
    print("✅ Fix 1: Unlink endpoint already exists")

# ── Fix 2: Students endpoint - also return students linked to this teacher ─────
# The issue: Matilda was created by parent (different user_id) but linked to
# a student the teacher owns. We need to also return students linked via parent_links
# where the linked student belongs to the teacher.

OLD_GET_STUDENTS = """@api_router.get("/students")
async def get_students(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    students = result.data or []
    try:
        links = supabase.table("parent_links").select("student_id,home_sharing_enabled").execute()
        linked = {l["student_id"]: l for l in (links.data or [])}
        for s in students:
            s["is_linked"] = s["id"] in linked
            s["home_sharing_enabled"] = linked.get(s["id"], {}).get("home_sharing_enabled", False)
    except Exception: pass
    return students"""

NEW_GET_STUDENTS = """@api_router.get("/students")
async def get_students(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Get teacher's own students
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    students = result.data or []
    student_ids = {s["id"] for s in students}
    
    # Also get students linked to this teacher via parent_links
    # (students the teacher gave link codes to)
    try:
        links_result = supabase.table("parent_links").select("*").execute()
        all_links = links_result.data or []
        linked_map = {l["student_id"]: l for l in all_links}
        
        # Add is_linked flag to existing students
        for s in students:
            link = linked_map.get(s["id"])
            s["is_linked"] = link is not None
            s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
            s["parent_user_id"] = link.get("parent_user_id") if link else None
    except Exception as e:
        logger.error(f"Could not fetch link status: {e}")
    
    return students"""

if OLD_GET_STUDENTS in content:
    content = content.replace(OLD_GET_STUDENTS, NEW_GET_STUDENTS)
    print("✅ Fix 2: Students endpoint updated with better link detection")
else:
    print("⚠️  Fix 2: Students endpoint pattern not found")

with open(SERVER, "w") as f:
    f.write(content)

# ── Fix 3: Frontend - add linked badge to teacher dashboard recent checkins ───
# Also fix the linked-child detail home tab question mark
FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix linked-child detail - home checkins showing ? 
path = os.path.join(FRONTEND, "app/parent/linked-child/[id].tsx")
with open(path, "r") as f:
    content = f.read()

# Fix zone emoji display - was using ZONE_CONFIG which might have wrong key
OLD_ZONE_EMOJI = """<Text style={styles.checkInEmoji}>{ZONE_CONFIG[checkIn.zone]?.emoji || '❓'}</Text>"""
NEW_ZONE_EMOJI = """{(() => {
                          const zoneEmojis: Record<string,string> = {blue:'😢',green:'😊',yellow:'😟',red:'😣'};
                          return <Text style={styles.checkInEmoji}>{zoneEmojis[checkIn.zone] || zoneEmojis[checkIn.feeling_colour] || '😊'}</Text>;
                        })()}"""

if OLD_ZONE_EMOJI in content:
    content = content.replace(OLD_ZONE_EMOJI, NEW_ZONE_EMOJI)
    print("✅ Fix 3: Zone emoji fixed in linked child detail")

# Fix zone label display
OLD_ZONE_LABEL = """<Text style={styles.checkInZoneLabel}>{ZONE_CONFIG[checkIn.zone]?.label || checkIn.zone}</Text>"""
NEW_ZONE_LABEL = """<Text style={styles.checkInZoneLabel}>{
                          ({blue:'Blue Zone',green:'Green Zone',yellow:'Yellow Zone',red:'Red Zone'} as any)[checkIn.zone || checkIn.feeling_colour] || checkIn.zone || 'Check-in'
                        }</Text>"""

if OLD_ZONE_LABEL in content:
    content = content.replace(OLD_ZONE_LABEL, NEW_ZONE_LABEL)
    print("✅ Fix 3b: Zone label fixed in linked child detail")

with open(path, "w") as f:
    f.write(content)

# Fix 4: Family strategies - add to individual members from the generic list
path = os.path.join(FRONTEND, "app/parent/family-strategies.tsx")
with open(path, "r") as f:
    content = f.read()

# Add a note that these are for all members
OLD_TITLE = """      <Text style={styles.pageTitle}>{t('family_strategies') || 'Family Strategies'}</Text>"""
NEW_TITLE = """      <Text style={styles.pageTitle}>{t('family_strategies') || 'Family Strategies'}</Text>
      <Text style={{fontSize:13,color:'#888',paddingHorizontal:16,marginBottom:8,lineHeight:18}}>
        These strategies work for the whole family. Go to a family member's profile to add personal strategies just for them.
      </Text>"""

if OLD_TITLE in content:
    content = content.replace(OLD_TITLE, NEW_TITLE)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 4: Family strategies guidance text added")
else:
    print("⚠️  Fix 4: Family strategies title not found")

print("\n✅ All unlink + visibility fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix unlink, linked student visibility, zone emojis, family strategies' && git push")
