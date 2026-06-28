// On-device full-screen live-class alarms (Android only) via the native LiveAlarm plugin.
//
// Unlike push, these are scheduled locally with AlarmManager, so the alarm rings at the
// exact time even if the app is CLOSED, offline, or in battery saver — like a bus-booking
// or Google reminder. Call syncLiveAlarms() for a logged-in student on boot / resume /
// when the live-class list changes; clearLiveAlarms() on logout.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { apiClient } from './api';
import { useAuthStore } from './auth';

const LiveAlarm = registerPlugin('LiveAlarm');

const isAndroid = () => {
  try { return Capacitor.getPlatform() === 'android'; } catch { return false; }
};

let _syncing = false;

export async function checkAlarmPermissions() {
  if (!isAndroid()) return true;
  try {
    const res = await LiveAlarm.checkPermissions();
    return res.granted !== false;
  } catch { return true; }
}

export async function requestAlarmPermissions() {
  if (!isAndroid()) return;
  try { await LiveAlarm.requestPermissions(); } catch { /* ignore */ }
}

export async function syncLiveAlarms() {
  if (!isAndroid() || _syncing) return;
  const { role, user } = useAuthStore.getState();
  if (role !== 'student' || !user?.standard_id) return;
  _syncing = true;
  try {
    const data = await apiClient(`/live-classes?standard_id=${user.standard_id}`).catch(() => null);
    if (!Array.isArray(data)) return;
    const now = Date.now();
    const classes = data
      .filter(lc => lc.status === 'scheduled' && lc.scheduled_at)
      .map(lc => ({
        id: String(lc.id),
        title: lc.title || lc.class_name || 'Live class',
        subject: lc.class_name || '',
        startMillis: Date.parse(lc.scheduled_at),
      }))
      .filter(c => c.startMillis && c.startMillis > now);
    await LiveAlarm.schedule({ classes });
  } catch (e) {
    console.warn('[liveAlarms] sync failed', e);
  } finally {
    _syncing = false;
  }
}

export async function clearLiveAlarms() {
  if (!isAndroid()) return;
  try { await LiveAlarm.cancelAll(); } catch { /* ignore */ }
}
