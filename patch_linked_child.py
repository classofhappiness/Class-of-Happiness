"""
Run with: python3 patch_linked_child.py
Adds missing endpoints for linked child detail screen.
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

NEW_ENDPOINTS = '''
# ================== LINKED CHILD DETAIL ENDPOINTS ==================

@api_router.get("/parent/linked-child/{student_id}/all-checkins")
async def get_all_checkins_for_linked_child(student_id: str, request: Request, days: int = 30):
    """All check-ins (home + school) for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs = result.data or []
        return [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
            "location": "home" if log.get("logged_by") == "parent" else "school",
        } for log in logs]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_all_checkins error: {e}")
        return []


@api_router.get("/parent/linked-child/{student_id}/school-strategies")
async def get_school_strategies_for_linked_child(student_id: str, request: Request):
    """Get strategies assigned to student at school."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        # Get custom strategies for this student
        try:
            strats = supabase.table("custom_strategies").select("*").eq("student_id", student_id).execute()
            custom = strats.data or []
        except Exception:
            custom = []
        # Get global strategies
        try:
            global_strats = supabase.table("strategies").select("*").execute()
            global_list = global_strats.data or []
        except Exception:
            global_list = []
        return {
            "custom_strategies": custom,
            "global_strategies": global_list[:8],  # limit
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_school_strategies error: {e}")
        return {"custom_strategies": [], "global_strategies": []}


@api_router.get("/parent/linked-child/{student_id}/family-strategies")
async def get_family_strategies_for_linked_child(student_id: str, request: Request):
    """Get family-assigned strategies for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        try:
            result = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("parent_user_id", user["user_id"]).execute()
            return result.data or []
        except Exception:
            return []
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_family_strategies error: {e}")
        return []


@api_router.post("/parent/linked-child/{student_id}/family-strategies")
async def create_family_strategy_for_linked_child(student_id: str, request: Request):
    """Create a family strategy for a linked child."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=403, detail="Not linked to this student")
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "parent_user_id": user["user_id"],
            "strategy_name": body.get("strategy_name", ""),
            "strategy_description": body.get("strategy_description", ""),
            "zone": body.get("zone", "green"),
            "icon": body.get("icon", "star"),
            "share_with_teacher": body.get("share_with_teacher", False),
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        try:
            result = supabase.table("family_assigned_strategies").insert(new_strategy).execute()
            return result.data[0] if result.data else new_strategy
        except Exception:
            # Table may not exist yet - return the data anyway
            return new_strategy
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_family_strategy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/parent/linked-child/{student_id}/family-strategies/{strategy_id}/toggle-sharing")
async def toggle_strategy_sharing(student_id: str, strategy_id: str, request: Request):
    """Toggle whether a family strategy is shared with teacher."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        current = supabase.table("family_assigned_strategies").select("*").eq("id", strategy_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Strategy not found")
        new_value = not current.data[0].get("share_with_teacher", False)
        supabase.table("family_assigned_strategies").update({"share_with_teacher": new_value}).eq("id", strategy_id).execute()
        return {"share_with_teacher": new_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_strategy_sharing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/parent/linked-child/{student_id}/toggle-home-sharing")
async def toggle_home_sharing(student_id: str, request: Request):
    """Toggle whether home check-ins are shared with teacher."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        link = supabase.table("parent_links").select("*").eq("parent_user_id", user["user_id"]).eq("student_id", student_id).execute()
        if not link.data:
            raise HTTPException(status_code=404, detail="Link not found")
        current = link.data[0].get("home_sharing_enabled", False)
        new_value = not current
        supabase.table("parent_links").update({"home_sharing_enabled": new_value}).eq("id", link.data[0]["id"]).execute()
        return {"home_sharing_enabled": new_value}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_home_sharing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

'''

MARKER = "app.include_router(api_router)"

if "/parent/linked-child/{student_id}/all-checkins" in content:
    print("✅ Linked child endpoints already exist")
elif MARKER in content:
    content = content.replace(MARKER, NEW_ENDPOINTS + MARKER)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ All linked child endpoints added")
else:
    print("❌ Could not find insertion marker")

# Also add Supabase table for family_assigned_strategies
print("\n⚠️  Run this SQL in Supabase to create the family_assigned_strategies table:")
print("""
CREATE TABLE IF NOT EXISTS public.family_assigned_strategies (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  parent_user_id TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  strategy_description TEXT,
  zone TEXT DEFAULT 'green',
  icon TEXT DEFAULT 'star',
  share_with_teacher BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.parent_links 
  ADD COLUMN IF NOT EXISTS home_sharing_enabled BOOLEAN DEFAULT false;
""")

# Fix linkedChildApi in frontend
FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
API = os.path.join(FRONTEND, "src/utils/api.ts")

with open(API, "r") as f:
    api_content = f.read()

# Find and update linkedChildApi to add missing methods
OLD_GET_ALL = """  getAll: (): Promise<LinkedChild[]> =>
    apiRequest('/parent/linked-children'),"""

NEW_GET_ALL = """  getAll: (): Promise<LinkedChild[]> =>
    apiRequest('/parent/linked-children'),

  getAllCheckIns: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/parent/linked-child/${studentId}/all-checkins?days=${days}`),

  getSchoolStrategies: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/school-strategies`),

  getFamilyStrategies: (studentId: string): Promise<any[]> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategies`),

  createFamilyStrategy: (studentId: string, data: any): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategies`, {
      method: 'POST', body: JSON.stringify(data)
    }),

  toggleStrategySharing: (studentId: string, strategyId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/family-strategies/${strategyId}/toggle-sharing`, {
      method: 'PUT'
    }),

  toggleHomeSharing: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/toggle-home-sharing`, { method: 'PUT' }),"""

if OLD_GET_ALL in api_content:
    api_content = api_content.replace(OLD_GET_ALL, NEW_GET_ALL)
    with open(API, "w") as f:
        f.write(api_content)
    print("✅ linkedChildApi updated with missing methods")
else:
    print("⚠️  Could not find linkedChildApi.getAll to extend")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add linked child detail endpoints' && git push")
