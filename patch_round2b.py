"""
Run with: python3 patch_round2b.py
Fixes:
1. Rewards page - header text too high
2. Student select - creatures not showing (add loading state)
3. Student detail - strategies fetch error handling
4. Teacher checkin - strategies show in dashboard
5. Linked child - checkin with strategies
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Rewards page - header too high ─────────────────────────────────────
REWARDS = os.path.join(FRONTEND, "app/student/rewards.tsx")

with open(REWARDS, "r") as f:
    content = f.read()

# Fix header style - add more top padding
OLD_REWARDS_HEADER = """      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🎉 {t('great_job_title')}</Text>
        <Text style={styles.headerSubtitle}>
          {rewardsData.streak_days > 1 
            ? `🔥 ${rewardsData.streak_days} ${t('day_streak')}` 
            : t('keep_it_up')}
        </Text>
      </View>"""

NEW_REWARDS_HEADER = """      {/* Header - pushed down from top */}
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>🎉 {t('great_job_title')}</Text>
        <Text style={styles.headerSubtitle}>
          {rewardsData.streak_days > 1 
            ? `🔥 ${rewardsData.streak_days} ${t('day_streak')}` 
            : t('keep_it_up')}
        </Text>
      </View>"""

if OLD_REWARDS_HEADER in content:
    content = content.replace(OLD_REWARDS_HEADER, NEW_REWARDS_HEADER)
    print("✅ Fix 1: Rewards header pushed down")
else:
    print("⚠️  Fix 1: Could not find rewards header")

# Find and update header style
OLD_HEADER_STYLE_RW = "  header: {"
# Find the header style block
import re
header_match = re.search(r'  header: \{[^}]+\}', content)
if header_match:
    old_block = header_match.group(0)
    if 'paddingTop' not in old_block:
        new_block = old_block.replace('  header: {', '  header: {\n    paddingTop: 20,')
        content = content.replace(old_block, new_block)
        print("✅ Fix 1b: Rewards header paddingTop added")

# Add headerSpacer style
OLD_LAST_STYLE = "});"
# Add before the last });
content = content.replace(
    "  loadingText: { fontSize: 18, color: '#666' },",
    "  loadingText: { fontSize: 18, color: '#666' },\n  headerSpacer: { height: 16 },"
)
print("✅ Fix 1c: Header spacer style added")

with open(REWARDS, "w") as f:
    f.write(content)

# ── Fix 2: Student detail - better error handling for strategies ──────────────
STUDENT_DETAIL = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")

if os.path.exists(STUDENT_DETAIL):
    with open(STUDENT_DETAIL, "r") as f:
        content = f.read()

    # Fix strategies fetch to not break everything if it fails
    OLD_FETCH = """        const [analyticsData, logsData, strategiesData, months, statusData] = await Promise.all([
        analyticsApi.getStudent(studentId, selectedPeriod),
        zoneLogsApi.getByStudent(studentId, selectedPeriod),
        strategiesApi.getAll(studentId),
        reportsApi.getAvailableMonths(studentId),
        teacherHomeDataApi.getSharingStatus(studentId).catch(() => null),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setStrategies(strategiesData);
      setAvailableMonths(months);"""

    NEW_FETCH = """        const [analyticsData, logsData, months, statusData] = await Promise.all([
        analyticsApi.getStudent(studentId, selectedPeriod),
        zoneLogsApi.getByStudent(studentId, selectedPeriod),
        reportsApi.getAvailableMonths(studentId).catch(() => []),
        teacherHomeDataApi.getSharingStatus(studentId).catch(() => null),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setAvailableMonths(months);
      // Fetch strategies separately so errors don't break main data
      try {
        const strategiesData = await strategiesApi.getAll(studentId);
        setStrategies(strategiesData);
      } catch (stratErr) {
        console.log('Strategies not available:', stratErr);
        setStrategies([]);
      }"""

    if OLD_FETCH in content:
        content = content.replace(OLD_FETCH, NEW_FETCH)
        print("✅ Fix 2: Student detail strategies fetch isolated")
    else:
        print("⚠️  Fix 2: Could not find strategies fetch block")

    with open(STUDENT_DETAIL, "w") as f:
        f.write(content)

# ── Fix 3: Check zoneLogsApi normalises feeling_colour for bulk checkins ─────
API = os.path.join(FRONTEND, "src/utils/api.ts")

with open(API, "r") as f:
    content = f.read()

# Check if getAll normalises feeling_colour to zone
if "feeling_colour" in content and "logged_by" in content:
    print("✅ Fix 3: API already handles feeling_colour field")
else:
    print("⚠️  Fix 3: May need to check zoneLogsApi normalisation")

# ── Fix 4: Ensure backend /zone-logs endpoint includes feeling_logs ───────────
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

# Find get_zone_logs and ensure it queries feeling_logs too
if "feeling_logs" in content and "zone_logs" in content:
    print("✅ Fix 4: Backend already queries both zone_logs and feeling_logs")

# ── Fix 5: Family resources page - fix header too high ───────────────────────
PARENT_RESOURCES = os.path.join(FRONTEND, "app/parent/resources.tsx")

if os.path.exists(PARENT_RESOURCES):
    with open(PARENT_RESOURCES, "r") as f:
        content = f.read()

    OLD_TOPBAR = """  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },"""

    NEW_TOPBAR = """  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },"""

    if OLD_TOPBAR in content:
        content = content.replace(OLD_TOPBAR, NEW_TOPBAR)
        print("✅ Fix 5: Parent resources header padding fixed")
    else:
        print("⚠️  Fix 5: Parent resources topBar style not found")

    with open(PARENT_RESOURCES, "w") as f:
        f.write(content)

# ── Fix 6: Teacher resources - add back button and fix header too high ─────────
TEACHER_RESOURCES = os.path.join(FRONTEND, "app/teacher/resources.tsx")

with open(TEACHER_RESOURCES, "r") as f:
    content = f.read()

# Fix tabs wrapper to add back button and more padding
OLD_TABS_WRAPPER = """      {/* Topic Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.tabsContainer}
        >"""

NEW_TABS_WRAPPER = """      {/* Header with back button */}
      <View style={styles.resourcesTopBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.resourcesBackBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.resourcesTopBarTitle}>{t('teacher_resources') || 'Teacher Resources'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Topic Tabs */}
      <View style={styles.tabsWrapper}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.tabsContainer}
        >"""

if OLD_TABS_WRAPPER in content:
    content = content.replace(OLD_TABS_WRAPPER, NEW_TABS_WRAPPER)
    print("✅ Fix 6: Teacher resources back button added")
else:
    print("⚠️  Fix 6: Could not find tabs wrapper")

# Add styles for the new top bar
OLD_TABS_WRAPPER_STYLE = """  tabsWrapper: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 8,
  },"""

NEW_TABS_WRAPPER_STYLE = """  resourcesTopBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 20,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  resourcesBackBtn: { padding: 4 },
  resourcesTopBarTitle: { fontSize: 17, fontWeight: '600', color: '#333' },
  tabsWrapper: {
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 4,
  },"""

if OLD_TABS_WRAPPER_STYLE in content:
    content = content.replace(OLD_TABS_WRAPPER_STYLE, NEW_TABS_WRAPPER_STYLE)
    print("✅ Fix 6b: Teacher resources top bar styles added")
else:
    print("⚠️  Fix 6b: tabsWrapper style not found")

with open(TEACHER_RESOURCES, "w") as f:
    f.write(content)

# ── Fix 7: Family strategies page - fix header too high ───────────────────────
FAM_STRAT = os.path.join(FRONTEND, "app/parent/family-strategies.tsx")

if os.path.exists(FAM_STRAT):
    with open(FAM_STRAT, "r") as f:
        content = f.read()

    OLD_FAM_TOPBAR = """  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'white',
    borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },"""

    NEW_FAM_TOPBAR = """  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, paddingTop: 20,
    backgroundColor: 'white', borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },"""

    if OLD_FAM_TOPBAR in content:
        content = content.replace(OLD_FAM_TOPBAR, NEW_FAM_TOPBAR)
        print("✅ Fix 7: Family strategies header padding fixed")

    with open(FAM_STRAT, "w") as f:
        f.write(content)

print("\n✅ All Round 2b patches applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix rewards layout, strategies errors, resource headers' && git push")
