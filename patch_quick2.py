"""
Run with: python3 patch_quick2.py
"""
import os

FRONTEND = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend")

# Fix 1: Parallel creature loading in select.tsx
path = os.path.join(FRONTEND, "app/student/select.tsx")
with open(path, "r") as f:
    content = f.read()

OLD = """  useEffect(() => {
    // Preload sounds for the student pages
    preloadSounds();
    
    const fetchAllCreatures = async () => {
      const creatureData: Record<string, StudentCreatureData> = {};
      
      for (const student of students) {
        try {
          const collection = await rewardsApi.getCollection(student.id);
          if (collection && collection.current_creature) {
            creatureData[student.id] = {
              currentCreature: collection.current_creature,
              currentStage: collection.current_stage || 0,
              collectedCreatures: collection.collected_creatures || [],
              totalPoints: collection.current_points || 0,
              allCreatures: collection.total_creatures || [],
            } as any;
          }
        } catch (error) {
          console.log(`Creatures not loaded for ${student.id} - will show when available`);
        }
      }
      
      setStudentCreatures(creatureData);
    };

    if (students.length > 0) {
      fetchAllCreatures();
    }
  }, [students]);"""

NEW = """  useEffect(() => { preloadSounds(); }, []);

  // Load ALL creatures in parallel - much faster than sequential
  useEffect(() => {
    if (students.length === 0) return;
    Promise.allSettled(
      students.map(s => rewardsApi.getCollection(s.id).then(c => ({ id: s.id, c })))
    ).then(results => {
      const data: Record<string, StudentCreatureData> = {};
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value.c?.current_creature) {
          const { id, c } = r.value;
          data[id] = {
            currentCreature: c.current_creature,
            currentStage: c.current_stage || 0,
            collectedCreatures: c.collected_creatures || [],
            totalPoints: c.current_points || 0,
            allCreatures: c.total_creatures || [],
          } as any;
        }
      });
      setStudentCreatures(data);
    });
  }, [students]);"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 1: Creatures load in parallel now")
else:
    print("❌ Pattern not found in select.tsx")

# Fix 2: Linked badge in students.tsx
path = os.path.join(FRONTEND, "app/teacher/students.tsx")
with open(path, "r") as f:
    content = f.read()

OLD2 = """                  <Text style={styles.studentName}>{student.name}</Text>"""
NEW2 = """                  <View style={{flexDirection:'row',alignItems:'center',gap:4}}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    {(student as any).is_linked && (
                      <Text style={{fontSize:10}}>🔗</Text>
                    )}
                  </View>"""

if OLD2 in content:
    content = content.replace(OLD2, NEW2)
    with open(path, "w") as f:
        f.write(content)
    print("✅ Fix 2: Linked badge added to students list")
else:
    print("❌ Pattern not found in students.tsx")

print("\nDeploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Parallel creature loading, linked badge on students' && git push")
