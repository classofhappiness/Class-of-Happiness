"""
Run with: python3 patch_final_direct.py
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# Fix 1: Family dashboard header - remove duplicate logo
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

OLD = """        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>{t('family_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness')}</Text>
        </View>"""

NEW = """        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('family_dashboard') || 'Family Dashboard'}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness') || 'Track emotional wellness at home'}</Text>
        </View>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 1: Family dashboard header - logo removed, subtitle kept")
else:
    print("❌ Pattern not found")

# Fix 2: Custom strategies - fix endpoint name
# The classrooms uses customStrategiesApi.create → /custom-strategies
# But backend has it at /helpers/custom
# Add correct endpoint
with open(SERVER, "r") as f:
    server = f.read()

# Add /custom-strategies as alias for /helpers/custom
if '"/custom-strategies"' not in server:
    idx = server.find('@api_router.post("/helpers/custom")')
    if idx > 0:
        snippet = server[idx:idx+600]
        # Add alias endpoint before the existing one
        ALIAS = '''@api_router.post("/custom-strategies")
async def create_custom_strategy_alias(request: Request):
    """Alias for /helpers/custom - used by classrooms and strategies pages."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        body = await request.json()
        new_id = str(uuid.uuid4())
        strategy = {
            "id": new_id,
            "student_id": body.get("student_id"),
            "user_id": user["user_id"],
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "zone": body.get("zone", body.get("feeling_colour", "green")),
            "feeling_colour": body.get("zone", body.get("feeling_colour", "green")),
            "icon": body.get("icon", "star"),
            "is_shared": body.get("is_shared", True),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("custom_strategies").insert(strategy).execute()
        return result.data[0] if result.data else strategy
    except Exception as e:
        logger.error(f"custom_strategies create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/custom-strategies")
async def get_custom_strategies(request: Request, student_id: Optional[str] = None):
    """Get custom strategies for a student."""
    user = await get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        query = supabase.table("custom_strategies").select("*")
        if student_id:
            query = query.eq("student_id", student_id)
        result = query.execute()
        return result.data or []
    except Exception as e:
        return []

'''
        server = server.replace(
            '@api_router.post("/helpers/custom")',
            ALIAS + '@api_router.post("/helpers/custom")'
        )
        with open(SERVER, "w") as f:
            f.write(server)
        print("✅ Fix 2: /custom-strategies endpoint added to backend")
    else:
        print("⚠️  Fix 2: /helpers/custom not found")
else:
    print("✅ Fix 2: /custom-strategies already exists")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix family header, add custom-strategies endpoint' && git push")
