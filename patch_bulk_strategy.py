"""
Run with: python3 patch_bulk_strategy.py
"""
import os

path = os.path.expanduser("~/Desktop/Class-of-Happiness/frontend/app/teacher/classrooms.tsx")

with open(path, "r") as f:
    content = f.read()

OLD = """  const handleBulkAddStrategy = async () => {
    if (!selectedStrategy || selectedStudentIds.size === 0) {
      Alert.alert('Select strategy and at least one student');
      return;
    }
    setAddingStrategy(true);
    try {
      // Add strategy to each selected student
      await Promise.all(
        Array.from(selectedStudentIds).map(studentId =>
          fetch(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/helpers/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: studentId,
              name: selectedStrategy.name,
              description: `Added by teacher for ${selectedZone} zone`,
              feeling_colour: selectedZone,
              icon: selectedStrategy.icon,
              is_shared: false,
            }),
          })
        )
      );
      Alert.alert('✅ Done!', `"${selectedStrategy.name}" added to ${selectedStudentIds.size} student(s).`);
      setStrategyModalVisible(false);
      setSelectedStrategy(null);
      setSelectedStudentIds(new Set());
      setCustomStrategyName('');
      setCustomStrategyDesc('');
      setShowCustomStrategyInput(false);
    } catch {
      Alert.alert('Error', 'Failed to add strategy to some students.');
    } finally {
      setAddingStrategy(false);
    }
  };"""

NEW = """  const handleBulkAddStrategy = async () => {
    const isCustom = showCustomStrategyInput && customStrategyName.trim();
    if (!isCustom && !selectedStrategy) {
      Alert.alert('Please select a strategy or write a custom one');
      return;
    }
    if (selectedStudentIds.size === 0) {
      Alert.alert('Please select at least one student');
      return;
    }
    setAddingStrategy(true);
    try {
      const stratName = isCustom ? customStrategyName.trim() : selectedStrategy!.name;
      const stratDesc = isCustom ? customStrategyDesc.trim() : `Added by teacher for ${selectedZone} zone`;
      const stratIcon = isCustom ? 'star' : selectedStrategy!.icon;

      await Promise.all(
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
      );
      Alert.alert('✅ Done!', `"${stratName}" added to ${selectedStudentIds.size} student(s).`);
      setStrategyModalVisible(false);
      setSelectedStrategy(null);
      setSelectedStudentIds(new Set());
      setCustomStrategyName('');
      setCustomStrategyDesc('');
      setShowCustomStrategyInput(false);
    } catch {
      Alert.alert('Error', 'Failed to add strategy to some students.');
    } finally {
      setAddingStrategy(false);
    }
  };"""

if OLD in content:
    content = content.replace(OLD, NEW)
    with open(path, "w") as f:
        f.write(content)
    print("✅ handleBulkAddStrategy updated to support custom strategies")
else:
    print("❌ Pattern not found")

print("Deploy: cd ~/Desktop/Class-of-Happiness && git add -A && git commit -m 'Fix bulk strategy to support custom strategies' && git push")
