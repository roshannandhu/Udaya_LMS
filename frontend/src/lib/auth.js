import { create } from 'zustand';
import { getApiBaseUrl, apiClient, clearApiCache } from './api';
import { enableScreenSecurity, disableScreenSecurity } from './secureScreen';
import { useSettingsStore, useAppCache, useWhatsNew } from '../store';

const API_BASE         = getApiBaseUrl();
const ROLE_KEY         = 'udaya_user_role';
const TOKEN_KEY        = 'udaya_token';
const REFRESH_KEY      = 'udaya_refresh_token';
const NAME_KEY         = 'udaya_user_name';
const TEACHER_TYPE_KEY = 'udaya_teacher_type';

const generateDeviceFingerprint = () => {
  const stored = localStorage.getItem('udaya_device_id');
  if (stored) return stored;
  // Unique per browser install — a random token, NOT derived from device specs, so two
  // identical phones never produce the same id (which would silently defeat single-device
  // enforcement). Existing installs keep their stored id, so no one is logged out.
  const id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  localStorage.setItem('udaya_device_id', id);
  return id;
};

export const ROLES = {
  TEACHER: 'teacher',
  STUDENT: 'student'
};

// ── Instant hydration from localStorage ─────────────────────────
const _storedToken       = localStorage.getItem(TOKEN_KEY);
const _storedRole        = localStorage.getItem(ROLE_KEY);
const _storedName        = localStorage.getItem(NAME_KEY);
const _storedTeacherType = localStorage.getItem(TEACHER_TYPE_KEY);
const _hasSession        = !!_storedToken && !!_storedRole;

