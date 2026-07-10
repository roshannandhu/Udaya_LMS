import { safeFileName } from './fileUtils';
import { xhrUpload } from './xhrUpload';

const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const port = '8001';
const envApiUrl = import.meta.env.VITE_API_URL;
const isBrowser = typeof window !== 'undefined';
const isLocalhostEnv = envApiUrl && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i.test(envApiUrl);
const isLocalhostPage = ['localhost', '127.0.0.1', '::1'].includes(hostname);
const productionApiByHost = {
  'udaya-learn.com': 'https://api.udaya-learn.com/api',
  'www.udaya-learn.com': 'https://api.udaya-learn.com/api',
};
const productionApiUrl = isBrowser ? productionApiByHost[hostname] : null;
const API_BASE = (
  productionApiUrl
    ? productionApiUrl
    : (
      envApiUrl && (!isBrowser || isLocalhostPage || !isLocalhostEnv)
        ? envApiUrl
        : `http://${hostname}:${port}/api`
    )
).replace(/\/$/, '');
const TOKEN_KEY    = 'tutoria_token';
const REFRESH_KEY  = 'tutoria_refresh_token';

// In-memory GET cache — 120s TTL; busted on any mutation. Lets quick revisits to a
// page render instantly from cache instead of re-showing a loading skeleton.
const _cache = new Map();
const CACHE_TTL = 120_000;
// These endpoints change too frequently to cache (must always be fresh).
// '/broadcasts/' covers read-receipt counts, read details, and reactions — all of
// which update live over WebSocket and must NOT be served from the stale GET cache
// (otherwise the teacher's read tick won't turn blue until a manual refresh).
// Reattempt status must be fresh: the teacher approves on a DIFFERENT device, so
// the student's cache is never busted by that mutation — a stale 'pending' would
// keep the exam card showing "Request re-attempt" after it was already approved.
const NO_CACHE = ['/notifications', '/auth/me', '/live-classes', '/broadcasts/',
  '/student/reattempt-requests', '/student/assignment-reattempt-requests',
  '/reattempt-requests', '/assignment-reattempt-requests',
  '/whatsapp/status', '/teacher/whatsapp/connection', '/teacher/whatsapp/stats'];

// Clear the in-memory GET cache. Called on login/logout so one account never sees
// another account's cached /standards, /subjects, /students responses (the cache is
// keyed by endpoint only, not by the auth token).
export function clearApiCache() {
  _cache.clear();
}

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

  // `fresh: true` skips the read cache (used by event-driven auto-refresh so a
  // refetch within the 120s TTL still returns live data); the response is still cached.
  const cacheable = isGet && !options.fresh && !NO_CACHE.some(p => endpoint.startsWith(p));
  if (cacheable) {
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
      throw new Error('Connection error. Please check your internet connection.');
    }
    if (refreshed) {
      const retryRes = await apiClient(endpoint, { ...options, _retry: true });
      return retryRes;
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
  } else if (response.status === 401 && options._retry) {
    // If the retried request ALSO returns 401, force logout immediately.
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
  // Re-attempt request flow
  requestReattempt: (testId, reason) =>
    apiClient(`/tests/${testId}/reattempt-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getMyReattemptRequests: () =>
    apiClient('/student/reattempt-requests'),
  getReattemptRequests: (testId) =>
    apiClient(`/reattempt-requests${testId ? `?test_id=${testId}` : ''}`),
  approveReattempt: (id) =>
    apiClient(`/reattempt-requests/${id}/approve`, { method: 'PATCH' }),
  rejectReattempt: (id) =>
    apiClient(`/reattempt-requests/${id}/reject`, { method: 'PATCH' }),
  generateFromPdf: async (file, numQuestions = 10, subjectHint = '') => {
    const token = localStorage.getItem(TOKEN_KEY);
    const form = new FormData();
    form.append('file', file);
    form.append('num_questions', String(numQuestions));
    form.append('subject_hint', subjectHint);
    const res = await fetch(`${API_BASE}/tests/generate-from-pdf`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Generation failed');
    }
    return res.json();
  },
  regenerateFlagged: async (sessionId, flaggedQuestions, goodStems, subjectHint = '') => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/tests/regenerate-flagged`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id:   sessionId,
        flagged:      flaggedQuestions,
        good_stems:   goodStems,
        subject_hint: subjectHint,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || 'Regeneration failed');
    }
    return res.json();
  },
};

