"""
Run with: python3 patch_student_detail.py
Enhances student detail screen with:
1. Combined school+home check-in calendar
2. Zone distribution pie chart
3. Strategy management (add/edit/delete/share)
4. Linked parent badge
5. Home vs school data tabs
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
DETAIL = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")

with open(DETAIL, "r") as f:
    content = f.read()

# ── Fix 1: Add new state vars and imports ─────────────────────────────────────
OLD_STATES = """  // Home data states
  const [homeData, setHomeData] = useState<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    message?: string;
  } | null>(null);
  const [sharingStatus, setSharingStatus] = useState<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;"""

NEW_STATES = """  // Home data states
  const [homeData, setHomeData] = useState<{
    sharing_enabled: boolean;
    home_checkins: any[];
    family_strategies: any[];
    total_home_checkins: number;
  } | null>(null);
  const [sharingStatus, setSharingStatus] = useState<{
    is_linked_to_parent: boolean;
    home_sharing_enabled: boolean;
    parent_name: string | null;
    link_count: number;"""

if OLD_STATES in content:
    content = content.replace(OLD_STATES, NEW_STATES)
    print("✅ Fix 1: New state vars added")
else:
    print("⚠️  Fix 1: Could not find state vars block")

# ── Fix 2: Add combined checkins + all strategies state ───────────────────────
OLD_SHOW_REPORT = """  const [showReportModal, setShowReportModal] = useState(false);"""
NEW_SHOW_REPORT = """  const [showReportModal, setShowReportModal] = useState(false);
  const [combinedLogs, setCombinedLogs] = useState<any[]>([]);
  const [allStrategies, setAllStrategies] = useState<{school: any[]; family: any[]}>({school: [], family: []});
  const [showAddStrategyModal, setShowAddStrategyModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({name:'', description:'', zone:'green', icon:'star', shareWithParent: false});
  const [savingStrategy, setSavingStrategy] = useState(false);
  const [activeDataTab, setActiveDataTab] = useState<'school'|'home'|'combined'>('combined');"""

if OLD_SHOW_REPORT in content:
    content = content.replace(OLD_SHOW_REPORT, NEW_SHOW_REPORT)
    print("✅ Fix 2: Combined logs and strategy state added")
else:
    print("⚠️  Fix 2: Could not find showReportModal")

# ── Fix 3: Enhance fetchData to load combined + all strategies ────────────────
OLD_FETCH_END = """      if (statusData) {
        setSharingStatus(statusData);
        
        // If linked and sharing enabled, fetch home data
        if (statusData.is_linked_to_parent && statusData.home_sharing_enabled) {
          try {
            const homeDataResult = await teacherHomeDataApi.getStudentHomeData(studentId, selectedPeriod);
            setHomeData(homeDataResult);
          } catch (error) {
            console.log('Could not fetch home data:', error);
          }
        }
      }"""

NEW_FETCH_END = """      if (statusData) {
        setSharingStatus(statusData);

        // Always fetch combined logs (school + home)
        try {
          const combined = await teacherHomeDataApi.getCombinedCheckins(studentId, selectedPeriod);
          setCombinedLogs(combined);
        } catch (e) { console.log('Combined checkins:', e); }

        // Fetch all strategies (school + family shared)
        try {
          const strats = await teacherHomeDataApi.getAllStrategies(studentId);
          setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
        } catch (e) { console.log('All strategies:', e); }

        // If linked and sharing enabled, fetch home data
        if (statusData.is_linked_to_parent && statusData.home_sharing_enabled) {
          try {
            const homeDataResult = await teacherHomeDataApi.getStudentHomeData(studentId, selectedPeriod);
            setHomeData(homeDataResult);
          } catch (error) {
            console.log('Could not fetch home data:', error);
          }
        }
      }"""

if OLD_FETCH_END in content:
    content = content.replace(OLD_FETCH_END, NEW_FETCH_END)
    print("✅ Fix 3: fetchData enhanced with combined + strategies")
else:
    print("⚠️  Fix 3: Could not find fetchData end block")

# ── Fix 4: Add linked parent badge near student header ────────────────────────
OLD_STUDENT_NAME_AREA = """          <Text style={styles.studentName}>{student.name}</Text>"""
NEW_STUDENT_NAME_AREA = """          <Text style={styles.studentName}>{student.name}</Text>
          {sharingStatus?.is_linked_to_parent && (
            <View style={styles.linkedBadge}>
              <MaterialIcons name="link" size={12} color="white" />
              <Text style={styles.linkedBadgeText}>
                {sharingStatus.parent_name ? `Linked: ${sharingStatus.parent_name}` : 'Parent Linked'}
              </Text>
            </View>
          )}"""

if OLD_STUDENT_NAME_AREA in content:
    content = content.replace(OLD_STUDENT_NAME_AREA, NEW_STUDENT_NAME_AREA)
    print("✅ Fix 4: Parent linked badge added to student header")
else:
    print("⚠️  Fix 4: Could not find student name area")

# ── Fix 5: Add calendar view and zone distribution before home data section ───
OLD_HOME_DATA_SECTION = """        {/* Home Data Section (if parent has enabled sharing) */}
        {sharingStatus?.is_linked_to_parent && ("""

NEW_HOME_DATA_SECTION = """        {/* ── Combined Calendar View ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.calendarSection}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="calendar-today" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Check-in Calendar</Text>
            </View>
            <View style={styles.calendarGrid}>
              {(() => {
                // Group by date
                const grouped: Record<string, any[]> = {};
                combinedLogs.forEach(log => {
                  const date = log.timestamp?.split('T')[0] || '';
                  if (!grouped[date]) grouped[date] = [];
                  grouped[date].push(log);
                });
                const dates = Object.keys(grouped).sort().slice(-14); // last 14 days with data
                return dates.map(date => {
                  const dayLogs = grouped[date];
                  const d = new Date(date);
                  const dayName = ['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()];
                  const dayNum = d.getDate();
                  const homeCount = dayLogs.filter(l => l.source === 'home').length;
                  const schoolCount = dayLogs.filter(l => l.source === 'school').length;
                  // dominant zone
                  const zones = dayLogs.map(l => l.zone);
                  const zoneCounts: Record<string,number> = {};
                  zones.forEach(z => { zoneCounts[z] = (zoneCounts[z]||0)+1; });
                  const dominant = Object.entries(zoneCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'green';
                  const ZONE_COLORS_MAP: Record<string,string> = {blue:'#4A90D9',green:'#4CAF50',yellow:'#FFC107',red:'#F44336'};
                  return (
                    <View key={date} style={styles.calendarDay}>
                      <Text style={styles.calendarDayName}>{dayName}</Text>
                      <View style={[styles.calendarDayCircle, {backgroundColor: ZONE_COLORS_MAP[dominant]}]}>
                        <Text style={styles.calendarDayNum}>{dayNum}</Text>
                      </View>
                      <View style={styles.calendarBadges}>
                        {schoolCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#5C6BC0'}]}><Text style={styles.calendarBadgeText}>S</Text></View>}
                        {homeCount > 0 && <View style={[styles.calendarBadge, {backgroundColor:'#4CAF50'}]}><Text style={styles.calendarBadgeText}>H</Text></View>}
                      </View>
                    </View>
                  );
                });
              })()}
            </View>
            {/* Legend */}
            <View style={styles.calendarLegend}>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#5C6BC0'}]}/><Text style={styles.legendText}>S = School</Text></View>
              <View style={styles.legendItem}><View style={[styles.legendDot, {backgroundColor:'#4CAF50'}]}/><Text style={styles.legendText}>H = Home</Text></View>
            </View>
          </View>
        )}

        {/* ── Zone Distribution (combined) ── */}
        {combinedLogs.length > 0 && (
          <View style={styles.zoneDistSection}>
            <View style={styles.sectionHeader}>
              <MaterialIcons name="pie-chart" size={20} color="#5C6BC0" />
              <Text style={styles.sectionTitle}>Zone Distribution</Text>
            </View>
            {/* Data source tabs */}
            <View style={styles.dataTabRow}>
              {(['combined','school','home'] as const).map(tab => (
                <TouchableOpacity key={tab}
                  style={[styles.dataTab, activeDataTab === tab && styles.dataTabActive]}
                  onPress={() => setActiveDataTab(tab)}>
                  <Text style={[styles.dataTabText, activeDataTab === tab && styles.dataTabTextActive]}>
                    {tab === 'combined' ? 'All' : tab === 'school' ? '🏫 School' : '🏠 Home'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {(() => {
              const filtered = activeDataTab === 'combined' ? combinedLogs
                : activeDataTab === 'school' ? combinedLogs.filter(l => l.source === 'school')
                : combinedLogs.filter(l => l.source === 'home');
              const counts: Record<string,number> = {blue:0,green:0,yellow:0,red:0};
              filtered.forEach(l => { if (l.zone in counts) counts[l.zone]++; });
              const total = Object.values(counts).reduce((a,b)=>a+b,0);
              const ZONE_COLORS_MAP: Record<string,string> = {blue:'#4A90D9',green:'#4CAF50',yellow:'#FFC107',red:'#F44336'};
              const ZONE_NAMES: Record<string,string> = {blue:'Blue',green:'Green',yellow:'Yellow',red:'Red'};
              return (
                <View style={styles.zoneDistBars}>
                  {(['green','blue','yellow','red'] as const).map(zone => {
                    const pct = total > 0 ? Math.round((counts[zone]/total)*100) : 0;
                    return (
                      <View key={zone} style={styles.zoneDistRow}>
                        <View style={[styles.zoneDistDot, {backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        <Text style={styles.zoneDistLabel}>{ZONE_NAMES[zone]}</Text>
                        <View style={styles.zoneDistBarBg}>
                          <View style={[styles.zoneDistBar, {width: `${pct}%` as any, backgroundColor: ZONE_COLORS_MAP[zone]}]}/>
                        </View>
                        <Text style={styles.zoneDistPct}>{pct}%</Text>
                        <Text style={styles.zoneDistCount}>({counts[zone]})</Text>
                      </View>
                    );
                  })}
                  {total === 0 && <Text style={styles.emptyText}>No check-ins for this view</Text>}
                </View>
              );
            })()}
          </View>
        )}

        {/* ── Strategy Management ── */}
        <View style={styles.strategiesSection}>
          <View style={styles.sectionHeader}>
            <MaterialIcons name="lightbulb" size={20} color="#FFC107" />
            <Text style={styles.sectionTitle}>Strategies</Text>
            <TouchableOpacity style={styles.addStratBtn} onPress={() => setShowAddStrategyModal(true)}>
              <MaterialIcons name="add" size={18} color="white" />
              <Text style={styles.addStratBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* School strategies */}
          {allStrategies.school.length > 0 && (
            <>
              <Text style={styles.stratSourceLabel}>🏫 School Strategies</Text>
              {allStrategies.school.map((s: any) => (
                <View key={s.id} style={styles.strategyRow}>
                  <MaterialIcons name={(s.icon || 'star') as any} size={20} color="#5C6BC0" />
                  <View style={styles.strategyInfo}>
                    <Text style={styles.strategyName}>{s.name}</Text>
                    {s.description ? <Text style={styles.strategyDesc}>{s.description}</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={[styles.shareToggleBtn, s.is_shared && styles.shareToggleBtnActive]}
                    onPress={async () => {
                      try {
                        await teacherHomeDataApi.toggleStrategyShare(studentId!, s.id);
                        const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                        setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      } catch (e) { console.log(e); }
                    }}>
                    <MaterialIcons name={s.is_shared ? 'home' : 'home'} size={14} color={s.is_shared ? 'white' : '#999'} />
                    <Text style={[styles.shareToggleText, s.is_shared && styles.shareToggleTextActive]}>
                      {s.is_shared ? 'Shared ✓' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert('Delete Strategy', `Delete "${s.name}"?`, [
                      {text:'Cancel', style:'cancel'},
                      {text:'Delete', style:'destructive', onPress: async () => {
                        await teacherHomeDataApi.deleteStrategy(studentId!, s.id);
                        const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                        setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      }}
                    ]);
                  }} style={{padding:6}}>
                    <MaterialIcons name="delete" size={18} color="#F44336" />
                  </TouchableOpacity>
                </View>
              ))}
            </>
          )}

          {/* Family strategies shared with teacher */}
          {allStrategies.family.length > 0 && (
            <>
              <Text style={styles.stratSourceLabel}>🏠 From Home (shared by parent)</Text>
              {allStrategies.family.map((s: any) => (
                <View key={s.id} style={[styles.strategyRow, {borderLeftColor:'#4CAF50', borderLeftWidth:3}]}>
                  <MaterialIcons name={(s.icon || 'favorite') as any} size={20} color="#4CAF50" />
                  <View style={styles.strategyInfo}>
                    <Text style={styles.strategyName}>{s.name || s.strategy_name}</Text>
                    {(s.description || s.strategy_description) ?
                      <Text style={styles.strategyDesc}>{s.description || s.strategy_description}</Text> : null}
                  </View>
                  <View style={[styles.zonePill, {backgroundColor:(ZONE_COLORS[s.zone as keyof typeof ZONE_COLORS]||'#999')+'25'}]}>
                    <Text style={{fontSize:10, color: ZONE_COLORS[s.zone as keyof typeof ZONE_COLORS]||'#999'}}>{s.zone}</Text>
                  </View>
                </View>
              ))}
            </>
          )}

          {allStrategies.school.length === 0 && allStrategies.family.length === 0 && (
            <View style={styles.emptyStrategies}>
              <MaterialIcons name="lightbulb-outline" size={40} color="#CCC" />
              <Text style={styles.emptyText}>No strategies yet. Tap Add to create one.</Text>
            </View>
          )}
        </View>

        {/* ── Add Strategy Modal ── */}
        <Modal visible={showAddStrategyModal} transparent animationType="slide" onRequestClose={() => setShowAddStrategyModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Strategy</Text>
                <TouchableOpacity onPress={() => setShowAddStrategyModal(false)}>
                  <MaterialIcons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{maxHeight:400}}>
                <Text style={styles.inputLabel}>Strategy Name *</Text>
                <TextInput
                  style={styles.textInput}
                  value={newStrategy.name}
                  onChangeText={v => setNewStrategy({...newStrategy, name: v})}
                  placeholder="e.g. Deep breathing, Take a walk..."
                  placeholderTextColor="#AAA"
                />
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, {height:60, textAlignVertical:'top'}]}
                  value={newStrategy.description}
                  onChangeText={v => setNewStrategy({...newStrategy, description: v})}
                  placeholder="How to use this strategy..."
                  placeholderTextColor="#AAA"
                  multiline
                />
                <Text style={styles.inputLabel}>Zone</Text>
                <View style={{flexDirection:'row', gap:8, marginBottom:16}}>
                  {(['blue','green','yellow','red'] as const).map(zone => (
                    <TouchableOpacity key={zone}
                      style={{flex:1, paddingVertical:10, borderRadius:8, alignItems:'center',
                        backgroundColor: newStrategy.zone === zone ? ZONE_COLORS[zone] : '#F0F0F0'}}
                      onPress={() => setNewStrategy({...newStrategy, zone})}>
                      <Text style={{fontSize:12, fontWeight:'600', color: newStrategy.zone === zone ? 'white' : '#666'}}>
                        {zone.charAt(0).toUpperCase() + zone.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity
                  style={{flexDirection:'row', alignItems:'center', gap:8, padding:12,
                    backgroundColor: newStrategy.shareWithParent ? '#E8F5E9' : '#F5F5F5',
                    borderRadius:10, marginBottom:16}}
                  onPress={() => setNewStrategy({...newStrategy, shareWithParent: !newStrategy.shareWithParent})}>
                  <MaterialIcons name={newStrategy.shareWithParent ? 'check-box' : 'check-box-outline-blank'} size={22} color={newStrategy.shareWithParent ? '#4CAF50' : '#999'} />
                  <View>
                    <Text style={{fontSize:14, fontWeight:'600', color:'#333'}}>Share with parent at home</Text>
                    <Text style={{fontSize:11, color:'#888'}}>Parent will see this strategy in their app</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{backgroundColor:'#5C6BC0', borderRadius:12, padding:16, alignItems:'center',
                    opacity: savingStrategy ? 0.6 : 1}}
                  onPress={async () => {
                    if (!newStrategy.name.trim()) { Alert.alert('Name required'); return; }
                    setSavingStrategy(true);
                    try {
                      await teacherHomeDataApi.addStrategy(studentId!, {
                        name: newStrategy.name.trim(),
                        description: newStrategy.description.trim(),
                        zone: newStrategy.zone,
                        icon: 'star',
                        share_with_parent: newStrategy.shareWithParent,
                      });
                      const strats = await teacherHomeDataApi.getAllStrategies(studentId!);
                      setAllStrategies({ school: strats.school_strategies || [], family: strats.family_strategies || [] });
                      setShowAddStrategyModal(false);
                      setNewStrategy({name:'', description:'', zone:'green', icon:'star', shareWithParent:false});
                    } catch (e: any) { Alert.alert('Error', e.message); }
                    finally { setSavingStrategy(false); }
                  }}
                  disabled={savingStrategy}>
                  <Text style={{color:'white', fontSize:16, fontWeight:'600'}}>
                    {savingStrategy ? 'Saving...' : 'Add Strategy'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* Home Data Section (if parent has enabled sharing) */}
        {sharingStatus?.is_linked_to_parent && ("""

if OLD_HOME_DATA_SECTION in content:
    content = content.replace(OLD_HOME_DATA_SECTION, NEW_HOME_DATA_SECTION)
    print("✅ Fix 5: Calendar, zone distribution, strategy management added")
else:
    print("⚠️  Fix 5: Could not find home data section marker")

# ── Fix 6: Add missing styles ─────────────────────────────────────────────────
OLD_LAST_STYLE = "  sharingNotEnabled: {"
NEW_LAST_STYLE = """  linkedBadge: { flexDirection:'row', alignItems:'center', backgroundColor:'#5C6BC0', paddingHorizontal:8, paddingVertical:3, borderRadius:10, gap:4, marginTop:4, alignSelf:'flex-start' },
  linkedBadgeText: { fontSize:11, color:'white', fontWeight:'600' },
  calendarSection: { backgroundColor:'white', borderRadius:16, padding:16, marginBottom:16 },
  calendarGrid: { flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:8 },
  calendarDay: { alignItems:'center', width:38 },
  calendarDayName: { fontSize:9, color:'#888', marginBottom:3 },
  calendarDayCircle: { width:28, height:28, borderRadius:14, alignItems:'center', justifyContent:'center' },
  calendarDayNum: { fontSize:11, fontWeight:'700', color:'white' },
  calendarBadges: { flexDirection:'row', gap:2, marginTop:2 },
  calendarBadge: { width:12, height:12, borderRadius:6, alignItems:'center', justifyContent:'center' },
  calendarBadgeText: { fontSize:7, color:'white', fontWeight:'700' },
  calendarLegend: { flexDirection:'row', gap:16, marginTop:10, justifyContent:'center' },
  legendItem: { flexDirection:'row', alignItems:'center', gap:4 },
  legendDot: { width:8, height:8, borderRadius:4 },
  legendText: { fontSize:11, color:'#666' },
  zoneDistSection: { backgroundColor:'white', borderRadius:16, padding:16, marginBottom:16 },
  sectionHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:12 },
  dataTabRow: { flexDirection:'row', backgroundColor:'#F5F5F5', borderRadius:10, padding:3, marginBottom:12, gap:3 },
  dataTab: { flex:1, paddingVertical:7, borderRadius:8, alignItems:'center' },
  dataTabActive: { backgroundColor:'white' },
  dataTabText: { fontSize:12, color:'#888', fontWeight:'500' },
  dataTabTextActive: { color:'#333', fontWeight:'600' },
  zoneDistBars: { gap:10 },
  zoneDistRow: { flexDirection:'row', alignItems:'center', gap:8 },
  zoneDistDot: { width:12, height:12, borderRadius:6, flexShrink:0 },
  zoneDistLabel: { fontSize:12, color:'#333', width:50 },
  zoneDistBarBg: { flex:1, height:10, backgroundColor:'#F0F0F0', borderRadius:5, overflow:'hidden' },
  zoneDistBar: { height:10, borderRadius:5 },
  zoneDistPct: { fontSize:12, fontWeight:'600', color:'#333', width:35, textAlign:'right' },
  zoneDistCount: { fontSize:10, color:'#888', width:28 },
  strategiesSection: { backgroundColor:'white', borderRadius:16, padding:16, marginBottom:16 },
  stratSourceLabel: { fontSize:12, fontWeight:'600', color:'#888', marginBottom:8, marginTop:8 },
  strategyRow: { flexDirection:'row', alignItems:'center', backgroundColor:'#F8F9FA', borderRadius:10, padding:10, marginBottom:6, gap:10 },
  strategyInfo: { flex:1 },
  strategyName: { fontSize:14, fontWeight:'600', color:'#333' },
  strategyDesc: { fontSize:11, color:'#888', marginTop:2 },
  shareToggleBtn: { flexDirection:'row', alignItems:'center', gap:3, paddingHorizontal:8, paddingVertical:5, borderRadius:8, backgroundColor:'#F0F0F0' },
  shareToggleBtnActive: { backgroundColor:'#4CAF50' },
  shareToggleText: { fontSize:10, color:'#888', fontWeight:'500' },
  shareToggleTextActive: { color:'white' },
  zonePill: { paddingHorizontal:7, paddingVertical:3, borderRadius:8 },
  addStratBtn: { flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#5C6BC0', paddingHorizontal:10, paddingVertical:6, borderRadius:8, marginLeft:'auto' },
  addStratBtnText: { fontSize:12, color:'white', fontWeight:'600' },
  emptyStrategies: { alignItems:'center', paddingVertical:24, gap:8 },
  emptyText: { fontSize:13, color:'#999', textAlign:'center' },
  modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.5)', justifyContent:'flex-end' },
  modalContent: { backgroundColor:'white', borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:40 },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  modalTitle: { fontSize:18, fontWeight:'bold', color:'#333' },
  inputLabel: { fontSize:13, fontWeight:'600', color:'#555', marginBottom:6 },
  textInput: { backgroundColor:'#F5F5F5', borderRadius:10, padding:12, fontSize:15, color:'#333', marginBottom:14 },
  sharingNotEnabled: {"""

if OLD_LAST_STYLE in content:
    content = content.replace(OLD_LAST_STYLE, NEW_LAST_STYLE)
    print("✅ Fix 6: New styles added")
else:
    print("⚠️  Fix 6: Could not find style insertion point")

# Also need TextInput import
if "TextInput" not in content:
    content = content.replace(
        "  Modal,\n  Share,",
        "  Modal,\n  Share,\n  TextInput,"
    )
    print("✅ Fix 6b: TextInput import added")

with open(DETAIL, "w") as f:
    f.write(content)

print("\n✅ Student detail enhanced!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Enhanced student detail: calendar, zone distribution, strategy management' && git push")
