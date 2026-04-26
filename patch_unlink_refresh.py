"""
Run with: python3 patch_unlink_refresh.py
Fix unlink to refresh data after unlinking on both teacher and parent sides
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix teacher student detail - refresh after unlink
path = os.path.join(FRONTEND, "app/teacher/student-detail.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_TEACHER_UNLINK = """                                await teacherApi.unlinkStudent(student.id);
                                Alert.alert(t('success') || 'Success', t('student_unlinked') || 'Student has been unlinked');"""

NEW_TEACHER_UNLINK = """                                await teacherApi.unlinkStudent(student.id);
                                Alert.alert(t('success') || 'Success', 'Student has been unlinked from parent. They will need a new code to reconnect.');
                                setShowLinkCodeModal(false);
                                setSharingStatus({ is_linked_to_parent: false, home_sharing_enabled: false, school_sharing_enabled: false, parent_name: null, link_count: 0 });
                                setHomeData(null);
                                setLinkCode(null);"""

if OLD_TEACHER_UNLINK in content:
    content = content.replace(OLD_TEACHER_UNLINK, NEW_TEACHER_UNLINK)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Teacher unlink now refreshes UI state")
else:
    print("⚠️  Teacher unlink pattern not found")

# Fix parent dashboard - refresh after unlink
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")
with open(path, "r") as f:
    content = f.read()

OLD_PARENT_UNLINK = """                              await linkedChildApi.unlink(child.id);
                              Alert.alert(t('success') || 'Success', t('child_unlinked') || 'Child has been unlinked successfully');"""

NEW_PARENT_UNLINK = """                              await linkedChildApi.unlink(child.id);
                              setLinkedChildren(prev => prev.filter(c => c.id !== child.id));
                              Alert.alert('✅ Unlinked', `${child.name} has been unlinked. You'll need a new code from the teacher to reconnect.`);"""

if OLD_PARENT_UNLINK in content:
    content = content.replace(OLD_PARENT_UNLINK, NEW_PARENT_UNLINK)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Parent unlink now refreshes list immediately")
else:
    print("⚠️  Parent unlink pattern not found")

# Also fix the family dashboard spacing issue
# The memberCardWrapper may have extra margin
with open(path, "r") as f:
    content = f.read()

# Check memberCardWrapper style
import re
wrapper_match = re.search(r'memberCardWrapper:\s*\{[^}]+\}', content)
if wrapper_match:
    old_wrapper = wrapper_match.group(0)
    print(f"Current memberCardWrapper: {old_wrapper}")
    # Fix spacing
    new_wrapper = re.sub(r'marginBottom:\s*\d+', 'marginBottom: 8', old_wrapper)
    new_wrapper = re.sub(r'marginRight:\s*\d+', 'marginRight: 10', new_wrapper)
    if old_wrapper != new_wrapper:
        content = content.replace(old_wrapper, new_wrapper)
        with open(path, "w") as f:
            f.write(content)
        print("✅ Member card spacing fixed")
    else:
        print("✅ Member card spacing already correct")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix unlink refresh on both sides' && git push")
