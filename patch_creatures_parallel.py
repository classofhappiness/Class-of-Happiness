"""
Run with: python3 patch_creatures_parallel.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/student/select.tsx")
with open(path, "r") as f:
    content = f.read()

OLD = """  // Fetch creature data for all students
  useEffect(() => {
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
              allCreatures: collection.total_creatures || collection.total_creatures || [],
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

NEW = """  // Preload sounds once
  useEffect(() => { preloadSounds(); }, []);

  // Load ALL creatures in parallel - much faster than one by one
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
    print("✅ Creatures now load in parallel!")
else:
    print("❌ Still not matching - check manually")
    # Show what's there
    lines = content.split('\n')
    for i, l in enumerate(lines[40:75], 41):
        print(f"{i}: {l}")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Parallel creature loading for speed' && git push")
