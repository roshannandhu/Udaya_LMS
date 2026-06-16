import React, { Suspense, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import { useWhatsNew } from '../../store';
import BottomNav from '../../components/shared/BottomNav';
import TopNav from '../../components/shared/TopNav';

function getActiveTab(path) {
  if (path === '/student' || path === '/student/') return 'home';
  if (path.startsWith('/student/calendar'))     return 'calendar';
  if (path.startsWith('/student/subjects'))     return 'subjects';
  if (path.startsWith('/student/live-classes')) return 'live';
  if (path.startsWith('/student/broadcasts'))   return 'broadcasts';
  if (path.startsWith('/student/profile'))      return 'profile';
  if (path.startsWith('/student/tests')) return 'tests';
  if (path.startsWith('/student/more') || path.startsWith('/student/leaderboard')) return 'more';
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

  // What's New: fetch unseen-content counts on mount and whenever the tab
  // regains focus, so badges reflect content added while the app was idle.
  const whatsNewData = useWhatsNew(s => s.data);
  useEffect(() => {
    if (isLoading || !user || user.must_change_pwd) return;
    const fetchNew = () => useWhatsNew.getState().fetch();
    fetchNew();
    window.addEventListener('focus', fetchNew);
    return () => window.removeEventListener('focus', fetchNew);
  }, [user, isLoading]);

  const badges = {
    subjects: whatsNewData?.videos?.count || 0,
    tests:    whatsNewData?.tests?.count  || 0,
    live:     whatsNewData?.live?.count   || 0,
  };

  const active = getActiveTab(location.pathname);

  // Phone app-shell: the content area scrolls (not the body), so reset it to the
  // top on route change — what body-scroll used to do for free.
  const contentRef = useRef(null);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [location.pathname]);

  const handleSignOut = async () => {
    await clearAuth();
    navigate('/login');
  };

  window.__studentSignOut = handleSignOut;

  const setActive = (tab) => {
    const map = {
      home: '/student',
      calendar: '/student/calendar',
      subjects: '/student/subjects',
      tests: '/student/tests',
      broadcasts: '/student/broadcasts',
      live: '/student/live-classes',
      profile: '/student/profile',
      more: '/student/more'
    };
    navigate(map[tab] || '/student');
  };

  return (
    // App-shell on phone (parity with TeacherLayout): lock to the dynamic
    // viewport and scroll the content, not the body, so the fixed bottom dock
    // can't drift when the mobile toolbar collapses. Desktop keeps body scroll.
    <div className="flex flex-col h-[100dvh] lg:h-auto lg:min-h-screen overflow-hidden lg:overflow-visible">
      <TopNav type="student" badges={badges} />
      {/* overflow-x-clip stops sideways pan; overflow-y-auto = phone scroll area. */}
      <div ref={contentRef} className="flex-1 flex flex-col min-h-0 overflow-y-auto lg:overflow-visible overflow-x-clip pb-28 lg:pb-0">
        <Suspense fallback={<div className="p-8 flex justify-center"><div className="animate-spin w-6 h-6 border-2 border-neutral-300 border-t-blue-500 rounded-full" /></div>}>
          <Outlet />
        </Suspense>
      </div>
      <BottomNav active={active} setActive={setActive} type="student" badges={badges} />
    </div>
  );
}