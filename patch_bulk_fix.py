"""
Run with: python3 patch_bulk_fix.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/classrooms.tsx")

with open(path, "r") as f:
    content = f.read()

OLD = """      await Promise.all(
        Array.from(selectedStudentIds).map(studentId =>
          customStrategiesApi.create({
            student_id: studentId,
            name: stratName,
            description: stratDesc,
            zone: selectedZone,
            icon: stratIcon,
            is_shared: true,
          })
        )
      );"""

NEW = """      const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const AsyncStorageMod = (await import('@react-native-async-storage/async-storage')).default;
      const token = await AsyncStorageMod.getItem('session_token');
      const results = await Promise.allSettled(
        Array.from(selectedStudentIds).map(studentId =>
          fetch(`${BACKEND_URL}/api/helpers/custom`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              student_id: studentId,
              name: stratName,
              description: stratDesc,
              feeling_colour: selectedZone,
              icon: stratIcon,
              is_shared: true,
            }),
          })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) throw new Error(`Failed for ${failed} student(s)`);"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Bulk strategy add now uses /helpers/custom correctly")
else:
    print("❌ Pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix classroom bulk strategy add endpoint' && git push")