export const useAuthStore = create((set, get) => ({
  // If we have a saved session, show the app immediately (isLoading: false)
  // verifyWithBackend() will confirm/reject silently in the background
  user: _hasSession ? { name: _storedName, role: _storedRole, teacher_type: _storedTeacherType || undefined } : null,
  role: _hasSession ? _storedRole : null,
  isLoading: !_hasSession,   // false if already logged in, true only on first visit
  deviceFingerprint: generateDeviceFingerprint(),

  login: async (identifier, password) => {
    try {
      const fp = get().deviceFingerprint;
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_or_username: identifier, password, device_fingerprint: fp })
      });

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.detail || 'Invalid credentials' };
      }

      // Two-step verification (teachers on new devices): no tokens yet —
      // the LoginPage shows the OTP step and calls verifyOtp() to finish.
      if (data.requires_otp) {
        return {
          success: true,
          requiresOTP: true,
          pendingId: data.pending_id,
          emailMasked: data.email_masked,
        };
      }

      return get().completeLogin(data);

    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  },

  // Shared tail of every successful auth (normal login + OTP verification):
  // persist tokens, reset per-account caches, set screen security, hydrate settings.
  completeLogin: (data) => {
    localStorage.setItem(TOKEN_KEY, data.token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    localStorage.setItem(ROLE_KEY, data.user.role);
    localStorage.setItem(NAME_KEY, data.user.name || '');
    if (data.user.teacher_type) localStorage.setItem(TEACHER_TYPE_KEY, data.user.teacher_type);
    else localStorage.removeItem(TEACHER_TYPE_KEY);

    useAuthStore.setState({
      user: data.user,
      role: data.user.role,
      isLoading: false
    });

    // Fresh account → drop any data cached under a previously logged-in account
    // (both caches are keyed by endpoint, not token, so they'd otherwise bleed
    // across accounts — e.g. showing the wrong teacher's standards/live classes).
    clearApiCache();
    useAppCache.getState().reset();
    useWhatsNew.getState().reset();

    // Native app: lock screen capture for students, keep open for teachers
    if (data.user.role === 'student') {
      enableScreenSecurity();
    } else {
      disableScreenSecurity();
      // Pull server-stored settings (branding, default password, PIN, etc.)
      useSettingsStore.getState().hydrateFromServer();
    }

    const needsPwdChange = data.user.role === 'student' && data.user.must_change_pwd;
    return { success: true, role: data.user.role, requiresPasswordChange: needsPwdChange };
  },

  verifyOtp: async (pendingId, code) => {
    try {
      const response = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_id: pendingId,
          code,
          device_fingerprint: get().deviceFingerprint,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data.detail || 'Verification failed' };
      }
      return get().completeLogin(data);
    } catch (error) {
      return { success: false, error: error.message || 'Verification failed' };
    }
  },

  resendOtp: async (pendingId) => {
    try {
      const response = await fetch(`${API_BASE}/auth/resend-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pending_id: pendingId }),
      });
      const data = await response.json();
      if (!response.ok) return { success: false, error: data.detail || 'Could not resend code' };
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message || 'Could not resend code' };
    }
  },

  verifyWithBackend: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isLoading: false });
      return;
    }

    // apiClient auto-refreshes on 401 using the stored refresh_token.
    // If refresh fails it dispatches 'auth:logout' (handled below).
    // If the backend is unreachable (network error), we keep the cached session alive.
    try {
      const user = await apiClient('/auth/me');
      localStorage.setItem(ROLE_KEY, user.role || 'student');
      localStorage.setItem(NAME_KEY, user.name || '');
      if (user.teacher_type) localStorage.setItem(TEACHER_TYPE_KEY, user.teacher_type);
      else localStorage.removeItem(TEACHER_TYPE_KEY);
      set({ user, role: user.role || 'student', isLoading: false });
      // Re-assert screen capture lock on EVERY app boot — not just fresh login.
      // Students reopen the app with a saved session (this path), where FLAG_SECURE
      // was never being set, so screenshots were unblocked after the first launch.
      if ((user.role || 'student') === 'student') {
        enableScreenSecurity();
      } else {
        disableScreenSecurity();
        // Refresh server-stored settings for teachers on every app boot
        useSettingsStore.getState().hydrateFromServer();
      }
    } catch (error) {
      if (error.message === 'Session expired. Please log in again.') {
        // auth:logout event has already cleared localStorage + state
        set({ isLoading: false });
      } else {
        // Network failure or connection error — keep cached session alive.
        // The user stays logged in; the next successful request will work normally.
        console.warn('Auth verify failed (keeping cached session):', error.message);
        set({ isLoading: false });
      }
    }
  },

  changePassword: async (newPassword) => {
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const response = await fetch(`${API_BASE}/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: newPassword })
      });

      if (!response.ok) {
        const data = await response.json();
        return { success: false, error: data.detail || 'Failed to change password' };
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  setUser: (user, role) => {
    localStorage.setItem(ROLE_KEY, role || '');
    set({ user, role, isLoading: false });
  },

  setLoading: (isLoading) => set({ isLoading }),

  clearAuth: async () => {
    // Remove this device's push token first (needs the still-valid auth token) so a
    // shared phone stops receiving pushes for the user who just logged out.
    try { await (await import('./push')).unregisterPush(); } catch (e) {}
    // Cancel any scheduled on-device live-class alarms for this user.
    try { await (await import('./liveAlarms')).clearLiveAlarms(); } catch (e) {}
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch (e) {}

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(TEACHER_TYPE_KEY);
    clearApiCache();
    useAppCache.getState().reset();
    useWhatsNew.getState().reset();
    disableScreenSecurity(); // always unlock on logout
    set({ user: null, role: null, isLoading: false });
  },

  getStoredRole: () => localStorage.getItem(ROLE_KEY) || null,
  getStoredName: () => localStorage.getItem(NAME_KEY) || null,

  getToken: () => localStorage.getItem(TOKEN_KEY) || null,

  enforceSingleDevice: async (userId) => {
    const fp = get().deviceFingerprint;
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return { allowed: false, message: 'Not authenticated.' };
    try {
      const response = await fetch(`${API_BASE}/auth/verify-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ device_fingerprint: fp })
      });
      if (!response.ok) return { allowed: true }; // fail open on network error
      const data = await response.json();
      if (!data.allowed) {
        const message = 'You were logged out because your account was opened on another device.';
        // Stash a reason so the login screen can explain what happened (cleared after shown).
        try { localStorage.setItem('udaya_logout_reason', message); } catch {}
        get().clearAuth();
        return { allowed: false, message };
      }
      return { allowed: true };
    } catch {
      return { allowed: true }; // fail open
    }
  }
}));

// Force-logout when apiClient gets a 401 and refresh fails
if (typeof window !== 'undefined') {
  window.addEventListener('auth:logout', () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(TEACHER_TYPE_KEY);
    clearApiCache();
    useAppCache.getState().reset();
    useWhatsNew.getState().reset();
    useAuthStore.setState({ user: null, role: null, isLoading: false });
  });
}