"""
Run with: python3 patch_sharing_prompt.py
Adds sharing consent prompt after parent links a child
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")
path = os.path.join(FRONTEND, "app/parent/dashboard.tsx")

with open(path, "r") as f:
    content = f.read()

# Find where linking succeeds and add sharing prompt
OLD_LINK_SUCCESS = """      setLinkedChildren(prev => [...prev, result]);
      Alert.alert('✅ Linked!', `${result.student_name || result.name || 'Child'} has been linked to your family account.`);"""

NEW_LINK_SUCCESS = """      setLinkedChildren(prev => [...prev, result]);
      const childName = result.student_name || result.name || 'Child';
      // Show sharing consent prompt
      Alert.alert(
        `✅ ${childName} Linked!`,
        `${childName} is now connected between home and school.\\n\\n📋 SHARING OPTIONS:\\n\\n🏠 → 🏫 You can share your home check-ins with the teacher so they can support ${childName} better at school.\\n\\n🏫 → 🏠 You can already see ${childName}\\'s school check-ins here.\\n\\nHome sharing is OFF by default for your privacy. You can turn it on anytime in the linked student section.`,
        [
          {
            text: '🔒 Keep Private (default)',
            style: 'cancel',
            onPress: () => {}
          },
          {
            text: '📤 Share Home Data with Teacher',
            onPress: async () => {
              try {
                await linkedChildApi.toggleHomeSharing(result.student_id || result.id);
                Alert.alert('✅ Sharing On', 'Your teacher can now see home check-ins. You can turn this off anytime.');
              } catch (e) {
                console.log('Could not enable sharing:', e);
              }
            }
          }
        ]
      );"""

if OLD_LINK_SUCCESS in content:
    content = content.replace(OLD_LINK_SUCCESS, NEW_LINK_SUCCESS)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Sharing consent prompt added after linking")
else:
    print("⚠️  Pattern not found - checking...")
    # Find any success alert after linkChild
    idx = content.find("parentApi.linkChild")
    if idx > 0:
        print(content[idx:idx+300])

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add sharing consent prompt after linking' && git push")
