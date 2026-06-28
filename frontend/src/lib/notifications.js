import { create } from 'zustand';
import { notificationApi } from './api';

let syncStarted = false;
let cleanupSync = null;
let inFlight = null;
let generation = 0;
// Newest notification timestamp we've already seen — lets the poll detect a
// genuinely NEW notification and broadcast an app-wide "something changed, refetch"
// signal. Uses created_at (orderable) rather than the UUID id (non-monotonic), and
// max-across-all so it's robust to list ordering.
let lastSeenNotifTs = null;

// Most server mutations a student/teacher cares about emit a notification
// (new_test, reattempt_approved, new_assignment, …). When the 30s poll (or a push /
// focus refresh) surfaces a notification newer than any we've seen, fire a single
// shared event so open data pages can refetch themselves. Separate name from
// 'udaya:notifications-refresh' (which this module LISTENS to) so there's no loop;
// fires only on a strictly-newer notification, so it can't storm.
function broadcastIfChanged(notifications) {
  try {
    if (!Array.isArray(notifications) || !notifications.length) return;
    const newest = notifications.reduce((max, n) => {
      const t = Date.parse(n?.created_at || 0);
      return Number.isFinite(t) && t > max ? t : max;
    }, 0);
    if (!newest) return;
    // First successful load just seeds the baseline — don't fire on initial mount.
    if (lastSeenNotifTs === null) { lastSeenNotifTs = newest; return; }
    if (newest > lastSeenNotifTs) {
      lastSeenNotifTs = newest;
      window.dispatchEvent(new CustomEvent('udaya:data-changed'));
    }
  } catch { /* ignore */ }
}

export const useNotificationStore = create((set, get) => ({
  notifications: [],
  loading: false,
  error: null,

  fetch: async () => {
    if (!localStorage.getItem('tutoria_token')) {
      set({ notifications: [], loading: false, error: null });
      return [];
    }
    if (inFlight) return inFlight;

    const requestGeneration = generation;
    set({ loading: true });
    const request = notificationApi.getAll()
      .then((data) => {
        const notifications = Array.isArray(data) ? data : [];
        if (requestGeneration === generation) {
          set({ notifications, loading: false, error: null });
          broadcastIfChanged(notifications);
        }
        return notifications;
      })
      .catch((error) => {
        if (requestGeneration === generation) {
          set({ loading: false, error: error?.message || 'Could not load notifications' });
        }
        throw error;
      })
      .finally(() => { if (inFlight === request) inFlight = null; });

    inFlight = request;
    return request;
  },

  markRead: async (id) => {
    const before = get().notifications;
    set({ notifications: before.map(n => n.id === id ? { ...n, read: true } : n) });
    try {
      await notificationApi.markRead(id);
    } catch (error) {
      set({ notifications: before, error: error?.message || 'Could not update notification' });
      throw error;
    }
  },

  markAllRead: async () => {
    const before = get().notifications;
    set({ notifications: before.map(n => ({ ...n, read: true })) });
    try {
      await notificationApi.markAllRead();
    } catch (error) {
      set({ notifications: before, error: error?.message || 'Could not update notifications' });
      throw error;
    }
  },

  reset: () => set({ notifications: [], loading: false, error: null }),
}));

export function startNotificationSync() {
  if (syncStarted || typeof window === 'undefined') return;
  syncStarted = true;

  const refresh = () => {
    if (document.visibilityState === 'visible') {
      useNotificationStore.getState().fetch().catch(() => {});
    }
  };
  const onVisibility = () => refresh();

  refresh();
  window.addEventListener('focus', refresh);
  window.addEventListener('udaya:notifications-refresh', refresh);
  document.addEventListener('visibilitychange', onVisibility);
  const interval = window.setInterval(refresh, 30000);

  cleanupSync = () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', refresh);
    window.removeEventListener('udaya:notifications-refresh', refresh);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function stopNotificationSync() {
  cleanupSync?.();
  cleanupSync = null;
  syncStarted = false;
  generation += 1;
  inFlight = null;
  lastSeenNotifTs = null; // new account starts with a fresh baseline
  useNotificationStore.getState().reset();
}
