import React, { memo } from 'react';
import { Home, BookOpen, MessageSquare, Calendar, MoreHorizontal, Users, Video } from 'lucide-react';

const TEACHER_ITEMS = [
  { id: 'today',      label: 'Home',       icon: Home },
  { id: 'subjects',   label: 'Classes',    icon: BookOpen },
  { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
  { id: 'attendance', label: 'Attendance', icon: Calendar },
  { id: 'live',       label: 'Live',       icon: Video },
  { id: 'more',       label: 'More',       icon: MoreHorizontal },
];

const STUDENT_ITEMS = [
  { id: 'home',       label: 'Home',       icon: Home },
  { id: 'subjects',   label: 'Subjects',   icon: BookOpen },
  { id: 'broadcasts', label: 'Broadcasts', icon: MessageSquare },
  { id: 'live',       label: 'Live',       icon: Video },
  { id: 'profile',    label: 'Profile',    icon: Users },
  { id: 'more',       label: 'More',       icon: MoreHorizontal },
];

const BottomNav = memo(function BottomNav({ active, setActive, type = 'teacher' }) {
  const items = type === 'teacher' ? TEACHER_ITEMS : STUDENT_ITEMS;
  return (
    <nav className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 right-4 z-40 glass-nav rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.05)] lg:hidden">
      <div className="max-w-5xl mx-auto flex p-1">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[52px] rounded-xl transition-all ${isActive ? 'bg-white/60 shadow-sm border border-white/80 text-neutral-900' : 'text-neutral-500 hover:text-neutral-700 border border-transparent'}`}>
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

export default BottomNav;
