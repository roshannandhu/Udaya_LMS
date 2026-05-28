import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import BottomNav from '../../components/shared/BottomNav';
import Sidebar from '../../components/shared/Sidebar';

function getActiveTab(path) {
  if (path === '/teacher' || path === '/teacher/') return 'today';
  if (path.startsWith('/teacher/subjects'))    return 'subjects';
  if (path.startsWith('/teacher/live-classes')) return 'live';
  if (path.startsWith('/teacher/attendance'))  return 'attendance';
  if (path.startsWith('/teacher/broadcasts'))  return 'broadcasts';
  if (path.startsWith('/teacher/more') || path.startsWith('/teacher/students')) return 'more';
  return 'home';
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
    <div className="min-h-screen flex flex-col lg:pl-[240px]">
      <Sidebar type="teacher" />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
      <BottomNav active={active} setActive={setActive} type="teacher" />
    </div>
  );
}