"""
Run with: python3 patch_teacher_yellowbar.py
Adds yellow bar to teacher screens with custom headers:
- bulk-checkin.tsx
- checkin.tsx  
- resources.tsx
- strategies.tsx
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
YELLOW_STYLE = "  yellowBar: { height: 4, backgroundColor: '#FFC107' },\n"

def add_bar(path, after_pattern, style_anchor):
    with open(path, "r") as f:
        content = f.read()
    name = path.split('/')[-1]
    if "yellowBar" in content or "'#FFC107'" in content.split("StyleSheet.create")[1]:
        print(f"✅ {name} - already has yellow bar")
        return
    if after_pattern in content:
        content = content.replace(after_pattern, after_pattern + "\n      <View style={styles.yellowBar} />")
        content = content.replace(style_anchor, YELLOW_STYLE + style_anchor)
        with open(path, "w") as f:
            f.write(content)
        print(f"✅ {name} - yellow bar added")
    else:
        print(f"⚠️  {name} - pattern not found")

# ── bulk-checkin.tsx ──────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/bulk-checkin.tsx")
add_bar(path,
    "      </View>\n\n      {/* Quick select all row */}",
    "  quickSelectBar: {"
)

# ── checkin.tsx ───────────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/checkin.tsx")
with open(path, "r") as f:
    content = f.read()
name = "checkin.tsx"
if "yellowBar" not in content:
    OLD = """      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Teacher Check-In</Text>
        <TouchableOpacity style={styles.alertBtn} onPress={() => setShowAlertModal(true)}>
          <MaterialIcons name="notifications-active" size={18} color="white" />
          <Text style={styles.alertBtnText}>Support</Text>
        </TouchableOpacity>
      </View>"""
    NEW = OLD + "\n      <View style={styles.yellowBar} />"
    if OLD in content:
        content = content.replace(OLD, NEW)
        content = content.replace("  header: {", YELLOW_STYLE + "  header: {")
        with open(path, "w") as f:
            f.write(content)
        print(f"✅ {name} - yellow bar added")
    else:
        print(f"⚠️  {name} - header pattern not found")
else:
    print(f"✅ {name} - already has yellow bar")

# ── resources.tsx ─────────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/resources.tsx")
with open(path, "r") as f:
    content = f.read()
name = "resources.tsx"
if "yellowBar" not in content:
    # Has resourcesTopBar from earlier patch
    if "resourcesTopBar" in content:
        OLD = """      </View>

      {/* Topic Tabs */}"""
        NEW = """      </View>
      <View style={styles.yellowBar} />

      {/* Topic Tabs */}"""
        if OLD in content:
            content = content.replace(OLD, NEW)
            content = content.replace("  resourcesTopBar: {", YELLOW_STYLE + "  resourcesTopBar: {")
            with open(path, "w") as f:
                f.write(content)
            print(f"✅ {name} - yellow bar added after resourcesTopBar")
        else:
            print(f"⚠️  {name} - pattern not found")
    else:
        print(f"⚠️  {name} - no resourcesTopBar found")
else:
    print(f"✅ {name} - already has yellow bar")

# ── strategies.tsx ────────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/strategies.tsx")
with open(path, "r") as f:
    content = f.read()
name = "strategies.tsx"
if "yellowBar" not in content:
    OLD = """      <View style={styles.header}>"""
    # Find the closing of this header
    idx = content.find(OLD)
    if idx > 0:
        end = content.find("</View>", idx)
        if end > 0:
            insert_pt = end + len("</View>")
            content = content[:insert_pt] + "\n      <View style={styles.yellowBar} />" + content[insert_pt:]
            content = content.replace("  header: {", YELLOW_STYLE + "  header: {")
            with open(path, "w") as f:
                f.write(content)
            print(f"✅ {name} - yellow bar added")
    else:
        print(f"⚠️  {name} - header not found")
else:
    print(f"✅ {name} - already has yellow bar")

# ── student/zone.tsx ──────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/student/zone.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    name = "zone.tsx"
    if "yellowBar" not in content and "FFC107" not in content:
        # Check if it has a header
        if "styles.header" in content:
            idx = content.find("<View style={styles.header}>")
            if idx > 0:
                end = content.find("</View>", idx) + len("</View>")
                content = content[:end] + "\n      <View style={styles.yellowBar} />" + content[end:]
                content = content.replace("  header: {", YELLOW_STYLE + "  header: {")
                with open(path, "w") as f:
                    f.write(content)
                print(f"✅ {name} - yellow bar added")
        else:
            print(f"  {name} - no header, skipping")

print("\n✅ Teacher yellow bars done!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Yellow bar on all teacher screens' && git push")
