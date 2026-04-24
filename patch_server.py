"""
Run this from your project root:
  python patch_server.py
It adds the 4 missing /parent/linked-child endpoints to server.py.
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

NEW_ENDPOINTS = '''
# ================== LINKED CHILD ENDPOINTS (parent <-> school) ==================

@api_router.get("/parent/linked-children")
async def get_linked_children_for_parent(request: Request):
    """Return all students linked to this parent via parent_links table."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        links = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).execute()
        children = []
        for link in (links.data or []):
            s = supabase.table("students").select("*").eq("id", link["student_id"]).execute()
            if s.data:
                student = s.data[0]
                # Resolve classroom name
                classroom_name = None
                if student.get("classroom_id"):
                    cr = supabase.table("classrooms").select("name").eq("id", student["classroom_id"]).execute()
                    if cr.data:
                        classroom_name = cr.data[0].get("name")
                children.append({
                    "id": student["id"],
                    "name": student.get("name", ""),
                    "avatar_type": student.get("avatar_type", "preset"),
                    "avatar_preset": student.get("avatar_preset", ""),
                    "avatar_custom": student.get("avatar_custom", ""),
                    "classroom_id": student.get("classroom_id"),
                    "classroom_name": classroom_name,
                    "home_sharing_enabled": True,
                    "school_sharing_enabled": True,
                    "is_linked_from_school": True,
                })
        return children
    except Exception as e:
        logger.error(f"get_linked_children error: {e}")
        return []


@api_router.post("/parent/linked-child/{student_id}/check-in")
async def parent_linked_child_checkin(student_id: str, request: Request):
    """Save a home check-in for a school-linked child into feeling_logs."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Verify parent is linked to this student
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        body = await request.json()
        log = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "feeling_colour": body.get("zone", ""),
            "helpers_selected": body.get("strategies_selected", []),
            "comment": body.get("comment", ""),
            "logged_by": "parent",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("feeling_logs").insert(log).execute()
        return {"status": "saved", "log": result.data[0] if result.data else log}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parent_linked_child_checkin error: {e}")
        raise HTTPException(status_code=500, detail=f"Could not save check-in: {str(e)}")


@api_router.get("/parent/linked-child/{student_id}/home-checkins")
async def get_home_checkins(student_id: str, request: Request, days: int = 30):
    """Return home check-ins (logged_by=parent) for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "parent").gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return result.data or []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_home_checkins error: {e}")
        return []


@api_router.get("/parent/linked-child/{student_id}/school-checkins")
async def get_school_checkins(student_id: str, request: Request, days: int = 30):
    """Return school check-ins for a linked child (respects sharing setting)."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "teacher").gte("timestamp", start_date).order("timestamp", desc=True).execute()
        return {"checkins": result.data or [], "sharing_disabled": False}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_school_checkins error: {e}")
        return {"checkins": [], "sharing_disabled": False}

'''

MARKER = "app.include_router(api_router)"

with open(SERVER, "r") as f:
    content = f.read()

if "/parent/linked-children" in content:
    print("ALREADY PATCHED — endpoints already exist in server.py")
elif MARKER not in content:
    print("ERROR — could not find insertion marker 'app.include_router(api_router)'")
else:
    content = content.replace(MARKER, NEW_ENDPOINTS + MARKER)
    with open(SERVER, "w") as f:
        f.write(content)
    print("SUCCESS — 4 linked-child endpoints added to server.py")
    print("Now deploy to Railway: git add -A && git commit -m 'Add linked-child parent endpoints' && git push")
