import { Home, BookOpen, Users, MessageSquare, Calendar, Video, BarChart3, User, FileQuestion, Trophy, MoreHorizontal } from 'lucide-react';

// Single source of truth for primary navigation, shared by TopNav (desktop)
// and BottomNav (mobile). `primary` items show in the mobile bottom bar.

export const TEACHER_NAV = [
  { id: 'today',      label: 'Home',         icon: Home,          path: '/teacher',              primary: true },
  { id: 'subjects',   label: 'Classes',      icon: BookOpen,      path: '/teacher/subjects',     primary: true },
  { id: 'students',   label: 'Students',     icon: Users,         path: '/teacher/students' },
  { id: 'broadcasts', label: 'Broadcasts',   icon: MessageSquare, path: '/teacher/broadcasts',   primary: true },
  { id: 'attendance', label: 'Attendance',   icon: Calendar,      path: '/teacher/attendance',   primary: true },
  { id: 'live',       label: 'Live Classes', icon: Video,         path: '/teacher/live-classes', primary: true },
  { id: 'reports',    label: 'Reports',      icon: BarChart3,     path: '/teacher/reports' },
  { id: 'more',       label: 'Profile',      icon: User,          path: '/teacher/more' },
];

export const STUDENT_NAV = [
  { id: 'home',        label: 'Home',         icon: Home,          path: '/student',              primary: true },
  { id: 'subjects',    label: 'Subjects',     icon: BookOpen,      path: '/student/subjects',     primary: true },
  { id: 'calendar',    label: 'Calendar',     icon: Calendar,      path: '/student/calendar',     primary: true },
  { id: 'tests',       label: 'Tests',        icon: FileQuestion,  path: '/student/tests',        primary: true },
  { id: 'broadcasts',  label: 'Broadcasts',   icon: MessageSquare, path: '/student/broadcasts',   primary: true },
  { id: 'live',        label: 'Live',         icon: Video,         path: '/student/live-classes' },
  { id: 'leaderboard', label: 'Ranking',      icon: Trophy,        path: '/student/leaderboard' },
  { id: 'profile',     label: 'Profile',      icon: User,          path: '/student/profile' },
];

export const MORE_ICON = MoreHorizontal;

// Resolve the active tab id from a pathname.
export function activeNavId(type, path) {
  if (type === 'teacher') {
    if (path === '/teacher' || path === '/teacher/') return 'today';
    if (path.startsWith('/teacher/subjects'))     return 'subjects';
    if (path.startsWith('/teacher/students'))     return 'students';
    if (path.startsWith('/teacher/attendance'))   return 'attendance';
    if (path.startsWith('/teacher/broadcasts'))   return 'broadcasts';
    if (path.startsWith('/teacher/live-classes')) return 'live';
    if (path.startsWith('/teacher/reports'))      return 'reports';
    return 'more';
  }
  if (path === '/student' || path === '/student/') return 'home';
  if (path.startsWith('/student/calendar'))     return 'calendar';
  if (path.startsWith('/student/subjects'))     return 'subjects';
  if (path.startsWith('/student/broadcasts'))   return 'broadcasts';
  if (path.startsWith('/student/live-classes')) return 'live';
  if (path.startsWith('/student/tests'))        return 'tests';
  if (path.startsWith('/student/leaderboard'))  return 'leaderboard';
  if (path.startsWith('/student/profile'))      return 'profile';
  return 'home';
}
