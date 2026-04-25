"""
Run with: python3 patch_header_errors.py
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# ── Fix 1: classrooms.tsx - fix Image import (RN not HTML) ───────────────────
path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Check what's imported
if "Image" not in content.split("from 'react-native'")[0].split("import {")[-1]:
    # Image not in RN imports - add it
    content = content.replace(
        "import { View, Text, StyleSheet,",
        "import { View, Text, StyleSheet, Image,"
    )
    # Remove standalone Image import if present
    content = content.replace(
        "import { Image } from 'react-native';\n",
        ""
    )
    print("✅ Fix 1: Image added to RN imports in classrooms.tsx")
else:
    print("✅ Fix 1: Image already in RN imports")

# Make sure no duplicate Image
if content.count("Image,") > 1:
    # Remove the one we just added
    content = content.replace(
        "import { View, Text, StyleSheet, Image,",
        "import { View, Text, StyleSheet,"
    )
    print("  Removed duplicate Image import")

with open(path, "w") as f:
    f.write(content)

# ── Fix 2: students.tsx - add missing pageHeader and pageHeaderTitle styles ───
path = os.path.join(FRONTEND, "app/teacher/students.tsx")
with open(path, "r") as f:
    content = f.read()

if "pageHeader" not in content:
    # Find StyleSheet.create and add styles inside
    content = content.replace(
        "  container: { flex: 1, backgroundColor: '#F8F9FA' },",
        """  container: { flex: 1, backgroundColor: '#F8F9FA' },
  pageHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#F8F9FA' },
  pageHeaderTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#333', textAlign: 'center' },"""
    )
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 2: pageHeader styles added to students.tsx")
else:
    print("✅ Fix 2: pageHeader styles already present")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix Image import and missing header styles' && git push")
