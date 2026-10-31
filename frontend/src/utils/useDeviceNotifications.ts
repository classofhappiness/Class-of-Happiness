import { useEffect, useState } from 'react';
import { loadDeviceNotificationsEnabled, setDeviceNotificationsEnabled, subscribeDeviceNotifications } from './notifications';

// The "Notifications on this device" switch as a hook: the same stored setting and the same behaviour wherever it is
// shown (Settings > General, school admin Support Requests tab), kept in step live.
export function useDeviceNotificationsEnabled(): [boolean, (next: boolean) => void] {
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let live = true;
    loadDeviceNotificationsEnabled().then((v) => { if (live) setEnabled(v); });
    const off = subscribeDeviceNotifications((v) => { if (live) setEnabled(v); });
    return () => { live = false; off(); };
  }, []);
  return [enabled, (next: boolean) => { setEnabled(next); setDeviceNotificationsEnabled(next); }];
}
