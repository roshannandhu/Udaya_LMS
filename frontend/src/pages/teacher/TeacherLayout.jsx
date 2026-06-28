import React, { Suspense, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';
import BottomNav from '../../components/shared/BottomNav';
import TopNav from '../../components/shared/TopNav';
import PageTransition from '../../components/shared/PageTransition';

function getActiveTab(path) {
  if (path === '/teacher' || path === '/teacher/') return 'today';
  if (path.startsWith('/teacher/standards'))     return 'subjects';
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
  const isBroadcastRoute = location.pathname.startsWith('/teacher/broadcasts');

  // On phone the content area is the scroll container (app-shell, see below),
  // so reset it to the top on every route change — what body-scroll did for free.
  const contentRef = useRef(null);
  useEffect(() => { if (contentRef.current) contentRef.current.scrollTop = 0; }, [location.pathname]);

  const handleSignOut = async () => {
    await clearAuth();
    navigate('/login');
  };

  window.__teacherSignOut = handleSignOut;

  const setActive = (tab) => {
    const routes = {
      today:      '/teacher',
      subjects:   '/teacher/standards',
      live:       '/teacher/live-classes',
      attendance: '/teacher/attendance',
      broadcasts: '/teacher/broadcasts',
      more:       '/teacher/more'
    };
    navigate(routes[tab] || '/teacher');
  };

  return (
    // App-shell on phone: lock the shell to the dynamic viewport (100dvh) and
    // let the CONTENT scroll, not the body. With the body fixed, the mobile
    // browser toolbar can't collapse on scroll, so the fixed bottom dock stops
    // drifting. Desktop (lg) keeps normal body scroll, unchanged.
    // pt-[env(safe-area-inset-top)]: on the Android APK (edge-to-edge, targetSdk 36)
    // the WebView draws under the status bar, and Android's WebView reports
    // env(safe-area-inset-top) as 0 even with viewport-fit=cover — so the bare
    // inset was inert and headers got clipped under the clock/icons. The 28px
    // floor guarantees clearance on the APK; env() wins on larger-notch devices.
    // lg:pt-0 keeps desktop flush (the floor never applies there).
    <div className={`flex flex-col h-[100dvh] overflow-hidden pt-[max(env(safe-area-inset-top),28px)] lg:pt-0 ${isBroadcastRoute ? 'lg:h-[100dvh]' : 'lg:h-auto lg:min-h-screen lg:overflow-visible'}`}>
      <TopNav type="teacher" />
      {/* overflow-x-clip (not -hidden: that would break position:sticky headers)
          stops sideways pan; overflow-y-auto makes this the phone scroll area. */}
      <div
        ref={contentRef}
        className={`flex-1 flex flex-col min-h-0 overflow-x-clip ${isBroadcastRoute ? 'overflow-y-hidden pb-0 lg:overflow-hidden' : 'overflow-y-auto pb-48 lg:pb-0 lg:overflow-visible'}`}
      >
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-pulse w-8 h-8 bg-neutral-200 rounded-lg"></div></div>}>
          <PageTransition><Outlet /></PageTransition>
        </Suspense>
      </div>
      <BottomNav active={active} setActive={setActive} type="teacher" />
    </div>
  );
}
