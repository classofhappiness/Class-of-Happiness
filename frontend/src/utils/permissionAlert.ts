import { Alert, Linking } from 'react-native';

// S09: one shared "photo access was denied" alert. Title + a body that says what to do + an Open Settings button
// (iOS will not show the system prompt a second time, so Settings is the only way back).
// Uses existing strings: permission_needed, allow_library_access_settings, camera_permission_desc, open_settings, cancel (all in the 10 languages).
export function showPermissionAlert(t: (key: string) => string | undefined, kind: 'library' | 'camera' = 'library') {
  Alert.alert(
    t('permission_needed') || 'Permission needed',
    kind === 'camera'
      ? (t('camera_permission_desc') || 'Please allow access to your camera.')
      : (t('allow_library_access_settings') || 'Please allow photo library access in Settings.'),
    [
      { text: t('cancel') || 'Cancel', style: 'cancel' },
      { text: t('open_settings') || 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); } },
    ],
  );
}
