import React, { Suspense } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import BottomNav from '../../components/shared/BottomNav';
import TopNav from '../../components/shared/TopNav';

function getActiveTab(path) {
  if (path === '/teacher' || path === '/teacher/') return 'today';
  if (path.startsWith('/teacher/subjects'))     return 'subjects';
  if (path.startsWith('/teacher/live-classes')) return 'live';
  if (path.startsWith('/teacher/attendance'))   return 'attendance';
  if (path.startsWith('/teacher/broadcasts'))   return 'broadcasts';
  if (path.startsWith('/teacher/tests'))        return 'today';
  if (path.startsWith('/teacher/more') || path.startsWith('/teacher/students') ||
      path.startsWith('/teacher/reports') || path.startsWith('/teacher/reminders') ||
      path.startsWith('/teacher/settings') || path.startsWith('/teacher/question-bank') ||
      path.startsWith('/teacher/profile')) return 'more';
  return 'today';
}

export default function TeacherLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role, clearAuth } = useAuthStore();

  const active = getActiveTab(location.pathname);

  const handleSignOut = async () => {
    await clearAuth();
    navigate('/login');
  };

  window.__teacherSignOut = handleSignOut;

  const setActive = (tab) => {
    const routes = {
      today:      '/teacher',
      subjects:   '/teacher/subjects',
      live:       '/teacher/live-classes',
      attendance: '/teacher/attendance',
      broadcasts: '/teacher/broadcasts',
      more:       '/teacher/more'
    };
    navigate(routes[tab] || '/teacher');
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav type="teacher" />
      <div className="flex-1 flex flex-col pb-28 lg:pb-0">
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse w-8 h-8 bg-neutral-200 rounded-lg"></div></div>}>
          <Outlet />
        </Suspense>
      </div>
      <BottomNav active={active} setActive={setActive} type="teacher" />
    </div>
  );
}