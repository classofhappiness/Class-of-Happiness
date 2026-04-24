"""
Run with: python3 patch_round2c.py
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Student detail - isolate strategies fetch ─────────────────────────
STUDENT_DETAIL = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")

with open(STUDENT_DETAIL, "r") as f:
    content = f.read()

OLD = """      const [analyticsData, logsData, strategiesData, months, statusData] = await Promise.all([
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

NEW = """      const [analyticsData, logsData, months, statusData] = await Promise.all([
        analyticsApi.getStudent(studentId, selectedPeriod),
        zoneLogsApi.getByStudent(studentId, selectedPeriod),
        reportsApi.getAvailableMonths(studentId).catch(() => []),
        teacherHomeDataApi.getSharingStatus(studentId).catch(() => null),
      ]);
      setAnalytics(analyticsData);
      setLogs(logsData);
      setAvailableMonths(months);
      // Fetch strategies separately so errors don't block main data
      try {
        const strategiesData = await strategiesApi.getAll(studentId);
        setStrategies(strategiesData || []);
      } catch (stratErr) {
        console.log('Strategies not available:', stratErr);
        setStrategies([]);
      }"""

if OLD in content:
    content = content.replace(OLD, NEW)
    print("✅ Fix 1: Student detail strategies isolated")
    with open(STUDENT_DETAIL, "w") as f:
        f.write(content)
else:
    print("❌ Fix 1: Block not found - check indentation")
    # Try with different whitespace
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'strategiesApi.getAll(studentId)' in line:
            print(f"  Found at line {i+1}: '{line}'")

# ── Fix 2: Parent resources - fix header padding ──────────────────────────────
PARENT_RES = os.path.join(FRONTEND, "app/parent/resources.tsx")

with open(PARENT_RES, "r") as f:
    content = f.read()

# Find the topBar style at line 471 area and fix it
# Use regex to find and replace the topBar style block
old_pattern = r'  topBar: \{[^}]+\},'
match = re.search(old_pattern, content)
if match:
    old_block = match.group(0)
    if 'paddingTop' not in old_block:
        new_block = old_block.replace('  topBar: {', '  topBar: {\n    paddingTop: 20,')
        content = content.replace(old_block, new_block)
        print("✅ Fix 2: Parent resources topBar paddingTop added")
        with open(PARENT_RES, "w") as f:
            f.write(content)
    else:
        print("✅ Fix 2: paddingTop already present")
else:
    print("⚠️  Fix 2: topBar style block not found by regex")
    # Show what's at line 471
    lines = content.split('\n')
    for i in range(469, min(478, len(lines))):
        print(f"  Line {i+1}: {lines[i]}")

# ── Fix 3: zoneLogsApi - ensure bulk checkins (feeling_colour) show in dashboard
API = os.path.join(FRONTEND, "src/utils/api.ts")

with open(API, "r") as f:
    content = f.read()

# Find getByStudent or getAll and check normalisation
if 'feeling_colour' in content:
    print("✅ Fix 3: API has feeling_colour handling")
else:
    print("⚠️  Fix 3: API may not normalise feeling_colour -> zone")

# Check if there's a zone_logs endpoint that also pulls from feeling_logs
grep_result = os.popen("grep -n 'zone_logs\\|getByStudent\\|getAll' " + API + " | head -20").read()
print("API zone log functions:", grep_result[:300])

print("\n✅ Round 2c done!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix strategies fetch isolation and header padding' && git push")
