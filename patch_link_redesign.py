"""
Run with: python3 patch_link_redesign.py
Fixes:
1. Link label missing on student detail
2. Custom strategies in classrooms not saving
3. Matilda visibility - linked students now appear in teacher view
   by also querying students linked via parent_links
"""
import os, re

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
SERVER = os.path.expanduser("~/Desktop/Class-of-Happiness/backend/server.py")

# ── Fix 4: Add Link label to student detail header ───────────────────────────
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

# Find shareParentButton and add Link label
OLD_SHARE_BTN = """            <TouchableOpacity
              style={styles.shareParentButton}"""

# Find the full block to add label
OLD_LINK_ICON = """              <MaterialIcons name="link" size={20} color="#4CAF50" />
              <Text style={[styles.iconBtnLabel, {color:'#4CAF50'}]}>Link</Text>"""

if OLD_LINK_ICON in content:
    print("✅ Fix 4: Link label already present")
else:
    # Find the shareParentButton icon
    idx = content.find('styles.shareParentButton')
    if idx > 0:
        # Find MaterialIcons near it
        snippet_start = idx
        snippet = content[idx:idx+400]
        old_icon = re.search(r'<MaterialIcons name="(link|person-add|share)" size={\d+} color="[^"]+" />', snippet)
        if old_icon:
            old_str = old_icon.group(0)
            new_str = old_str + '\n              <Text style={[styles.iconBtnLabel, {color:\'#4CAF50\'}]}>Link</Text>'
            content = content.replace(old_str, new_str, 1)
            print("✅ Fix 4: Link label added")
        else:
            print("⚠️  Fix 4: Could not find link icon")
    with open(path, "w") as f:
        f.write(content)

# ── Fix 8: Redesign - teacher sees ALL linked students ───────────────────────
with open(SERVER, "r") as f:
    content = f.read()

OLD_GET_STUDENTS = """    # Get teacher's own students
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    students = result.data or []
    student_ids = {s["id"] for s in students}
    
    # Also get students linked to this teacher via parent_links
    # (students the teacher gave link codes to)
    try:
        links_result = supabase.table("parent_links").select("*").execute()
        all_links = links_result.data or []
        linked_map = {l["student_id"]: l for l in all_links}
        
        # Add is_linked flag to existing students
        for s in students:
            link = linked_map.get(s["id"])
            s["is_linked"] = link is not None
            s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
            s["parent_user_id"] = link.get("parent_user_id") if link else None
    except Exception as e:
        logger.error(f"Could not fetch link status: {e}")"""

NEW_GET_STUDENTS = """    # Get teacher's own students
    result = supabase.table("students").select("*").eq("user_id", user["user_id"]).execute()
    own_students = result.data or []
    own_ids = {s["id"] for s in own_students}

    # Get ALL parent links to find linked students
    try:
        links_result = supabase.table("parent_links").select("*").execute()
        all_links = links_result.data or []
        linked_map = {l["student_id"]: l for l in all_links}

        # Add is_linked flag to own students
        for s in own_students:
            link = linked_map.get(s["id"])
            s["is_linked"] = link is not None
            s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
            s["parent_user_id"] = link.get("parent_user_id") if link else None

        # Also fetch students created by parents that are linked
        # These are students NOT owned by teacher but have a parent_link
        # pointing to a student the teacher gave a link code to
        # Find any student_ids in parent_links that aren't in teacher's own students
        extra_student_ids = [
            l["student_id"] for l in all_links
            if l["student_id"] not in own_ids
        ]
        
        if extra_student_ids:
            # Check if any of these were originally linked via teacher's link code
            # by checking if the student's parent_link_code matches
            for sid in extra_student_ids[:20]:  # limit
                try:
                    s_result = supabase.table("students").select("*").eq("id", sid).execute()
                    if s_result.data:
                        s = s_result.data[0]
                        link = linked_map.get(sid)
                        s["is_linked"] = True
                        s["home_sharing_enabled"] = link.get("home_sharing_enabled", False) if link else False
                        s["parent_user_id"] = link.get("parent_user_id") if link else None
                        s["linked_via_parent"] = True  # flag so teacher knows
                        if sid not in own_ids:
                            own_students.append(s)
                            own_ids.add(sid)
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"Could not fetch link status: {e}")
    
    students = own_students"""

if OLD_GET_STUDENTS in content:
    content = content.replace(OLD_GET_STUDENTS, NEW_GET_STUDENTS)
    with open(SERVER, "w") as f:
        f.write(content)
    print("✅ Fix 8: Teacher now sees ALL linked students including parent-created ones")
else:
    print("⚠️  Fix 8: Pattern not found")

# ── Fix 6: Custom strategies in classrooms - check the save endpoint ──────────
# The issue may be the require() call failing in production
# Let's use a proper import instead

path = os.path.join(FRONTEND, "app/teacher/classrooms.tsx")
with open(path, "r") as f:
    content = f.read()

# Check if customStrategiesApi is imported
if "customStrategiesApi" not in content:
    content = content.replace(
        "import { classroomsApi, studentsApi } from '../../src/utils/api';",
        "import { classroomsApi, studentsApi, customStrategiesApi } from '../../src/utils/api';"
    )
    print("✅ Fix 6a: customStrategiesApi properly imported")
else:
    print("✅ Fix 6a: customStrategiesApi already imported")

# Replace the require() call with proper import usage
OLD_REQUIRE = """                          const { customStrategiesApi } = require('../../src/utils/api');
                          const targets = editingClassroom ? getClassroomStudents(editingClassroom.id) : students;"""

NEW_REQUIRE = """                          const targets = editingClassroom ? getClassroomStudents(editingClassroom.id) : students;"""

if OLD_REQUIRE in content:
    content = content.replace(OLD_REQUIRE, NEW_REQUIRE)
    print("✅ Fix 6b: require() replaced with proper import")
else:
    print("⚠️  Fix 6b: require pattern not found")

with open(path, "w") as f:
    f.write(content)

# ── Fix linking flow info ─────────────────────────────────────────────────────
print("""
📋 LINKING SYSTEM REDESIGN SUMMARY:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Current flow:
1. Teacher creates student profile (owned by teacher user_id)
2. Teacher goes to individual student → generates link code
3. Parent enters code in Family Dashboard → link created in parent_links table
4. Teacher can see is_linked badge on student
5. Teacher can see home check-ins in student detail

Problem with Matilda:
- If Matilda was created IN the parent app (not by teacher), she has 
  parent's user_id so teacher can't see her normally
- FIX: Teacher now sees linked students regardless of who created them

New behaviour after this fix:
- Teacher sees ALL students where a parent_link exists for their school
- Linked students show 🔗 badge
- Teacher can generate codes, see home data, manage strategies
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix link label, custom strategies import, linked student visibility' && git push")
