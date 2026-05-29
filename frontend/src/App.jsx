import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import { useAuthStore, ROLES } from './lib/auth';
import { useAppCache } from './store';

import TeacherLayout      from './pages/teacher/TeacherLayout';
import StudentLayout      from './pages/student/StudentLayout';

const TodayPage               = lazy(() => import('./pages/teacher/TodayPage'));
const SubjectsPage            = lazy(() => import('./pages/teacher/SubjectsPage'));
const StandardDetailPage      = lazy(() => import('./pages/teacher/StandardDetailPage'));
const SubjectDetailPage       = lazy(() => import('./pages/teacher/SubjectDetailPage'));
const StudentsPage            = lazy(() => import('./pages/teacher/StudentsPage'));
const StudentDetailPage       = lazy(() => import('./pages/teacher/StudentDetailPage'));
const BroadcastsPage          = lazy(() => import('./pages/teacher/BroadcastsPage'));
const MorePage                = lazy(() => import('./pages/teacher/MorePage'));
const QuestionBankPage        = lazy(() => import('./pages/teacher/QuestionBankPage'));
const TeacherProfilePage      = lazy(() => import('./pages/teacher/TeacherProfilePage'));
const TestsPage               = lazy(() => import('./pages/teacher/TestsPage'));
const ReportsPage             = lazy(() => import('./pages/teacher/ReportsPage'));
const RemindersPage           = lazy(() => import('./pages/teacher/RemindersPage'));
const SettingsPage            = lazy(() => import('./pages/teacher/SettingsPage'));
const AttendancePage          = lazy(() => import('./pages/teacher/AttendancePage'));
const TeacherLiveClassesPage  = lazy(() => import('./pages/teacher/TeacherLiveClassesPage'));
const StudentLiveClassesPage  = lazy(() => import('./pages/student/StudentLiveClassesPage'));

const StudentHomePage            = lazy(() => import('./pages/student/StudentHomePage'));
const StudentSubjectsPage        = lazy(() => import('./pages/student/StudentSubjectsPage'));
const StudentSubjectViewPage     = lazy(() => import('./pages/student/StudentSubjectViewPage'));
const StudentVideoPlayerPage     = lazy(() => import('./pages/student/StudentVideoPlayerPage'));
const StudentTestsPage           = lazy(() => import('./pages/student/StudentTestsPage'));
const StudentTestTakingPage      = lazy(() => import('./pages/student/StudentTestTakingPage'));
const StudentTestResultPage      = lazy(() => import('./pages/student/StudentTestResultPage'));
const StudentTestReviewPage      = lazy(() => import('./pages/student/StudentTestReviewPage'));
const StudentBroadcastsPage      = lazy(() => import('./pages/student/StudentBroadcastsPage'));
const StudentProfilePage         = lazy(() => import('./pages/student/StudentProfilePage'));
const StudentChangePasswordPage  = lazy(() => import('./pages/student/StudentChangePasswordPage'));
const StudentLeaderboardPage     = lazy(() => import('./pages/student/StudentLeaderboardPage'));
const StudentMorePage            = lazy(() => import('./pages/student/StudentMorePage'));
const StudentReportPage          = lazy(() => import('./pages/student/StudentReportPage'));

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

  useEffect(() => {
    if (user?.id && role === ROLES.STUDENT) {
      enforceSingleDevice(user.id);
    }
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

export default function App() {
  return (
    <BrowserRouter>
      <AuthHandler />
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
    </BrowserRouter>
  );
}