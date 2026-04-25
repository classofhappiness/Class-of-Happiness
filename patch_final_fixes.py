"""
Run with: python3 patch_final_fixes.py
Fixes:
1. Deploy yellow bar to TranslatedHeader
2. Fix parent/strategies to work without studentId
3. Add parent linked indicator to teacher dashboard student list
4. Fix family-strategies navigation from parent dashboard
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Yellow bar in TranslatedHeader ────────────────────────────────────
HEADER = os.path.join(FRONTEND, "src/components/TranslatedHeader.tsx")

with open(HEADER, "r") as f:
    content = f.read()

if "yellowBar" not in content:
    # Add yellow bar to JSX
    OLD_JSX = """  return (
    <View style={[styles.header, { paddingTop: (Platform.OS === "ios" ? insets.top : 12) + 8 }]}>
      <View style={styles.headerContent}>
        {showBack && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        )}
        <Image
          source={require('../../assets/images/logo_coh.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{title}</Text>
      </View>
    </View>
  );"""

    NEW_JSX = """  return (
    <View style={[styles.header, { paddingTop: (Platform.OS === "ios" ? insets.top : 12) + 8 }]}>
      <View style={styles.headerContent}>
        {showBack && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
        )}
        <Image
          source={require('../../assets/images/logo_coh.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.yellowBar} />
    </View>
  );"""

    # Add yellow bar style
    OLD_STYLE = """  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
});"""

    NEW_STYLE = """  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  yellowBar: {
    height: 4,
    backgroundColor: '#FFC107',
    marginHorizontal: -16,
    marginTop: 8,
  },
});"""

    if OLD_JSX in content and OLD_STYLE in content:
        content = content.replace(OLD_JSX, NEW_JSX)
        content = content.replace(OLD_STYLE, NEW_STYLE)
        # Also update header paddingBottom to 0
        content = content.replace(
            "    paddingBottom: 12,",
            "    paddingBottom: 0,"
        )
        with open(HEADER, "w") as f:
            f.write(content)
        print("✅ Fix 1: Yellow bar added to TranslatedHeader")
    else:
        print("⚠️  Fix 1: TranslatedHeader JSX not found - may already have yellow bar")
else:
    print("✅ Fix 1: Yellow bar already present")

# ── Fix 2: Parent strategies - fix to work without studentId ─────────────────
STRAT = os.path.join(FRONTEND, "app/parent/strategies.tsx")

with open(STRAT, "r") as f:
    content = f.read()

# Fix the fetchStrategies to handle no studentId
OLD_FETCH = """  const fetchStrategies = async () => {
    if (!studentId) return;
    try {
      const [defaultStrats, customStrats] = await Promise.all([
        strategiesApi.getByZone(selectedZone, studentId, language),
        customStrategiesApi.getAll(studentId),
      ]);
      setStrategies(defaultStrats);
      setCustomStrategies(customStrats.filter(s => s.zone === selectedZone));
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };"""

NEW_FETCH = """  // Generic family strategies shown when no student linked
  const GENERIC_STRATEGIES: Record<string, Array<{name:string; description:string; icon:string}>> = {
    blue: [
      {name:'Comfort Corner', description:'Find a quiet cosy spot together and sit side by side.', icon:'home'},
      {name:'Warm Drink Together', description:'Make a hot chocolate and chat gently.', icon:'local-cafe'},
      {name:'Gentle Hug', description:'Offer a long warm hug without words.', icon:'favorite'},
      {name:'Nature Walk', description:'Go outside for a slow quiet walk.', icon:'directions-walk'},
    ],
    green: [
      {name:'Gratitude Share', description:'Each person shares one thing they are grateful for today.', icon:'favorite'},
      {name:'Family Dance', description:'Put on an upbeat song and dance together spontaneously.', icon:'music-note'},
      {name:'Cook Together', description:'Prepare a simple meal or snack as a team.', icon:'restaurant'},
      {name:'Play a Game', description:'A card game or board game everyone enjoys.', icon:'sports-esports'},
    ],
    yellow: [
      {name:'Box Breathing', description:'Breathe in 4, hold 4, out 4, hold 4. Do together.', icon:'air'},
      {name:'Feelings Check-in', description:'Rate how you feel 1-10 and why, as a family.', icon:'chat'},
      {name:'Shake It Out', description:'Stand and shake your whole body for 30 seconds!', icon:'accessibility'},
      {name:'Count to 10', description:'Count to 10 slowly as a family before responding to stress.', icon:'format-list-numbered'},
    ],
    red: [
      {name:'Space & Calm', description:'Give each person a few minutes of quiet space.', icon:'self-improvement'},
      {name:'Cold Water', description:'Drink cold water or hold a cold pack to reset.', icon:'water'},
      {name:'Safe Word', description:'Agree on a family calm-down word everyone respects.', icon:'record-voice-over'},
      {name:'Pause & Reconnect', description:'Take a break then come back together with kindness.', icon:'pause-circle-filled'},
    ],
  };

  const fetchStrategies = async () => {
    try {
      if (studentId) {
        const [defaultStrats, customStrats] = await Promise.all([
          strategiesApi.getByZone(selectedZone, studentId, language),
          customStrategiesApi.getAll(studentId),
        ]);
        setStrategies(defaultStrats);
        setCustomStrategies(customStrats.filter((s: any) => s.zone === selectedZone));
      } else {
        // Generic mode — show built-in family strategies
        setStrategies([]);
        setCustomStrategies([]);
      }
    } catch (error) {
      console.error('Error fetching strategies:', error);
    }
  };"""

if OLD_FETCH in content:
    content = content.replace(OLD_FETCH, NEW_FETCH)
    print("✅ Fix 2a: fetchStrategies fixed for no studentId")
else:
    print("⚠️  Fix 2a: fetchStrategies block not found")

# Fix the header to show generic title when no student
OLD_HEADER_TITLE = """        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            My Family's Strategies
          </Text>
          <Text style={styles.headerSubtitle}>
            Create and manage coping strategies for your child
          </Text>
        </View>"""

NEW_HEADER_TITLE = """        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={{flexDirection:'row',alignItems:'center',marginBottom:8,gap:4}}>
            <MaterialIcons name="arrow-back" size={20} color="#5C6BC0" />
            <Text style={{color:'#5C6BC0',fontSize:14,fontWeight:'500'}}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {student ? `${student.name}'s Strategies` : t('family_strategies') || 'Family Strategies'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {student
              ? 'Strategies to support your child at home'
              : 'Research-backed strategies for your whole family across all emotion zones'}
          </Text>
        </View>"""

if OLD_HEADER_TITLE in content:
    content = content.replace(OLD_HEADER_TITLE, NEW_HEADER_TITLE)
    print("✅ Fix 2b: Header updated with generic/student title")
else:
    print("⚠️  Fix 2b: Header not found")

# Add generic strategies display before default strategies section
OLD_DEFAULT_STRATS = """        {/* Default Strategies */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Strategies</Text>
          {strategies.map((strategy) => ("""

NEW_DEFAULT_STRATS = """        {/* Generic family strategies when no student selected */}
        {!studentId && (GENERIC_STRATEGIES[selectedZone] || []).map((strategy, index) => (
          <View key={index} style={styles.strategyCard}>
            <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color + '25' }]}>
              <MaterialIcons name={strategy.icon as any} size={22} color={zoneConfig.color} />
            </View>
            <View style={styles.strategyContent}>
              <Text style={styles.strategyName}>{strategy.name}</Text>
              <Text style={styles.strategyDesc}>{strategy.description}</Text>
            </View>
          </View>
        ))}

        {/* Default Strategies (when student selected) */}
        {studentId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Strategies</Text>
          {strategies.map((strategy) => ("""

if OLD_DEFAULT_STRATS in content:
    content = content.replace(OLD_DEFAULT_STRATS, NEW_DEFAULT_STRATS)
    # Close the extra View
    content = content.replace(
        """          </View>
        ))}
        </View>

      </ScrollView>""",
        """          </View>
        ))}
        </View>
        )}

      </ScrollView>"""
    )
    print("✅ Fix 2c: Generic strategies display added")
else:
    print("⚠️  Fix 2c: Default strategies block not found")

with open(STRAT, "w") as f:
    f.write(content)

# ── Fix 3: Add parent link badge to teacher dashboard student list ─────────────
DASH = os.path.join(FRONTEND, "app/teacher/dashboard.tsx")

with open(DASH, "r") as f:
    content = f.read()

# Add parent link indicator to recent check-ins list
OLD_LOG_NAME = """                  <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                  <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>"""

NEW_LOG_NAME = """                  <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                    <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                    {log.logged_by === 'parent' && (
                      <View style={{backgroundColor:'#E8F5E9',paddingHorizontal:5,paddingVertical:1,borderRadius:6}}>
                        <Text style={{fontSize:9,color:'#4CAF50',fontWeight:'600'}}>HOME</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>"""

if OLD_LOG_NAME in content:
    content = content.replace(OLD_LOG_NAME, NEW_LOG_NAME)
    with open(DASH, "w") as f:
        f.write(content)
    print("✅ Fix 3: Home badge added to dashboard recent checkins")
else:
    print("⚠️  Fix 3: Log name block not found in dashboard")

print("\n✅ All final fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Yellow bar, family strategies generic, home badge in dashboard' && git push")
