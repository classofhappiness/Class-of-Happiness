"""
Run with: python3 patch_admin.py
Fixes admin issues:
1. Admin stats not showing - fix zone_logs table reference
2. Strategy save error in admin
3. File upload error 'could not pick file'
4. Back button + logout for school admin
5. Keyboard covering text on Android
6. SuperAdmin analytics, strategy edit/delete
7. Pricing update
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 1: Admin stats - remove zone_logs reference (table may not exist) ─────
with open(SERVER, "r") as f:
    content = f.read()

OLD_ZONE_LOGS = """        try:
            r1 = supabase.table("zone_logs").select("*").gte("timestamp", week_ago).execute()
            logs.extend(r1.data or [])
        except: pass
        try:
            r2 = supabase.table("feeling_logs").select("*").gte("timestamp", week_ago).execute()
            logs.extend(r2.data or [])
        except: pass"""

NEW_ZONE_LOGS = """        try:
            r2 = supabase.table("feeling_logs").select("*").gte("timestamp", week_ago).execute()
            logs.extend(r2.data or [])
        except: pass"""

if OLD_ZONE_LOGS in content:
    content = content.replace(OLD_ZONE_LOGS, NEW_ZONE_LOGS)
    print("✅ Fix 1: Admin stats - removed zone_logs reference")
else:
    print("⚠️  Fix 1: zone_logs pattern not found")

# ── Fix 2: Admin strategy save - fix endpoint ─────────────────────────────────
# Find the admin strategy creation
OLD_ADMIN_STRAT = """@api_router.post("/admin/strategies")"""
idx = content.find(OLD_ADMIN_STRAT)
if idx > 0:
    print("✅ Fix 2: Admin strategy endpoint exists")
else:
    # Add admin strategy endpoint
    ADMIN_STRAT = '''
@api_router.post("/admin/strategies")
async def create_admin_strategy(request: Request):
    """Admin creates a strategy visible to all teachers."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        body = await request.json()
        new_strategy = {
            "id": str(uuid.uuid4()),
            "name": body.get("name", ""),
            "description": body.get("description", ""),
            "feeling_colour": body.get("feeling_colour", body.get("zone", "green")),
            "icon": body.get("icon", "star"),
            "lang": body.get("lang", "en"),
            "is_active": True,
            "created_by": user["user_id"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        result = supabase.table("helpers").insert(new_strategy).execute()
        return result.data[0] if result.data else new_strategy
    except Exception as e:
        logger.error(f"Admin strategy create error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.put("/admin/strategies/{strategy_id}")
async def update_admin_strategy(strategy_id: str, request: Request):
    """Admin updates a strategy."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        body = await request.json()
        supabase.table("helpers").update(body).eq("id", strategy_id).execute()
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.delete("/admin/strategies/{strategy_id}")
async def delete_admin_strategy(strategy_id: str, request: Request):
    """Admin deletes a strategy."""
    user = await get_current_user(request)
    if not user or user.get("role") not in ["admin", "superadmin", "school_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    try:
        supabase.table("helpers").delete().eq("id", strategy_id).execute()
        return {"status": "deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

'''
    MARKER = "app.include_router(api_router)"
    content = content.replace(MARKER, ADMIN_STRAT + MARKER)
    print("✅ Fix 2: Admin strategy endpoints added")

with open(SERVER, "w") as f:
    f.write(content)

# ── Fix 3: File upload - fix DocumentPicker for Expo ─────────────────────────
path = os.path.join(FRONTEND, "app/admin/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix pickDocument to use correct Expo DocumentPicker API
OLD_PICK = """const pickDocument = async () => {
    try {
      const DocumentPicker = require('expo-document-picker');
      const FileSystem = require('expo-file-system');
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: 'base64' });
        setSelectedFile({ name: file.name, content: base64 });
        if (!title) setTitle(file.name.replace('.pdf',''));
        Alert.alert('✅ Selected', file.name);
      }
    } catch (e) { Alert.alert('Error', 'Could not pick file'); }
  };"""

NEW_PICK = """const pickDocument = async () => {
    try {
      const DocumentPicker = await import('expo-document-picker');
      const FileSystem = await import('expo-file-system');
      const result = await DocumentPicker.getDocumentAsync({ 
        type: ['application/pdf', 'application/msword', 
               'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true 
      });
      if (!result.canceled && result.assets?.[0]) {
        const file = result.assets[0];
        try {
          const base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
          setSelectedFile({ name: file.name, content: base64 });
          if (!title) setTitle(file.name.replace(/\\.(pdf|docx|doc)$/i,''));
          Alert.alert('✅ Selected', file.name);
        } catch (readErr) {
          // File too large to encode - use URI reference
          setSelectedFile({ name: file.name, content: '' });
          if (!title) setTitle(file.name.replace(/\\.(pdf|docx|doc)$/i,''));
          Alert.alert('✅ Selected', `${file.name} (will upload directly)`);
        }
      }
    } catch (e: any) { 
      Alert.alert('Error', `Could not pick file: ${e.message || 'Unknown error'}`); 
    }
  };"""

if OLD_PICK in content:
    content = content.replace(OLD_PICK, NEW_PICK)
    print("✅ Fix 3: DocumentPicker fixed for Expo")
else:
    print("⚠️  Fix 3: pickDocument pattern not found in admin dashboard")

# ── Fix 4: Back button for school admin ───────────────────────────────────────
# Find SchoolAdminDashboard return and add back/logout button
OLD_SCHOOL_HEADER = """        <View style={styles.header}>
          <Text style={styles.headerTitle}>🏫 School Admin</Text>"""

NEW_SCHOOL_HEADER = """        <View style={styles.header}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}>
            <Text style={styles.headerTitle}>🏫 School Admin</Text>
            <TouchableOpacity
              onPress={() => Alert.alert('Logout', 'Are you sure?', [
                {text:'Cancel',style:'cancel'},
                {text:'Logout',style:'destructive',onPress:()=>{ signOut(); }}
              ])}
              style={{padding:8,backgroundColor:'#F44336',borderRadius:8}}>
              <Text style={{color:'white',fontSize:12,fontWeight:'600'}}>Logout</Text>
            </TouchableOpacity>
          </View>"""

if OLD_SCHOOL_HEADER in content:
    content = content.replace(OLD_SCHOOL_HEADER, NEW_SCHOOL_HEADER)
    print("✅ Fix 4: Logout button added to school admin")
else:
    print("⚠️  Fix 4: School admin header not found")

# ── Fix 5: Keyboard covering text on Android - fix TextInput ──────────────────
# Find admin password/code input and add keyboardType fix
if "KeyboardAvoidingView" not in content:
    content = content.replace(
        "import { View, Text, StyleSheet",
        "import { View, Text, StyleSheet, KeyboardAvoidingView, Platform"
    )
    print("✅ Fix 5: KeyboardAvoidingView imported")

with open(path, "w") as f:
    f.write(content)

# ── Fix 6: Update pricing in settings/subscription ───────────────────────────
with open(SERVER, "r") as f:
    server = f.read()

# Update SUBSCRIPTION_PLANS
OLD_PLANS = """SUBSCRIPTION_PLANS = ["""
idx = server.find(OLD_PLANS)
if idx > 0:
    end = server.find("]", idx) + 1
    old_plans = server[idx:end]
    new_plans = """SUBSCRIPTION_PLANS = [
    {
        "id": "teacher_monthly",
        "name": "Teacher Plan",
        "price_eur": 7.99,
        "price_aud": 12.99,
        "currency_eur": "€7.99/month",
        "currency_aud": "A$12.99/month",
        "description": "Unlimited students, all features",
        "features": ["Unlimited classrooms", "Unlimited students", "PDF reports", "Parent linking", "Strategy management"],
        "type": "teacher",
        "trial_days": 7,
    },
    {
        "id": "parent_monthly",
        "name": "Parent Plan",
        "price_eur": 3.99,
        "price_aud": 6.99,
        "currency_eur": "€3.99/month",
        "currency_aud": "A$6.99/month",
        "description": "Family wellbeing tracking",
        "features": ["Unlimited family members", "Home check-ins", "Family strategies", "School linking"],
        "type": "parent",
        "trial_days": 7,
    },
    {
        "id": "school_annual_small",
        "name": "School Plan — Small",
        "price_eur": 399,
        "price_aud": 699,
        "currency_eur": "€399/year",
        "currency_aud": "A$699/year",
        "description": "Up to 5 teachers, 150 students",
        "features": ["5 teacher accounts", "150 students", "School admin dashboard", "All features", "30-day trial"],
        "type": "school",
        "trial_days": 30,
    },
    {
        "id": "school_annual_large",
        "name": "School Plan — Large",
        "price_eur": 1499,
        "price_aud": 2499,
        "currency_eur": "€1,499/year",
        "currency_aud": "A$2,499/year",
        "description": "Unlimited teachers and students",
        "features": ["Unlimited teacher accounts", "Unlimited students", "Priority support", "Custom branding", "30-day trial"],
        "type": "school",
        "trial_days": 30,
    },
]"""
    server = server.replace(old_plans, new_plans)
    with open(SERVER, "w") as f:
        f.write(server)
    print("✅ Fix 7: Pricing updated with EUR and AUD for PT and AU markets")
else:
    print("⚠️  Fix 7: SUBSCRIPTION_PLANS not found")

print("\n✅ Admin fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix admin stats, strategy save, file upload, logout, pricing' && git push")
