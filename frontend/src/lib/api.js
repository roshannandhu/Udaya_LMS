const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const port = '8001';
const envApiUrl = import.meta.env.VITE_API_URL;
const isBrowser = typeof window !== 'undefined';
const isLocalhostEnv = envApiUrl && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api\/?$/i.test(envApiUrl);
const isLocalhostPage = ['localhost', '127.0.0.1', '::1'].includes(hostname);
const API_BASE = (
  envApiUrl && (!isBrowser || isLocalhostPage || !isLocalhostEnv)
    ? envApiUrl
    : `http://${hostname}:${port}/api`
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
const NO_CACHE = ['/notifications', '/auth/me', '/live-classes', '/broadcasts/'];

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
    formData.append('file', file);
    formData.append('class_id', classId);
    const res = await fetch(`${API_BASE}/notes/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Upload failed');
    }
    _cache.clear();
    return res.json();
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
  const res = await fetch(`${API_BASE}${endpoint}`, { headers });
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
    if (file) formData.append('file', file);
    formData.append('text_side', textSide || 'right');
    const res = await fetch(`${API_BASE}/teacher/thumbnail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Failed to upload thumbnail');
    }
    _cache.clear();
    return res.json();
  },
  uploadProfilePhoto: async (file) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const formData = new FormData();
    if (file) formData.append('file', file);
    const res = await fetch(`${API_BASE}/teacher/profile-photo`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Failed to upload profile photo');
    }
    return res.json();
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

export const reportApi = {
  // Teacher fetches a specific student's report
  getV2: (studentId, period = 'overall') =>
    apiClient(`/students/${studentId}/report/v2?period=${period}`),
  // Student fetches their own report (uses 'me' alias resolved server-side)
  getMy: (period = 'overall') =>
    apiClient(`/students/me/report/v2?period=${period}`),
  // Teacher: per-student performance for a standard (or one subject within it)
  performance: ({ standardId, classId, period = 'overall' }) =>
    apiClient(`/reports/performance?standard_id=${standardId}${classId ? `&class_id=${classId}` : ''}&period=${period}`),
};

export const assignmentApi = {
  getByClass: (classId) => apiClient(`/assignments?class_id=${classId}`),

  create: async (formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/assignments/create`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Failed to create assignment');
    }
    _cache.clear();
    return res.json();
  },

  update: (id, data) =>
    apiClient(`/assignments/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  delete: (id) =>
    apiClient(`/assignments/${id}`, { method: 'DELETE' }),

  addAttachments: async (id, formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/assignments/${id}/attachments`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Failed to upload files');
    }
    _cache.clear();
    return res.json();
  },

  deleteAttachment: (id, attId) =>
    apiClient(`/assignments/${id}/attachments/${attId}`, { method: 'DELETE' }),

  getSubmissions: (id) => apiClient(`/assignments/${id}/submissions`),

  submit: async (id, formData) => {
    const token = localStorage.getItem(TOKEN_KEY);
    const res = await fetch(`${API_BASE}/assignments/${id}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Failed to submit assignment');
    }
    _cache.clear();
    return res.json();
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

  // Last generated analysis for this student+period — instant, no LLM call.
  getCachedInsights: (studentId, period = 'overall') =>
    apiClient(`/insights/cached/${studentId}?period=${period}`),

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

  // Connection / QR pairing (scan-to-connect setup)
  getConnection: () => apiClient('/teacher/whatsapp/connection'),
  getQr:         () => apiClient('/teacher/whatsapp/qr'),
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

  // Read-only inbox (parent replies, grouped by parent)
  getInbox:      ()     => apiClient('/teacher/whatsapp/inbox'),
  markInboxRead: (data) => apiClient('/teacher/whatsapp/inbox/mark-read', { method: 'POST', body: JSON.stringify(data || {}) }),

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
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/teacher/whatsapp/upload-media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.detail || 'Upload failed');
    }
    _cache.clear();
    return res.json();
  },
};
