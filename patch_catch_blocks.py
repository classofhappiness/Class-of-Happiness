"""
Run with: python3 patch_catch_blocks.py
Fixes empty catch {} blocks with proper silent logging
so errors are captured without crashing the app.
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

files_to_fix = [
    "app/settings.tsx",
    "app/admin/dashboard.tsx",
    "app/teacher/checkin.tsx",
]

total_fixed = 0

for filepath in files_to_fix:
    full_path = os.path.join(FRONTEND, filepath)
    with open(full_path, "r") as f:
        content = f.read()

    original = content

    # Replace bare catch {} with catch (e) { console.log(...) }
    # Pattern: catch {} or catch (e) {}
    content = re.sub(
        r'} catch \{\}',
        '} catch (e) { console.log("[silent]", e); }',
        content
    )

    # Also fix single-line try/catch with empty catch
    content = re.sub(
        r'try \{([^{}]+)\} catch \{\}',
        lambda m: f'try {{{m.group(1)}}} catch (e) {{ console.log("[silent]", e); }}',
        content
    )

    if content != original:
        with open(full_path, "w") as f:
            f.write(content)
        count = original.count("catch {}") 
        total_fixed += count
        print(f"✅ Fixed {count} empty catch blocks in {filepath}")
    else:
        print(f"✅ No empty catch blocks in {filepath}")

print(f"\n✅ Total fixed: {total_fixed} empty catch blocks")

# ── Also check for missing SafeAreaView usage ─────────────────────────────────
print("\n--- Checking SafeAreaView usage ---")
for root, dirs, files in os.walk(os.path.join(FRONTEND, "app")):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for file in files:
        if file.endswith(".tsx"):
            path = os.path.join(root, file)
            with open(path) as f:
                c = f.read()
            if "return (" in c and "SafeAreaView" not in c and "safeArea" not in c.lower():
                rel = path.replace(FRONTEND + "/", "")
                print(f"⚠️  {rel} — missing SafeAreaView")

# ── Check for potential null crashes ─────────────────────────────────────────
print("\n--- Checking for potential null crashes ---")
null_risks = []
for root, dirs, files in os.walk(os.path.join(FRONTEND, "app")):
    dirs[:] = [d for d in dirs if d != "node_modules"]
    for file in files:
        if file.endswith(".tsx"):
            path = os.path.join(root, file)
            with open(path) as f:
                lines = f.readlines()
            for i, line in enumerate(lines):
                # Look for .map( without null check
                if ".map(" in line and "?" not in line and "|| []" not in line and "Array.isArray" not in line:
                    if "//skip" not in line.lower():
                        rel = path.replace(FRONTEND + "/", "")
                        null_risks.append(f"{rel}:{i+1}: {line.strip()[:80]}")

if null_risks:
    print(f"Found {len(null_risks)} potential null .map() calls:")
    for r in null_risks[:10]:
        print(f"  {r}")
else:
    print("✅ No obvious null .map() risks found")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix empty catch blocks, improve error logging' && git push")
