"""
Run with: python3 patch_headers_all.py
Fixes:
1. Parent dashboard - yellow bar too far down, heading centered, logo+title layout
2. Teacher dashboard - students/classrooms sections missing yellow bar (uses TranslatedHeader - already fixed)
3. Teacher classrooms - add proper header with yellow bar
4. Linked child detail - add logo, center heading, add yellow bar
5. All TranslatedHeader - tighten spacing between logo and yellow bar
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Parent Dashboard - fix header layout and yellow bar position ───────
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix: move yellow bar INSIDE the scrollview header, center the title, add logo
OLD_HEADER = """        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('family_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness')}</Text>
        </View>
        <View style={styles.yellowBar} />"""

NEW_HEADER = """        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo_coh.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerTitle}>{t('family_dashboard')}</Text>
          <Text style={styles.headerSubtitle}>{t('track_emotional_wellness')}</Text>
          <View style={styles.yellowBar} />
        </View>"""

if OLD_HEADER in content:
    content = content.replace(OLD_HEADER, NEW_HEADER)
    print("✅ Fix 1a: Parent dashboard header fixed")
else:
    print("⚠️  Fix 1a: Parent dashboard header not found")

# Fix header styles - center everything, tighten spacing
OLD_HEADER_STYLE = """  yellowBar: { height: 4, backgroundColor: '#FFC107', marginHorizontal: -16, marginBottom: 8 },
  header: {
    marginBottom: 20,
    marginTop: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 6,
  },"""

NEW_HEADER_STYLE = """  yellowBar: { height: 4, backgroundColor: '#FFC107', marginHorizontal: -16, marginTop: 8, marginBottom: 0 },
  header: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 8,
    paddingBottom: 0,
  },
  headerLogo: { width: 56, height: 56, marginBottom: 4 },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
    textAlign: 'center',
  },"""

if OLD_HEADER_STYLE in content:
    content = content.replace(OLD_HEADER_STYLE, NEW_HEADER_STYLE)
    print("✅ Fix 1b: Parent dashboard header styles fixed")
else:
    print("⚠️  Fix 1b: Parent dashboard header styles not found")

# Fix headerSubtitle to be centered
content = content.replace(
    "  headerSubtitle: {\n    fontSize: 14,\n    color: '#888',\n  },",
    "  headerSubtitle: {\n    fontSize: 13,\n    color: '#888',\n    textAlign: 'center',\n  },"
)

with open(path, "w") as f:
    f.write(content)

# ── Fix 2: TranslatedHeader - tighten spacing, center title ──────────────────
path = os.path.join(FRONTEND, "src/components/TranslatedHeader.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_HEADER_CONTENT = """  const handleBack = () => {
    if (backTo) {
      router.replace(backTo as any);
    } else {
      router.back();
    }
  };

  return (
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

NEW_HEADER_CONTENT = """  const handleBack = () => {
    if (backTo) {
      router.replace(backTo as any);
    } else {
      router.back();
    }
  };

  return (
    <View style={[styles.header, { paddingTop: (Platform.OS === "ios" ? insets.top : 12) + 4 }]}>
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

if OLD_HEADER_CONTENT in content:
    content = content.replace(OLD_HEADER_CONTENT, NEW_HEADER_CONTENT)
    print("✅ Fix 2: TranslatedHeader spacing tightened")
else:
    print("⚠️  Fix 2: TranslatedHeader content not found")

# Fix styles to center title
OLD_TH_STYLES = """  header: {
    backgroundColor: '#F8F9FA',
    paddingBottom: 0,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 10,
  },
  backButton: {
    marginRight: 8,
    padding: 10,
  },
  logo: {
    width: 28,
    height: 28,
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  yellowBar: {
    height: 4,
    backgroundColor: '#FFC107',
    marginHorizontal: -16,
    marginTop: 8,
  },"""

NEW_TH_STYLES = """  header: {
    backgroundColor: '#F8F9FA',
    paddingBottom: 0,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 6,
  },
  backButton: {
    marginRight: 8,
    padding: 6,
  },
  logo: {
    width: 26,
    height: 26,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginRight: 32,
  },
  yellowBar: {
    height: 4,
    backgroundColor: '#FFC107',
    marginHorizontal: -16,
    marginTop: 4,
  },"""

if OLD_TH_STYLES in content:
    content = content.replace(OLD_TH_STYLES, NEW_TH_STYLES)
    print("✅ Fix 2b: TranslatedHeader styles updated - title centered")
else:
    print("⚠️  Fix 2b: TranslatedHeader styles not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 3: Teacher classrooms - add proper header with logo + yellow bar ──────
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Check imports
if "Image" not in content:
    content = content.replace(
        "import { View, Text, StyleSheet",
        "import { View, Text, StyleSheet, Image"
    )

# Find return and add header after SafeAreaView
OLD_RETURN = """  return (
    <SafeAreaView style={styles.container}>"""

NEW_RETURN = """  return (
    <SafeAreaView style={styles.container}>
      {/* Header with logo + yellow bar */}
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={styles.pageHeaderBack}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Image source={require('../../assets/images/logo_coh.png')} style={styles.pageHeaderLogo} resizeMode="contain" />
        <Text style={styles.pageHeaderTitle}>{t('classrooms') || 'Classrooms'}</Text>
        <View style={{width:32}} />
      </View>
      <View style={styles.pageYellowBar} />"""

if OLD_RETURN in content and "pageHeader" not in content:
    content = content.replace(OLD_RETURN, NEW_RETURN)
    # Add styles
    content = content.replace(
        "  container: { flex: 1, backgroundColor: '#F8F9FA' },",
        """  container: { flex: 1, backgroundColor: '#F8F9FA' },
  pageHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:10, backgroundColor:'#F8F9FA' },
  pageHeaderBack: { padding:4, width:32 },
  pageHeaderLogo: { width:28, height:28 },
  pageHeaderTitle: { flex:1, fontSize:17, fontWeight:'bold', color:'#333', textAlign:'center' },
  pageYellowBar: { height:4, backgroundColor:'#FFC107' },"""
    )
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 3: Classrooms header + yellow bar added")
else:
    print("⚠️  Fix 3: Classrooms already has header or pattern not found")

# ── Fix 4: Linked child detail - add logo, center, yellow bar ─────────────────
path = os.path.join(FRONTEND, "app/parent/linked-child/[id].tsx")
with open(path, "r") as f:
    content = f.read()

# Add Image import if missing
if "Image" not in content:
    content = content.replace(
        "import {\n  View,",
        "import {\n  View,\n  Image,"
    )

OLD_LINKED_HEADER = """      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{child.name}</Text>
        <View style={styles.headerBadge}>
          <MaterialIcons name="school" size={16} color="#5C6BC0" />
          <Text style={styles.headerBadgeText}>{t('linked') || 'Linked'}</Text>
        </View>
      </View>"""

NEW_LINKED_HEADER = """      <View style={styles.header}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Image source={require('../../../assets/images/logo_coh.png')} style={styles.headerLogo} resizeMode="contain" />
          <Text style={styles.headerTitle}>{child.name}</Text>
          <View style={styles.headerBadge}>
            <MaterialIcons name="link" size={14} color="#5C6BC0" />
            <Text style={styles.headerBadgeText}>{t('linked') || 'Linked'}</Text>
          </View>
        </View>
        <View style={styles.yellowBar} />
      </View>"""

if OLD_LINKED_HEADER in content:
    content = content.replace(OLD_LINKED_HEADER, NEW_LINKED_HEADER)
    print("✅ Fix 4a: Linked child header updated with logo + yellow bar")
else:
    print("⚠️  Fix 4a: Linked child header not found")

# Fix linked child header styles
OLD_LINKED_STYLES = """  header: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: 'bold', color: '#333', marginLeft: 12 },"""

NEW_LINKED_STYLES = """  header: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee', paddingTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 6, gap: 8 },
  headerLogo: { width: 26, height: 26 },
  backButton: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#333', textAlign: 'center' },
  yellowBar: { height: 4, backgroundColor: '#FFC107' },"""

if OLD_LINKED_STYLES in content:
    content = content.replace(OLD_LINKED_STYLES, NEW_LINKED_STYLES)
    print("✅ Fix 4b: Linked child header styles fixed")
else:
    print("⚠️  Fix 4b: Linked child styles not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix 5: Teacher students page - check if it has a header ──────────────────
path = os.path.join(FRONTEND, "app/teacher/students.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "TranslatedHeader" not in content and "yellowBar" not in content and "Image" not in content:
        # Add a simple header
        if "return (\n    <SafeAreaView" in content:
            content = content.replace(
                "return (\n    <SafeAreaView style={styles.container}>",
                """return (
    <SafeAreaView style={styles.container}>
      <View style={styles.pageHeader}>
        <TouchableOpacity onPress={() => router.back()} style={{padding:4}}>
          <MaterialIcons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.pageHeaderTitle}>{t('students') || 'Students'}</Text>
        <View style={{width:32}} />
      </View>
      <View style={{height:4, backgroundColor:'#FFC107'}} />"""
            )
            content = content.replace(
                "  container: { flex: 1, backgroundColor: '#F8F9FA' },",
                "  container: { flex: 1, backgroundColor: '#F8F9FA' },\n  pageHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal:12, paddingVertical:10 },\n  pageHeaderTitle: { flex:1, fontSize:17, fontWeight:'bold', color:'#333', textAlign:'center' },"
            )
            with open(path, "w") as f:
                f.write(content)
            print("✅ Fix 5: Teacher students page header added")
    else:
        print("✅ Fix 5: Teacher students already has header")

print("\n✅ All header fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix all headers: centered, logo, yellow bar consistent' && git push")
