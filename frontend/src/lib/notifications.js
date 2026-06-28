import { create } from 'zustand';
import { notificationApi } from './api';

let syncStarted = false;
let cleanupSync = null;
let inFlight = null;
let generation = 0;

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
  useNotificationStore.getState().reset();
}
