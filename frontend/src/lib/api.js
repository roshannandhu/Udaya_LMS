const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const port = '8001';
const API_BASE = hostname === 'localhost' || hostname === '127.0.0.1'
  ? (import.meta.env.VITE_API_URL || `http://localhost:${port}/api`)
  : `http://${hostname}:${port}/api`;
const TOKEN_KEY    = 'tutoria_token';
const REFRESH_KEY  = 'tutoria_refresh_token';

// In-memory GET cache — 60s TTL; busted on any mutation
const _cache = new Map();
const CACHE_TTL = 60_000;
// These endpoints change too frequently to cache
const NO_CACHE = ['/student/tests/history', '/notifications', '/auth/me', '/live-classes'];

// Refresh the access token using the stored refresh token.
// Uses a shared promise so concurrent 401 responses all wait for the same refresh
// instead of the second one immediately triggering logout.
// Returns true (success), false (server rejected token), or throws on network error.
let _refreshPromise = null;
async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise;
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;

  _refreshPromise = (async () => {
    // Network errors are intentionally NOT caught here — they propagate to
    // apiClient which treats them differently from a genuine "token rejected" response.
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return false; // Auth server explicitly rejected the refresh token
    const data = await res.json();
    localStorage.setItem(TOKEN_KEY, data.token);
    if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
    return true;
  })();

  // Clear shared promise on completion or error
  return _refreshPromise.finally(() => { _refreshPromise = null; });
}

