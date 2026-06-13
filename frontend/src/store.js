import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { apiClient } from './lib/api';

/* ── Selector helper: subscribe to multiple slices without mass re-renders ── */
export function useAppSelector(selector) {
  return useAppCache(useShallow(selector));
}

// Udaya's default brand logo (the Buddha mark in /public). Shown wherever no
// custom teacher logo is set, so the app is never logo-less.
export const DEFAULT_LMS_LOGO = '/udaya-logo.png';

/* ─── Teacher settings store ─────────────────────────────────────
   localStorage is only an instant cache so the UI doesn't flash defaults
   on reload. The BACKEND (teacher_settings.json via /teacher/settings) is the
   source of truth, so settings sync across devices/browsers. Every setter
   writes through to the backend; hydrateFromServer() pulls the truth back in
   after login.
──────────────────────────────────────────────────────────────────── */

// store (camelCase) key → backend (snake_case) key
const SETTINGS_SERVER_KEYS = {
  lmsName: 'lms_name',
  lmsLogo: 'lms_logo',
  defaultStudentPassword: 'default_student_password',
  terminationPin: 'termination_pin',
  notifTestSubmission: 'notif_test_submission',
  notifNewStudent: 'notif_new_student',
  notifBroadcastReply: 'notif_broadcast_reply',
  notifWeeklyReport: 'notif_weekly_report',
  securitySingleDevice: 'security_single_device',
  securityAutoLogout: 'security_auto_logout',
  securityTwoStepVerification: 'security_two_step_verification',
  otpEmailReady: 'otp_email_ready',   // read-only (server-computed; never POSTed — no setter)
  studentsCanViewReport: 'students_can_view_report',
};
const SETTINGS_LOCAL_KEYS = Object.fromEntries(
  Object.entries(SETTINGS_SERVER_KEYS).map(([local, server]) => [server, local])
);

// Push a camelCase patch to the backend (fire-and-forget). null → '' so that a
// value can actually be cleared (e.g. removing the logo). Failures are swallowed:
// the local cache still updates, and the next successful save reconciles.
function persistSettings(patch) {
  const body = {};
  for (const [k, v] of Object.entries(patch)) {
    const serverKey = SETTINGS_SERVER_KEYS[k];
    if (!serverKey) continue;
    body[serverKey] = v == null ? '' : v;
  }
  if (Object.keys(body).length === 0) return;
  apiClient('/teacher/settings', { method: 'POST', body: JSON.stringify(body) }).catch(() => {});
}

export const useSettingsStore = create(
  persist(
    (set) => ({
      // Branding
      lmsName: 'Udaya',
      setLmsName: (name) => { set({ lmsName: name }); persistSettings({ lmsName: name }); },
      lmsLogo: null, // base64 data URL or null
      setLmsLogo: (logo) => { set({ lmsLogo: logo }); persistSettings({ lmsLogo: logo }); },

      // Student defaults
      defaultStudentPassword: '',
      setDefaultStudentPassword: (pwd) => { set({ defaultStudentPassword: pwd }); persistSettings({ defaultStudentPassword: pwd }); },

      // Termination PIN
      terminationPin: '',
      setTerminationPin: (pin) => { set({ terminationPin: pin }); persistSettings({ terminationPin: pin }); },

      // Notification preferences
      notifTestSubmission: true,
      notifNewStudent: true,
      notifBroadcastReply: false,
      notifWeeklyReport: true,
      setNotif: (key, val) => { set({ [key]: val }); persistSettings({ [key]: val }); },

      // Security preferences
      securitySingleDevice: true,
      securityAutoLogout: false,
      securityTwoStepVerification: false,   // email OTP on new-device teacher logins
      otpEmailReady: false,                 // read-only: RESEND_API_KEY configured server-side
      setSecurityPref: (key, val) => { set({ [key]: val }); persistSettings({ [key]: val }); },

      // Report visibility
      studentsCanViewReport: true,   // teacher toggles this; false = hides report from students
      setStudentsCanViewReport: (val) => { set({ studentsCanViewReport: val }); persistSettings({ studentsCanViewReport: val }); },

      // Pull server-stored settings into the store (call after teacher login / on boot).
      // Only overwrites keys the server actually has, so first-run defaults survive.
      hydrateFromServer: async () => {
        try {
          const res = await apiClient('/teacher/settings');
          if (!res || typeof res !== 'object') return;
          const patch = {};
          for (const [serverKey, val] of Object.entries(res)) {
            const localKey = SETTINGS_LOCAL_KEYS[serverKey];
            if (!localKey || val === undefined) continue;
            // empty logo string → null so falsy checks + "Remove" UI behave
            patch[localKey] = (localKey === 'lmsLogo' && val === '') ? null : val;
          }
          // never let a blank stored name wipe out the default
          if (patch.lmsName === '') delete patch.lmsName;
          if (Object.keys(patch).length) set(patch);
        } catch { /* offline or not a teacher — keep the local cache */ }
      },

      // Apply branding fetched from the PUBLIC /branding endpoint (login page).
      // Does NOT write back to the server — it's a read-only display update.
      applyBranding: ({ lms_name, lms_logo } = {}) => set((s) => ({
        lmsName: lms_name || s.lmsName,
        lmsLogo: lms_logo ? lms_logo : (lms_logo === '' ? null : s.lmsLogo),
      })),
    }),
    { name: 'tutoria-settings', storage: createJSONStorage(() => localStorage) }
  )
);

