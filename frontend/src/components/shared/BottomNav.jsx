import React, { memo } from 'react';
import { motion } from 'framer-motion';
import { TEACHER_NAV, STUDENT_NAV, MORE_ICON } from './nav-items';

const pillSpring = { type: 'spring', stiffness: 400, damping: 36 };

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
              {isActive && (
                <motion.div
                  layoutId={`nav-pill-${type}`}
                  className="absolute inset-0 rounded-full bg-white"
                  transition={pillSpring}
                />
              )}
              <button
                type="button"
                onClick={() => setActive(item.id)}
                title={item.label}
                className={`relative z-10 w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0
                  transition-colors duration-150 ease-out
                  active:scale-90
                  ${isActive ? 'text-black' : 'text-neutral-400 hover:text-white'}`}
              >
                <item.icon className="w-6 h-6" />
              </button>
              {badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none pointer-events-none z-20">
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
