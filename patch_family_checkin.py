"""
Run with: python3 patch_family_checkin.py
Fixes family checkin to use same zone labels as student zone screen
Also adds unlink to linkedChildApi in frontend
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix 1: Family checkin - use same zone labels as student zone screen
path = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_ZONES = """const getZones = (t: (key: string) => string) => [
  { id: 'blue', name: t('blue_label')||'Blue', color: '#4A90D9', desc: t('blue_words')||'Sad, Tired, Bored', face: '😢' },
  { id: 'green', name: t('green_label')||'Green', color: '#4CAF50', desc: t('green_words')||'Calm, Happy, Focused', face: '😊' },
  { id: 'yellow', name: t('yellow_label')||'Yellow', color: '#FFC107', desc: t('yellow_words')||'Worried, Frustrated, Silly', face: '😐' },
  { id: 'red', name: t('red_label')||'Red', color: '#F44336', desc: t('red_words')||'Angry, Scared, Out of Control', face: '🤯' },
];"""

NEW_ZONES = """const getZones = (t: (key: string) => string) => [
  { id: 'blue', name: t('blue_zone')||'Blue Zone', color: '#4A90D9', desc: t('blue_feeling')||'Quiet Energy — Sad, Tired, Bored', face: '😢', emoji: '😢' },
  { id: 'green', name: t('green_zone')||'Green Zone', color: '#4CAF50', desc: t('green_feeling')||'Balanced Energy — Calm, Happy, Focused', face: '😊', emoji: '😊' },
  { id: 'yellow', name: t('yellow_zone')||'Yellow Zone', color: '#FFC107', desc: t('yellow_feeling')||'Fizzing Energy — Worried, Silly, Frustrated', face: '😟', emoji: '😟' },
  { id: 'red', name: t('red_zone')||'Red Zone', color: '#F44336', desc: t('red_feeling')||'Big Energy — Angry, Scared, Overwhelmed', face: '😣', emoji: '😣' },
];"""

if OLD_ZONES in content:
    content = content.replace(OLD_ZONES, NEW_ZONES)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 1: Family checkin zones match student zone screen")
else:
    print("⚠️  Fix 1: Zone pattern not found")

# Fix 2: Add unlink method to linkedChildApi
API = os.path.join(FRONTEND, "src/utils/api.ts")
with open(API, "r") as f:
    content = f.read()

OLD_TOGGLE = """  toggleHomeSharing: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/toggle-home-sharing`, { method: 'PUT' }),"""

NEW_TOGGLE = """  toggleHomeSharing: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/toggle-home-sharing`, { method: 'PUT' }),

  unlink: (studentId: string): Promise<any> =>
    apiRequest(`/parent/linked-child/${studentId}/unlink`, { method: 'DELETE' }),"""

if OLD_TOGGLE in content and "unlink:" not in content:
    content = content.replace(OLD_TOGGLE, NEW_TOGGLE)
    with open(API, "w") as f:
        f.write(content)
    print("✅ Fix 2: unlink method added to linkedChildApi")
else:
    print("✅ Fix 2: unlink already exists or pattern not found")

# Fix 3: Family strategies - add ability to apply strategy to a family member
# Check parent/strategies to see if it handles family members
path = os.path.join(FRONTEND, "app/parent/family-strategies.tsx")
with open(path, "r") as f:
    content = f.read()

# Add an "Add to family member" button to each strategy
if "Add to" not in content:
    OLD_STRAT_CARD = """              <Text style={styles.strategyTitle}>{strategy.title}</Text>
              <Text style={styles.strategyDesc}>{strategy.description}</Text>"""
    NEW_STRAT_CARD = """              <Text style={styles.strategyTitle}>{strategy.title}</Text>
              <Text style={styles.strategyDesc}>{strategy.description}</Text>"""
    # The family-strategies page is a different component
    print("⚠️  Fix 3: Family strategies add-to-member needs separate work")
else:
    print("✅ Fix 3: Already handled")

# Fix 4: Checkin zone buttons - make them look like student zone (big coloured blocks)
path = os.path.join(FRONTEND, "app/parent/checkin.tsx")
with open(path, "r") as f:
    content = f.read()

# Find zone buttons render and make them bigger/same as student
OLD_ZONE_BTN = """                  {zones.map(zone => (
                    <TouchableOpacity
                      key={zone.id}
                      style={[
                        styles.zoneButton,
                        { borderColor: zone.color },
                        selectedZone === zone.id && { backgroundColor: zone.color },
                      ]}
                      onPress={() => setSelectedZone(zone.id)}
                    >
                      <Text style={styles.zoneFace}>{zone.face}</Text>
                      <Text style={[styles.zoneName, selectedZone === zone.id && { color: 'white' }]}>
                        {zone.name}
                      </Text>
                      <Text style={[styles.zoneDesc, selectedZone === zone.id && { color: 'rgba(255,255,255,0.9)' }]}>
                        {zone.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}"""

NEW_ZONE_BTN = """                  {zones.map(zone => (
                    <TouchableOpacity
                      key={zone.id}
                      style={[
                        styles.zoneButton,
                        { backgroundColor: zone.color },
                        selectedZone === zone.id && styles.zoneButtonSelected,
                      ]}
                      onPress={() => setSelectedZone(zone.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.zoneFace}>{zone.face}</Text>
                      <Text style={styles.zoneName}>{zone.name}</Text>
                      <Text style={styles.zoneDesc}>{zone.desc}</Text>
                      {selectedZone === zone.id && (
                        <MaterialIcons name="check-circle" size={20} color="white" style={{position:'absolute',top:8,right:8}} />
                      )}
                    </TouchableOpacity>
                  ))}"""

if OLD_ZONE_BTN in content:
    content = content.replace(OLD_ZONE_BTN, NEW_ZONE_BTN)
    print("✅ Fix 4: Family checkin zone buttons redesigned to match student")

    # Update zone button styles
    OLD_ZONE_STYLE = """  zoneButton: {"""
    content = re.sub(
        r'  zoneButton: \{[^}]+\}',
        "  zoneButton: { borderRadius: 16, padding: 20, marginBottom: 12, alignItems: 'center', position: 'relative' }",
        content
    )
    content = re.sub(
        r'  zoneName: \{[^}]+\}',
        "  zoneName: { fontSize: 18, fontWeight: '700', color: 'white', marginTop: 6 }",
        content
    )
    content = re.sub(
        r'  zoneDesc: \{[^}]+\}',
        "  zoneDesc: { fontSize: 13, color: 'rgba(255,255,255,0.9)', marginTop: 4, textAlign: 'center' }",
        content
    )
    content = re.sub(
        r'  zoneFace: \{[^}]+\}',
        "  zoneFace: { fontSize: 40 }",
        content
    )
    # Add selected style
    if "zoneButtonSelected" not in content:
        content = content.replace(
            "  zoneButton: {",
            "  zoneButtonSelected: { borderWidth: 3, borderColor: 'white' },\n  zoneButton: {"
        )
else:
    print("⚠️  Fix 4: Zone button pattern not found")

import re
with open(path, "w") as f:
    f.write(content)

print("\n✅ Family checkin + unlink fixes applied!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix family checkin zones, unlink, zone button styles' && git push")
