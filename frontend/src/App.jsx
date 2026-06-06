import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import { useAuthStore, ROLES } from './lib/auth';
import { useAppCache } from './store';
import ErrorBoundary from './components/ErrorBoundary';

import TeacherLayout      from './pages/teacher/TeacherLayout';
import StudentLayout      from './pages/student/StudentLayout';

// Wrap React.lazy so a failed dynamic import (usually a stale chunk after a new
// deploy/rebuild) triggers ONE automatic reload to fetch fresh assets instead of
// crashing the whole app. The reload flag is shared with ErrorBoundary.
const RELOAD_FLAG = 'cl_reloaded';
// Every lazy route's import factory, collected so we can warm them all on idle.
const _routeFactories = [];
function lazyWithRetry(factory) {
  _routeFactories.push(factory);
  return lazy(async () => {
    try {
      const mod = await factory();
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(RELOAD_FLAG)) {
        try { sessionStorage.setItem(RELOAD_FLAG, '1'); } catch { /* ignore */ }
        window.location.reload();
        return new Promise(() => {}); // hold render until the reload happens
      }
      throw err; // already retried once — let ErrorBoundary show the fallback
    }
  });
}

// Warm every route chunk in the background. import() is memoized, so a route that
// later mounts reuses the already-loaded module → navigation has nothing to download
// and the Suspense loader stops appearing.
function prefetchRoutes() {
  _routeFactories.forEach((f) => { try { f(); } catch { /* ignore */ } });
}

const TodayPage               = lazyWithRetry(() => import('./pages/teacher/TodayPage'));
const SubjectsPage            = lazyWithRetry(() => import('./pages/teacher/SubjectsPage'));
const StandardDetailPage      = lazyWithRetry(() => import('./pages/teacher/StandardDetailPage'));
const SubjectDetailPage       = lazyWithRetry(() => import('./pages/teacher/SubjectDetailPage'));
const StudentsPage            = lazyWithRetry(() => import('./pages/teacher/StudentsPage'));
const StudentDetailPage       = lazyWithRetry(() => import('./pages/teacher/StudentDetailPage'));
const BroadcastsPage          = lazyWithRetry(() => import('./pages/teacher/BroadcastsPage'));
const MorePage                = lazyWithRetry(() => import('./pages/teacher/MorePage'));
const QuestionBankPage        = lazyWithRetry(() => import('./pages/teacher/QuestionBankPage'));
const TeacherProfilePage      = lazyWithRetry(() => import('./pages/teacher/TeacherProfilePage'));
const TestsPage               = lazyWithRetry(() => import('./pages/teacher/TestsPage'));
const ReportsPage             = lazyWithRetry(() => import('./pages/teacher/ReportsPage'));
const RemindersPage           = lazyWithRetry(() => import('./pages/teacher/RemindersPage'));
const SettingsPage            = lazyWithRetry(() => import('./pages/teacher/SettingsPage'));
const AttendancePage          = lazyWithRetry(() => import('./pages/teacher/AttendancePage'));
const TeacherLiveClassesPage  = lazyWithRetry(() => import('./pages/teacher/TeacherLiveClassesPage'));
const StudentLiveClassesPage  = lazyWithRetry(() => import('./pages/student/StudentLiveClassesPage'));

const StudentHomePage            = lazyWithRetry(() => import('./pages/student/StudentHomePage'));
const StudentCalendarPage        = lazyWithRetry(() => import('./pages/student/CalendarPage'));
const StudentSubjectsPage        = lazyWithRetry(() => import('./pages/student/StudentSubjectsPage'));
const StudentSubjectViewPage     = lazyWithRetry(() => import('./pages/student/StudentSubjectViewPage'));
const StudentVideoPlayerPage     = lazyWithRetry(() => import('./pages/student/StudentVideoPlayerPage'));
const StudentTestsPage           = lazyWithRetry(() => import('./pages/student/StudentTestsPage'));
const StudentTestTakingPage      = lazyWithRetry(() => import('./pages/student/StudentTestTakingPage'));
const StudentTestResultPage      = lazyWithRetry(() => import('./pages/student/StudentTestResultPage'));
const StudentTestReviewPage      = lazyWithRetry(() => import('./pages/student/StudentTestReviewPage'));
const StudentBroadcastsPage      = lazyWithRetry(() => import('./pages/student/StudentBroadcastsPage'));
const StudentProfilePage         = lazyWithRetry(() => import('./pages/student/StudentProfilePage'));
const StudentChangePasswordPage  = lazyWithRetry(() => import('./pages/student/StudentChangePasswordPage'));
const StudentLeaderboardPage     = lazyWithRetry(() => import('./pages/student/StudentLeaderboardPage'));
const StudentMorePage            = lazyWithRetry(() => import('./pages/student/StudentMorePage'));
const StudentReportPage          = lazyWithRetry(() => import('./pages/student/StudentReportPage'));

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white/30">
      <div className="animate-pulse flex items-center gap-2">
        <div className="w-8 h-8 bg-neutral-200 rounded-lg"></div>
        <span className="text-neutral-500">Loading...</span>
      </div>
    </div>
  );
}