/* ─── Broadcast store ───────────────────────────────────────────── */
export const useStore = create((set) => ({
  user: null,
  broadcastsByStandard: {},
  login:  (role) => set({ user: role }),
  logout: () => set({ user: null, broadcastsByStandard: {} }),
  updateBroadcasts: (standardId, updater) =>
    set((state) => ({
      broadcastsByStandard: {
        ...state.broadcastsByStandard,
        [standardId]: updater(state.broadcastsByStandard[standardId] || []),
      },
    })),
}));

/* ─── App-level data cache (persisted to localStorage) ─────────────
   Hydrates synchronously on every page load / refresh — zero wait.
   TTL: 2 minutes. After that, a background refresh runs silently
   while the user already sees the stale (still correct) data.
──────────────────────────────────────────────────────────────────── */
const TTL = 2 * 60 * 1000; // 2 min
const stale = (ts) => !ts || Date.now() - ts > TTL;

export const useAppCache = create(
  persist(
    (set, get) => ({
      standards:      [],
      subjects:       [],
      students:       [],
      standardsTs:    null,
      subjectsTs:     null,
      studentsTs:     null,
      standardsReady: false,
      subjectsReady:  false,
      studentsReady:  false,

      /* ── Prefetch all three in one parallel shot ── */
      prefetchAll: async () => {
        const s = get();
        const needStds  = stale(s.standardsTs);
        const needSubs  = stale(s.subjectsTs);
        const needStuds = stale(s.studentsTs);
        if (!needStds && !needSubs && !needStuds) {
          set({ standardsReady: true, subjectsReady: true, studentsReady: true });
          return;
        }

        const [r0, r1, r2] = await Promise.allSettled([
          needStds  ? apiClient('/standards') : s.standards,
          needSubs  ? apiClient('/subjects')  : s.subjects,
          needStuds ? apiClient('/students')  : s.students,
        ]);
        const now = Date.now();
        set({
          ...(needStds && r0.status === 'fulfilled' && Array.isArray(r0.value)
            ? { standards: r0.value, standardsTs: now, standardsReady: true } : { standardsReady: true }),
          ...(needSubs && r1.status === 'fulfilled' && Array.isArray(r1.value)
            ? { subjects: r1.value, subjectsTs: now, subjectsReady: true } : { subjectsReady: true }),
          ...(needStuds && r2.status === 'fulfilled' && Array.isArray(r2.value)
            ? { students: r2.value, studentsTs: now, studentsReady: true } : { studentsReady: true }),
        });
      },

      /* ── Individual refreshers ── */
      refreshStandards: async () => {
        if (!stale(get().standardsTs)) { set({ standardsReady: true }); return; }
        try {
          const d = await apiClient('/standards');
          if (Array.isArray(d)) set({ standards: d, standardsTs: Date.now(), standardsReady: true });
        } catch { set({ standardsReady: true }); }
      },
      refreshSubjects: async () => {
        if (!stale(get().subjectsTs)) { set({ subjectsReady: true }); return; }
        try {
          const d = await apiClient('/subjects');
          if (Array.isArray(d)) set({ subjects: d, subjectsTs: Date.now(), subjectsReady: true });
        } catch { set({ subjectsReady: true }); }
      },
      refreshStudents: async () => {
        if (!stale(get().studentsTs)) { set({ studentsReady: true }); return; }
        try {
          const d = await apiClient('/students');
          if (Array.isArray(d)) set({ students: d, studentsTs: Date.now(), studentsReady: true });
        } catch { set({ studentsReady: true }); }
      },

      /* ── Selectors ── */
      getSubjectsFor:  (stdId) => get().subjects.filter(s => String(s.standard_id) === String(stdId)),
      getStudentsFor:  (stdId) => get().students.filter(s => String(s.standard_id) === String(stdId)),

      /* ── Optimistic local patch of a single standard (instant UI update) ── */
      updateStandardLocal: (id, patch) => set({
        standards: get().standards.map(s => String(s.id) === String(id) ? { ...s, ...patch } : s),
      }),

      /* ── Invalidate (call after mutations) ── */
      invalidate:         () => set({ standardsTs: null, subjectsTs: null, studentsTs: null }),
      invalidateStudents: () => set({ studentsTs: null }),

      /* ── Full reset (call on login/logout so one account never shows another
            account's cached standards / subjects / students). ── */
      reset: () => set({
        standards: [], subjects: [], students: [],
        standardsTs: null, subjectsTs: null, studentsTs: null,
        standardsReady: false, subjectsReady: false, studentsReady: false,
      }),
    }),
    {
      name: 'tutoria-app-cache',               // localStorage key
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({                    // only persist data, not functions
        standards:      s.standards,
        subjects:       s.subjects,
        students:       s.students,
        standardsTs:    s.standardsTs,
        subjectsTs:     s.subjectsTs,
        studentsTs:     s.studentsTs,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Ready if we've fetched at least once (ts is set), even if result was empty
          state.standardsReady = state.standardsTs != null;
          state.subjectsReady  = state.subjectsTs  != null;
          state.studentsReady  = state.studentsTs  != null;
        }
      },
    }
  )
);

