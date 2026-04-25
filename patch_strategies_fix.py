"""
Run with: python3 patch_strategies_fix.py
"""
import os

STRAT = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/parent/strategies.tsx")

with open(STRAT, "r") as f:
    content = f.read()

# The issue is an extra </View> and )} wrapping the student-only default strategies
# Find and fix the closing
OLD = """          </View>
        ))}
        </View>
        )}

      </ScrollView>"""

NEW = """          </View>
        ))}
        </View>
        )}

      </ScrollView>"""

# Actually the real fix - the student-only section has wrong closing
OLD2 = """        {/* Default Strategies (when student selected) */}
        {studentId && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Default Strategies</Text>
          {strategies.map((strategy) => (
            <View key={strategy.id} style={styles.strategyCard}>
              <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color + '40' }]}>
                <MaterialIcons name={strategy.icon as any} size={24} color={zoneConfig.color} />
              </View>
              <View style={styles.strategyContent}>
                <Text style={styles.strategyName}>{strategy.name}</Text>
                <Text style={styles.strategyDesc}>{strategy.description}</Text>
              </View>
            </View>
          ))}
        </View>
        )}"""

NEW2 = """        {/* Default Strategies (when student selected) */}
        {studentId && strategies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Default Strategies</Text>
            {strategies.map((strategy) => (
              <View key={strategy.id} style={styles.strategyCard}>
                <View style={[styles.strategyIcon, { backgroundColor: zoneConfig.color + '40' }]}>
                  <MaterialIcons name={strategy.icon as any} size={24} color={zoneConfig.color} />
                </View>
                <View style={styles.strategyContent}>
                  <Text style={styles.strategyName}>{strategy.name}</Text>
                  <Text style={styles.strategyDesc}>{strategy.description}</Text>
                </View>
              </View>
            ))}
          </View>
        )}"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2)
    print("✅ Fixed student-only default strategies JSX")
else:
    print("⚠️  Pattern not found - trying line-based fix")
    # Find line 262 area and show context
    lines = content.split('\n')
    print(f"Lines 258-266:")
    for i in range(257, min(266, len(lines))):
        print(f"  {i+1}: {lines[i]}")

with open(STRAT, "w") as f:
    f.write(content)

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix strategies JSX syntax error' && git push")
