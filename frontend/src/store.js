import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { apiClient } from './lib/api';

/* ─── Teacher settings store (persisted) ───────────────────────── */
export const useSettingsStore = create(
  persist(
    (set) => ({
      // Branding
      lmsName: 'Tutoria',
      setLmsName: (name) => set({ lmsName: name }),
      lmsLogo: null, // base64 data URL or null
      setLmsLogo: (logo) => set({ lmsLogo: logo }),

      // Student defaults
      defaultStudentPassword: '',
      setDefaultStudentPassword: (pwd) => set({ defaultStudentPassword: pwd }),

      // Termination PIN
      terminationPin: '',
      setTerminationPin: (pin) => set({ terminationPin: pin }),

      // Notification preferences
      notifTestSubmission: true,
      notifNewStudent: true,
      notifBroadcastReply: false,
      notifWeeklyReport: true,
      setNotif: (key, val) => set({ [key]: val }),

      // Security preferences
      securitySingleDevice: true,
      securityAutoLogout: false,
      setSecurityPref: (key, val) => set({ [key]: val }),
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
        if (!needStds && !needSubs && !needStuds) return;

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

      /* ── Invalidate (call after mutations) ── */
      invalidate:         () => set({ standardsTs: null, subjectsTs: null, studentsTs: null }),
      invalidateStudents: () => set({ studentsTs: null }),
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
        // After hydrating from localStorage, mark as ready immediately
        if (state) {
          state.standardsReady = Array.isArray(state.standards) && state.standards.length > 0;
          state.subjectsReady  = Array.isArray(state.subjects)  && state.subjects.length  > 0;
          state.studentsReady  = Array.isArray(state.students)  && state.students.length  > 0;
        }
      },
    }
  )
);
