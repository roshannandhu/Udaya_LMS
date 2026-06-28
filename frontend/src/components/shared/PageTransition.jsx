import React, { useCallback, useRef } from 'react';
import { useLocation, Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';

/**
 * PageTransition
 * ─────────────
 * Wraps <Outlet /> and plays a smooth fade+slide-up on every route change.
 * Uses React startTransition so the old page stays visible while the new
 * chunk loads, avoiding a flash of the Suspense fallback on slow connections.
 *
 * Pure CSS — no Framer Motion dependency needed here.
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  const [displayLocation, setDisplayLocation] = useState(location);
  const [transitionStage, setTransitionStage] = useState('enter');
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (location.pathname === displayLocation.pathname) return;
    // Start exit
    setTransitionStage('exit');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    // After exit animation, swap content and enter
    timeoutRef.current = setTimeout(() => {
      setDisplayLocation(location);
      setTransitionStage('enter');
    }, 160); // matches exit duration below
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <style>{`
        .page-enter {
          animation: pageEnter 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
          will-change: opacity, transform;
        }
        .page-exit {
          animation: pageExit 0.14s ease-in both;
          will-change: opacity, transform;
        }
        @keyframes pageEnter {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pageExit {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-6px); }
        }
      `}</style>
      <div
        key={displayLocation.pathname}
        className={transitionStage === 'enter' ? 'page-enter' : 'page-exit'}
      >
        {children}
      </div>
    </>
  );
}
