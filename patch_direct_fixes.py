"""
Run with: python3 patch_direct_fixes.py
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Fix 1: Students endpoint - add is_linked flag
OLD_STUDENTS = """@api_router.get("/students")
async def get_students(request: Request):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()"""

NEW_STUDENTS = """@api_router.get("/students")
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

if OLD_STUDENTS in content:
    content = content.replace(OLD_STUDENTS, NEW_STUDENTS)
    print("✅ Fix 1: Students endpoint returns is_linked flag")
else:
    print("❌ Fix 1: Pattern not matched")

# Fix 10: Link code - remove teacher-only restriction
OLD_LINK = """    if user.get("role") not in ["teacher", "admin"]:
        raise HTTPException(status_code=403, detail="Teachers only")"""
NEW_LINK = """    # Allow teachers, admins and school admins to generate codes
    if user.get("role") not in ["teacher", "admin", "school_admin", "super_admin"]:
        raise HTTPException(status_code=403, detail="Not authorized")"""

if OLD_LINK in content:
    content = content.replace(OLD_LINK, NEW_LINK)
    print("✅ Fix 10: Link code now works for teachers and admins")
else:
    print("❌ Fix 10: Pattern not matched")

with open(SERVER, "w") as f:
    f.write(content)

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix is_linked on students, fix link code auth' && git push")
