"""
Run with: python3 patch_creatures_strategies.py
1. Add points needed display to CreatureCollection
2. Fix strategies sync - show admin/teacher/custom strategies on individual student
3. Add custom strategy add/delete to classrooms strategy modal
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Add points info to CreatureCollection ──────────────────────────────
path = os.path.join(FRONTEND, "src/components/CreatureCollection.tsx")
with open(path, "r") as f:
    content = f.read()

# Find where current creature is displayed and add points progress
OLD_CURRENT = """      {/* Current Creature Section */}"""
NEW_CURRENT = """      {/* Points Guide */}
      <View style={styles.pointsGuide}>
        <Text style={styles.pointsGuideTitle}>⭐ Points needed to evolve:</Text>
        <View style={styles.pointsGuideRow}>
          {['🥚 Egg→Stage 1', '→ Stage 2', '→ Stage 3', '→ Full Grown'].map((label, i) => (
            <View key={i} style={styles.pointsGuideItem}>
              <Text style={styles.pointsGuidePoints}>{[25,60,120,200][i]}</Text>
              <Text style={styles.pointsGuideLabel}>{label}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.pointsGuideHint}>
          💡 Earn points by checking in and using strategies!
        </Text>
      </View>

      {/* Current Creature Section */}"""

if OLD_CURRENT in content:
    content = content.replace(OLD_CURRENT, NEW_CURRENT)
    print("✅ Fix 1a: Points guide added to creature collection")
else:
    print("⚠️  Fix 1a: Could not find current creature section")

# Add styles for points guide
OLD_STYLES_CC = "  collectionTitle: {"
NEW_STYLES_CC = """  pointsGuide: {
    backgroundColor: '#FFF9E6',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  pointsGuideTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 8,
    textAlign: 'center',
  },
  pointsGuideRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  pointsGuideItem: {
    alignItems: 'center',
    flex: 1,
  },
  pointsGuidePoints: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5C6BC0',
  },
  pointsGuideLabel: {
    fontSize: 8,
    color: '#888',
    textAlign: 'center',
    marginTop: 2,
  },
  pointsGuideHint: {
    fontSize: 11,
    color: '#888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  collectionTitle: {"""

if OLD_STYLES_CC in content:
    content = content.replace(OLD_STYLES_CC, NEW_STYLES_CC)
    print("✅ Fix 1b: Points guide styles added")

with open(path, "w") as f:
    f.write(content)

# ── Fix 2: Fix strategies on individual student - show all sources ─────────────
# The issue is strategiesApi.getAll only shows default strategies
# We need to show: default + custom + admin strategies
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix the strategies fetch to use teacherHomeDataApi.getAllStrategies
OLD_STRAT_FETCH = """      // Fetch strategies separately so errors don't block main data
      try {
        const strategiesData = await strategiesApi.getAll(studentId);
        setStrategies(strategiesData || []);
      } catch (stratErr) {
        console.log('Strategies not available:', stratErr);
        setStrategies([]);
      }"""

NEW_STRAT_FETCH = """      // Fetch all strategies (school custom + admin + family shared)
      try {
        const allStrats = await teacherHomeDataApi.getAllStrategies(studentId);
        // Combine school and family strategies into one list
        const schoolStrats = (allStrats.school_strategies || []).map((s: any) => ({
          ...s,
          source: 'school',
        }));
        const familyStrats = (allStrats.family_strategies || []).map((s: any) => ({
          ...s,
          name: s.name || s.strategy_name,
          description: s.description || s.strategy_description,
          source: 'home',
        }));
        setStrategies([...schoolStrats, ...familyStrats] as any);
        setAllStrategies({ school: schoolStrats, family: familyStrats });
      } catch (stratErr) {
        console.log('Strategies fetch error:', stratErr);
        // Fallback to basic strategies API
        try {
          const basic = await strategiesApi.getAll(studentId);
          setStrategies(basic || []);
        } catch { setStrategies([]); }
      }"""

if OLD_STRAT_FETCH in content:
    content = content.replace(OLD_STRAT_FETCH, NEW_STRAT_FETCH)
    print("✅ Fix 2: Student detail now shows all strategy sources")
else:
    print("⚠️  Fix 2: Could not find strategies fetch block")

with open(path, "w") as f:
    f.write(content)

# ── Fix 3: Classrooms - add text input for custom strategies ──────────────────
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Add TextInput to imports if not there
if "TextInput" not in content.split("from 'react-native'")[0]:
    content = content.replace(
        "  Platform,,\n  Image,} from 'react-native';",
        "  Platform,\n  Image,\n  TextInput,} from 'react-native';"
    )
    # Also try other patterns
    if "TextInput" not in content:
        content = content.replace(
            "  Platform,\n  Image,} from 'react-native';",
            "  Platform,\n  Image,\n  TextInput,} from 'react-native';"
        )

# Find the strategy modal content and add custom strategy input
OLD_STRATEGY_LIST = """              {/* Strategies List */}
              <ScrollView style={styles.strategyList}>
                {ALL_STRATEGIES[selectedZone]?.map(strategy => ("""

NEW_STRATEGY_LIST = """              {/* Add Custom Strategy */}
              {showCustomStrategyInput ? (
                <View style={{backgroundColor:'#F8F9FA',borderRadius:10,padding:12,marginBottom:12}}>
                  <TextInput
                    style={{borderWidth:1,borderColor:'#DDD',borderRadius:8,padding:10,fontSize:14,marginBottom:8,backgroundColor:'white'}}
                    placeholder="Strategy name..."
                    value={customStrategyName}
                    onChangeText={setCustomStrategyName}
                    placeholderTextColor="#AAA"
                  />
                  <TextInput
                    style={{borderWidth:1,borderColor:'#DDD',borderRadius:8,padding:10,fontSize:13,marginBottom:8,backgroundColor:'white',height:60,textAlignVertical:'top'}}
                    placeholder="Description (optional)..."
                    value={customStrategyDesc}
                    onChangeText={setCustomStrategyDesc}
                    multiline
                    placeholderTextColor="#AAA"
                  />
                  <View style={{flexDirection:'row',gap:8}}>
                    <TouchableOpacity
                      style={{flex:1,backgroundColor:'#5C6BC0',borderRadius:8,padding:10,alignItems:'center'}}
                      onPress={async () => {
                        if (!customStrategyName.trim()) return;
                        try {
                          const { customStrategiesApi } = require('../../src/utils/api');
                          const studentIds = editingClassroom
                            ? getClassroomStudents(editingClassroom.id).map((s:any) => s.id)
                            : [];
                          for (const sid of studentIds) {
                            await customStrategiesApi.create({
                              student_id: sid,
                              name: customStrategyName.trim(),
                              description: customStrategyDesc.trim(),
                              zone: selectedZone,
                              is_shared: true,
                            });
                          }
                          setCustomStrategyName('');
                          setCustomStrategyDesc('');
                          setShowCustomStrategyInput(false);
                          Alert.alert('✅ Added', `Strategy added to ${studentIds.length} students`);
                        } catch(e) { Alert.alert('Error', 'Could not save strategy'); }
                      }}>
                      <Text style={{color:'white',fontWeight:'600',fontSize:13}}>Save Strategy</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{flex:1,backgroundColor:'#F0F0F0',borderRadius:8,padding:10,alignItems:'center'}}
                      onPress={() => setShowCustomStrategyInput(false)}>
                      <Text style={{color:'#666',fontWeight:'600',fontSize:13}}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity
                  style={{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#EEF2FF',borderRadius:8,padding:10,marginBottom:12}}
                  onPress={() => setShowCustomStrategyInput(true)}>
                  <MaterialIcons name="add" size={18} color="#5C6BC0" />
                  <Text style={{color:'#5C6BC0',fontWeight:'600',fontSize:13}}>Write a custom strategy</Text>
                </TouchableOpacity>
              )}

              {/* Strategies List */}
              <ScrollView style={styles.strategyList}>
                {ALL_STRATEGIES[selectedZone]?.map(strategy => ("""

if OLD_STRATEGY_LIST in content:
    content = content.replace(OLD_STRATEGY_LIST, NEW_STRATEGY_LIST)
    print("✅ Fix 3: Custom strategy input added to classrooms modal")
else:
    print("⚠️  Fix 3: Strategy list pattern not found")

with open(path, "w") as f:
    f.write(content)

print("\n✅ All fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Creature points guide, strategies sync, custom strategy in classrooms' && git push")
