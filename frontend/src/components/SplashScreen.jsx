import React, { useEffect, useState } from 'react';
import logoSrc from '/iconn.jpeg';

/**
 * SplashScreen
 * ────────────
 * Phone  → pure white, logo + text fade/slide in, thin progress bar, screen fades out.
 * PC     → frosted-glass white, same intro and same simple fade-out.
 *
 * Props:
 *   onDone   — callback fired when the outro finishes (parent should unmount this).
 *   duration — approx ms before fade-out starts (default 1800).
 */
export default function SplashScreen({ onDone, duration = 1800 }) {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;

  // 'intro' → 'fade-out' (same on both phone and desktop)
  const [phase, setPhase] = useState('intro');

  useEffect(() => {
    let t2;
    const t1 = setTimeout(() => {
      setPhase('fade-out');
      t2 = setTimeout(() => onDone?.(), 600);
    }, duration);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const title = 'Udaya Tuition Home';

  return (
    <>
      <style>{`
        .splash-root {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          font-family: 'Inter', sans-serif;
          overflow: hidden;
        }

        /* ── Phone: pure white ── */
        .splash-root.phone {
          background: #ffffff;
        }

        /* ── Desktop: frosted glass ── */
        .splash-root.desktop {
          background: rgba(255,255,255,0.85);
          backdrop-filter: blur(40px) saturate(180%);
          -webkit-backdrop-filter: blur(40px) saturate(180%);
        }
        .splash-root.desktop::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none;
          opacity: 0.5;
        }

        /* ── Fade-out overlay ── */
        .splash-root.fade-out {
          opacity: 0;
          transition: opacity 0.55s ease;
          pointer-events: none;
        }

        /* ── Logo wrapper ── */
        .splash-logo-wrap {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          /* inline style handles fly animation */
        }

        /* ── Logo intro ── */
        @keyframes logoIn {
          from { opacity: 0; transform: scale(0.78); }
          to   { opacity: 1; transform: scale(1); }
        }
        .splash-logo {
          width: 120px;
          height: 120px;
          object-fit: contain;
          animation: logoIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.18s both;
          user-select: none;
          pointer-events: none;
        }
        @media (min-width: 768px) {
          .splash-logo { width: 140px; height: 140px; }
        }

        /* ── Title ── */
        .splash-title {
          margin-top: 28px;
          font-size: 1.25rem;
          font-weight: 600;
          letter-spacing: 0.06em;
          color: #111111;
          display: flex;
          gap: 0;
        }
        @keyframes textIn {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .splash-title-wrap {
          animation: textIn 0.5s ease 0.55s both;
        }

        /* ── Progress bar (phone only) ── */
        @keyframes progress {
          from { width: 0%; }
          to   { width: 72%; }
        }
        .splash-progress-track {
          position: absolute;
          bottom: 56px;
          left: 50%;
          transform: translateX(-50%);
          width: 60px;
          height: 2px;
          background: #e5e5e5;
          border-radius: 99px;
          overflow: hidden;
          animation: textIn 0.4s ease 0.9s both;
        }
        .splash-progress-bar {
          height: 100%;
          background: #111111;
          border-radius: 99px;
          width: 0%;
          animation: progress 1.4s cubic-bezier(0.4,0,0.2,1) 1s forwards;
        }
      `}</style>

      <div
        className={[
          'splash-root',
          isDesktop ? 'desktop' : 'phone',
          phase === 'fade-out' ? 'fade-out' : '',
        ].join(' ')}
      >
        {/* Logo */}
        <div className="splash-logo-wrap">
          <img
            src={logoSrc}
            alt="Udaya logo"
            className="splash-logo"
            draggable={false}
          />
        </div>

        {/* Title */}
        <div className="splash-title-wrap">
          <div className="splash-title">{title}</div>
        </div>

        {/* Phone-only progress bar */}
        {!isDesktop && (
          <div className="splash-progress-track">
            <div className="splash-progress-bar" />
          </div>
        )}
      </div>
    </>
  );
}
