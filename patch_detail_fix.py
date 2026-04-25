"""
Run with: python3 patch_detail_fix.py
"""
import os, re

DETAIL = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/student-detail.tsx")

with open(DETAIL, "r") as f:
    content = f.read()

# Fix 1: Add TextInput to React Native imports
OLD_IMPORT = """import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  Share,
  Platform,
  Animated,
} from 'react-native';"""

NEW_IMPORT = """import { 
  View, 
  Text, 
  StyleSheet, 
  SafeAreaView, 
  ScrollView, 
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Alert,
  Linking,
  Modal,
  Share,
  Platform,
  Animated,
  TextInput,
} from 'react-native';"""

if OLD_IMPORT in content:
    content = content.replace(OLD_IMPORT, NEW_IMPORT)
    print("✅ Fix 1: TextInput imported")
else:
    print("⚠️  Fix 1: Could not find import block")

# Fix 2: Remove duplicate styles
# Find all style names and their line numbers
style_names = []
for match in re.finditer(r'^  (\w+): \{', content, re.MULTILINE):
    style_names.append(match.group(1))

dupes = set(n for n in style_names if style_names.count(n) > 1)
print(f"Duplicate styles found: {dupes}")

# For each duplicate, keep first occurrence, remove subsequent ones
for dupe in dupes:
    # Find all occurrences of this style block
    pattern = rf'  {dupe}: \{{[^}}]*\}},'
    matches = list(re.finditer(pattern, content, re.DOTALL))
    if len(matches) > 1:
        # Remove all but first
        for match in reversed(matches[1:]):
            content = content[:match.start()] + content[match.end():]
            print(f"  Removed duplicate: {dupe}")

# Fix parameter types in arrow functions
content = content.replace(
    "v => setNewStrategy({...newStrategy, name: v})",
    "(v: string) => setNewStrategy({...newStrategy, name: v})"
)
content = content.replace(
    "v => setNewStrategy({...newStrategy, description: v})",
    "(v: string) => setNewStrategy({...newStrategy, description: v})"
)
print("✅ Fix 3: Parameter types fixed")

with open(DETAIL, "w") as f:
    f.write(content)

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix TextInput import and duplicate styles' && git push")
