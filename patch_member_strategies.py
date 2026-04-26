"""
Run with: python3 patch_member_strategies.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/parent/dashboard.tsx")

with open(path, "r") as f:
    content = f.read()

OLD = """                {/* Big kid-friendly check-in button */}
                <TouchableOpacity
                  style={styles.bigCheckinButton}
                  onPress={() => router.push({
                    pathname: '/parent/checkin',
                    params: { 
                      memberId: member.id, 
                      memberName: member.name,
                      studentId: (member as any).student_id || '',
                    }
                  })}
                >
                  <Text style={styles.bigCheckinEmoji}>😊</Text>
                  <Text style={styles.bigCheckinText}>{t('check_in') || t('checkin') || 'Check In'}</Text>
                </TouchableOpacity>"""

NEW = """                {/* Action buttons row */}
                <View style={{flexDirection:'row', gap:6, width:'100%'}}>
                  <TouchableOpacity
                    style={[styles.bigCheckinButton, {flex:2}]}
                    onPress={() => router.push({
                      pathname: '/parent/checkin',
                      params: { 
                        memberId: member.id, 
                        memberName: member.name,
                        studentId: (member as any).student_id || '',
                      }
                    })}
                  >
                    <Text style={styles.bigCheckinEmoji}>😊</Text>
                    <Text style={styles.bigCheckinText}>{t('check_in') || 'Check In'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bigCheckinButton, {flex:1, backgroundColor:'#5C6BC0'}]}
                    onPress={() => router.push({
                      pathname: '/parent/strategies',
                      params: { 
                        studentId: (member as any).student_id || member.id,
                        memberName: member.name,
                      }
                    })}
                  >
                    <Text style={{fontSize:16}}>💡</Text>
                    <Text style={[styles.bigCheckinText, {fontSize:10}]}>Strategies</Text>
                  </TouchableOpacity>
                </View>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Strategies button added to family member cards")
else:
    print("❌ Pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Add strategies button to family member cards' && git push")
