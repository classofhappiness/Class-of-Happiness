import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CreatureManagement } from '../../src/components/CreatureManagement';
import { TranslatedHeader } from '../../src/components/TranslatedHeader';
import { useApp } from '../../src/context/AppContext';

export default function TeacherCreatureCodeScreen() {
  const { t } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8F9FA' }} edges={['left', 'right', 'bottom']}>
      <TranslatedHeader title={t('manage_creatures_title') || 'Manage Creatures'} showBack />
      <CreatureManagement role="teacher" />
    </SafeAreaView>
  );
}
