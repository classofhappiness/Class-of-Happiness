"""
Run with: python3 patch_remove_yellowbar.py
Removes yellow bars from all custom headers and fixes padding
so content sits lower, not higher.
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

files_to_fix = [
    "app/parent/dashboard.tsx",
    "app/parent/resources.tsx",
    "app/parent/family-strategies.tsx",
    "app/parent/strategies.tsx",
    "app/parent/checkin.tsx",
    "app/teacher/bulk-checkin.tsx",
    "app/teacher/checkin.tsx",
    "app/teacher/resources.tsx",
    "app/teacher/strategies.tsx",
    "app/teacher/classrooms.tsx",
    "app/teacher/students.tsx",
    "app/parent/linked-child/[id].tsx",
]

for filepath in files_to_fix:
    full_path = os.path.join(FRONTEND, filepath)
    if not os.path.exists(full_path):
        continue
    with open(full_path, "r") as f:
        content = f.read()
    
    original = content
    name = filepath.split("/")[-1]

    # Remove yellow bar JSX elements - various patterns used
    content = re.sub(r'\s*<View style=\{styles\.yellowBar\} />', '', content)
    content = re.sub(r'\s*<View style=\{\{height:4, backgroundColor:\'#FFC107\'\}\} />', '', content)
    content = re.sub(r'\s*<View style=\{styles\.pageYellowBar\} />', '', content)

    # Remove yellowBar style definitions
    content = re.sub(r'\s*yellowBar:\s*\{[^}]+\},', '', content)
    content = re.sub(r'\s*pageYellowBar:\s*\{[^}]+\},', '', content)

    # Fix headers that have too little paddingTop - make them sit lower
    # Replace paddingTop: 8 with paddingTop: 16 in topBar/header styles
    content = re.sub(
        r'(topBar:\s*\{[^}]*paddingVertical:\s*)10',
        r'\g<1>14',
        content
    )
    content = re.sub(
        r'(header:\s*\{[^}]*paddingTop:\s*)8',
        r'\g<1>16',
        content
    )

    # Add shadow to custom topBars that don't have it
    if "topBar:" in content and "shadowColor" not in content:
        content = content.replace(
            "  topBar: {",
            "  topBar: {\n    shadowColor: '#000',\n    shadowOffset: { width: 0, height: 2 },\n    shadowOpacity: 0.06,\n    shadowRadius: 4,\n    elevation: 3,"
        )

    if content != original:
        with open(full_path, "w") as f:
            f.write(content)
        print(f"✅ {name} - yellow bar removed, shadow added")
    else:
        print(f"  {name} - no changes needed")

# Also fix parent dashboard header to sit lower
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

# Fix marginTop on header to push content down
content = content.replace(
    "  header: {\n    alignItems: 'center',\n    marginBottom: 20,\n    marginTop: 8,\n    paddingBottom: 0,\n  },",
    "  header: {\n    alignItems: 'center',\n    marginBottom: 20,\n    marginTop: 20,\n    paddingBottom: 8,\n  },"
)

with open(path, "w") as f:
    f.write(content)
print("✅ Parent dashboard header margin fixed")

print("\n✅ All yellow bars removed!")
print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Remove yellow bars, use shadow headers, fix header padding' && git push")
