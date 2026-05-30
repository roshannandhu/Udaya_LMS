import React, { memo } from 'react';
import { Home, BookOpen, Users, MessageSquare, MoreHorizontal, FileQuestion, Trophy, Calendar, BarChart3, Settings, User, Video } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useSettingsStore } from '../../store';

const TEACHER_ITEMS = [
  { id: 'today',      label: 'Home',        icon: Home,           path: '/teacher' },
  { id: 'subjects',   label: 'Classes',     icon: BookOpen,       path: '/teacher/subjects' },
  { id: 'students',   label: 'Students',    icon: Users,          path: '/teacher/students' },
  { id: 'broadcasts', label: 'Broadcasts',  icon: MessageSquare,  path: '/teacher/broadcasts' },
  { id: 'attendance', label: 'Attendance',  icon: Calendar,       path: '/teacher/attendance' },
  { id: 'live',       label: 'Live Classes',icon: Video,          path: '/teacher/live-classes' },
  { id: 'reports',    label: 'Reports',     icon: BarChart3,      path: '/teacher/reports' },
  { id: 'more',       label: 'Profile',     icon: User,           path: '/teacher/more' },
];

const STUDENT_ITEMS = [
  { id: 'home',        label: 'Home',        icon: Home,          path: '/student' },
  { id: 'subjects',    label: 'Subjects',    icon: BookOpen,      path: '/student/subjects' },
  { id: 'tests',       label: 'Tests & Assignments', icon: FileQuestion,  path: '/student/tests' },
  { id: 'broadcasts',  label: 'Broadcasts',  icon: MessageSquare, path: '/student/broadcasts' },
  { id: 'live',        label: 'Live Classes',icon: Video,         path: '/student/live-classes' },
  { id: 'leaderboard', label: 'Ranking',     icon: Trophy,        path: '/student/leaderboard' },
  { id: 'profile',     label: 'Profile',     icon: Users,         path: '/student/profile' },
];

const Sidebar = memo(function Sidebar({ type = 'teacher' }) {
  const location = useLocation();
  const items = type === 'teacher' ? TEACHER_ITEMS : STUDENT_ITEMS;
  const { lmsName, lmsLogo } = useSettingsStore();
  
  const getActiveTab = (path) => {
    if (type === 'teacher') {
      if (path === '/teacher' || path === '/teacher/') return 'today';
      if (path.startsWith('/teacher/subjects'))     return 'subjects';
      if (path.startsWith('/teacher/students'))     return 'students';
      if (path.startsWith('/teacher/attendance'))   return 'attendance';
      if (path.startsWith('/teacher/broadcasts'))   return 'broadcasts';
      if (path.startsWith('/teacher/live-classes')) return 'live';
      if (path.startsWith('/teacher/reports'))      return 'reports';
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
    <aside className="hidden lg:flex flex-col w-[220px] fixed top-4 bottom-4 left-4 glass-nav rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.05)] z-50 overflow-hidden">
      <div className="p-5 flex flex-col h-full overflow-y-auto">
        <div className="flex items-center gap-3 mb-10 mt-2 px-1">
          {lmsLogo
            ? <img src={lmsLogo} alt="logo" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 shadow-sm border border-neutral-200" />
            : <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                <div className="w-4 h-4 border-2 border-white/90 rounded-sm rotate-45" />
              </div>
          }
          <span 
            className="font-black text-2xl tracking-tighter bg-clip-text text-transparent bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-500 truncate drop-shadow-sm"
            style={{ fontFamily: '"Outfit", "Plus Jakarta Sans", "Inter", sans-serif' }}
          >
            {lmsName || 'Udaya'}
          </span>
        </div>

        <nav className="space-y-1">
          {items.map((item) => {
            const isActive = active === item.id;
            return (
              <Link key={item.id} to={item.path}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all text-sm font-medium ${
                  isActive 
                    ? 'bg-white/60 backdrop-blur-md shadow-sm border border-white/80 text-neutral-900' 
                    : 'text-neutral-600 hover:bg-white/40 border border-transparent'
                }`}>
                <item.icon size={18} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-neutral-900' : 'text-neutral-500'} />
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
