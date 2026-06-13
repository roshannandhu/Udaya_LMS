import React, { memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../../store';

import { TEACHER_NAV, STUDENT_NAV } from './nav-items';

const Sidebar = memo(function Sidebar({ type = 'teacher' }) {
  const location = useLocation();
  const items = type === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const { lmsName, lmsLogo } = useSettingsStore();
  
  const getActiveTab = (path) => {
    if (type === 'teacher') {
      if (path === '/teacher' || path === '/teacher/') return 'today';
      if (path.startsWith('/teacher/standards'))     return 'subjects';
      if (path.startsWith('/teacher/students'))     return 'students';
      if (path.startsWith('/teacher/attendance'))   return 'attendance';
      if (path.startsWith('/teacher/broadcasts'))   return 'broadcasts';
      if (path.startsWith('/teacher/live-classes')) return 'live';
      if (path.startsWith('/teacher/reports'))      return 'reports';
      if (path.startsWith('/teacher/whatsapp'))     return 'whatsapp';
      return 'more';
    } else {
      if (path === '/student' || path === '/student/') return 'home';
      if (path.startsWith('/student/subjects'))     return 'subjects';
      if (path.startsWith('/student/broadcasts'))   return 'broadcasts';
      if (path.startsWith('/student/live-classes')) return 'live';
      if (path.startsWith('/student/tests'))        return 'tests';
      if (path.startsWith('/student/leaderboard'))  return 'leaderboard';
      if (path.startsWith('/student/profile'))      return 'profile';
      return 'home';
    }
  };

  const active = getActiveTab(location.pathname);

  return (
    <aside className="hidden lg:flex flex-col w-[220px] fixed top-4 bottom-4 left-4 glass-nav rounded-2xl shadow-card z-50 overflow-hidden">
      <div className="p-5 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center gap-3 mb-10 mt-2 px-1">
          <img src={lmsLogo || DEFAULT_LMS_LOGO} alt="logo" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm border border-neutral-200 bg-white" />
          <span
            className="font-bold text-2xl tracking-tight text-neutral-900 truncate"
            style={{ fontFamily: '"Fraunces", Georgia, serif' }}
          >
            {lmsName || 'Udaya'}
          </span>
        </div>

        <nav className="space-y-1">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <Link key={item.id} to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium ${
                  isActive
                    ? 'bg-[#F2F1EE] border border-[#EBEAE7] text-neutral-900'
                    : 'text-neutral-600 hover:bg-[#F2F1EE] border border-transparent'
                }`}>
                <item.icon className={`w-5 h-5 ${isActive ? 'text-neutral-900' : 'text-neutral-500'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
});

export default Sidebar;
