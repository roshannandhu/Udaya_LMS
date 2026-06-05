import React, { memo } from 'react';
import { TEACHER_NAV, STUDENT_NAV, MORE_ICON } from './nav-items';

const BottomNav = memo(function BottomNav({ active, setActive, type = 'teacher' }) {
  const source = type === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const items = source.filter((i) => i.primary);
  // Teachers get a "More" tab on mobile to reach students/reports/settings.
  if (type === 'teacher') items.push({ id: 'more', label: 'More', icon: MORE_ICON });

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <nav className="nav-dark max-w-md mx-auto px-4 py-2 flex items-center justify-between rounded-[28px] pointer-events-auto">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <button key={item.id} onClick={() => setActive(item.id)} title={item.label}
              className={`flex items-center justify-center w-[42px] h-[42px] rounded-full transition-colors flex-shrink-0 ${
                isActive ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}>
              <item.icon size={20} strokeWidth={isActive ? 2.5 : 2} />
            </button>
          );
        })}
      </nav>
    </div>
  );
});

export default BottomNav;
