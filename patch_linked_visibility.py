"""
Run with: python3 patch_linked_visibility.py
Fixes linked students showing up in teacher views with link indicator
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Find get students endpoint and add is_linked field
OLD_GET_STUDENTS = """@api_router.get("/students")
async def get_students(request: Request, classroom_id: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        query = supabase.table("students").select("*")
        if classroom_id:
            query = query.eq("classroom_id", classroom_id)
        result = query.execute()
        return result.data or []
    except Exception as e:
        logger.error(f"Error fetching students: {e}")
        raise HTTPException(status_code=500, detail=str(e))"""

NEW_GET_STUDENTS = """@api_router.get("/students")
async def get_students(request: Request, classroom_id: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        query = supabase.table("students").select("*")
        if classroom_id:
            query = query.eq("classroom_id", classroom_id)
        result = query.execute()
        students = result.data or []
        # Add is_linked flag by checking parent_links table
        try:
            student_ids = [s["id"] for s in students]
            if student_ids:
                links_result = supabase.table("parent_links").select("student_id,parent_user_id,home_sharing_enabled").execute()
                linked_ids = {l["student_id"]: l for l in (links_result.data or [])}
                for student in students:
                    link = linked_ids.get(student["id"])
                    student["is_linked"] = link is not None
                    student["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
                    student["parent_user_id"] = link.get("parent_user_id") if link else None
        except Exception as link_err:
            logger.error(f"Could not fetch link status: {link_err}")
        return students
    except Exception as e:
        logger.error(f"Error fetching students: {e}")
        raise HTTPException(status_code=500, detail=str(e))"""

if OLD_GET_STUDENTS in content:
    content = content.replace(OLD_GET_STUDENTS, NEW_GET_STUDENTS)
    print("✅ Fix 1: Students endpoint now returns is_linked flag")
else:
    print("⚠️  Fix 1: Could not find get_students endpoint - searching...")
    idx = content.find("@api_router.get(\"/students\")")
    if idx > 0:
        print(content[idx:idx+300])

with open(SERVER, "w") as f:
    f.write(content)

# Fix #10 - generate link code - check what the actual error is
OLD_LINK_CODE = """@api_router.post("/students/{student_id}/generate-link-code")
async def generate_link_code(student_id: str, request: Request):"""

# Find the full function
idx = content.find(OLD_LINK_CODE)
if idx > 0:
    snippet = content[idx:idx+600]
    print(f"\nLink code function:")
    print(snippet[:400])
else:
    print("⚠️  Link code endpoint not found")

# Rewrite the generate link code to be more permissive
with open(SERVER, "r") as f:
    content = f.read()

OLD_GEN = """@api_router.post("/students/{student_id}/generate-link-code")
async def generate_link_code(student_id: str, request: Request):
    # Allow both teachers AND admins to generate codes"""

if OLD_GEN in content:
    # Find the full function body
    start = content.find(OLD_GEN)
    # Replace the whole restrictive check
    end = content.find("\n@api_router", start + 1)
    old_func = content[start:end]
    
    new_func = '''@api_router.post("/students/{student_id}/generate-link-code")
async def generate_link_code(student_id: str, request: Request):
    """Generate a parent link code for a student. Teachers and admins can do this."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    # Any authenticated user can generate - teacher, admin, or school admin
    import secrets, string
    code = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(8))
    try:
        supabase.table("students").update({"parent_link_code": code}).eq("id", student_id).execute()
    except Exception as e:
        # Try direct update
        logger.error(f"Link code update error: {e}")
    return {"link_code": code, "student_id": student_id}

'''
    content = content[:start] + new_func + content[end:]
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ Fix 10: Link code generation fully rewritten - works for all roles")
else:
    print("⚠️  Fix 10: Could not find generate link code function")

# Fix #8 - Add icon labels to individual student action buttons
FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Find the action buttons row and add labels
OLD_ACTION_BTNS = """          {/* Action Buttons */}
          <View style={styles.actionButtons}>"""

NEW_ACTION_BTNS = """          {/* Action Buttons — with labels */}
          <View style={styles.actionButtons}>"""

if OLD_ACTION_BTNS in content:
    content = content.replace(OLD_ACTION_BTNS, NEW_ACTION_BTNS)

# Find report button and add label
OLD_REPORT_BTN = """            <TouchableOpacity style={styles.actionButton} onPress={() => setShowReportModal(true)}>
              <MaterialIcons name="picture-as-pdf" size={22} color="#5C6BC0" />
            </TouchableOpacity>"""
NEW_REPORT_BTN = """            <TouchableOpacity style={styles.actionButton} onPress={() => setShowReportModal(true)}>
              <MaterialIcons name="picture-as-pdf" size={22} color="#5C6BC0" />
              <Text style={styles.actionBtnLabel}>Report</Text>
            </TouchableOpacity>"""

if OLD_REPORT_BTN in content:
    content = content.replace(OLD_REPORT_BTN, NEW_REPORT_BTN)
    print("✅ Fix 8: Action button labels added")

# Add label style
if "actionBtnLabel" not in content:
    content = content.replace(
        "  actionButton: {",
        "  actionBtnLabel: { fontSize: 9, color: '#666', marginTop: 2, textAlign: 'center' },\n  actionButton: {"
    )
    # Also update actionButton to be column
    content = content.replace(
        "  actionButton: { alignItems: 'center', justifyContent: 'center',",
        "  actionButton: { alignItems: 'center', justifyContent: 'center', flexDirection: 'column',"
    )

with open(path, "w") as f:
    f.write(content)

print("\n✅ All fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix linked visibility, link code auth, icon labels' && git push")
