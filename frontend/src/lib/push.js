// Push notifications (Android only) via @capacitor/push-notifications + FCM.
//
// Lifecycle: call initPush() once the user is authenticated on a native Android
// device, and unregisterPush() on logout. All entry points are guarded so they're
// safe no-ops on web/iOS or when the plugin isn't present.
//
// The live-class full-screen ALARM is built natively (UdayaMessagingService) from a
// data-only message — it never reaches this JS layer when the app is closed. Here we
// only: register the FCM token, refresh the in-app bell on a foreground message, and
// route taps to the right screen.

import { Capacitor } from '@capacitor/core';
import { deviceApi } from './api';

const LAST_TOKEN_KEY = 'udaya_fcm_token';
let _initialized = false;
let _handles = [];

const isAndroid = () => {
  try { return Capacitor.getPlatform() === 'android'; } catch { return false; }
};

// Short two-tone "ding" via Web Audio — no bundled asset. Used when a push arrives
// while the app is in the foreground (the OS stays silent for foreground pushes).
function playDing() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const now = ac.currentTime;
    [[880, 0], [1175, 0.13]].forEach(([freq, at]) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + at);
      gain.gain.exponentialRampToValueAtTime(0.3, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + 0.18);
      osc.connect(gain).connect(ac.destination);
      osc.start(now + at);
      osc.stop(now + at + 0.2);
    });
    setTimeout(() => { try { ac.close(); } catch { /* ignore */ } }, 600);
  } catch { /* ignore */ }
}

// Map a notification's data payload to an in-app route. Best-effort; falls back to
// the role home. push.js runs outside the Router, so we navigate via the URL.
function routeForData(data = {}) {
  const kind = data.kind || data.type || '';
  const classId = data.class_id;
  if (kind === 'live_class_reminder' || kind === 'new_live_class') return '/student/live-classes';
  if (kind === 'broadcast') return '/student/broadcasts';
  if (kind === 'new_test' || kind === 'reattempt_approved' || kind === 'reattempt_rejected') return '/student/tests';
  if (kind === 'new_video' || kind === 'video_reply') return classId ? `/student/subjects/${classId}` : '/student';
  if (kind === 'new_note' || kind === 'new_assignment' || kind.startsWith('assignment_')) return classId ? `/student/subjects/${classId}` : '/student';
  if (classId) return `/student/subjects/${classId}`;
  return null;
}

function navigateTo(path) {
  if (!path) return;
  try {
    if (window.location.pathname !== path) window.location.assign(path);
  } catch { /* ignore */ }
}

async function syncToken(token) {
  if (!token) return;
  try {
    await deviceApi.register(token, 'android');
    localStorage.setItem(LAST_TOKEN_KEY, token);
  } catch { /* best-effort; will retry next launch */ }
}

export async function initPush() {
  if (_initialized || !isAndroid()) return;
  _initialized = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    // Android 13+ prompts; older versions grant implicitly.
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
      perm = await PushNotifications.requestPermissions();
    }
    if (perm.receive !== 'granted') { _initialized = false; return; }

    _handles.push(await PushNotifications.addListener('registration', (t) => syncToken(t?.value)));
    _handles.push(await PushNotifications.addListener('registrationError', (e) =>
      console.warn('[push] registration error', e)));

    // Foreground message → the OS shows nothing for foreground pushes, so make it
    // audible in-app (a short ding) and refresh the bell. Background/closed messages
    // are shown + sounded by the OS via the udaya_messages channel.
    _handles.push(await PushNotifications.addListener('pushNotificationReceived', () => {
      playDing();
      try { window.dispatchEvent(new CustomEvent('udaya:notifications-refresh')); } catch { /* ignore */ }
    }));

    // Tap on a notification → deep-link to the relevant screen.
    _handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data = action?.notification?.data || {};
      navigateTo(routeForData(data));
    }));

    await PushNotifications.register();
  } catch (e) {
    console.warn('[push] init failed', e);
    _initialized = false;
  }
}

export async function unregisterPush() {
  if (!isAndroid()) return;
  const token = localStorage.getItem(LAST_TOKEN_KEY);
  try {
    for (const h of _handles) { try { await h.remove(); } catch { /* ignore */ } }
    _handles = [];
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.removeAllListeners();
    if (token) { try { await deviceApi.unregister(token); } catch { /* ignore */ } }
  } catch { /* ignore */ }
  localStorage.removeItem(LAST_TOKEN_KEY);
  _initialized = false;
}