function AuthHandler() {
  const navigate = useNavigate();
  const { verifyWithBackend } = useAuthStore();
  const prefetchAll = useAppCache(s => s.prefetchAll);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await verifyWithBackend();
      if (cancelled) return;
      const { isLoading, user, role } = useAuthStore.getState();
      if (!isLoading && user) {
        prefetchAll();
        // Warm all route chunks once the app is idle so first navigation to any
        // page is instant (no on-demand chunk load / Suspense flash).
        const ric = window.requestIdleCallback
          ? window.requestIdleCallback.bind(window)
          : (fn) => setTimeout(fn, 1200);
        ric(() => prefetchRoutes());
        const currentPath = window.location.pathname;
        if (currentPath === '/login' || currentPath === '/') {
          if (role === ROLES.TEACHER) {
            navigate('/teacher', { replace: true });
          } else if (role === ROLES.STUDENT) {
            navigate('/student', { replace: true });
          }
        }
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, prefetchAll]);

  return null;
}

function ProtectedTeacherRoute({ children }) {
  const { role, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/30">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-200 rounded-lg"></div>
          <span className="text-neutral-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role !== ROLES.TEACHER) return <Navigate to="/student" replace />;

  return children;
}

function ProtectedStudentRoute({ children }) {
  const role            = useAuthStore(s => s.role);
  const isLoading       = useAuthStore(s => s.isLoading);
  const user            = useAuthStore(s => s.user);
  const enforceSingleDevice = useAuthStore(s => s.enforceSingleDevice);
  const location = useLocation();

  // Single-device enforcement (students only): check now, then keep checking so the
  // OLD device logs itself out automatically once the student signs in elsewhere.
  // Poll every 30s, and re-check the instant the tab/app regains focus for prompt logout.
  // enforceSingleDevice() fails open on network errors and calls clearAuth() on mismatch,
  // which flips `user` to null and the guard below redirects to /login.
  useEffect(() => {
    if (!(user?.id && role === ROLES.STUDENT)) return;

    const check = () => enforceSingleDevice(user.id);
    check();

    const interval = setInterval(check, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, role, enforceSingleDevice]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/30">
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-8 h-8 bg-neutral-200 rounded-lg"></div>
          <span className="text-neutral-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (role !== ROLES.STUDENT) return <Navigate to="/teacher" replace />;
  if (user.must_change_pwd && !location.pathname.includes('/change-password')) {
    return <Navigate to="/student/change-password" replace />;
  }

  return children;
}

// Resets the error boundary whenever the route changes, so a one-off page error
// doesn't trap the user on the fallback screen after they navigate away.
function RoutedBoundary({ children }) {
  const location = useLocation();
  return <ErrorBoundary routeKey={location.pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthHandler />
      <RoutedBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/teacher" element={
          <ProtectedTeacherRoute>
            <TeacherLayout />
          </ProtectedTeacherRoute>
        }>
          <Route index element={<TodayPage />} />
          <Route path="subjects" element={<SubjectsPage />} />
          <Route path="subjects/:standardId" element={<StandardDetailPage />} />
          <Route path="subjects/:standardId/:classId" element={<SubjectDetailPage />} />
          <Route path="live-classes" element={<TeacherLiveClassesPage />} />
          <Route path="students" element={<StudentsPage />} />
          <Route path="students/:studentId" element={<StudentDetailPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="more" element={<MorePage />} />
          <Route path="question-bank" element={<QuestionBankPage />} />
          <Route path="profile" element={<TeacherProfilePage />} />
          <Route path="tests" element={<TestsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="reminders" element={<RemindersPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="attendance" element={<AttendancePage />} />
        </Route>

        <Route path="/student" element={
          <ProtectedStudentRoute>
            <StudentLayout />
          </ProtectedStudentRoute>
        }>
          <Route index element={<StudentHomePage />} />
          <Route path="calendar" element={<StudentCalendarPage />} />
          <Route path="subjects" element={<StudentSubjectsPage />} />
          <Route path="subjects/:classId" element={<StudentSubjectViewPage />} />
          <Route path="subjects/:classId/video/:videoId" element={<StudentVideoPlayerPage />} />
          <Route path="live-classes" element={<StudentLiveClassesPage />} />
          <Route path="tests" element={<StudentTestsPage />} />
          <Route path="tests/:testId/take" element={<StudentTestTakingPage />} />
          <Route path="tests/result" element={<StudentTestResultPage />} />
          <Route path="tests/review" element={<StudentTestReviewPage />} />
          <Route path="broadcasts" element={<StudentBroadcastsPage />} />
          <Route path="profile" element={<StudentProfilePage />} />
          <Route path="more" element={<StudentMorePage />} />
          <Route path="change-password" element={<StudentChangePasswordPage />} />
          <Route path="leaderboard" element={<StudentLeaderboardPage />} />
          <Route path="report" element={<StudentReportPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      </RoutedBoundary>
    </BrowserRouter>
  );
}