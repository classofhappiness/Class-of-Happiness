"""
Run with: python3 patch_sharing_prompt2.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/parent/dashboard.tsx")

with open(path, "r") as f:
    content = f.read()

OLD = """      Alert.alert('Success', `${result.student_name} has been linked!`);
      setShowLinkModal(false);
      setLinkCode('');
      fetchData();"""

NEW = """      const childName = result.student_name || 'Child';
      setShowLinkModal(false);
      setLinkCode('');
      fetchData();
      // Show sharing consent after linking
      setTimeout(() => {
        Alert.alert(
          `✅ ${childName} Linked!`,
          `${childName} is now connected between home and school.\\n\\n📋 SHARING:\\n\\n🏫→🏠 You can already see school check-ins here.\\n\\n🏠→🏫 You can choose to share home check-ins with the teacher.\\n\\nHome sharing is OFF by default for privacy.`,
          [
            { text: '🔒 Keep Private', style: 'cancel' },
            {
              text: '📤 Share with Teacher',
              onPress: async () => {
                try {
                  await linkedChildApi.toggleHomeSharing(result.student_id || result.id);
                  Alert.alert('✅ Sharing On', 'Teacher can now see home check-ins. Turn off anytime in the linked student section.');
                } catch (e) { console.log('Sharing toggle error:', e); }
              }
            }
          ]
        );
      }, 500);"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Sharing consent prompt added correctly")
else:
    print("❌ Pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix sharing consent prompt after linking' && git push")
