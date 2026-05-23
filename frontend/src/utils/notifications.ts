import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) return null; // Simulator — skip
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const token = (await Notifications.getExpoPushTokenAsync()).data;

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  // Store token locally
  await AsyncStorage.setItem('expo_push_token', token);

  // Register with backend
  try {
    const sessionToken = await AsyncStorage.getItem('session_token');
    if (sessionToken) {
      await fetch(`${BACKEND_URL}/api/notifications/register-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
        body: JSON.stringify({ token }),
      });
    }
  } catch (e) {
    console.warn('Push token registration failed:', e);
  }

  return token;
}

export async function sendHelpRequest(params: {
  student_id: string;
  strategy_id: string;
  strategy_name: string;
  zone: string;
  message?: string;
  context?: 'school' | 'home'; // school = teacher only, home = family only
}): Promise<{ ok: boolean; shield_awarded: boolean }> {
  try {
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${BACKEND_URL}/api/notifications/help-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return { ok: false, shield_awarded: false };
  }
}

export async function sendZoneAlert(params: {
  student_id: string;
  zone: string;
  log_id?: string;
  context?: 'school' | 'home'; // school = teacher only, home = family only
}): Promise<void> {
  try {
    const token = await AsyncStorage.getItem('session_token');
    await fetch(`${BACKEND_URL}/api/notifications/zone-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });
  } catch {}
}

export async function sendParentMessage(params: {
  student_id: string;
  message: string;
  zone: string;
}): Promise<{ ok: boolean }> {
  try {
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${BACKEND_URL}/api/notifications/parent-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch {
    return { ok: false };
  }
}

export async function getStudentShield(student_id: string): Promise<{
  has_shield: boolean;
  level: string | null;
  count: number;
  label?: string;
}> {
  try {
    const token = await AsyncStorage.getItem('session_token');
    const res = await fetch(`${BACKEND_URL}/api/notifications/shield/${student_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return await res.json();
  } catch {
    return { has_shield: false, level: null, count: 0 };
  }
}

export async function getStudentNotifSettings(student_id: string, teacher_token: string): Promise<{
  enabled: boolean;
  help_request: boolean;
  zone_alerts: string[];
}> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/student/${student_id}/settings`, {
      headers: { Authorization: `Bearer ${teacher_token}` },
    });
    return await res.json();
  } catch {
    return { enabled: false, help_request: false, zone_alerts: [] };
  }
}

export async function updateStudentNotifSettings(
  student_id: string,
  teacher_token: string,
  settings: { enabled: boolean; help_request: boolean; zone_alerts: string[] }
): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/notifications/student/${student_id}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${teacher_token}` },
      body: JSON.stringify(settings),
    });
  } catch {}
}

export async function getAlerts(token: string): Promise<any[]> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/notifications/alerts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[Alerts] fetch failed:', res.status);
      return [];
    }
    const data = await res.json();
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.alerts)) return data.alerts;
    return [];
  } catch(e) {
    console.error('[Alerts] fetch error:', e);
    return [];
  }
}

export async function resolveAlert(alert_id: string, token: string): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/api/notifications/alerts/${alert_id}/resolve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
}

export const SHIELD_LEVELS = [
  { level: 'bronze_1', label: 'Bronze Shield I',   emoji: '🛡️',  min: 1  },
  { level: 'bronze_2', label: 'Bronze Shield II',  emoji: '🛡️',  min: 3  },
  { level: 'bronze_3', label: 'Bronze Shield III', emoji: '🛡️',  min: 5  },
  { level: 'silver_1', label: 'Silver Shield I',   emoji: '🥈🛡️', min: 10 },
  { level: 'silver_2', label: 'Silver Shield II',  emoji: '🥈🛡️', min: 20 },
  { level: 'gold',     label: 'Gold Shield',       emoji: '🏆🛡️', min: 50 },
];

export function shieldEmoji(level: string | null): string {
  if (!level) return '';
  return SHIELD_LEVELS.find(s => s.level === level)?.emoji || '🛡️';
}
