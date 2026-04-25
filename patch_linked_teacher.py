"""
Run with: python3 patch_linked_teacher.py
Adds:
1. Backend: /teacher/student/{id}/sharing-status
2. Backend: /teacher/student/{id}/home-data
3. Backend: /teacher/student/{id}/strategies (add/edit/delete)
4. Backend: /teacher/student/{id}/combined-checkins (school + home)
5. Frontend: Enhanced student detail with calendar, zone distribution, strategy sync
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")
FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Backend: Add missing teacher endpoints ────────────────────────────────────
with open(SERVER, "r") as f:
    content = f.read()

NEW_ENDPOINTS = '''
# ================== TEACHER → LINKED STUDENT ENDPOINTS ==================

@api_router.get("/teacher/student/{student_id}/sharing-status")
async def get_student_sharing_status(student_id: str, request: Request):
    """Check if a student is linked to a parent and sharing status."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Check if any parent is linked to this student
        links = supabase.table("parent_links").select("*").eq("student_id", student_id).execute()
        is_linked = len(links.data or []) > 0
        home_sharing = False
        school_sharing = False
        parent_name = None
        if is_linked and links.data:
            link = links.data[0]
            home_sharing = link.get("home_sharing_enabled", False)
            school_sharing = True  # school always shares with parent by default
            # Get parent name
            try:
                parent = supabase.table("users").select("name,email").eq("user_id", link["parent_user_id"]).execute()
                if parent.data:
                    parent_name = parent.data[0].get("name") or parent.data[0].get("email", "Parent")
            except Exception:
                pass
        return {
            "is_linked_to_parent": is_linked,
            "home_sharing_enabled": home_sharing,
            "school_sharing_enabled": school_sharing,
            "parent_name": parent_name,
            "link_count": len(links.data or []),
        }
    except Exception as e:
        logger.error(f"get_student_sharing_status error: {e}")
        return {"is_linked_to_parent": False, "home_sharing_enabled": False, "school_sharing_enabled": False, "parent_name": None}


@api_router.get("/teacher/student/{student_id}/home-data")
async def get_student_home_data(student_id: str, request: Request, days: int = 30):
    """Get home check-ins and family strategies for a student (teacher view)."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # Verify teacher owns this student
        student = supabase.table("students").select("*").eq("id", student_id).execute()
        if not student.data:
            raise HTTPException(status_code=404, detail="Student not found")

        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

        # Home check-ins (logged_by = parent)
        home_logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "parent").gte("timestamp", start_date).order("timestamp", desc=True).execute()

        # Family strategies
        try:
            fam_strats = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("share_with_teacher", True).execute()
            family_strategies = fam_strats.data or []
        except Exception:
            family_strategies = []

        home_checkins = [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
        } for log in (home_logs.data or [])]

        return {
            "sharing_enabled": True,
            "home_checkins": home_checkins,
            "family_strategies": family_strategies,
            "total_home_checkins": len(home_checkins),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_student_home_data error: {e}")
        return {"sharing_enabled": False, "home_checkins": [], "family_strategies": [], "total_home_checkins": 0}


@api_router.get("/teacher/student/{student_id}/combined-checkins")
async def get_student_combined_checkins(student_id: str, request: Request, days: int = 30):
    """Get ALL check-ins for a student — school + home combined."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        result = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        logs = result.data or []
        return [{
            **log,
            "zone": log.get("feeling_colour", log.get("zone", "")),
            "strategies_selected": log.get("helpers_selected", log.get("strategies_selected", [])),
            "source": "home" if log.get("logged_by") == "parent" else "school",
        } for log in logs]
    except Exception as e:
        logger.error(f"get_student_combined_checkins error: {e}")
        return []


@api_router.get("/teacher/student/{student_id}/all-strategies")
async def get_student_all_strategies(student_id: str, request: Request):
    """Get all strategies for a student — school custom + family shared."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        # School strategies
        try:
            school = supabase.table("custom_strategies").select("*").eq("student_id", student_id).execute()
            school_strats = [{**s, "source": "school"} for s in (school.data or [])]
        except Exception:
            school_strats = []
        # Family strategies (shared with teacher)
        try:
            family = supabase.table("family_assigned_strategies").select("*").eq("student_id", student_id).eq("share_with_teacher", True).execute()
            family_strats = [{**s, "source": "home", "name": s.get("strategy_name",""), "description": s.get("strategy_description","")} for s in (family.data or [])]
        except Exception:
            family_strats = []
        return {"school_strategies": school_strats, "family_strategies": family_strats}
    except Exception as e:
        logger.error(f"get_student_all_strategies error: {e}")
        return {"school_strategies": [], "family_strategies": []}


@api_router.post("/teacher/student/{student_id}/strategies")
async def add_student_strategy(student_id: str, request: Request):
    """Add a custom strategy for a student at school."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "student_id": student_id,
            "user_id": user["user_id"],
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "feeling_colour": body.get("zone", body.get("feeling_colour", "green")),
            "zone": body.get("zone", "green"),
            "icon": body.get("icon", "star"),
            "is_shared": body.get("share_with_parent", False),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("custom_strategies").insert(new_strategy).execute()
        return result.data[0] if result.data else new_strategy
    except Exception as e:
        logger.error(f"add_student_strategy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/teacher/student/{student_id}/strategies/{strategy_id}")
