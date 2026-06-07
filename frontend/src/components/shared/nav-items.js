import { MdHome, MdMenuBook, MdPeople, MdChatBubble, MdEvent, MdVideocam, MdBarChart, MdPerson, MdAssignment, MdEmojiEvents, MdMoreHoriz } from 'react-icons/md';

// Single source of truth for primary navigation, shared by TopNav (desktop)
// and BottomNav (mobile). `primary` items show in the mobile bottom bar.

export const TEACHER_NAV = [
  { id: 'today',      label: 'Home',         icon: MdHome,          path: '/teacher',              primary: true },
  { id: 'subjects',   label: 'Classes',      icon: MdMenuBook,      path: '/teacher/standards',     primary: true },
  { id: 'students',   label: 'Students',     icon: MdPeople,        path: '/teacher/students' },
  { id: 'broadcasts', label: 'Broadcasts',   icon: MdChatBubble,    path: '/teacher/broadcasts',   primary: true },
  { id: 'attendance', label: 'Attendance',   icon: MdEvent,         path: '/teacher/attendance',   primary: true },
  { id: 'live',       label: 'Live Classes', icon: MdVideocam,      path: '/teacher/live-classes', primary: true },
  { id: 'reports',    label: 'Reports',      icon: MdBarChart,      path: '/teacher/reports' },
  { id: 'more',       label: 'Profile',      icon: MdPerson,        path: '/teacher/more' },
];

export const STUDENT_NAV = [
  { id: 'home',        label: 'Home',         icon: MdHome,          path: '/student',              primary: true },
  { id: 'subjects',    label: 'Subjects',     icon: MdMenuBook,      path: '/student/subjects',     primary: true },
  { id: 'calendar',    label: 'Calendar',     icon: MdEvent,         path: '/student/calendar' },
  { id: 'tests',       label: 'Tests',        icon: MdAssignment,    path: '/student/tests',        primary: true },
  { id: 'broadcasts',  label: 'Broadcasts',   icon: MdChatBubble,    path: '/student/broadcasts',   primary: true },
  { id: 'live',        label: 'Live',         icon: MdVideocam,      path: '/student/live-classes', primary: true },
  { id: 'leaderboard', label: 'Ranking',      icon: MdEmojiEvents,   path: '/student/leaderboard' },
  { id: 'profile',     label: 'Profile',      icon: MdPerson,        path: '/student/profile' },
];

export const MORE_ICON = MdMoreHoriz;

// Resolve the active tab id from a pathname.
export function activeNavId(type, path) {
  if (type === 'teacher') {
    if (path === '/teacher' || path === '/teacher/') return 'today';
    if (path.startsWith('/teacher/standards'))     return 'subjects';
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
