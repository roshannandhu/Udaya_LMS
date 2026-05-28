import React, { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import BottomNav from '../../components/shared/BottomNav';
import Sidebar from '../../components/shared/Sidebar';

function getActiveTab(path) {
  if (path === '/student' || path === '/student/') return 'home';
  if (path.startsWith('/student/subjects'))     return 'subjects';
  if (path.startsWith('/student/live-classes')) return 'live';
  if (path.startsWith('/student/broadcasts'))   return 'broadcasts';
  if (path.startsWith('/student/profile'))      return 'profile';
  if (path.startsWith('/student/more') || path.startsWith('/student/tests') || path.startsWith('/student/leaderboard')) return 'more';
  return 'home';
}

export default function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { clearAuth, user, isLoading } = useAuthStore();

  useEffect(() => {
    if (!isLoading && user?.must_change_pwd && location.pathname !== '/student/change-password') {
      navigate('/student/change-password', { replace: true });
    }
  }, [user, isLoading, location.pathname, navigate]);

  const active = getActiveTab(location.pathname);

  const handleSignOut = async () => {
    await clearAuth();
    navigate('/login');
  };

  window.__studentSignOut = handleSignOut;

  const setActive = (tab) => {
    const map = {
      home: '/student',
      subjects: '/student/subjects',
      live: '/student/live-classes',
      broadcasts: '/student/broadcasts',
      profile: '/student/profile',
      more: '/student/more'
    };
    navigate(map[tab] || '/student');
  };

  return (
    <div className="min-h-screen flex flex-col lg:pl-[240px]">
      <Sidebar type="student" />
      <div className="flex-1 flex flex-col">
        <Outlet />
      </div>
      <BottomNav active={active} setActive={setActive} type="student" />
    </div>
  );
}