"""
Run with: python3 patch_classroom_custom.py
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix 6: Add custom strategy input to classrooms modal
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Insert after existing strategy selector, before student selector
OLD = """              {/* Student selector */}
              <Text style={styles.sectionLabel}>Select Students ({selectedStudentIds.size} selected)</Text>"""

NEW = """              {/* Custom Strategy Option */}
              <TouchableOpacity
                style={[styles.strategyOption, showCustomStrategyInput && { borderColor: '#5C6BC0', borderWidth: 2, backgroundColor: '#EEF2FF' }]}
                onPress={() => { setShowCustomStrategyInput(!showCustomStrategyInput); setSelectedStrategy(null); }}
              >
                <MaterialIcons name="add-circle" size={20} color="#5C6BC0" />
                <Text style={[styles.strategyOptionText, { color: '#5C6BC0', fontWeight: '600' }]}>✏️ Write a custom strategy...</Text>
              </TouchableOpacity>

              {showCustomStrategyInput && (
                <View style={{ backgroundColor: '#F8F9FA', borderRadius: 10, padding: 12, marginBottom: 8, gap: 8 }}>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: 'white' }}
                    placeholder="Strategy name e.g. Take 3 deep breaths"
                    value={customStrategyName}
                    onChangeText={setCustomStrategyName}
                    placeholderTextColor="#AAA"
                  />
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 10, fontSize: 13, backgroundColor: 'white', height: 56, textAlignVertical: 'top' }}
                    placeholder="How to do it (optional)..."
                    value={customStrategyDesc}
                    onChangeText={setCustomStrategyDesc}
                    multiline
                    placeholderTextColor="#AAA"
                  />
                </View>
              )}

              {/* Student selector */}
              <Text style={styles.sectionLabel}>Select Students ({selectedStudentIds.size} selected)</Text>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    print("✅ Fix 6: Custom strategy input added to classrooms modal")
else:
    print("❌ Pattern not found")

# Also fix the Apply Strategy button to handle custom strategies
OLD_APPLY = """    try {
      await Promise.all(
        [...selectedStudentIds].map(sid =>
          studentsApi.addStrategy(sid, {
            strategy_id: selectedStrategy!.id,
            strategy_name: selectedStrategy!.name,
            zone: selectedZone,
          })
        )
      );"""

NEW_APPLY = """    try {
      if (showCustomStrategyInput && customStrategyName.trim()) {
        // Save custom strategy to each selected student
        await Promise.all(
          [...selectedStudentIds].map(sid =>
            customStrategiesApi.create({
              student_id: sid,
              name: customStrategyName.trim(),
              description: customStrategyDesc.trim(),
              zone: selectedZone,
              is_shared: true,
            })
          )
        );
      } else {
        await Promise.all(
          [...selectedStudentIds].map(sid =>
            studentsApi.addStrategy(sid, {
              strategy_id: selectedStrategy!.id,
              strategy_name: selectedStrategy!.name,
              zone: selectedZone,
            })
          )
        );
      }"""

if OLD_APPLY in content:
    # Find closing brace to add extra closing brace for else
    content = content.replace(OLD_APPLY, NEW_APPLY)
    print("✅ Fix 6b: Apply button handles custom strategies")
else:
    print("⚠️  Fix 6b: Apply button pattern not found")

# Add TextInput import if missing
if "TextInput" not in content.split("from 'react-native'")[0].split("import {")[-1]:
    content = content.replace(
        "  Platform,\n  Image,\n  TextInput,} from 'react-native';",
        "  Platform,\n  Image,\n  TextInput,} from 'react-native';"
    )
    # Check alternative
    if "TextInput" not in content.split("} from 'react-native'")[0].split("import {")[-1]:
        content = content.replace(
            "  Image,} from 'react-native';",
            "  Image,\n  TextInput,} from 'react-native';"
        )
        print("✅ Fix 6c: TextInput added to imports")

# Reset custom strategy after apply
OLD_RESET = """      setStrategyModalVisible(false);
      setSelectedStrategy(null);
      setSelectedStudentIds(new Set());"""
NEW_RESET = """      setStrategyModalVisible(false);
      setSelectedStrategy(null);
      setSelectedStudentIds(new Set());
      setCustomStrategyName('');
      setCustomStrategyDesc('');
      setShowCustomStrategyInput(false);"""

if OLD_RESET in content:
    content = content.replace(OLD_RESET, NEW_RESET)
    print("✅ Fix 6d: Reset custom strategy fields after apply")

with open(path, "w") as f:
    f.write(content)

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add custom strategy to classrooms, fix family label' && git push")
