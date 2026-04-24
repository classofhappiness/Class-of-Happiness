"""
Run with: python3 patch_layout_dupes.py
Removes duplicate screen names from _layout.tsx
"""
import os

LAYOUT = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/_layout.tsx")

with open(LAYOUT, "r") as f:
    content = f.read()

# Remove the duplicate parent/strategies that was added by our patch
OLD_DUPE = """        <Stack.Screen
          name="parent/widget"
          options={{
            headerShown: false,
            title: 'Family Widget',
          }}
        />
        <Stack.Screen
          name="parent/strategies"
          options={{
            title: 'Family Strategies',
            headerBackTitle: 'Dashboard',
          }}
        />"""

NEW_NO_DUPE = """        <Stack.Screen
          name="parent/widget"
          options={{
            headerShown: false,
            title: 'Family Widget',
          }}
        />"""

if OLD_DUPE in content:
    content = content.replace(OLD_DUPE, NEW_NO_DUPE)
    print("✅ Removed duplicate parent/strategies screen")
else:
    # Try finding and removing just the second occurrence
    first = content.find('name="parent/strategies"')
    second = content.find('name="parent/strategies"', first + 1)
    if second > 0:
        # Find the full Stack.Screen block around second occurrence
        block_start = content.rfind("        <Stack.Screen", 0, second)
        block_end = content.find("        />", second) + len("        />")
        content = content[:block_start] + content[block_end:]
        print("✅ Removed second occurrence of parent/strategies")
    else:
        print("⚠️  Could not find duplicate")

with open(LAYOUT, "w") as f:
    f.write(content)

# Verify no more duplicates
names = []
import re
for match in re.finditer(r'name="([^"]+)"', content):
    names.append(match.group(1))

dupes = [n for n in names if names.count(n) > 1]
if dupes:
    print(f"⚠️  Still duplicated: {set(dupes)}")
else:
    print("✅ All screen names are unique!")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix duplicate screen names causing app crash' && git push")
