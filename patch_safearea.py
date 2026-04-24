"""
Run with: python3 patch_safearea.py
Adds SafeAreaView to screens that are missing it - prevents content
going under the status bar/notch on iOS.
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

def add_safe_area(filepath, old_import, new_import, old_return, new_return, old_closing, new_closing):
    full_path = os.path.join(FRONTEND, filepath)
    if not os.path.exists(full_path):
        print(f"⚠️  {filepath} not found")
        return False
    with open(full_path, "r") as f:
        content = f.read()
    changed = False
    if old_import and old_import in content:
        content = content.replace(old_import, new_import)
        changed = True
    if old_return and old_return in content:
        content = content.replace(old_return, new_return)
        changed = True
    if old_closing and old_closing in content:
        content = content.replace(old_closing, new_closing)
        changed = True
    if changed:
        with open(full_path, "w") as f:
            f.write(content)
        print(f"✅ {filepath} - SafeAreaView added")
    else:
        print(f"⚠️  {filepath} - could not patch (patterns not found)")
    return changed

# ── Fix settings.tsx ──────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/settings.tsx")
with open(path, "r") as f:
    content = f.read()

if "SafeAreaView" not in content:
    content = content.replace(
        "import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';",
        "import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, TextInput } from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context';"
    )
    # Wrap ScrollView in SafeAreaView
    content = content.replace(
        "  return (\n    <ScrollView \n      style={[styles.container, { paddingTop: insets.top }]}",
        "  return (\n    <SafeAreaView style={styles.safeArea}>\n    <ScrollView \n      style={styles.container}"
    )
    content = content.replace(
        "    </ScrollView>\n  );\n}",
        "    </ScrollView>\n    </SafeAreaView>\n  );\n}"
    )
    # Add safeArea style
    content = content.replace(
        "  container: {\n    flex: 1,\n    backgroundColor: '#F8F9FA',\n  },",
        "  safeArea: { flex: 1, backgroundColor: '#F8F9FA' },\n  container: {\n    flex: 1,\n    backgroundColor: '#F8F9FA',\n  },"
    )
    with open(path, "w") as f:
        f.write(content)
    print("✅ app/settings.tsx - SafeAreaView added")
else:
    print("✅ app/settings.tsx - SafeAreaView already present")

# ── Fix about.tsx ─────────────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/about.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "SafeAreaView" not in content:
        if "from 'react-native'" in content:
            content = content.replace(
                "from 'react-native'",
                "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context'"
            )
        if "  return (\n    <View" in content:
            content = content.replace("  return (\n    <View", "  return (\n    <SafeAreaView")
            content = content.replace("    </View>\n  );\n}", "    </SafeAreaView>\n  );\n}")
        with open(path, "w") as f:
            f.write(content)
        print("✅ app/about.tsx - SafeAreaView added")
    else:
        print("✅ app/about.tsx - SafeAreaView already present")

# ── Fix subscription/index.tsx ────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/subscription/index.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "SafeAreaView" not in content and "from 'react-native'" in content:
        content = content.replace(
            "from 'react-native'",
            "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context'"
        )
        # Replace first View wrapper with SafeAreaView if it's the root
        content = re.sub(
            r'return \(\s*\n\s*<View style=\{styles\.container\}>',
            'return (\n    <SafeAreaView style={styles.container}>',
            content
        )
        content = re.sub(
            r'</View>\s*\n\s*\);\s*\n}',
            '</SafeAreaView>\n  );\n}',
            content,
            count=1
        )
        with open(path, "w") as f:
            f.write(content)
        print("✅ app/subscription/index.tsx - SafeAreaView added")
    else:
        print("✅ app/subscription/index.tsx - already ok")

# ── Fix subscription/success.tsx ──────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/subscription/success.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "SafeAreaView" not in content and "from 'react-native'" in content:
        content = content.replace(
            "from 'react-native'",
            "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context'"
        )
        content = re.sub(
            r'return \(\s*\n\s*<View style=\{styles\.container\}>',
            'return (\n    <SafeAreaView style={styles.container}>',
            content
        )
        content = re.sub(
            r'</View>\s*\n\s*\);\s*\n}',
            '</SafeAreaView>\n  );\n}',
            content,
            count=1
        )
        with open(path, "w") as f:
            f.write(content)
        print("✅ app/subscription/success.tsx - SafeAreaView added")
    else:
        print("✅ app/subscription/success.tsx - already ok")

# ── Fix teacher/strategies.tsx ────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/teacher/strategies.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "SafeAreaView" not in content and "from 'react-native'" in content:
        content = content.replace(
            "from 'react-native'",
            "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context'"
        )
        content = re.sub(
            r'return \(\s*\n\s*<View style=\{styles\.container\}>',
            'return (\n    <SafeAreaView style={styles.container}>',
            content
        )
        content = re.sub(
            r'</View>\s*\n\s*\);\s*\n}',
            '</SafeAreaView>\n  );\n}',
            content,
            count=1
        )
        with open(path, "w") as f:
            f.write(content)
        print("✅ app/teacher/strategies.tsx - SafeAreaView added")
    else:
        print("✅ app/teacher/strategies.tsx - already ok")

# ── Fix auth/callback.tsx ─────────────────────────────────────────────────────
path = os.path.join(FRONTEND, "app/auth/callback.tsx")
if os.path.exists(path):
    with open(path, "r") as f:
        content = f.read()
    if "SafeAreaView" not in content and "from 'react-native'" in content:
        content = content.replace(
            "from 'react-native'",
            "from 'react-native';\nimport { SafeAreaView } from 'react-native-safe-area-context'"
        )
        content = re.sub(
            r'return \(\s*\n\s*<View style=\{styles\.container\}>',
            'return (\n    <SafeAreaView style={styles.container}>',
            content
        )
        content = re.sub(
            r'</View>\s*\n\s*\);\s*\n}',
            '</SafeAreaView>\n  );\n}',
            content,
            count=1
        )
        with open(path, "w") as f:
            f.write(content)
        print("✅ app/auth/callback.tsx - SafeAreaView added")
    else:
        print("✅ app/auth/callback.tsx - already ok")

# ── Final TypeScript check ────────────────────────────────────────────────────
print("\n✅ SafeAreaView patches complete!")
print("Now run: cd ~/Desktop/Class-of-Happiness/frontend && npx tsc --noEmit 2>&1 | head -20")
print("Then deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add SafeAreaView to all screens missing it' && git push")
