import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

import LoginPage from './pages/LoginPage';
import { useAuthStore, ROLES } from './lib/auth';
import { useAppCache } from './store';

import TeacherLayout      from './pages/teacher/TeacherLayout';
import TodayPage          from './pages/teacher/TodayPage';
import SubjectsPage       from './pages/teacher/SubjectsPage';
import StandardDetailPage from './pages/teacher/StandardDetailPage';
import SubjectDetailPage  from './pages/teacher/SubjectDetailPage';
import StudentsPage       from './pages/teacher/StudentsPage';
import StudentDetailPage  from './pages/teacher/StudentDetailPage';
import BroadcastsPage     from './pages/teacher/BroadcastsPage';
import MorePage           from './pages/teacher/MorePage';
import QuestionBankPage   from './pages/teacher/QuestionBankPage';
import TeacherProfilePage from './pages/teacher/TeacherProfilePage';
import TestsPage          from './pages/teacher/TestsPage';
import ReportsPage        from './pages/teacher/ReportsPage';
import RemindersPage      from './pages/teacher/RemindersPage';
import SettingsPage       from './pages/teacher/SettingsPage';
import AttendancePage     from './pages/teacher/AttendancePage';
import TeacherLiveClassesPage from './pages/teacher/TeacherLiveClassesPage';
import StudentLiveClassesPage from './pages/student/StudentLiveClassesPage';

import StudentLayout          from './pages/student/StudentLayout';
import StudentHomePage        from './pages/student/StudentHomePage';
import StudentSubjectsPage    from './pages/student/StudentSubjectsPage';
import StudentSubjectViewPage from './pages/student/StudentSubjectViewPage';
import StudentVideoPlayerPage from './pages/student/StudentVideoPlayerPage';
import StudentTestsPage       from './pages/student/StudentTestsPage';
import StudentTestTakingPage  from './pages/student/StudentTestTakingPage';
import StudentTestResultPage  from './pages/student/StudentTestResultPage';
import StudentTestReviewPage  from './pages/student/StudentTestReviewPage';
import StudentBroadcastsPage  from './pages/student/StudentBroadcastsPage';
import StudentProfilePage     from './pages/student/StudentProfilePage';
import StudentChangePasswordPage from './pages/student/StudentChangePasswordPage';
import StudentLeaderboardPage   from './pages/student/StudentLeaderboardPage';
import StudentMorePage        from './pages/student/StudentMorePage';

function AuthHandler() {
  const navigate = useNavigate();
  const { role, verifyWithBackend, isLoading, user } = useAuthStore();
  const prefetchAll = useAppCache(s => s.prefetchAll);

  useEffect(() => {
    verifyWithBackend();
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      // Kick off background prefetch as soon as user is verified
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
  }, [role, isLoading, user, navigate]);

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
  const { role, isLoading, user, enforceSingleDevice } = useAuthStore();
  const location = useLocation();

  useEffect(() => {
    if (user && role === ROLES.STUDENT) {
      enforceSingleDevice(user.id);
    }
  }, [user, role, enforceSingleDevice]);

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
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}