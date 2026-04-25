"""
Run with: python3 patch_cc_strat.py
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Add points guide to CreatureCollection ────────────────────────────
path = os.path.join(FRONTEND, "src/components/CreatureCollection.tsx")
with open(path, "r") as f:
    content = f.read()

# Insert points guide right after the return ( in the modal
OLD = """  const handleClose = () => { playButtonFeedback(); onClose(); };"""
NEW = """  const handleClose = () => { playButtonFeedback(); onClose(); };

  const PointsGuide = () => (
    <View style={styles.pointsGuide}>
      <Text style={styles.pointsGuideTitle}>⭐ How to grow your creature:</Text>
      <View style={styles.pointsGuideRow}>
        {[
          {label:'🥚 Hatch', pts: 25},
          {label:'🐣 Grow', pts: 60},
          {label:'🐤 Evolve', pts: 120},
          {label:'✨ Max', pts: 200},
        ].map((item, i) => (
          <View key={i} style={styles.pointsGuideItem}>
            <Text style={styles.pointsGuidePts}>{item.pts}</Text>
            <Text style={styles.pointsGuideLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.pointsGuideHint}>Check in + use strategies = earn points!</Text>
    </View>
  );"""

if OLD in content and "PointsGuide" not in content:
    content = content.replace(OLD, NEW)
    print("✅ Fix 1a: PointsGuide component added")
else:
    print("⚠️  Fix 1a: Already added or pattern not found")

# Find where to insert <PointsGuide /> - just before the creature display
OLD_RENDER = """  const renderItemGrid = (items: any[], unlockedIds: string[], label: string, emoji: string) => {"""
# Add PointsGuide render call near the scrollview content
# Find the modal ScrollView content
OLD_SCROLL_START = """          <ScrollView showsVerticalScrollIndicator={false}>"""
NEW_SCROLL_START = """          <ScrollView showsVerticalScrollIndicator={false}>
            <PointsGuide />"""

if OLD_SCROLL_START in content and "<PointsGuide />" not in content:
    content = content.replace(OLD_SCROLL_START, NEW_SCROLL_START)
    print("✅ Fix 1b: PointsGuide inserted into modal")
else:
    print("⚠️  Fix 1b: ScrollView start not found or already added")

# Add styles
OLD_LAST_STYLE = "  itemCard: {"
NEW_LAST_STYLE = """  pointsGuide: { backgroundColor:'#FFF9E6', borderRadius:12, padding:12, marginBottom:12, borderWidth:1, borderColor:'#FFE082' },
  pointsGuideTitle: { fontSize:12, fontWeight:'700', color:'#F57F17', marginBottom:8, textAlign:'center' },
  pointsGuideRow: { flexDirection:'row', justifyContent:'space-between', marginBottom:6 },
  pointsGuideItem: { alignItems:'center', flex:1 },
  pointsGuidePts: { fontSize:15, fontWeight:'900', color:'#5C6BC0' },
  pointsGuideLabel: { fontSize:9, color:'#888', textAlign:'center', marginTop:1 },
  pointsGuideHint: { fontSize:10, color:'#888', textAlign:'center', fontStyle:'italic' },
  itemCard: {"""

if "pointsGuide:" not in content:
    content = content.replace(OLD_LAST_STYLE, NEW_LAST_STYLE)
    print("✅ Fix 1c: Points guide styles added")

with open(path, "w") as f:
    f.write(content)

# ── Fix 3: Classrooms - add custom strategy write box ─────────────────────────
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Add TextInput to imports
if "TextInput" not in content:
    content = content.replace(
        "  Platform,\n  Image,} from 'react-native';",
        "  Platform,\n  Image,\n  TextInput,} from 'react-native';"
    )
    print("✅ Fix 3a: TextInput imported")

# Find strategy modal content - look for zone selector
OLD_ZONE_TABS = """              {/* Zone selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneTabs}>"""

NEW_ZONE_TABS = """              {/* Add Custom Strategy */}
              {showCustomStrategyInput ? (
                <View style={{backgroundColor:'#F8F9FA',borderRadius:10,padding:12,marginBottom:12,gap:8}}>
                  <Text style={{fontSize:13,fontWeight:'600',color:'#333'}}>Write a custom strategy:</Text>
                  <TextInput
                    style={{borderWidth:1,borderColor:'#DDD',borderRadius:8,padding:10,fontSize:14,backgroundColor:'white'}}
                    placeholder="Strategy name e.g. Take 3 deep breaths"
                    value={customStrategyName}
                    onChangeText={setCustomStrategyName}
                    placeholderTextColor="#AAA"
                  />
                  <TextInput
                    style={{borderWidth:1,borderColor:'#DDD',borderRadius:8,padding:10,fontSize:13,backgroundColor:'white',height:56,textAlignVertical:'top'}}
                    placeholder="How to do it (optional)..."
                    value={customStrategyDesc}
                    onChangeText={setCustomStrategyDesc}
                    multiline
                    placeholderTextColor="#AAA"
                  />
                  <View style={{flexDirection:'row',gap:8}}>
                    <TouchableOpacity
                      style={{flex:1,backgroundColor:'#5C6BC0',borderRadius:8,padding:10,alignItems:'center'}}
                      onPress={async () => {
                        if (!customStrategyName.trim()) { Alert.alert('Name required'); return; }
                        try {
                          const { customStrategiesApi } = require('../../src/utils/api');
                          const targets = editingClassroom ? getClassroomStudents(editingClassroom.id) : students;
                          for (const s of targets) {
                            await customStrategiesApi.create({
                              student_id: s.id, name: customStrategyName.trim(),
                              description: customStrategyDesc.trim(),
                              zone: selectedZone, is_shared: true,
                            });
                          }
                          Alert.alert('✅ Done', `Added to ${targets.length} student(s)`);
                          setCustomStrategyName(''); setCustomStrategyDesc('');
                          setShowCustomStrategyInput(false);
                        } catch { Alert.alert('Error','Could not save strategy'); }
                      }}>
                      <Text style={{color:'white',fontWeight:'600'}}>Save to Students</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{backgroundColor:'#EEE',borderRadius:8,padding:10,paddingHorizontal:16}}
                      onPress={() => setShowCustomStrategyInput(false)}>
                      <Text style={{color:'#666',fontWeight:'600'}}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#EEF2FF',borderRadius:8,padding:10,marginBottom:12}}
                  onPress={() => setShowCustomStrategyInput(true)}>
                  <MaterialIcons name="add" size={18} color="#5C6BC0"/>
                  <Text style={{color:'#5C6BC0',fontWeight:'600',fontSize:13}}>✏️ Write a custom strategy</Text>
                </TouchableOpacity>
              )}

              {/* Zone selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.zoneTabs}>"""

if OLD_ZONE_TABS in content and "showCustomStrategyInput" not in content:
    content = content.replace(OLD_ZONE_TABS, NEW_ZONE_TABS)
    print("✅ Fix 3b: Custom strategy input added to classrooms")
elif "showCustomStrategyInput" in content:
    print("✅ Fix 3b: Already added")
else:
    print("⚠️  Fix 3b: Zone tabs not found")
    # Show what's around strategy modal
    idx = content.find("strategyModalVisible")
    if idx > 0:
        print(content[idx:idx+200])

with open(path, "w") as f:
    f.write(content)

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Creature points guide, custom strategy in classrooms' && git push")
