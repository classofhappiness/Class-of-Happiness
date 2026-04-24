"""
Run with: python3 patch_admin_features.py
Adds:
1. Resource upload tab to school admin dashboard
2. Period toggle (day/week/month) for emotion trends
3. Better percentage display
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
ADMIN = os.path.join(FRONTEND, "app/admin/dashboard.tsx")

with open(ADMIN, "r") as f:
    content = f.read()

# ── Fix 1: Add 'resources' tab to school admin tab bar ───────────────────────
OLD_SCHOOL_TABS = """{[{id:'overview',icon:'bar-chart',label:'Overview'},{id:'alerts',icon:'notifications-active',label:'Alerts'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'settings',icon:'settings',label:'Settings'}].map(t=>("""

NEW_SCHOOL_TABS = """{[{id:'overview',icon:'bar-chart',label:'Overview'},{id:'alerts',icon:'notifications-active',label:'Alerts'},{id:'strategies',icon:'lightbulb',label:'Strategies'},{id:'resources',icon:'cloud-upload',label:'Resources'},{id:'settings',icon:'settings',label:'Settings'}].map(t=>("""

if OLD_SCHOOL_TABS in content:
    content = content.replace(OLD_SCHOOL_TABS, NEW_SCHOOL_TABS)
    print("✅ Fix 1: Resources tab added to school admin")
else:
    print("⚠️  Fix 1: School admin tabs not found")

# ── Fix 2: Add period toggle state to SchoolAdminDashboard ───────────────────
OLD_SCHOOL_STATE = """  const [tab, setTab] = useState<'overview'|'alerts'|'strategies'|'settings'>('overview');"""
NEW_SCHOOL_STATE = """  const [tab, setTab] = useState<'overview'|'alerts'|'strategies'|'resources'|'settings'>('overview');
  const [statsPeriod, setStatsPeriod] = useState<7|30|90>(7);"""

if OLD_SCHOOL_STATE in content:
    content = content.replace(OLD_SCHOOL_STATE, NEW_SCHOOL_STATE)
    print("✅ Fix 2: Period state added")
else:
    print("⚠️  Fix 2: School admin state not found")

# ── Fix 3: Update loadData to use period ─────────────────────────────────────
OLD_LOAD_OVERVIEW = """      if (tab==='overview') {
        try { const d = await apiCall('/admin/stats', authToken); setStats(d); } catch {}"""
NEW_LOAD_OVERVIEW = """      if (tab==='overview') {
        try { const d = await apiCall(`/admin/stats?days=${statsPeriod}`, authToken); setStats(d); } catch {}"""

if OLD_LOAD_OVERVIEW in content:
    content = content.replace(OLD_LOAD_OVERVIEW, NEW_LOAD_OVERVIEW)
    print("✅ Fix 3: Stats call uses period")
else:
    print("⚠️  Fix 3: loadData overview block not found")

# ── Fix 4: Add period toggle UI before emotion trends ────────────────────────
OLD_STUDENT_TRENDS = """            <Text style={[styles.sectionTitle,{marginTop:16}]}>Student Emotion Trends</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Emotion Trends</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

NEW_STUDENT_TRENDS = """            {/* Period Toggle */}
            <View style={{flexDirection:'row',gap:8,marginTop:16,marginBottom:4}}>
              {([7,30,90] as const).map(p=>(
                <TouchableOpacity key={p}
                  style={{flex:1,paddingVertical:8,borderRadius:8,alignItems:'center',
                    backgroundColor: statsPeriod===p ? '#5C6BC0' : '#F0F0F0'}}
                  onPress={()=>{ setStatsPeriod(p); }}>
                  <Text style={{fontSize:12,fontWeight:'600',color:statsPeriod===p?'white':'#666'}}>
                    {p===7?'7 Days':p===30?'30 Days':'3 Months'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:12}]}>Student Emotion Zones</Text>
            <Text style={styles.sectionSubtitle}>How students are feeling — percentages of total check-ins in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Wellbeing Zones</Text>
            <Text style={styles.sectionSubtitle}>Teacher self check-ins — percentages of total in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

if OLD_STUDENT_TRENDS in content:
    content = content.replace(OLD_STUDENT_TRENDS, NEW_STUDENT_TRENDS)
    print("✅ Fix 4: Period toggle + improved labels added to school admin")
else:
    print("⚠️  Fix 4: Student trends block not found")

# ── Fix 5: Add resources tab content ─────────────────────────────────────────
OLD_STRATEGIES_TAB = """        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={false}/>}

        {!loading && tab==='settings' && (
          <SchoolSettingsTab"""

NEW_STRATEGIES_TAB = """        {!loading && tab==='strategies' && <StrategyManager authToken={authToken} isSuperAdmin={false}/>}

        {!loading && tab==='resources' && <AdminResourceUpload authToken={authToken}/>}

        {!loading && tab==='settings' && (
          <SchoolSettingsTab"""

if OLD_STRATEGIES_TAB in content:
    content = content.replace(OLD_STRATEGIES_TAB, NEW_STRATEGIES_TAB)
    print("✅ Fix 5: Resources tab content wired up")
else:
    print("⚠️  Fix 5: Strategies tab not found")

# ── Fix 6: Add AdminResourceUpload component ─────────────────────────────────
# Add before SchoolAdminDashboard function
RESOURCE_COMPONENT = '''
// ── Admin Resource Upload Component ──────────────────────────────────────────
function AdminResourceUpload({ authToken }: { authToken: string | null }) {
  const { t } = useApp();
  const [resources, setResources] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [audience, setAudience] = React.useState('both');
  const [selectedFile, setSelectedFile] = React.useState<{name:string; content:string} | null>(null);

  React.useEffect(() => { loadResources(); }, []);

  const loadResources = async () => {
    setLoading(true);
    try {
      const data = await apiCall('/admin/resources', authToken);
      setResources(Array.isArray(data) ? data : []);
    } catch { setResources([]); }
    finally { setLoading(false); }
  };

  const pickDocument = async () => {
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
  };

  const handleUpload = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title'); return; }
    setUploading(true);
    try {
      const payload: any = {
        title: title.trim(),
        description: description.trim(),
        audience,
        topic: 'general',
        content_type: selectedFile ? 'pdf' : 'text',
        content: selectedFile ? selectedFile.content : description.trim(),
        pdf_filename: selectedFile?.name,
      };
      await apiCall('/admin/resources', authToken, { method: 'POST', body: JSON.stringify(payload) });
      Alert.alert('✅ Uploaded', 'Resource shared with ' + audience);
      setTitle(''); setDescription(''); setSelectedFile(null); setAudience('both');
      loadResources();
    } catch (e: any) { Alert.alert('Upload Failed', e.message || 'Please try again'); }
    finally { setUploading(false); }
  };

  const deleteResource = (id: string) => {
    Alert.alert('Delete', 'Remove this resource?', [
      {text:'Cancel',style:'cancel'},
      {text:'Delete',style:'destructive',onPress:async()=>{
        try { await apiCall(`/admin/resources/${id}`, authToken, {method:'DELETE'}); loadResources(); }
        catch { Alert.alert('Error','Could not delete'); }
      }},
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{padding:16,paddingBottom:40}}>
      <Text style={styles.sectionTitle}>Upload Resources</Text>
      <Text style={styles.sectionSubtitle}>Share files with teachers, parents, or both. Uploaded resources appear in their resource sections.</Text>

      <View style={{backgroundColor:'white',borderRadius:14,padding:16,marginBottom:16}}>
        <Text style={styles.inputLabel}>Title *</Text>
        <TextInput style={styles.input} placeholder="Resource title..." value={title} onChangeText={setTitle} placeholderTextColor="#AAA"/>

        <Text style={styles.inputLabel}>Description</Text>
        <TextInput style={[styles.input,{height:60,textAlignVertical:'top'}]} placeholder="Brief description..." value={description} onChangeText={setDescription} multiline placeholderTextColor="#AAA"/>

        <Text style={styles.inputLabel}>Share With</Text>
        <View style={{flexDirection:'row',gap:8,marginBottom:12}}>
          {[{id:'teachers',label:'👩‍🏫 Teachers'},{id:'parents',label:'👨‍👩‍👧 Parents'},{id:'both',label:'🌐 Both'}].map(opt=>(
            <TouchableOpacity key={opt.id}
              style={{flex:1,paddingVertical:8,borderRadius:8,alignItems:'center',
                backgroundColor:audience===opt.id?'#5C6BC0':'#F0F0F0'}}
              onPress={()=>setAudience(opt.id)}>
              <Text style={{fontSize:12,fontWeight:'600',color:audience===opt.id?'white':'#666'}}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={{flexDirection:'row',alignItems:'center',borderWidth:2,borderColor:'#5C6BC0',borderStyle:'dashed',borderRadius:10,padding:14,marginBottom:12,gap:10}}
          onPress={pickDocument}>
          <MaterialIcons name="attach-file" size={24} color="#5C6BC0"/>
          <Text style={{color:'#5C6BC0',flex:1}}>{selectedFile?.name || 'Select PDF file (optional)'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.addBtn, uploading && {opacity:0.6}]}
          onPress={handleUpload}
          disabled={uploading}>
          <MaterialIcons name={uploading?'hourglass-empty':'cloud-upload'} size={18} color="white"/>
          <Text style={styles.addBtnText}>{uploading?'Uploading...':'Upload Resource'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Uploaded Resources ({resources.length})</Text>
      {loading ? <ActivityIndicator color="#5C6BC0"/> : resources.length === 0 ? (
        <Text style={styles.emptyText}>No resources uploaded yet</Text>
      ) : resources.map((r,i)=>(
        <View key={r.id||i} style={{flexDirection:'row',alignItems:'center',backgroundColor:'white',borderRadius:12,padding:12,marginBottom:8,gap:10}}>
          <MaterialIcons name={r.content_type==='pdf'?'picture-as-pdf':'article'} size={28} color={r.content_type==='pdf'?'#F44336':'#5C6BC0'}/>
          <View style={{flex:1}}>
            <Text style={{fontSize:14,fontWeight:'600',color:'#333'}}>{r.title}</Text>
            <Text style={{fontSize:11,color:'#888',marginTop:2}}>For: {r.target_audience||r.audience||'all'}</Text>
          </View>
          <TouchableOpacity onPress={()=>deleteResource(r.id)} style={{padding:8}}>
            <MaterialIcons name="delete" size={20} color="#F44336"/>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

'''

# Insert before SchoolAdminDashboard
OLD_SCHOOL_ADMIN_FN = """function SchoolAdminDashboard({ authToken, user }: { authToken:string|null, user:any }) {"""

if OLD_SCHOOL_ADMIN_FN in content:
    content = content.replace(OLD_SCHOOL_ADMIN_FN, RESOURCE_COMPONENT + OLD_SCHOOL_ADMIN_FN)
    print("✅ Fix 6: AdminResourceUpload component added")
else:
    print("⚠️  Fix 6: SchoolAdminDashboard function not found")

# Need to add React import for useState/useEffect in the component
if "import React" in content and "React.useState" not in content:
    content = content.replace("import React,", "import React,")

with open(ADMIN, "w") as f:
    f.write(content)

print("\n✅ All admin feature patches applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add admin resource upload, period toggle for emotion trends' && git push")