export async function apiClient(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const isGet = !options.method || options.method === 'GET';

  if (isGet && !NO_CACHE.some(p => endpoint.startsWith(p))) {
    const hit = _cache.get(endpoint);
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  // On 401, try to refresh the token once, then retry
  if (response.status === 401 && !options._retry) {
    let refreshed = false;
    try {
      refreshed = await tryRefreshToken();
    } catch {
      // Network error while refreshing (backend temporarily down).
      // Do NOT logout — the token itself may still be valid.
      // The request fails gracefully; the user stays logged in.
      throw new Error('Connection error. Please check your internet connection.');
    }
    if (refreshed) {
      return apiClient(endpoint, { ...options, _retry: true });
    }
    // refresh returned false → auth server explicitly rejected the refresh token
    // → session is genuinely expired → force logout
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem('tutoria_user_role');
    localStorage.removeItem('tutoria_user_name');
    _cache.clear();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }
    throw new Error('Session expired. Please log in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  const data = await response.json();

  if (isGet && !NO_CACHE.some(p => endpoint.startsWith(p))) {
    _cache.set(endpoint, { ts: Date.now(), data });
  } else if (!isGet) {
    _cache.clear();
  }

  return data;
}

export function getApiBaseUrl() {
  return API_BASE;
}

export function getApiToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function useApi() {
  return apiClient;
}

export const attendanceApi = {
  // Get single-day attendance list for a subject
  getSubjectAttendance: (subjectId, date) =>
    apiClient(`/subjects/${subjectId}/attendance${date ? `?date=${date}` : ''}`),

  // POST to mark/update attendance for a day
  markSubjectAttendance: (subjectId, data) =>
    apiClient(`/subjects/${subjectId}/attendance`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // DELETE a single record (clear / undo a marking)
  clearAttendanceRecord: (subjectId, studentId, date) =>
    apiClient(`/subjects/${subjectId}/attendance/${studentId}/${date}`, {
      method: 'DELETE',
    }),

  // GET full week view (Mon-Sun)
  getSubjectAttendanceWeek: (subjectId, start) =>
    apiClient(`/subjects/${subjectId}/attendance/week?start=${start}`),

  // GET student's own attendance summary
  getStudentAttendance: (studentId) =>
    apiClient(`/students/${studentId}/attendance`),

  // GET students below threshold for a standard
  getLowAttendance: (standardId, pct = 75) =>
    apiClient(`/reports/attendance?standard_id=${standardId}&below_pct=${pct}`),

  // Download CSV export
  downloadExport: async (standardId) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(
      `${API_BASE}/reports/export/attendance?standard_id=${standardId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!response.ok) throw new Error('Export failed');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${standardId}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },
};

export const testApi = {
  createTestWithQuestions: (data) =>
    apiClient('/tests/with-questions', { method: 'POST', body: JSON.stringify(data) }),
  getTests: (classId) =>
    apiClient(`/tests${classId ? `?class_id=${classId}` : ''}`),
  getTestForTaking: (testId) =>
    apiClient(`/tests/${testId}/take`),
  getTestForEdit: (testId) =>
    apiClient(`/tests/${testId}/edit`),
  updateTestFull: (testId, data) =>
    apiClient(`/tests/${testId}/full`, { method: 'PUT', body: JSON.stringify(data) }),
  submitTest: (testId, data) =>
    apiClient(`/tests/${testId}/submit`, { method: 'POST', body: JSON.stringify(data) }),
  getTestResults: (testId) =>
    apiClient(`/tests/${testId}/results`),
  getStudentTestHistory: () =>
    apiClient('/student/tests/history'),
  deleteTest: (testId) =>
    apiClient(`/tests/${testId}`, { method: 'DELETE' }),
  getAttemptReview: (testId) =>
    apiClient(`/tests/${testId}/attempt-review`),
};

export const leaderboardApi = {
  get: (standardId) =>
    apiClient(`/leaderboard${standardId ? `?standard_id=${standardId}` : ''}`),
  getLeaderboard: (classId) =>
    apiClient(`/leaderboard?class_id=${classId}`),
};

export const broadcastApi = {
  markRead: (broadcastIds) =>
    apiClient('/broadcast-reads', { method: 'POST', body: JSON.stringify({ broadcast_ids: broadcastIds }) }),
  getReadCounts: (standardId) =>
    apiClient(`/broadcasts/reads?standard_id=${standardId}`),
};

export const notificationApi = {
  getAll: () =>
    apiClient('/notifications'),
  markRead: (id) =>
    apiClient(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    apiClient('/notifications/read-all', { method: 'POST' }),
};

export const videoApi = {
  getVideos: (classId) =>
    apiClient(`/videos?class_id=${classId}`),
  markComplete: (videoId) =>
    apiClient(`/videos/${videoId}/complete`, { method: 'POST' }),
  getViewers: (videoId) =>
    apiClient(`/videos/${videoId}/viewers`),
  createYouTube: (data) =>
    apiClient('/videos/youtube', { method: 'POST', body: JSON.stringify(data) }),
  getToken: (videoId) =>
    apiClient(`/videos/${videoId}/token`),
  getThumbnail: (videoId) =>
    apiClient(`/videos/${videoId}/thumbnail`),
};

export const liveClassApi = {
  getByClass:    (classId)      => apiClient(`/live-classes?class_id=${classId}`),
  create:        (data)         => apiClient('/live-classes', { method: 'POST', body: JSON.stringify(data) }),
  getJoinToken:  (liveClassId)  => apiClient(`/live-classes/${liveClassId}/join-token`),
  end:           (liveClassId)  => apiClient(`/live-classes/${liveClassId}/end`, { method: 'POST' }),
  cancel:        (liveClassId)  => apiClient(`/live-classes/${liveClassId}/cancel`, { method: 'POST' }),
  getAttendance: (liveClassId)  => apiClient(`/live-classes/${liveClassId}/attendance`),
};

export const teacherApi = {
  list:   ()    => apiClient('/teachers'),
  create: (data) => apiClient('/teachers', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id)  => apiClient(`/teachers/${id}`, { method: 'DELETE' }),
};

export const reportApi = {
  // Teacher fetches a specific student's report
  getV2: (studentId, period = 'overall') =>
    apiClient(`/students/${studentId}/report/v2?period=${period}`),
  // Student fetches their own report (uses 'me' alias resolved server-side)
  getMy: (period = 'overall') =>
    apiClient(`/students/me/report/v2?period=${period}`),
};