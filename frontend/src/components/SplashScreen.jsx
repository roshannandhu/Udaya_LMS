import React, { useEffect, useRef, useState } from 'react';
import logoSrc from '/iconn.jpeg';

/**
 * SplashScreen
 * ────────────
 * Phone  → pure white, logo + text fade/slide in, thin progress bar, screen fades out.
 * PC     → frosted-glass white, same intro, then:
 *            1. text dissolves (blur + fade letter by letter)
 *            2. logo shrinks and flies to the browser-tab position (top-left)
 *            3. everything fades out, app loads
 *
 * Props:
 *   onDone  — callback fired when the outro finishes (parent should unmount this).
 *   duration — approx ms before outro starts (default 1800).
 */
export default function SplashScreen({ onDone, duration = 1800 }) {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;

  // ── Phase state ──────────────────────────────────────────────────────────────
  // 'intro' → 'hold' → 'dissolve-text' (desktop) → 'fly-logo' (desktop) → 'fade-out'
  const [phase, setPhase] = useState('intro');
  const logoRef   = useRef(null);
  const textRef   = useRef(null);
  const wrapRef   = useRef(null);

  useEffect(() => {
    // Phase timeline
    const t1 = setTimeout(() => {
      if (isDesktop) {
        setPhase('dissolve-text');
        const t2 = setTimeout(() => {
          setPhase('fly-logo');
          const t3 = setTimeout(() => {
            setPhase('fade-out');
            const t4 = setTimeout(() => onDone?.(), 600);
            return () => clearTimeout(t4);
          }, 800);
          return () => clearTimeout(t3);
        }, 600);
        return () => clearTimeout(t2);
      } else {
        setPhase('fade-out');
        const t2 = setTimeout(() => onDone?.(), 600);
        return () => clearTimeout(t2);
      }
    }, duration);

    return () => clearTimeout(t1);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Logo target: browser tab top-left corner ─────────────────────────────────
  // We estimate the favicon sits at roughly (16px, 10px) from viewport top-left.
  // The logo is centered at (50vw, 50vh). So delta = -(50vw - 16) , -(50vh - 10).
  const flyStyle = phase === 'fly-logo' ? {
    transform: `translate(calc(-50vw + 24px), calc(-50vh + 12px)) scale(0.07)`,
    opacity: 0,
    transition: 'transform 0.8s cubic-bezier(0.4, 0, 0.8, 1), opacity 0.8s ease 0.3s',
  } : {
    transform: 'translate(0,0) scale(1)',
    opacity: 1,
    transition: 'transform 0.8s ease, opacity 0.4s ease',
  };

  // ── Text chars for staggered dissolve ────────────────────────────────────────
  const title = 'Udaya Tuition Home';

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

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
          from { opacity: 0; transform: translateY(18px); filter: blur(4px); }
          to   { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        .splash-title-wrap {
          animation: textIn 0.5s ease 0.55s both;
        }

        /* ── Char dissolve (desktop outro) ── */
        .splash-char {
          display: inline-block;
          transition: opacity 0.35s ease, filter 0.35s ease, transform 0.35s ease;
        }
        .dissolve-text .splash-char {
          opacity: 0;
          filter: blur(6px);
          transform: translateY(-6px) scale(0.9);
        }

        /* ── Sub-label ── */
        .splash-sub {
          margin-top: 8px;
          font-size: 0.7rem;
          font-weight: 400;
          letter-spacing: 0.12em;
          color: #a3a3a3;
          text-transform: uppercase;
          animation: textIn 0.5s ease 0.75s both;
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
        ref={wrapRef}
        className={[
          'splash-root',
          isDesktop ? 'desktop' : 'phone',
          phase === 'fade-out' ? 'fade-out' : '',
          phase === 'dissolve-text' ? 'dissolve-text' : '',
        ].join(' ')}
      >
        {/* Logo — wrapped so we can animate independently on desktop */}
        <div
          ref={logoRef}
          className="splash-logo-wrap"
          style={isDesktop ? flyStyle : {}}
        >
          <img
            src={logoSrc}
            alt="Udaya logo"
            className="splash-logo"
            draggable={false}
          />
        </div>

        {/* Title + subtitle */}
        <div ref={textRef} className="splash-title-wrap">
          <div className="splash-title" aria-label={title}>
            {title.split('').map((ch, i) => (
              <span
                key={i}
                className="splash-char"
                style={
                  phase === 'dissolve-text'
                    ? { transitionDelay: `${i * 22}ms` }
                    : { transitionDelay: `0ms` }
                }
              >
                {ch === ' ' ? '\u00a0' : ch}
              </span>
            ))}
          </div>
          <div className="splash-sub">Powered by Udaya</div>
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
