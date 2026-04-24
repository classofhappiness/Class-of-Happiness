"""
Run with: python3 patch_parent_admin.py
Fixes:
1. Parent dashboard - hardcoded day names -> use t() keys
2. Parent dashboard - check-in button text -> use t()  
3. Admin dashboard - description text overflow in PT
4. Admin dashboard - hardcoded English strings -> use t()
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: Parent dashboard - hardcoded day names ────────────────────────────
PARENT_DASH = os.path.join(FRONTEND, "app/parent/dashboard.tsx")

with open(PARENT_DASH, "r") as f:
    content = f.read()

# Fix hardcoded days in weekly table header
OLD_DAYS = """                {[t('day_sun') || 'Sun', t('day_mon') || 'Mon', t('day_tue') || 'Tue', t('day_wed') || 'Wed', t('day_thu') || 'Thu', t('day_fri') || 'Fri', t('day_sat') || 'Sat'].map((day) => (
                    <View key={day} style={styles.weeklyDayHeader}>
                      <Text style={styles.weeklyDayText}>{day}</Text>
                    </View>
                  ))}"""

NEW_DAYS = """                {(language === 'pt'
                    ? ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
                    : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                  ).map((day) => (
                    <View key={day} style={styles.weeklyDayHeader}>
                      <Text style={styles.weeklyDayText}>{day}</Text>
                    </View>
                  ))}"""

if OLD_DAYS in content:
    content = content.replace(OLD_DAYS, NEW_DAYS)
    print("✅ Fix 1: Parent dashboard day names translated")
else:
    print("⚠️  Fix 1: Day names block not found — may already be fixed")

# Fix check-in button text
OLD_CHECKIN = """                  <Text style={styles.bigCheckinText}>{t('check_in') || t('check_in')||t('check_in')||'Check In'}</Text>"""
NEW_CHECKIN = """                  <Text style={styles.bigCheckinText}>{t('check_in') || t('checkin') || 'Check In'}</Text>"""

if OLD_CHECKIN in content:
    content = content.replace(OLD_CHECKIN, NEW_CHECKIN)
    print("✅ Fix 2: Parent check-in button cleaned up")

# Fix family strategies button text
OLD_FAM = """              <Text style={styles.actionButtonText} numberOfLines={1}>{t('family_strategies') || t('family_strategies')||'Family Strategies'}</Text>"""
NEW_FAM = """              <Text style={styles.actionButtonText} numberOfLines={1}>{t('family_strategies') || 'Family Strategies'}</Text>"""

if OLD_FAM in content:
    content = content.replace(OLD_FAM, NEW_FAM)
    print("✅ Fix 3: Family strategies button text cleaned up")

# Add language to useApp destructuring so we can use it for day names
OLD_USE_APP = """  const { user, presetAvatars, t } = useApp();"""
NEW_USE_APP = """  const { user, presetAvatars, t, language } = useApp();"""

if OLD_USE_APP in content:
    content = content.replace(OLD_USE_APP, NEW_USE_APP)
    print("✅ Fix 4: Added language to useApp in parent dashboard")
elif "const { user, presetAvatars, t, language } = useApp();" in content:
    print("✅ Fix 4: language already in useApp")

with open(PARENT_DASH, "w") as f:
    f.write(content)

# ── Fix 2: Admin dashboard - description overflow + hardcoded strings ────────
ADMIN_DASH = os.path.join(FRONTEND, "app/admin/dashboard.tsx")

with open(ADMIN_DASH, "r") as f:
    content = f.read()

# Fix header description overflow
OLD_HEADER = """        <Text style={styles.headerRole}>{headerLabel}</Text>"""
NEW_HEADER = """        <Text style={styles.headerRole} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>{headerLabel}</Text>"""

if OLD_HEADER in content:
    content = content.replace(OLD_HEADER, NEW_HEADER)
    print("✅ Fix 5: Admin header role text now auto-fits")

# Fix headerSub style to allow wrapping
OLD_HEADER_STYLE = """  headerSub:{fontSize:13,color:'rgba(255,255,255,0.8)',marginTop:2},"""
NEW_HEADER_STYLE = """  headerSub:{fontSize:13,color:'rgba(255,255,255,0.8)',marginTop:2,flexShrink:1},"""

if OLD_HEADER_STYLE in content:
    content = content.replace(OLD_HEADER_STYLE, NEW_HEADER_STYLE)
    print("✅ Fix 6: Admin headerSub allows shrink")

# Fix the school admin label which can overflow in PT
OLD_LABEL = """  const headerLabel = isSuperAdmin ? '👑 Super Admin — All Schools' : '🏫 School Admin — '+((user as any)?.school_name||'My School');"""
NEW_LABEL = """  const headerLabel = isSuperAdmin ? '👑 Super Admin' : '🏫 '+((user as any)?.school_name||'School Admin');"""

if OLD_LABEL in content:
    content = content.replace(OLD_LABEL, NEW_LABEL)
    print("✅ Fix 7: Admin header label shortened to prevent overflow")

# Fix hardcoded 'Admin Dashboard' title to use translations
OLD_ADMIN_TITLE = """        <Text style={styles.headerTitle}>Admin Dashboard</Text>"""
NEW_ADMIN_TITLE = """        <Text style={styles.headerTitle}>{isSuperAdmin ? 'Super Admin' : (t('school_admin_dashboard') || 'Admin Dashboard')}</Text>"""

if OLD_ADMIN_TITLE in content:
    content = content.replace(OLD_ADMIN_TITLE, NEW_ADMIN_TITLE)
    print("✅ Fix 8: Admin Dashboard title translated")

# Need t in the main component - add it
OLD_MAIN_CONST = """  const isSuperAdmin = user?.role==='superadmin';"""
NEW_MAIN_CONST = """  const { t } = useApp();
  const isSuperAdmin = user?.role==='superadmin';"""

if OLD_MAIN_CONST in content and "const { t } = useApp();\n  const isSuperAdmin" not in content:
    content = content.replace(OLD_MAIN_CONST, NEW_MAIN_CONST)
    print("✅ Fix 9: Added t() to admin main component")

with open(ADMIN_DASH, "w") as f:
    f.write(content)

print("\n✅ All patches applied!")
print("Now deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix parent/admin PT translation issues and overflow' && git push")
