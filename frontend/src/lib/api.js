const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const port = '8001';
const API_BASE = hostname === 'localhost' || hostname === '127.0.0.1'
  ? (import.meta.env.VITE_API_URL || `http://localhost:${port}/api`)
  : `http://${hostname}:${port}/api`;
const TOKEN_KEY = 'tutoria_token';

export async function apiClient(endpoint, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);

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

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
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