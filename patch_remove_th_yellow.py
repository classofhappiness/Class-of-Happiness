"""
Run with: python3 patch_remove_th_yellow.py
"""
import os, re

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/src/components/TranslatedHeader.tsx")

with open(path, "r") as f:
    content = f.read()

# Remove yellow bar JSX line
content = content.replace("      <View style={styles.yellowBar} />\n", "")

# Remove yellowBar style block
content = re.sub(r'\s*yellowBar: \{[^}]+\},?', '', content)

# Fix paddingBottom so header sits lower - increase it
content = content.replace(
    "    paddingBottom: 12,",
    "    paddingBottom: 14,"
)

# Increase paddingTop multiplier so content is lower on screen
content = content.replace(
    "paddingTop: (Platform.OS === 'ios' ? insets.top : 16) + 8",
    "paddingTop: (Platform.OS === 'ios' ? insets.top : 16) + 10"
)

with open(path, "w") as f:
    f.write(content)

# Verify
with open(path, "r") as f:
    result = f.read()

if "yellowBar" not in result and "FFC107" not in result:
    print("✅ Yellow bar completely removed from TranslatedHeader")
else:
    print("⚠️  Still has references:")
    for i, line in enumerate(result.split('\n')):
        if 'yellowBar' in line or 'FFC107' in line:
            print(f"  Line {i+1}: {line}")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Remove yellow bar from TranslatedHeader, lower header padding' && git push")
