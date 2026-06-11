import React, { memo } from 'react';
import { useMotionValue } from 'framer-motion';
import { TEACHER_NAV, STUDENT_NAV, MORE_ICON } from './nav-items';
import DockItem from './DockItem';

const BottomNav = memo(function BottomNav({ active, setActive, type = 'teacher', badges }) {
  const source = type === 'teacher' ? TEACHER_NAV : STUDENT_NAV;
  const items = source.filter((i) => i.primary);
  // Teachers get a "More" tab on mobile to reach students/reports/settings.
  if (type === 'teacher') items.push({ id: 'more', label: 'More', icon: MORE_ICON });

  // Dock magnification: track the pointer's x over the pill (mouse or finger drag).
  const mouseX = useMotionValue(Infinity);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pointer-events-none">
      <nav
        className="nav-dark max-w-md mx-auto px-4 py-2 h-[58px] flex items-center justify-between rounded-[28px] pointer-events-auto"
        onMouseMove={(e) => mouseX.set(e.clientX)}
        onMouseLeave={() => mouseX.set(Infinity)}
        onTouchMove={(e) => mouseX.set(e.touches[0].clientX)}
        onTouchEnd={() => mouseX.set(Infinity)}
        onTouchCancel={() => mouseX.set(Infinity)}
      >
        {items.map((item) => {
          const isActive = active === item.id;
          const badge = badges?.[item.id] || 0;
          return (
            <div key={item.id} className="relative flex-shrink-0">
              <DockItem
                mouseX={mouseX}
                baseSize={42}
                magnification={60}
                distance={110}
                onClick={() => setActive(item.id)}
                title={item.label}
                className={`flex items-center justify-center rounded-full transition-colors flex-shrink-0 ${
                  isActive ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
                }`}
              >
                <item.icon className="w-6 h-6" />
              </DockItem>
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
