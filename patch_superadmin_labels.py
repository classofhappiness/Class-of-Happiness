"""
Run with: python3 patch_superadmin_labels.py
"""
import os

ADMIN = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/admin/dashboard.tsx")

with open(ADMIN, "r") as f:
    content = f.read()

OLD = """            <Text style={[styles.sectionTitle,{marginTop:20}]}>Student Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Emotion Colours — All Schools</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

NEW = """            <Text style={[styles.sectionTitle,{marginTop:20}]}>Student Emotion Zones — All Schools</Text>
            <Text style={styles.sectionSubtitle}>Zone distribution as % of all student check-ins in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={zc[z]??0} total={tzc}/>)}
            </View>

            <Text style={[styles.sectionTitle,{marginTop:16}]}>Teacher Wellbeing Zones — All Schools</Text>
            <Text style={styles.sectionSubtitle}>Zone distribution as % of all teacher self check-ins in selected period</Text>
            <View style={styles.colourTrends}>
              {ZONES.map(z=><ColourRow key={z} zone={z} count={tc[z]??0} total={ttc}/>)}
            </View>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(ADMIN, "w") as f:
        f.write(content)
    print("✅ SuperAdmin emotion labels updated")
else:
    print("❌ Block not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix SuperAdmin emotion zone labels' && git push")
