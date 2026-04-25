"""
Run with: python3 patch_icon_labels.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/student-detail.tsx")

with open(path, "r") as f:
    content = f.read()

OLD = """          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push({
              pathname: '/profiles/edit',
              params: { studentId: student.id }
            })}
          >
            <MaterialIcons name="edit" size={20} color="#5C6BC0" />
          </TouchableOpacity>"""

NEW = """          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push({
              pathname: '/profiles/edit',
              params: { studentId: student.id }
            })}
          >
            <MaterialIcons name="edit" size={20} color="#5C6BC0" />
            <Text style={styles.iconBtnLabel}>Edit</Text>
          </TouchableOpacity>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    print("✅ Edit label added")
else:
    print("❌ Edit button not found")

# Add iconBtnLabel style
if "iconBtnLabel" not in content:
    content = content.replace(
        "  editButton: {",
        "  iconBtnLabel: { fontSize: 9, color: '#5C6BC0', marginTop: 2, fontWeight: '600' },\n  editButton: {"
    )
    # Make editButton column
    content = content.replace(
        "  editButton: { padding: 8,",
        "  editButton: { padding: 8, alignItems: 'center', flexDirection: 'column',"
    )
    print("✅ Icon label style added")

with open(path, "w") as f:
    f.write(content)

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add icon labels to student detail' && git push")