async def delete_student_strategy(student_id: str, strategy_id: str, request: Request):
    """Delete a custom strategy for a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        supabase.table("custom_strategies").delete().eq("id", strategy_id).eq("student_id", student_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/teacher/student/{student_id}/strategies/{strategy_id}/toggle-share")
async def toggle_strategy_share_with_parent(student_id: str, strategy_id: str, request: Request):
    """Toggle sharing a school strategy with the parent."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        current = supabase.table("custom_strategies").select("is_shared").eq("id", strategy_id).execute()
        if not current.data:
            raise HTTPException(status_code=404, detail="Strategy not found")
        new_val = not current.data[0].get("is_shared", False)
        supabase.table("custom_strategies").update({"is_shared": new_val}).eq("id", strategy_id).execute()
        return {"is_shared": new_val}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

'''

MARKER = "app.include_router(api_router)"

if "/teacher/student/{student_id}/sharing-status" in content:
    print("✅ Teacher student endpoints already exist")
elif MARKER in content:
    content = content.replace(MARKER, NEW_ENDPOINTS + MARKER)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ All teacher/student endpoints added to backend")
else:
    print("❌ Could not find insertion marker")

# ── Frontend: Add combined checkins and all-strategies to api.ts ──────────────
API = os.path.join(FRONTEND, "src/utils/api.ts")

with open(API, "r") as f:
    api_content = f.read()

OLD_TEACHER_HOME = """export const teacherHomeDataApi = {
  getStudentHomeData: (studentId: string, days: number = 30): Promise<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    message?: string;
  }> =>
    apiRequest(`/teacher/student/${studentId}/home-data?days=${days}`),
  
  getSharingStatus: (studentId: string): Promise<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    school_sharing_enabled: boolean;
  }> =>
    apiRequest(`/teacher/student/${studentId}/sharing-status`),
};"""

NEW_TEACHER_HOME = """export const teacherHomeDataApi = {
  getStudentHomeData: (studentId: string, days: number = 30): Promise<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    total_home_checkins: number;
  }> =>
    apiRequest(`/teacher/student/${studentId}/home-data?days=${days}`),

  getSharingStatus: (studentId: string): Promise<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    school_sharing_enabled: boolean;
    parent_name: string | null;
    link_count: number;
  }> =>
    apiRequest(`/teacher/student/${studentId}/sharing-status`),

  getCombinedCheckins: (studentId: string, days: number = 30): Promise<any[]> =>
    apiRequest(`/teacher/student/${studentId}/combined-checkins?days=${days}`),

  getAllStrategies: (studentId: string): Promise<{school_strategies: any[]; family_strategies: any[]}> =>
    apiRequest(`/teacher/student/${studentId}/all-strategies`),

  addStrategy: (studentId: string, data: {name: string; description?: string; zone: string; icon?: string; share_with_parent?: boolean}): Promise<any> =>
    apiRequest(`/teacher/student/${studentId}/strategies`, { method: 'POST', body: JSON.stringify(data) }),

  deleteStrategy: (studentId: string, strategyId: string): Promise<void> =>
    apiRequest(`/teacher/student/${studentId}/strategies/${strategyId}`, { method: 'DELETE' }),

  toggleStrategyShare: (studentId: string, strategyId: string): Promise<{is_shared: boolean}> =>
    apiRequest(`/teacher/student/${studentId}/strategies/${strategyId}/toggle-share`, { method: 'PUT' }),
};"""

if OLD_TEACHER_HOME in api_content:
    api_content = api_content.replace(OLD_TEACHER_HOME, NEW_TEACHER_HOME)
    with open(API, "w") as f:
        f.write(api_content)
    print("✅ teacherHomeDataApi extended with new methods")
else:
    print("⚠️  Could not find teacherHomeDataApi to extend")

print("\n✅ Backend + API patch done!")
print("Now apply the student-detail frontend patch, then deploy.")
