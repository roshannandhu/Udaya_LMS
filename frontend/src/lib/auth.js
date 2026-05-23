import { create } from 'zustand';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
const ROLE_KEY = 'tutoria_user_role';
const TOKEN_KEY = 'tutoria_token';
const NAME_KEY = 'tutoria_user_name';

const generateDeviceFingerprint = () => {
  const stored = localStorage.getItem('tutoria_device_id');
  if (stored) return stored;
  const fp = `${navigator.userAgent}-${screen.width}x${screen.height}-${new Date().getTimezoneOffset()}`;
  const hash = btoa(fp).slice(0, 32);
  localStorage.setItem('tutoria_device_id', hash);
  return hash;
};

export const ROLES = {
  TEACHER: 'teacher',
  STUDENT: 'student'
};

// ── Instant hydration from localStorage ─────────────────────────
const _storedToken = localStorage.getItem(TOKEN_KEY);
const _storedRole  = localStorage.getItem(ROLE_KEY);
const _storedName  = localStorage.getItem(NAME_KEY);
const _hasSession  = !!_storedToken && !!_storedRole;

export const useAuthStore = create((set, get) => ({
  // If we have a saved session, show the app immediately (isLoading: false)
  // verifyWithBackend() will confirm/reject silently in the background
  user: _hasSession ? { name: _storedName, role: _storedRole } : null,
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

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ROLE_KEY, data.user.role);
      localStorage.setItem(NAME_KEY, data.user.name || '');

      set({
        user: data.user,
        role: data.user.role,
        isLoading: false
      });

      const needsPwdChange = data.user.role === 'student' && data.user.must_change_pwd;
      return { success: true, role: data.user.role, requiresPasswordChange: needsPwdChange };

    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message || 'Login failed' };
    }
  },

  verifyWithBackend: async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      set({ isLoading: false });
      return;
    }

    // Already rendered with cached credentials — verify quietly in background
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        const user = await response.json();
        localStorage.setItem(ROLE_KEY, user.role || 'student');
        localStorage.setItem(NAME_KEY, user.name || '');
        // Update store with fresh server data, keep isLoading false
        set({ user, role: user.role || 'student', isLoading: false });
      } else {
        // Token expired/invalid — clear and redirect to login
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(ROLE_KEY);
        localStorage.removeItem(NAME_KEY);
        set({ user: null, role: null, isLoading: false });
      }
    } catch (error) {
      // Network failure — keep the cached session alive, just mark loading done
      console.warn('Auth verify failed (network?), keeping cached session:', error.message);
      set({ isLoading: false });
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
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
    } catch (e) {}

    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    localStorage.removeItem(NAME_KEY);
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
        get().clearAuth();
        return { allowed: false, message: 'This account is active on another device. You have been logged out.' };
      }
      return { allowed: true };
    } catch {
      return { allowed: true }; // fail open
    }
  }
}));