"""
Run with: python3 patch_superadmin_features.py
Adds resource upload and period toggle to SuperAdmin dashboard
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
ADMIN = os.path.join(FRONTEND, "app/admin/dashboard.tsx")

with open(ADMIN, "r") as f:
    content = f.read()

# ── Fix 1: Add resources tab to SuperAdmin tab bar ───────────────────────────
OLD_SUPER_TABS = """{[{id:'analytics',icon:'bar-chart',label:'Analytics'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'App Info'}].map(t=>("""

NEW_SUPER_TABS = """{[{id:'analytics',icon:'bar-chart',label:'Analytics'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'resources',icon:'cloud-upload',label:'Resources'},{id:'settings',icon:'settings',label:'App Info'}].map(t=>("""

if OLD_SUPER_TABS in content:
    content = content.replace(OLD_SUPER_TABS, NEW_SUPER_TABS)
    print("✅ Fix 1: Resources tab added to SuperAdmin")
else:
    print("⚠️  Fix 1: SuperAdmin tabs not found")

# ── Fix 2: Add period state to SuperAdminDashboard ───────────────────────────
OLD_SUPER_STATE = """  const [tab, setTab] = useState<'analytics'|'strategies'|'settings'>('analytics');"""
NEW_SUPER_STATE = """  const [tab, setTab] = useState<'analytics'|'strategies'|'resources'|'settings'>('analytics');
  const [statsPeriod, setStatsPeriod] = useState<7|30|90>(7);"""

if OLD_SUPER_STATE in content:
    content = content.replace(OLD_SUPER_STATE, NEW_SUPER_STATE)
    print("✅ Fix 2: Period state added to SuperAdmin")
else:
    print("⚠️  Fix 2: SuperAdmin state not found")

# ── Fix 3: Update stats call to use period ───────────────────────────────────
OLD_SUPER_LOAD = """  const loadStats = async () => {
    setLoading(true);
    try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch { setStats(null); }
    finally { setLoading(false); }
  };"""

NEW_SUPER_LOAD = """  const loadStats = async () => {
    setLoading(true);
    try { const d = await apiCall(`/admin/stats?days=${statsPeriod}`, authToken); setStats(d); } catch { setStats(null); }
    finally { setLoading(false); }
  };"""

if OLD_SUPER_LOAD in content:
    content = content.replace(OLD_SUPER_LOAD, NEW_SUPER_LOAD)
    print("✅ Fix 3: SuperAdmin stats call uses period")
else:
    print("⚠️  Fix 3: loadStats not found")

# ── Fix 4: Add period toggle to SuperAdmin analytics tab ─────────────────────
OLD_SUPER_ANALYTICS = """            <Text style={styles.sectionTitle}>Global Analytics</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to expand. No individual names or comments shown.</Text>"""

NEW_SUPER_ANALYTICS = """            <Text style={styles.sectionTitle}>Global Analytics</Text>
            <Text style={styles.sectionSubtitle}>Tap any card to expand. No individual names or comments shown.</Text>

            {/* Period Toggle */}
            <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
              {([7,30,90] as const).map(p=>(
                <TouchableOpacity key={p}
                  style={{flex:1,paddingVertical:8,borderRadius:8,alignItems:'center',
                    backgroundColor:statsPeriod===p?'#3949AB':'#F0F0F0'}}
                  onPress={()=>{ setStatsPeriod(p); loadStats(); }}>
                  <Text style={{fontSize:12,fontWeight:'600',color:statsPeriod===p?'white':'#666'}}>
                    {p===7?'7 Days':p===30?'30 Days':'3 Months'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>"""

if OLD_SUPER_ANALYTICS in content:
    content = content.replace(OLD_SUPER_ANALYTICS, NEW_SUPER_ANALYTICS)
    print("✅ Fix 4: Period toggle added to SuperAdmin analytics")
else:
    print("⚠️  Fix 4: SuperAdmin analytics header not found")

# ── Fix 5: Add resources tab and improve emotion labels in SuperAdmin ─────────
OLD_SUPER_STRAT_TAB = """        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={true}/>}

        {!loading && tab==='settings' && ("""

NEW_SUPER_STRAT_TAB = """        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={true}/>}

        {!loading && tab==='resources' && <AdminResourceUpload authToken={authToken}/>}

        {!loading && tab==='settings' && ("""

if OLD_SUPER_STRAT_TAB in content:
    content = content.replace(OLD_SUPER_STRAT_TAB, NEW_SUPER_STRAT_TAB)
    print("✅ Fix 5: Resources tab wired up in SuperAdmin")
else:
    print("⚠️  Fix 5: SuperAdmin strategies tab not found")

# ── Fix 6: Fix emotion labels in SuperAdmin - student zones ──────────────────
OLD_SUPER_STUDENT_TRENDS = """            <Text style={[styles.sectionTitle,{marginTop:16}]}>Student Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

NEW_SUPER_STUDENT_TRENDS = """            <Text style={[styles.sectionTitle,{marginTop:16}]}>Student Emotion Zones — All Schools</Text>
            <Text style={styles.sectionSubtitle}>Zone distribution as % of total student check-ins in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Wellbeing Zones — All Schools</Text>
            <Text style={styles.sectionSubtitle}>Zone distribution as % of total teacher self check-ins in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

if OLD_SUPER_STUDENT_TRENDS in content:
    content = content.replace(OLD_SUPER_STUDENT_TRENDS, NEW_SUPER_STUDENT_TRENDS)
    print("✅ Fix 6: SuperAdmin emotion labels improved with context")
else:
    print("⚠️  Fix 6: SuperAdmin emotion trends not found")

with open(ADMIN, "w") as f:
    f.write(content)

print("\n✅ SuperAdmin features patched!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add SuperAdmin resource upload and period toggle' && git push")
