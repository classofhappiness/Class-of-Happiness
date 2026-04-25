"""
Run with: python3 patch_strat_direct.py
"""
import os

STRAT = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/parent/strategies.tsx")

with open(STRAT, "r") as f:
    content = f.read()

OLD = """        </View>
      </ScrollView>

      {/* Add Strategy Modal */}"""

NEW = """        </View>
        )}

      </ScrollView>

      {/* Add Strategy Modal */}"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(STRAT, "w") as f:
        f.write(content)
    print("✅ Fixed missing )} in strategies.tsx")
else:
    print("❌ Pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix strategies JSX closing tag' && git push")
