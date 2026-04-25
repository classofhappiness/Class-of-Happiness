"""
Run with: python3 patch_dash_badge.py
"""
import os

DASH = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/dashboard.tsx")

with open(DASH, "r") as f:
    content = f.read()

OLD = """                    <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>"""

NEW = """                    <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
                      <Text style={styles.logName}>{getStudentName(log.student_id)}</Text>
                      {log.logged_by === 'parent' && (
                        <View style={{backgroundColor:'#E8F5E9',paddingHorizontal:5,paddingVertical:1,borderRadius:6}}>
                          <Text style={{fontSize:9,color:'#4CAF50',fontWeight:'600'}}>HOME</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.logTime}>{formatTime(log.timestamp)}</Text>"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(DASH, "w") as f:
        f.write(content)
    print("✅ Home badge added to dashboard recent checkins")
else:
    print("❌ Not found")

print("Now deploy!")
