"""
Run with: python3 patch_resources.py
Fixes two things:
1. Backend: /teacher-resources now accepts ?audience=parents to show parent-targeted resources
2. Backend: /parent/resources endpoint added as alias
"""
import os, re

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Fix 1: Update get_teacher_resources to support audience param
OLD_ROUTE = '''@api_router.get("/teacher-resources")  # audience filter supported  # audience filter supported
async def get_teacher_resources(request: Request, topic: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
    all_resources = resources_result.data or []

    visible = []
    for r in all_resources:
        audience = r.get("target_audience", "both")
        if audience not in ["teachers", "both", None, ""]:
            continue
        resource_topic = r.get("topic") or r.get("category") or "general"
        if topic and topic != "all" and resource_topic != topic:
            continue
        visible.append(r)'''

NEW_ROUTE = '''@api_router.get("/teacher-resources")  # audience filter supported
async def get_teacher_resources(request: Request, topic: Optional[str] = None, audience: Optional[str] = None):
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
    all_resources = resources_result.data or []

    # Determine which audiences to show
    # If caller specifies audience=parents, show parents+both
    # If caller specifies audience=teachers (default), show teachers+both
    # If no audience specified, show all
    if audience == "parents":
        allowed_audiences = ["parents", "both", None, ""]
    elif audience == "teachers":
        allowed_audiences = ["teachers", "both", None, ""]
    else:
        allowed_audiences = ["teachers", "parents", "both", None, ""]

    visible = []
    for r in all_resources:
        r_audience = r.get("target_audience", "both")
        if r_audience not in allowed_audiences:
            continue
        resource_topic = r.get("topic") or r.get("category") or "general"
        if topic and topic != "all" and resource_topic != topic:
            continue
        visible.append(r)'''

if OLD_ROUTE in content:
    content = content.replace(OLD_ROUTE, NEW_ROUTE)
    print("✅ Fix 1: Backend audience filter updated")
else:
    print("⚠️  Fix 1: Could not find old route — may already be patched or slightly different")

# Fix 2: Add /parent/resources alias endpoint before app.include_router
PARENT_RESOURCES_ENDPOINT = '''
@api_router.get("/parent/resources")
async def get_parent_resources(request: Request, topic: Optional[str] = None):
    """Resources visible to parents — those uploaded with audience=parents or both."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        resources_result = supabase.table("resources").select("*").eq("is_active", True).execute()
        all_resources = resources_result.data or []
        allowed_audiences = ["parents", "both", None, ""]
        visible = []
        for r in all_resources:
            r_audience = r.get("target_audience", "both")
            if r_audience not in allowed_audiences:
                continue
            resource_topic = r.get("topic") or r.get("category") or "general"
            if topic and topic != "all" and resource_topic != topic:
                continue
            try:
                ratings_result = supabase.table("teacher_resource_ratings").select("*").eq("resource_id", r["id"]).execute()
                ratings = ratings_result.data or []
            except Exception:
                ratings = []
            visible.append(_resource_to_teacher_resource(r, ratings))
        return visible
    except Exception as e:
        logger.error(f"get_parent_resources error: {e}")
        return []

'''

MARKER = "app.include_router(api_router)"

if "/parent/resources" in content:
    print("✅ Fix 2: /parent/resources already exists")
elif MARKER in content:
    content = content.replace(MARKER, PARENT_RESOURCES_ENDPOINT + MARKER)
    print("✅ Fix 2: /parent/resources endpoint added")
else:
    print("❌ Fix 2: Could not find insertion marker")

with open(SERVER, "w") as f:
    f.write(content)

print("\nDone! Now deploy: git add -A && git commit -m 'Fix resource visibility for parents' && git push")