/* ─── What's New (student) ───────────────────────────────────────────
   Server-tracked per-section "last seen" markers (student_seen table).
   `data` mirrors GET /student/whats-new. `prevSeen` snapshots the seen-at
   BEFORE markSeen so item-level NEW pills stay visible for the rest of the
   session even after the nav badge clears. Not persisted — refetched per
   session so it can never bleed across accounts.
──────────────────────────────────────────────────────────────────── */
const WHATS_NEW_TTL = 60 * 1000; // 1 min between background refetches

export const useWhatsNew = create((set, get) => ({
  data: null,        // { seen, videos: {count, items}, tests: {...}, live: {...} }
  prevSeen: {},      // { videos|tests|live: ISO timestamp } — session-stable NEW baseline
  fetchedAt: 0,
  fetch: async (force = false) => {
    const s = get();
    if (!force && s.data && Date.now() - s.fetchedAt < WHATS_NEW_TTL) return;
    try {
      const data = await apiClient('/student/whats-new');
      if (!data || typeof data !== 'object') return;
      // Snapshot each section's baseline once per session; markSeen moves the
      // server marker but the pills keep comparing against this snapshot.
      const prevSeen = { ...get().prevSeen };
      for (const sec of ['videos', 'tests', 'live']) {
        if (!prevSeen[sec] && data.seen?.[sec]) prevSeen[sec] = data.seen[sec];
      }
      set({ data, prevSeen, fetchedAt: Date.now() });
    } catch { /* not a student or offline — leave state as-is */ }
  },
  markSeen: async (section) => {
    const s = get();
    if (!s.data?.[section]) return;
    if (s.data[section].count === 0) return; // nothing new — skip the write
    // Clear the badge optimistically but keep items so NEW pills survive.
    set({ data: { ...s.data, [section]: { ...s.data[section], count: 0 } } });
    try {
      await apiClient('/student/seen', { method: 'POST', body: JSON.stringify({ section }) });
    } catch { /* server marker stays — badge will just reappear next session */ }
  },
  counts: () => {
    const d = get().data;
    return {
      videos: d?.videos?.count || 0,
      tests:  d?.tests?.count  || 0,
      live:   d?.live?.count   || 0,
    };
  },
  reset: () => set({ data: null, prevSeen: {}, fetchedAt: 0 }),
}));

// True if an item's created_at is newer than the session's seen baseline.
export const isNewSince = (createdAt, baseline) =>
  !!createdAt && !!baseline && new Date(createdAt) > new Date(baseline);