export const leaderboardApi = {
  get: (standardId, period = 'overall') => {
    const params = new URLSearchParams();
    if (standardId) params.set('standard_id', standardId);
    if (period && period !== 'overall') params.set('period', period);
    const qs = params.toString();
    return apiClient(`/leaderboard${qs ? `?${qs}` : ''}`);
  },
  getLeaderboard: (classId) =>
    apiClient(`/leaderboard?class_id=${classId}`),
};

// Bulk student management (teacher Manage-Excel grid). Each maps to a
// teacher-only backend endpoint that operates on many ids in one request.
export const studentApi = {
  bulkDelete: (ids) =>
    apiClient('/students/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  bulkMove: (ids, standard_id) =>
    apiClient('/students/bulk-move', { method: 'POST', body: JSON.stringify({ ids, standard_id }) }),
  bulkBlock: (ids, blocked) =>
    apiClient('/students/bulk-block', { method: 'POST', body: JSON.stringify({ ids, blocked }) }),
  bulkResetPassword: (ids, new_password = null) =>
    apiClient('/students/bulk-reset-password', { method: 'POST', body: JSON.stringify({ ids, new_password }) }),
};

export const broadcastApi = {
  markRead: (broadcastIds) =>
    apiClient('/broadcast-reads', { method: 'POST', body: JSON.stringify({ broadcast_ids: broadcastIds }) }),
  getReadCounts: (standardId) =>
    apiClient(`/broadcasts/reads?standard_id=${standardId}`),
  getReadDetails: (broadcastId) =>
    apiClient(`/broadcasts/${broadcastId}/reads/details`),
  getTTL: (standardId) =>
    apiClient(`/standards/${standardId}/broadcast-ttl`),
  setTTL: (standardId, ttlHours) =>
    apiClient(`/standards/${standardId}/broadcast-ttl`, { method: 'PATCH', body: JSON.stringify({ ttl_hours: ttlHours }) }),
  getReactions: (standardId) =>
    apiClient(`/broadcasts/reactions?standard_id=${standardId}`),
  addReaction: (broadcastId, emoji) =>
    apiClient(`/broadcasts/${broadcastId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  removeReaction: (broadcastId, emoji) =>
    apiClient(`/broadcasts/${broadcastId}/reactions/${encodeURIComponent(emoji)}`, { method: 'DELETE' }),
};

export const notesApi = {
  getByClass: (classId) =>
    apiClient(`/notes?class_id=${classId}`),
  create: (data) =>
    apiClient('/notes', { method: 'POST', body: JSON.stringify(data) }),
  update: (noteId, data) =>
    apiClient(`/notes/${noteId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (noteId) =>
    apiClient(`/notes/${noteId}`, { method: 'DELETE' }),
  uploadFile: async (file, classId) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file, safeFileName(file, 'upload'));
    formData.append('class_id', classId);
    const resData = await xhrUpload(`${API_BASE}/notes/upload`, formData, token);
    _cache.clear();
    return resData;
  },
};

// Fetch a protected file's bytes through the authed streaming endpoint (no public
// URL ever reaches the client). Returns { blob, type } — the caller renders it in
// the SecureFileViewer and revokes any object URL on close.
export async function fetchSecureBlob(endpoint) {
  const token = localStorage.getItem(TOKEN_KEY);
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  // Signal the native app so the backend can enforce app-only viewing for
  // students (protected files are blocked on student web). Set at boot in main.jsx.
  if (typeof window !== 'undefined' && window.__UDAYA_NATIVE__) headers['X-Udaya-Client'] = 'app';
  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, { headers });
  } catch {
    throw new Error('Network error — check your connection and try again.');
  }
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    const err = new Error(e.detail || `Failed to load file (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const blob = await res.blob();
  return { blob, type: blob.type || res.headers.get('content-type') || 'application/octet-stream' };
}

export const notificationApi = {
  getAll: () =>
    apiClient('/notifications'),
  markRead: (id) =>
    apiClient(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () =>
    apiClient('/notifications/read-all', { method: 'POST' }),
};

export const deviceApi = {
  register: (token, platform = 'android') =>
    apiClient('/devices/register', { method: 'POST', body: JSON.stringify({ token, platform }) }),
  unregister: (token) =>
    apiClient('/devices/register', { method: 'DELETE', body: JSON.stringify({ token }) }),
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
  // Private per-student comments. Student sees only their own; teacher sees all.
  getComments: (videoId) =>
    apiClient(`/videos/${videoId}/comments`),
  postComment: (videoId, text) =>
    apiClient(`/videos/${videoId}/comments`, { method: 'POST', body: JSON.stringify({ text }) }),
  replyComment: (commentId, text) =>
    apiClient(`/video-comments/${commentId}/reply`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  // Delete a comment. Student may delete only their own; teacher may delete any (server-enforced).
  deleteComment: (commentId) =>
    apiClient(`/video-comments/${commentId}`, { method: 'DELETE' }),
  // Likes. Student likes/unlikes a lesson; teacher sees the count (in the video list).
  likeVideo: (videoId) =>
    apiClient(`/videos/${videoId}/like`, { method: 'POST' }),
  unlikeVideo: (videoId) =>
    apiClient(`/videos/${videoId}/like`, { method: 'DELETE' }),
};

export const liveClassApi = {
  getByClass:    (classId)      => apiClient(`/live-classes?class_id=${classId}`),
  create:        (data)         => apiClient('/live-classes', { method: 'POST', body: JSON.stringify(data) }),
  getJoinToken:  (liveClassId)  => apiClient(`/live-classes/${liveClassId}/join-token`),
  getHostLink:   (liveClassId)  => apiClient(`/live-classes/${liveClassId}/host-link`),
  end:           (liveClassId)  => apiClient(`/live-classes/${liveClassId}/end`, { method: 'POST' }),
  cancel:        (liveClassId)  => apiClient(`/live-classes/${liveClassId}/cancel`, { method: 'POST' }),
  remove:        (liveClassId)  => apiClient(`/live-classes/${liveClassId}`, { method: 'DELETE' }),
  getAttendance: (liveClassId)  => apiClient(`/live-classes/${liveClassId}/attendance`),
};

export const teacherApi = {
  list:   ()    => apiClient('/teachers'),
  create: (data) => apiClient('/teachers', { method: 'POST', body: JSON.stringify(data) }),
  remove: (id)  => apiClient(`/teachers/${id}`, { method: 'DELETE' }),
  getSettings: () => apiClient('/teacher/settings'),
  updateSettings: (data) => apiClient('/teacher/settings', { method: 'POST', body: JSON.stringify(data) }),

  // Assign Student IDs. Default fills only students missing one (idempotent).
  // Pass force=true to regenerate EVERY student's ID into the current format
  // (this changes existing students' login IDs).
  backfillStudentCodes: (force = false) =>
    apiClient(`/admin/backfill-student-codes${force ? '?force=true' : ''}`, { method: 'POST' }),

  // Backups: trigger an immediate backup, and list recent backups (with presigned
  // download URLs). Auto-backup cadence is the `backup_frequency` setting.
  createBackup: () => apiClient('/admin/backup-now', { method: 'POST' }),
  listBackups: () => apiClient('/admin/backups'),

  // Universal auto-thumbnail base image (teacher's face + blank space on one side)
  getThumbnail: () => apiClient('/teacher/thumbnail'),
  uploadThumbnail: async ({ file, textSide }) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    if (file) {
      formData.append('file', file, safeFileName(file, 'thumb'));
    }
    formData.append('text_side', textSide || 'right');
    try {
      return await xhrUpload(`${API_BASE}/teacher/thumbnail`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to upload thumbnail');
    }
  },
  uploadProfilePhoto: async (file) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    if (file) {
      formData.append('file', file, safeFileName(file, 'photo'));
    }
    try {
      return await xhrUpload(`${API_BASE}/teacher/profile-photo`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to upload photo');
    }
  },
};

export const dashboardApi = {
  getStats:    () => apiClient('/dashboard/stats'),
  getActivity: () => apiClient('/dashboard/activity'),
  getOverview: () => apiClient('/dashboard/overview'),
  getInsights: () => apiClient('/dashboard/insights'),
};

export const joinRequestApi = {
  approve: (id) => apiClient(`/join-requests/${id}/approve`, { method: 'PATCH' }),
  reject:  (id) => apiClient(`/join-requests/${id}/reject`,  { method: 'PATCH' }),
};

export const reminderApi = {
  list:   ()      => apiClient('/reminders'),
  create: (data)  => apiClient('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, d) => apiClient(`/reminders/${id}`, { method: 'PATCH', body: JSON.stringify(d) }),
  remove: (id)    => apiClient(`/reminders/${id}`, { method: 'DELETE' }),
};

const clampPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
};

const dayNumber = (dateValue, fallback) => {
  const n = Number(String(dateValue || '').slice(8, 10));
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const shortLabel = (value, fallback) => {
  const s = String(value || fallback || '').trim();
  return s.length > 12 ? `${s.slice(0, 11)}...` : s;
};

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const sumBy = (items, key) => (items || []).reduce((sum, item) => sum + num(item?.[key]), 0);

const pctOf = (part, total) => {
  const t = num(total);
  return t > 0 ? clampPct((num(part) / t) * 100) : 0;
};

const dayLabel = (dateValue) => {
  const date = String(dateValue || '').slice(0, 10);
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date.slice(5) || '--';
  return parsed.toLocaleDateString(undefined, { weekday: 'short' });
};

const dateDetail = (dateValue) => {
  const date = String(dateValue || '').slice(0, 10);
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date.slice(5) || '--';
  return parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

const localDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const normalizeReportV2 = (report = {}) => {
  const student = report.student || {};
  const classAvg = clampPct(report.class_averages?.avg_score ?? student.avg_score);
  const timeline = [...(report.test_timeline || [])].sort((a, b) =>
    String(a.date || '').localeCompare(String(b.date || ''))
  );
  const recentTests = timeline.slice(-12);
  const trendData = recentTests.length
    ? recentTests.map((t, index) => ({
        name: shortLabel(t.test_title, `T${index + 1}`),
        studentScore: clampPct(t.score_pct),
        classScore: clampPct(t.class_avg_score_pct ?? classAvg),
      }))
    : [];

  const progressionByTest = {};
  recentTests.forEach((t, index) => {
    const key = `${t.date || index}:${t.test_title || index}`;
    progressionByTest[key] ||= { testName: shortLabel(t.test_title, `T${index + 1}`) };
    progressionByTest[key][t.subject || 'General'] = clampPct(t.score_pct);
  });

  const bySubject = (report.class_averages || {}).by_subject || {};
  const radarData = (report.subject_radar || []).map((r) => ({
    subject: r.subject || 'Subject',
    student: clampPct(r.test_count ? r.test_avg : (r.attendance_pct || r.video_pct || 0)),
    classAvg: clampPct(r.subject_id && bySubject[r.subject_id] != null ? bySubject[r.subject_id] : classAvg),
  }));

  const topicItems = report.topic_map || [];
  const polarData = topicItems.length
    ? topicItems.slice(0, 8).map((t) => ({ topic: t.topic || t.subject || 'Topic', score: clampPct(t.score_pct) }))
    : radarData.map((r) => ({ topic: r.subject, score: r.student }));

  const scatterData = recentTests
    .filter((t) => Number.isFinite(Number(t.time_minutes)))
    .map((t, index) => ({
      name: shortLabel(t.test_title, `T${index + 1}`),
      dateIndex: index + 1,
      score: clampPct(t.score_pct),
      time: Number(t.time_minutes),
    }));

  const rangeData = recentTests.slice(-6).map((t, index) => {
    const score = clampPct(t.score_pct);
    return {
      name: shortLabel(t.test_title, `T${index + 1}`),
      minScore: clampPct(t.class_min_score_pct ?? score),
      maxScore: clampPct(t.class_max_score_pct ?? score),
      classAvg: clampPct(t.class_avg_score_pct ?? classAvg),
      studentScore: score,
    };
  });

  const activityByDate = {};
  const bump = (date, count = 1) => {
    if (!date) return;
    const key = String(date).slice(0, 10);
    activityByDate[key] = (activityByDate[key] || 0) + count;
  };
  (report.attendance_heatmap || []).forEach((r) => bump(r.date, (r.present || 0) + (r.late || 0)));
  (report.video_heatmap || []).forEach((r) => bump(r.date, Math.ceil((r.minutes || 0) / 15)));
  (report.test_heatmap || []).forEach((r) => bump(r.date, r.count || 0));
  (report.assignment_heatmap || []).forEach((r) => bump(r.date, r.count || 0));
  const heatmapData = Object.entries(activityByDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-28)
    .map(([date, count]) => ({ date, count }));

  const videoByDate = Object.fromEntries((report.video_heatmap || []).map((r) => [String(r.date).slice(0, 10), r.minutes || 0]));
  const testsByDate = Object.fromEntries((report.test_heatmap || []).map((r) => [String(r.date).slice(0, 10), r.count || 0]));
  const assignmentsByDate = Object.fromEntries((report.assignment_heatmap || []).map((r) => [String(r.date).slice(0, 10), r.count || 0]));
  const overlapData = [...new Set([
    ...Object.keys(videoByDate),
    ...Object.keys(testsByDate),
    ...Object.keys(assignmentsByDate),
  ])].sort().slice(-7).map((date) => ({
    day: new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' }),
    videos: videoByDate[date] || 0,
    tests: testsByDate[date] || 0,
    notes: assignmentsByDate[date] || 0,
  }));

  const assignmentStats = report.assignment_stats || {};
  const assignmentSubmitted = Number(assignmentStats.submitted || 0);
  const assignmentTotal = Number(assignmentStats.total || 0);
  const assignmentData = [
    { name: 'Submitted', value: assignmentSubmitted, color: '#2563EB' },
    { name: 'Pending', value: Math.max(0, assignmentTotal - assignmentSubmitted), color: '#D97706' },
    { name: 'Overdue', value: Number(assignmentStats.overdue || 0), color: '#E11D48' },
  ];

  const totalVideoMinutes = Math.round(sumBy(report.video_heatmap, 'minutes'));
  const totalVideoSessions = sumBy(report.video_heatmap, 'count');
  const totalTests = timeline.length;
  const totalTestsAvailable = num(report.total_tests_in_standard);
  const liveAttended = num(report.live_classes_stats?.attended);
  const liveTotal = num(report.live_classes_stats?.total);
  const rawSubjects = report.subject_radar || [];
  const videosCompleted = sumBy(rawSubjects, 'video_done');
  const videosAvailable = sumBy(rawSubjects, 'video_total');
  const videoPercent = videosAvailable ? pctOf(videosCompleted, videosAvailable) : clampPct(totalVideoMinutes / 3);
  const testPercent = totalTestsAvailable ? pctOf(totalTests, totalTestsAvailable) : (totalTests ? 100 : 0);
  const assignmentPercent = assignmentTotal ? pctOf(assignmentSubmitted, assignmentTotal) : (assignmentSubmitted ? 100 : 0);
  const livePercent = liveTotal ? pctOf(liveAttended, liveTotal) : (liveAttended ? 100 : 0);
  const pendingAssignments = Math.max(0, assignmentTotal - assignmentSubmitted);
  const learningSignalData = [
    {
      key: 'videos',
      name: 'Concept videos',
      percent: videoPercent,
      valueText: videosAvailable ? `${videosCompleted}/${videosAvailable}` : `${totalVideoMinutes} min`,
      unitLabel: videosAvailable ? 'completed' : 'watched',
      caption: videosAvailable
        ? `${totalVideoMinutes} watched minutes across ${totalVideoSessions} session${totalVideoSessions === 1 ? '' : 's'}`
        : `${totalVideoSessions} video session${totalVideoSessions === 1 ? '' : 's'} tracked`,
      color: '#2563EB',
    },
    {
      key: 'tests',
      name: 'Tests attempted',
      percent: testPercent,
      valueText: totalTestsAvailable ? `${totalTests}/${totalTestsAvailable}` : `${totalTests}`,
      unitLabel: totalTestsAvailable ? 'attempted' : 'tests',
      caption: totalTestsAvailable ? 'Attempt rate from available exams in this standard' : 'Completed exam attempts in this period',
      color: '#7C3AED',
    },
    {
      key: 'assignments',
      name: 'Assignments submitted',
      percent: assignmentPercent,
      valueText: assignmentTotal ? `${assignmentSubmitted}/${assignmentTotal}` : `${assignmentSubmitted}`,
      unitLabel: assignmentTotal ? 'submitted' : 'submissions',
      caption: `${pendingAssignments} pending assignment${pendingAssignments === 1 ? '' : 's'}`,
      color: '#D97706',
    },
    {
      key: 'live',
      name: 'Live class attendance',
      percent: livePercent,
      valueText: liveTotal ? `${liveAttended}/${liveTotal}` : `${liveAttended}`,
      unitLabel: liveTotal ? 'attended' : 'classes',
      caption: liveTotal ? 'Live sessions attended from scheduled classes' : 'No scheduled live-class baseline yet',
      color: '#059669',
    },
  ];

  const sourceActivityDates = [...new Set([
    ...Object.keys(videoByDate),
    ...Object.keys(testsByDate),
    ...Object.keys(assignmentsByDate),
  ])].sort();
  const endActivityDate = sourceActivityDates.length
    ? new Date(`${sourceActivityDates[sourceActivityDates.length - 1]}T00:00:00`)
    : null;
  const activityDates = endActivityDate
    ? Array.from({ length: 7 }, (_, index) => {
        const d = new Date(endActivityDate);
        d.setDate(d.getDate() - (6 - index));
        return localDateKey(d);
      })
    : [];
  const activityFlowData = activityDates.map((date) => {
    const videoMinutes = num(videoByDate[date]);
    const tests = num(testsByDate[date]);
    const assignments = num(assignmentsByDate[date]);
    const studyScore = Math.min(100, Math.round(
      Math.min(videoMinutes / 45, 1) * 40 +
      Math.min(tests / 2, 1) * 35 +
      Math.min(assignments / 2, 1) * 25
    ));
    return {
      date,
      day: dayLabel(date),
      dayDetail: dateDetail(date),
      videoMinutes: Math.round(videoMinutes),
      tests,
      assignments,
      studyScore,
    };
  });

  const timeItems = totalVideoMinutes > 0
    ? [{ name: 'Video Minutes', value: totalVideoMinutes, color: '#2563EB' }]
    : [];
  const donutData = [
    ...timeItems.filter((item) => item.value > 0),
  ];

  const attendanceDays = (report.attendance_heatmap || []).map((r) => {
    const status = (r.absent || 0) > (r.present || 0) + (r.late || 0)
      ? 'absent'
      : (r.late || 0) > 0 ? 'late' : 'present';
    return { date: r.date, dayNumber: dayNumber(r.date, null), status, info: status };
  });

  const testDays = timeline.map((t) => ({
    date: t.date,
    dayNumber: dayNumber(t.date, null),
    hasTest: true,
    score: clampPct(t.score_pct),
    testName: t.test_title || 'Test',
  }));

  const bellBins = report.class_bell_bins && report.class_bell_bins.some((b) => b.count > 0)
    ? report.class_bell_bins
    : (() => {
        const bins = Array.from({ length: 11 }, (_, i) => ({ scoreBin: i * 10, count: 0 }));
        timeline.forEach((t) => {
          const bin = Math.max(0, Math.min(10, Math.floor(clampPct(t.score_pct) / 10)));
          bins[bin].count += 1;
        });
        return bins;
      })();

  return {
    ...report,
    student,
    trendData,
    progressionData: Object.values(progressionByTest),
    radarData,
    polarData,
    scatterData,
    rangeData,
    heatmapData,
    overlapData,
    donutData,
    treemapData: timeItems.filter((item) => item.value > 0).map((d) => ({ name: d.name, size: d.value })),
    learningSignalData,
    activityFlowData,
    attendanceDays,
    testDays,
    bumpData: [{ week: report.period || 'Overall', rank: report.rank || 0 }],
    assignmentData,
    bellData: bellBins,
    quadrantData: scatterData,
    activityData: recentTests.slice(-5).reverse().map((t) => ({
      time: String(t.date || '').slice(11, 16) || '--',
      title: `${t.test_title || 'Test'} - ${clampPct(t.score_pct)}%`,
      color: clampPct(t.score_pct) >= 70 ? 'bg-blue-600' : 'bg-amber-500',
    })),
  };
};

export const reportApi = {
  getSmartReport: async (studentId, period = 'overall') =>
    normalizeReportV2(await apiClient(`/students/${studentId}/report/v2?period=${period}`)),
  // Teacher fetches a specific student's report
  getV2: async (studentId, period = 'overall') =>
    normalizeReportV2(await apiClient(`/students/${studentId}/report/v2?period=${period}`)),
  // Student fetches their own report (uses 'me' alias resolved server-side)
  getMy: async (period = 'overall') =>
    normalizeReportV2(await apiClient(`/students/me/report/v2?period=${period}`)),
  // Teacher: per-student performance for a standard (or one subject within it)
  performance: ({ standardId, classId, period = 'overall' }) =>
    apiClient(`/reports/performance?standard_id=${standardId}${classId ? `&class_id=${classId}` : ''}&period=${period}`),
};

export const assignmentApi = {
  getByClass: (classId) => apiClient(`/assignments?class_id=${classId}`),

  create: async (formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      return await xhrUpload(`${API_BASE}/assignments/create`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to create assignment');
    }
  },

  update: (id, data) =>
    apiClient(`/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id) =>
    apiClient(`/assignments/${id}`, { method: 'DELETE' }),

  addAttachments: async (id, formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      return await xhrUpload(`${API_BASE}/assignments/${id}/attachments`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to add attachments');
    }
  },

  deleteAttachment: (id, attId) =>
    apiClient(`/assignments/${id}/attachments/${attId}`, { method: 'DELETE' }),

  getSubmissions: (id) => apiClient(`/assignments/${id}/submissions`),

  submit: async (id, formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    try {
      return await xhrUpload(`${API_BASE}/assignments/${id}/submit`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to submit assignment');
    }
  },

  grade: (id, subId, data) =>
    apiClient(`/assignments/${id}/submissions/${subId}/grade`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteSubmission: (assignmentId, submissionId) =>
    apiClient(`/assignments/${assignmentId}/submissions/${submissionId}`, { method: 'DELETE' }),

  deleteMySubmission: (assignmentId) =>
    apiClient(`/assignments/${assignmentId}/my-submission`, { method: 'DELETE' }),

  getAllMyAssignments: () => apiClient('/student/assignments'),

  // Re-attempt (re-do a GRADED assignment): request → teacher approves → grade
  // cleared → student retracts + resubmits via the normal flow.
  requestReattempt: (assignmentId, reason) =>
    apiClient(`/assignments/${assignmentId}/reattempt-request`, { method: 'POST', body: JSON.stringify({ reason }) }),
  getMyReattemptRequests: () => apiClient('/student/assignment-reattempt-requests'),
  getReattemptRequests: (assignmentId) =>
    apiClient(`/assignment-reattempt-requests${assignmentId ? `?assignment_id=${assignmentId}` : ''}`),
  approveReattempt: (id) =>
    apiClient(`/assignment-reattempt-requests/${id}/approve`, { method: 'PATCH' }),
  rejectReattempt: (id) =>
    apiClient(`/assignment-reattempt-requests/${id}/reject`, { method: 'PATCH' }),
};

export const aiApi = {
  generateInsights: (studentId, stats) =>
    apiClient('/insights/generate', { method: 'POST', body: JSON.stringify({ student_id: studentId, stats }) }),

  // Called by StudentReportCard — extracts student_id from report data object.
  generateStudentReport: async (data, period) => {
    const studentId = data?.student?.id;
    if (!studentId) throw new Error('Missing student ID');
    const res = await apiClient('/insights/generate', { method: 'POST', body: JSON.stringify({ student_id: studentId, stats: { period } }) });
    return { report: res.insights };
  },

  // Last generated analysis for this student+period — instant, no LLM call.
  getCachedInsights: (studentId, period = 'overall') =>
    apiClient(`/insights/cached/${studentId}?period=${period}`),

  // Remaining AI calls for today. { remaining, limit, unlimited }
  getTokens: () => apiClient('/insights/tokens'),

  // Streams coaching insights token-by-token. Calls onChunk(textDelta) as text
  // arrives; resolves when the stream closes. Throws on HTTP/stream errors.
  generateInsightsStream: async (studentId, stats, onChunk) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/insights/generate/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ student_id: studentId, stats }),
    });
    if (!res.ok || !res.body) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || `AI request failed (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are separated by a blank line
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';
      for (const evt of events) {
        const line = evt.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        let obj;
        try { obj = JSON.parse(payload); } catch { continue; }
        if (obj.error) throw new Error(obj.error);
        if (obj.text) onChunk(obj.text);
      }
    }
  },
};

export const whatsappApi = {
  // Config (secret key is returned masked; only sent back when changed)
  getConfig:    ()     => apiClient('/teacher/whatsapp/config'),
  setConfig:    (data) => apiClient('/teacher/whatsapp/config', { method: 'POST', body: JSON.stringify(data) }),

  // Connection. For Baileys this returns the live socket state + a `qr` data-URL
  // while pairing; enableBaileys switches the active provider to the QR transport.
  getConnection: () => apiClient('/teacher/whatsapp/connection'),
  enableBaileys: () => apiClient('/whatsapp/enable-baileys', { method: 'POST' }),
  disconnect:    () => apiClient('/teacher/whatsapp/disconnect', { method: 'POST' }),

  // Recipients grouped by class
  getRecipients: (standardIds) =>
    apiClient(`/teacher/whatsapp/recipients${standardIds && standardIds.length ? `?standard_ids=${standardIds.join(',')}` : ''}`),

  // Cost estimate + send
  estimate: (data) => apiClient('/teacher/whatsapp/estimate', { method: 'POST', body: JSON.stringify(data) }),
  send:     (data) => apiClient('/teacher/whatsapp/send',     { method: 'POST', body: JSON.stringify(data) }),

  // History + spend total
  getMessages: (limit = 100, status) =>
    apiClient(`/teacher/whatsapp/messages?limit=${limit}${status ? `&status=${status}` : ''}`),

  // Dashboard stats (KPIs, donut, month spend, recent, scheduled)
  getStats: () => apiClient('/teacher/whatsapp/stats'),

  // Chats (two-way parent threads: replies in, teacher messages out)
  getInbox:      ()     => apiClient('/teacher/whatsapp/inbox'),
  markInboxRead: (data) => apiClient('/teacher/whatsapp/inbox/mark-read', { method: 'POST', body: JSON.stringify(data || {}) }),
  replyInbox:    (data) => apiClient('/teacher/whatsapp/inbox/reply', { method: 'POST', body: JSON.stringify(data || {}) }),
  deleteMessage: (id)   => apiClient(`/teacher/whatsapp/inbox/message/${id}`, { method: 'DELETE' }),
  deleteChat:    (phone)=> apiClient(`/teacher/whatsapp/inbox/chat/${phone}`, { method: 'DELETE' }),

  // Variables (picker source of truth — auto vs ask)
  getVariables:    ()       => apiClient('/teacher/whatsapp/variables'),

  // Templates
  listTemplates:   ()       => apiClient('/teacher/whatsapp/templates'),
  createTemplate:  (data)   => apiClient('/teacher/whatsapp/templates', { method: 'POST', body: JSON.stringify(data) }),
  updateTemplate:  (id, data) => apiClient(`/teacher/whatsapp/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  submitTemplate:  (id)     => apiClient(`/teacher/whatsapp/templates/${id}/submit`, { method: 'POST' }),
  templateStatus:  (id)     => apiClient(`/teacher/whatsapp/templates/${id}/status`),
  deleteTemplate:  (id)     => apiClient(`/teacher/whatsapp/templates/${id}`, { method: 'DELETE' }),

  // Reports + criteria
  previewCriteria: (data) => apiClient('/teacher/whatsapp/preview-criteria', { method: 'POST', body: JSON.stringify(data) }),
  sendReports:     (data) => apiClient('/teacher/whatsapp/send-reports',     { method: 'POST', body: JSON.stringify(data) }),

  // Background batch send progress (large sends are queued server-side)
  getBatch: (batchId) => apiClient(`/teacher/whatsapp/batches/${batchId}`),

  // Pending Actions (auto-detected exam-result notifications)
  getPending:     ()       => apiClient('/teacher/whatsapp/pending'),
  dismissPending: (testId) => apiClient('/teacher/whatsapp/pending/dismiss', { method: 'POST', body: JSON.stringify({ test_id: testId }) }),

  // Onboarding
  sendWelcome: (data) => apiClient('/teacher/whatsapp/send-welcome', { method: 'POST', body: JSON.stringify(data) }),

  // Automation jobs
  listJobs:  ()         => apiClient('/teacher/whatsapp/jobs'),
  createJob: (data)     => apiClient('/teacher/whatsapp/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id, data) => apiClient(`/teacher/whatsapp/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id)       => apiClient(`/teacher/whatsapp/jobs/${id}`, { method: 'DELETE' }),
  toggleJob: (id)       => apiClient(`/teacher/whatsapp/jobs/${id}/toggle`, { method: 'POST' }),
  runJobNow: (id)       => apiClient(`/teacher/whatsapp/jobs/${id}/run-now`, { method: 'POST' }),

  // Media upload (FormData)
  uploadMedia: async (file) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    formData.append('file', file, safeFileName(file, 'media'));
    try {
      return await xhrUpload(`${API_BASE}/teacher/whatsapp/upload-media`, formData, token);
    } catch (e) {
      throw new Error(e.message || 'Failed to upload media');
    }
  },
};
