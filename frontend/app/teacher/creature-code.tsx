import React from 'react';
import { SafeAreaView } from 'react-native';
import { CreatureManagement } from '../../src/components/CreatureManagement';

export default function TeacherCreatureCodeScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }}>
      <CreatureManagement role="teacher" />
    </SafeAreaView>
  );
}
