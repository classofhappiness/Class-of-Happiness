"""
Run with: python3 patch_loggedby.py
"""
import os

DASH = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/dashboard.tsx")

with open(DASH, "r") as f:
    content = f.read()

# Fix: cast log to any to access logged_by
OLD = """                    {log.logged_by === 'parent' && ("""
NEW = """                    {(log as any).logged_by === 'parent' && ("""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(DASH, "w") as f:
        f.write(content)
    print("✅ Fixed logged_by type error")
else:
    print("❌ Not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix logged_by type error' && git push")
