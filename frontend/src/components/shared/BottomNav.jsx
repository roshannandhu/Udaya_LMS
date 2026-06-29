import React, { memo } from 'react';
import { TEACHER_NAV, STUDENT_NAV, MORE_ICON } from './nav-items';

const BottomNav = memo(function BottomNav({ active, setActive, type = 'teacher', badges }) {
  const source = type === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const items = source.filter((i) => i.primary);
  // Teachers get a "More" tab on mobile to reach students/reports/settings.
  if (type === 'teacher') items.push({ id: 'more', label: 'More', icon: MORE_ICON });

  return (
    <div className="lg:hidden shrink-0 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
      <nav className="nav-dark max-w-md mx-auto px-4 py-2 h-[58px] flex items-center justify-between rounded-[28px]">
        {items.map((item) => {
          const isActive = active === item.id;
          const badge = badges?.[item.id] || 0;
          return (
            <div key={item.id} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => setActive(item.id)}
                title={item.label}
                className={`w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0
                  transition-all duration-200 ease-out will-change-transform
                  active:scale-90
                  ${isActive ? 'bg-white text-black scale-105' : 'text-neutral-400 hover:text-white'}`}
              >
                <item.icon className="w-6 h-6" />
              </button>
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </div>
          );
        })}
      </nav>
    </div>

  );
});

export default BottomNav;
