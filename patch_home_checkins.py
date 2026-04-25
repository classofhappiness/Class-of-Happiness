"""
Run with: python3 patch_home_checkins.py
Fixes home checkins query to also check family_zone_logs table
"""
import os

SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

with open(SERVER, "r") as f:
    content = f.read()

OLD = """        # Home check-ins (logged_by = parent)
        home_logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).eq("logged_by", "parent").gte("timestamp", start_date).order("timestamp", desc=True).execute()"""

NEW = """        # Home check-ins - check feeling_logs (logged_by=parent) AND family_zone_logs
        home_logs = supabase.table("feeling_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
        all_feeling_logs = home_logs.data or []
        # Filter for home/parent logs
        parent_feeling_logs = [l for l in all_feeling_logs if l.get("logged_by") in ("parent", "family")]
        # Also check family_zone_logs table
        try:
            fam_logs_result = supabase.table("family_zone_logs").select("*").eq("student_id", student_id).gte("timestamp", start_date).order("timestamp", desc=True).execute()
            fam_zone_logs = [{**l, "logged_by": "parent"} for l in (fam_logs_result.data or [])]
        except Exception:
            fam_zone_logs = []
        combined_home = parent_feeling_logs + fam_zone_logs
        # deduplicate by timestamp
        seen = set()
        home_only = []
        for l in combined_home:
            ts = l.get("timestamp","")
            if ts not in seen:
                seen.add(ts)
                home_only.append(l)
        home_only.sort(key=lambda x: x.get("timestamp",""), reverse=True)
        # Create mock result object
        class MockResult:
            def __init__(self, data): self.data = data
        home_logs = MockResult(home_only)"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ Fix 7: Home checkins query fixed")
else:
    print("❌ Pattern not found")
    # Show exact lines
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if 'Home check' in line or 'home_logs' in line:
            print(f"  {i+1}: {line}")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix home checkins query + all other fixes' && git push")
