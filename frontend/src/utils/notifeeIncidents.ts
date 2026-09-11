// Real feature Sep 11 (build 27, Phase 1 completion): the one genuinely unbuilt piece of
// the Support Requests "buzz" feature - a real, ringing, full-screen incident alert on
// Android, distinct from a normal push. Written against @notifee/react-native 9.1.8
// (confirmed installed version - API checked directly against this package's own type
// definitions, not assumed from memory, given how easy it is to get notifee's Android
// config shape wrong). iOS gets no notifee work here - it already has
// interruptionLevel:'timeSensitive' available via expo-notifications with no SDK upgrade
// needed (see the original brief), Critical Alerts is a separate, still-pending Apple
// entitlement application, not something client code can unlock on its own.
//
// Scope actually delivered vs. not, stated plainly rather than overclaimed:
// - Channels created, correct importance/vibration/sound-loop config: yes.
// - Full-screen, looping-sound alert while the app is OPEN (foreground): yes, wired via
//   the foreground listener in app/_layout.tsx.
// - True full-screen-intent while the app is BACKGROUNDED or killed: NOT independently
//   verified. Android's full-screen-intent behaviour for a remote (not locally-
//   scheduled) notification generally requires the OS to already be showing a
//   heads-up/full-screen notification driven by the channel's own settings before any JS
//   runs - which the channel config below sets up correctly - but whether notifee's
//   fullScreenAction actually fires for a backgrounded app via Expo's push delivery path
//   (not raw FCM + a native background handler) is exactly the kind of platform-specific
//   behaviour that cannot be confirmed without a real device. Foreground behaviour is the
//   first, simplest thing to ring-test; if backgrounded delivery doesn't show full-screen,
//   that's a real, separate follow-up (likely a native background handler), not a bug in
//   this file.
import notifee, {
  AndroidImportance,
  AndroidVisibility,
  AndroidCategory,
  EventType,
} from '@notifee/react-native';
import { Platform } from 'react-native';

export const SUPPORT_REQUEST_CHANNEL_ID = 'support_requests';
export const INCIDENT_CHANNEL_ID = 'incidents';

// Real addition Sep 11: two channels, matching the tone-spec already agreed for this
// feature (plan doc, "Notification channel defaults") - standard buzz is a two-note
// alert, incident is a hard, insistent, looping ring. Channel settings (importance/
// vibration/sound) are the ones that actually matter for a BACKGROUNDED app, since the OS
// - not our JS - decides how to present the notification in that case; this is done once,
// idempotently, at app startup regardless of role (cheap, and a school_admin's own
// channel preferences should exist before their first incident ever arrives, not be
// created reactively on the first push).
export async function setupNotifeeChannels(): Promise<void> {
  if (Platform.OS !== 'android') return; // notifee channels are an Android-only concept
  try {
    await notifee.createChannel({
      id: SUPPORT_REQUEST_CHANNEL_ID,
      name: 'Support requests',
      description: 'A teacher needs support - classroom help, a staff member, or Back on Track supervision.',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibrationPattern: [0, 250, 250, 250],
    });
    await notifee.createChannel({
      id: INCIDENT_CHANNEL_ID,
      name: 'Incidents',
      description: 'An urgent incident needs immediate attention. Rings until acknowledged.',
      importance: AndroidImportance.HIGH,
      visibility: AndroidVisibility.PUBLIC,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      bypassDnd: true,
    });
  } catch (e) {
    console.warn('[notifeeIncidents] channel setup failed:', e);
  }
}

// Real addition Sep 11: true for exactly the payload shape create_support_request's push
// already sends (server.py: data={"type":"support_request","id":...,"is_incident":...}) -
// push data payloads arrive as strings, never real booleans, so is_incident is checked
// both ways rather than assuming one.
export function isIncidentPushData(data: Record<string, any> | undefined | null): boolean {
  if (!data) return false;
  return data.type === 'support_request' && (data.is_incident === true || data.is_incident === 'true');
}

// Real addition Sep 11: the actual full-screen/looping alert. fullScreenAction with no
// launchActivity set launches the app's own main activity (notifee default) - matches
// "tapping it should open the app to see what's happening", not a custom native screen.
// ongoing:true keeps it from being swipe-dismissed by accident, matching a real incoming-
// call notification's own behaviour - the only way to clear it is the in-app Acknowledge/
// respond action (which should call dismissIncidentAlert below) or notifee's own press
// action opening the app.
export async function showIncidentAlert(params: { requestId: string; title: string; body: string }): Promise<void> {
  if (Platform.OS !== 'android') return; // iOS incident presentation is expo-notifications' own timeSensitive path, not this
  try {
    await notifee.requestPermission();
    await setupNotifeeChannels(); // idempotent - cheap safety net if this fires before app startup's own call
    await notifee.displayNotification({
      id: `incident-${params.requestId}`,
      title: params.title,
      body: params.body,
      data: { type: 'support_request', id: params.requestId, is_incident: 'true' },
      android: {
        channelId: INCIDENT_CHANNEL_ID,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        category: AndroidCategory.CALL,
        loopSound: true,
        ongoing: true,
        autoCancel: false,
        fullScreenAction: { id: 'default' },
        pressAction: { id: 'default' },
        color: '#E05252',
      },
    });
  } catch (e) {
    console.warn('[notifeeIncidents] showIncidentAlert failed:', e);
  }
}

export async function dismissIncidentAlert(requestId: string): Promise<void> {
  try {
    await notifee.cancelNotification(`incident-${requestId}`);
  } catch {}
}

// Real addition Sep 11: pressing the notification (or its full-screen action) already
// opens the app on its own via pressAction/fullScreenAction with no launchActivity
// override - nothing extra needed for that. This just clears the ongoing/looping alert
// the moment the user has actually looked at it, so it doesn't keep ringing in the
// background after they've already opened the app from it. Registered once from
// app/_layout.tsx; deliberately does not stop the ring on DISMISSED (a swipe should not
// silently clear an unacknowledged incident - ongoing:true above should prevent the swipe
// itself, this is a second layer in case it doesn't).
export function registerNotifeeForegroundHandler(): () => void {
  return notifee.onForegroundEvent(({ type, detail }) => {
    if (type === EventType.PRESS && detail.notification?.id) {
      notifee.cancelNotification(detail.notification.id).catch(() => {});
    }
  });
}
