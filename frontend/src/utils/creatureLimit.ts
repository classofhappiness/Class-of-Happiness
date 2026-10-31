import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// The calm "free creatures collected" message. Shown on its own at most once per child per
// device (AsyncStorage flag; if storage fails it just may show again on the next visit), and
// whenever a child taps a locked card or submit hits the limit (their own action).
const key = (studentId: string) => `coh.creatureLimitShown.${studentId}`;

export async function creatureLimitAlreadyShown(studentId?: string | null): Promise<boolean> {
  if (!studentId) return true;
  try {
    return (await AsyncStorage.getItem(key(studentId))) === '1';
  } catch {
    return false;
  }
}

export async function markCreatureLimitShown(studentId?: string | null) {
  if (!studentId) return;
  try {
    await AsyncStorage.setItem(key(studentId), '1');
  } catch {
    /* storage unavailable: harmless, the message may appear again */
  }
}

// The button only goes to the subscribe screen; the parent gate sits in front of Subscribe there.
export function showCreatureLimitNotice(t: (k: string) => string, goSubscribe: () => void) {
  Alert.alert(
    t('creature_limit_message') || "You've collected all your free creatures! Ask a grown-up to see more.",
    undefined,
    [
      { text: t('ok') || 'OK', style: 'cancel' },
      { text: t('creature_limit_ask') || 'Ask a grown-up', onPress: goSubscribe },
    ],
  );
}
