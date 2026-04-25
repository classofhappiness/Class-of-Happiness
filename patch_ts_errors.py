"""
Run with: python3 patch_ts_errors.py
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix 1: all_creatures -> total_creatures in select.tsx
path = os.path.join(FRONTEND, "app/student/select.tsx")
with open(path, "r") as f:
    content = f.read()
content = content.replace("collection.all_creatures", "collection.total_creatures")
with open(path, "w") as f:
    f.write(content)
print("✅ Fix 1: all_creatures -> total_creatures")

# Fix 2 & 3: Add missing pageHeader styles to students.tsx
path = os.path.join(FRONTEND, "app/teacher/students.tsx")
with open(path, "r") as f:
    content = f.read()

if "pageHeader:" not in content:
    # Find StyleSheet.create({ and add after first {
    content = re.sub(
        r'(const styles = StyleSheet\.create\(\{)',
        r'\1\n  pageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10, backgroundColor: "#F8F9FA" },\n  pageHeaderTitle: { flex: 1, fontSize: 17, fontWeight: "bold", color: "#333", textAlign: "center" },',
        content
    )
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 2: pageHeader styles added to students.tsx")
else:
    print("✅ Fix 2: pageHeader already exists")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix remaining TS errors' && git push")
