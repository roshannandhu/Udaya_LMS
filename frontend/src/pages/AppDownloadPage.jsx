import React, { useEffect, useRef, useState } from 'react';
import {
  MdMenuBook, MdAssignment, MdVideocam, MdChatBubble, MdEmojiEvents, MdBarChart,
} from 'react-icons/md';
import { Play } from 'lucide-react';
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';
import { apiClient } from '../lib/api';

// ── Constants (real, working) ──────────────────────────────────────────────────
const R2_BASE = 'https://files.udaya-learn.com';
const FALLBACK_APK = `${R2_BASE}/app/udaya-latest.apk`;
const LOCATION_URL = 'https://share.google/M9oZS4oVP6281fzOi';
const CONTACT_EMAIL = 'udayatuitionhome@gmail.com';

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return null;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Real student-app features (the app's actual capabilities) with the app's own icons.
const FEATURES = [
  { Icon: MdMenuBook,   grad: 'linear-gradient(135deg,#4DA6FF,#2E7DFF)', sh: 'rgba(77,166,255,0.35)',  title: 'Subjects & lessons',     body: 'Every subject in one place, with video lessons you can watch and resume anytime.' },
  { Icon: Play,         grad: 'linear-gradient(135deg,#FF6B6B,#FF8FB1)', sh: 'rgba(255,107,107,0.35)', title: 'Video lessons',          body: 'Stream class videos, pick up right where you left off, and track what you finished.' },
  { Icon: MdAssignment, grad: 'linear-gradient(135deg,#FFC93C,#FFAE2E)', sh: 'rgba(255,201,60,0.4)',   title: 'Tests & instant results',body: 'Take quizzes and exams, then see your score, rank and answers straight away.' },
  { Icon: MdVideocam,   grad: 'linear-gradient(135deg,#28C7A0,#16A77F)', sh: 'rgba(40,199,160,0.35)',  title: 'Live classes',           body: 'Join live online classes right from your phone — never miss a session.' },
  { Icon: MdChatBubble, grad: 'linear-gradient(135deg,#9B6BFF,#6A3CFF)', sh: 'rgba(155,107,255,0.38)', title: 'Class updates',          body: 'Announcements, notes and important messages from your teacher in one feed.' },
  { Icon: MdEmojiEvents,grad: 'linear-gradient(135deg,#FF8FB1,#FF6B9D)', sh: 'rgba(255,143,177,0.4)',  title: 'Leaderboard & ranking',  body: 'Earn points, climb the class leaderboard and see how you rank among friends.' },
];

const PAGE_CSS = `
  .u-page * { box-sizing: border-box; }
  @keyframes uBlob {
    0%{transform:translate(0,0) scale(1) rotate(0)} 33%{transform:translate(40px,-30px) scale(1.12) rotate(20deg)}
    66%{transform:translate(-30px,25px) scale(.94) rotate(-15deg)} 100%{transform:translate(0,0) scale(1) rotate(0)}
  }
  @keyframes uFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-22px)} }
  @keyframes uFloatSm { 0%,100%{transform:translateY(0) rotate(-6deg)} 50%{transform:translateY(-14px) rotate(6deg)} }
  @keyframes uTwinkle { 0%,100%{opacity:.35;transform:scale(.7)} 50%{opacity:1;transform:scale(1.1)} }
  @keyframes uBob { 0%,100%{transform:translateY(0) rotate(0)} 50%{transform:translateY(-12px) rotate(1.5deg)} }
  @keyframes uProgress { from{width:0%} to{width:68%} }
  @keyframes uWiggle { 0%,100%{transform:rotate(-3deg)} 50%{transform:rotate(3deg)} }
  .u-reveal { opacity:0; transform:translateY(40px); transition:opacity .7s ease, transform .8s cubic-bezier(.16,.84,.44,1); }
  @media (max-width:820px){
    .u-hero-grid{ grid-template-columns:1fr !important; gap:32px !important; }
    .u-hero-left { text-align: center; display: flex; flex-direction: column; align-items: center; }
    .u-hero-btn-wrap { justify-content: center; text-align: left; }
    .u-fgrid{ grid-template-columns:1fr 1fr !important; }
    .u-steps{ grid-template-columns:1fr !important; max-width:360px; margin:0 auto; }
    /* Copy + download stay first; the phone visual sits below it. */
    .u-phonewrap{ margin-top:14px; }
    /* No mouse on phones → straighten the device so it never looks skewed/clipped. */
    .u-phone3d{ transform:none !important; }
    .u-footer { flex-direction: column !important; gap: 24px !important; text-align: center; }
    .u-footer-links { justify-content: center !important; }
  }
  @media (max-width:520px){
    .u-hero-title { font-size: 36px !important; }
    .u-fgrid{ grid-template-columns:1fr !important; }
    /* Scale the mockup to fit small screens without horizontal scroll. */
    .u-phonewrap{ transform:scale(0.82); transform-origin:top center; height:500px; }
  }
  @media (max-width:360px){
    .u-phonewrap{ transform:scale(0.72); height: 440px; }
  }
`;

export default function AppDownloadPage() {
  const { lmsName, lmsLogo, applyBranding } = useSettingsStore();
  const [info, setInfo] = useState(null);
  const rootRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => { document.title = `Get the ${lmsName || 'Udaya'} app`; }, [lmsName]);

  // Load the playful fonts once.
  useEffect(() => {
    const id = 'u-fonts';
    if (!document.getElementById(id)) {
      const l = document.createElement('link');
      l.id = id; l.rel = 'stylesheet';
      l.href = 'https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700;800&display=swap';
      document.head.appendChild(l);
    }
  }, []);

  // Branding + live app version. R2 version.json is the source of truth (the CI
  // pipeline writes it on every release), so read it FIRST/directly; fall back to the
  // backend only if R2 is unreachable. This guarantees the page shows the ACTUAL
  // published version, never a stale/guessed one.
  useEffect(() => {
    apiClient('/branding').then(applyBranding).catch(() => {});
    fetch(`${R2_BASE}/app/version.json?t=${Date.now()}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        if (j && j.versionName) { setInfo(j); return; }
        return apiClient('/app/version').then(d => { if (d && d.versionName) setInfo(d); });
      })
      .catch(() => {
        apiClient('/app/version').then(d => { if (d && d.versionName) setInfo(d); }).catch(() => {});
      });
  }, [applyBranding]);

  // Scroll reveals + mouse parallax + phone tilt (ported from the design prototype).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reveals = Array.from(root.querySelectorAll('[data-reveal]'));
    const show = (el) => {
      if (el._shown) return; el._shown = true;
      el.style.transitionDelay = (parseInt(el.dataset.delay || '0', 10)) + 'ms';
      el.style.opacity = '1'; el.style.transform = 'none';
    };
    const checkReveals = () => {
      const h = window.innerHeight || document.documentElement.clientHeight;
      reveals.forEach((el) => {
        if (el._shown) return;
        const r = el.getBoundingClientRect();
        if (r.top < h * 0.92 && r.bottom > 0) show(el);
      });
    };
    checkReveals();
    window.addEventListener('scroll', checkReveals, { passive: true, capture: true });
    window.addEventListener('resize', checkReveals, { passive: true });
    const fallback = setTimeout(() => reveals.forEach(show), 1200);

    const parallaxEls = Array.from(root.querySelectorAll('[data-parallax]'));
    let mx = 0, my = 0, raf = null;
    const tick = () => {
      raf = null;
      const p = phoneRef.current;
      if (p) p.style.transform = `rotateX(${(6 - my * 14).toFixed(2)}deg) rotateY(${(-14 + mx * 18).toFixed(2)}deg)`;
      parallaxEls.forEach((el) => {
        const d = parseFloat(el.dataset.parallax) || 20;
        el.style.translate = `${(mx * d).toFixed(1)}px ${(my * d).toFixed(1)}px`;
      });
    };
    const onMove = (ev) => {
      const r = root.getBoundingClientRect();
      mx = (ev.clientX - r.left) / r.width - 0.5;
      my = (ev.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => {
      window.removeEventListener('scroll', checkReveals, { capture: true });
      window.removeEventListener('resize', checkReveals);
      window.removeEventListener('mousemove', onMove);
      clearTimeout(fallback);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const fallbackVersion = '1.2.8';
  const fallbackApkUrl = `${R2_BASE}/app/udaya-${fallbackVersion}.apk`;
  const apkUrl = info?.apkUrl || info?.apkLatestUrl || fallbackApkUrl;

  const versionName = info?.versionName || fallbackVersion;
  const size = formatSize(info?.sizeBytes) || '6.7 MB';
  const meta = `v${versionName}${size ? ` · ${size}` : ''} · no ads`;
  const name = lmsName || 'Udaya';
  const hasLogo = !!lmsLogo;

  // Reusable bits
  const Brand = ({ big }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
      {hasLogo ? (
        <img src={lmsLogo} alt={name} style={{ width: big ? 38 : 34, height: big ? 38 : 34, borderRadius: 11, objectFit: 'cover', boxShadow: '0 6px 16px rgba(255,107,107,0.25)' }} />
      ) : (
        <div style={{ width: big ? 38 : 34, height: big ? 38 : 34, borderRadius: 11, background: 'linear-gradient(135deg,#FFC93C,#FF6B6B)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(255,107,107,0.35)', transform: 'rotate(-6deg)' }}>
          <div style={{ width: big ? 14 : 12, height: big ? 14 : 12, background: '#fff', borderRadius: 4, transform: 'rotate(45deg)' }} />
        </div>
      )}
      <span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: big ? 24 : 20, letterSpacing: '-0.5px', color: '#2A2350' }}>{name}</span>
    </div>
  );

  const reveal = (delay = 0) => ({ 'data-reveal': true, 'data-delay': delay, className: 'u-reveal' });

  return (
    <div ref={rootRef} className="u-page" style={{ fontFamily: "'Nunito',sans-serif", color: '#2A2350', background: '#FFF9F0', overflowX: 'hidden', position: 'relative', minHeight: '100dvh' }}>
      <style>{PAGE_CSS}</style>

      {/* NAV */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px clamp(20px,5vw,64px)', backdropFilter: 'blur(10px)', background: 'rgba(255,249,240,0.72)', borderBottom: '1px solid rgba(42,35,80,0.06)' }}>
        <Brand big />
        <a href={apkUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 15, color: '#fff', textDecoration: 'none', background: '#2A2350', padding: '11px 20px', borderRadius: 999, boxShadow: '0 8px 18px rgba(42,35,80,0.22)' }}>Get the app</a>
      </nav>

      {/* HERO */}
      <section style={{ position: 'relative', padding: 'clamp(40px,7vw,84px) clamp(20px,5vw,64px) clamp(60px,8vw,100px)', overflow: 'hidden' }}>
        <div data-parallax="26" style={{ position: 'absolute', top: -80, left: -60, width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#9B6BFF,#6A3CFF)', filter: 'blur(8px)', opacity: 0.32, animation: 'uBlob 16s ease-in-out infinite', zIndex: 0 }} />
        <div data-parallax="40" style={{ position: 'absolute', top: 40, right: -40, width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#4DA6FF,#28C7A0)', filter: 'blur(8px)', opacity: 0.30, animation: 'uBlob 20s ease-in-out infinite reverse', zIndex: 0 }} />
        <div data-parallax="18" style={{ position: 'absolute', bottom: -100, left: '40%', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle at 30% 30%,#FFC93C,#FF6B6B)', filter: 'blur(10px)', opacity: 0.28, animation: 'uBlob 18s ease-in-out infinite', zIndex: 0 }} />
        <div data-parallax="60" style={{ position: 'absolute', top: '18%', left: '8%', fontSize: 26, animation: 'uTwinkle 3.5s ease-in-out infinite', zIndex: 1 }}>✦</div>
        <div data-parallax="50" style={{ position: 'absolute', top: '30%', right: '10%', width: 22, height: 22, background: '#28C7A0', borderRadius: 7, transform: 'rotate(20deg)', animation: 'uFloatSm 6s ease-in-out infinite', zIndex: 1 }} />
        <div data-parallax="70" style={{ position: 'absolute', bottom: '14%', right: '16%', fontSize: 22, color: '#FFC93C', animation: 'uTwinkle 4s ease-in-out infinite', zIndex: 1 }}>★</div>

        <div className="u-hero-grid" style={{ position: 'relative', zIndex: 2, maxWidth: 1180, margin: '0 auto', display: 'grid', gridTemplateColumns: '1.05fr 0.95fr', gap: 'clamp(24px,4vw,56px)', alignItems: 'center' }}>
          {/* left copy */}
          <div className="u-hero-left">
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', padding: '7px 14px 7px 8px', borderRadius: 999, boxShadow: '0 6px 16px rgba(42,35,80,0.08)', marginBottom: 22 }}>
              <span style={{ background: 'linear-gradient(135deg,#FFC93C,#FF6B6B)', color: '#fff', fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 12, padding: '3px 10px', borderRadius: 999 }}>NEW</span>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: '#6B6593' }}>The official {name} app</span>
            </div>
            <h1 className="u-hero-title" style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 'clamp(40px,6vw,68px)', lineHeight: 1.02, letterSpacing: '-1.5px', margin: '0 0 20px', color: '#2A2350' }}>
              Learning that feels like <span style={{ position: 'relative', display: 'inline-block', color: '#FF6B6B' }}>play<span style={{ position: 'absolute', left: 0, bottom: 4, width: '100%', height: 12, background: '#FFC93C', opacity: 0.55, borderRadius: 999, zIndex: -1 }} /></span>.
            </h1>
            <p style={{ fontSize: 'clamp(16px,1.5vw,19px)', lineHeight: 1.55, color: '#6B6593', fontWeight: 600, maxWidth: 470, margin: '0 0 32px' }}>
              Video lessons, tests, live classes and rankings for <strong style={{ color: '#2A2350' }}>classes 8, 9 &amp; 10</strong> — all in one app. Download once, learn anywhere.
            </p>
            <div id="download" className="u-hero-btn-wrap" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
              <a href={apkUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'linear-gradient(135deg,#FF6B6B,#FF8FB1)', color: '#fff', textDecoration: 'none', padding: '16px 26px', borderRadius: 18, boxShadow: '0 14px 30px rgba(255,107,107,0.4)', transform: 'rotate(-1deg)' }}>
                <span style={{ fontSize: 26 }}>⬇</span>
                <span style={{ textAlign: 'left', lineHeight: 1.1 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, opacity: 0.85 }}>Direct download</span>
                  <span style={{ display: 'block', fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 19 }}>Get the APK</span>
                </span>
              </a>
              <div style={{ lineHeight: 1.3 }}>
                <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 15, color: '#2A2350' }}>Android • Free</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#9590B5' }}>{meta}</div>
              </div>
            </div>
          </div>

          {/* right phone */}
          <div className="u-phonewrap" style={{ perspective: 1300, display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
            <div data-parallax="34" style={{ position: 'absolute', top: -6, left: '4%', zIndex: 6, background: '#fff', padding: '10px 14px', borderRadius: 16, boxShadow: '0 14px 26px rgba(42,35,80,0.16)', display: 'flex', alignItems: 'center', gap: 9, animation: 'uBob 5s ease-in-out infinite' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg,#28C7A0,#4DA6FF)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>✓</div>
              <div style={{ lineHeight: 1.1 }}><div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 14, color: '#2A2350' }}>Test done!</div><div style={{ fontSize: 11, fontWeight: 700, color: '#9590B5' }}>+20 points</div></div>
            </div>
            <div data-parallax="46" style={{ position: 'absolute', bottom: 28, right: '0%', zIndex: 6, background: '#2A2350', color: '#fff', padding: '12px 16px', borderRadius: 16, boxShadow: '0 14px 26px rgba(42,35,80,0.28)', animation: 'uBob 6s ease-in-out infinite', animationDelay: '.6s' }}>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>Day streak</div>
              <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 22, display: 'flex', alignItems: 'center', gap: 6 }}>🔥 14</div>
            </div>

            <div style={{ animation: 'uFloat 6s ease-in-out infinite' }}>
              <div ref={phoneRef} className="u-phone3d" style={{ transform: 'rotateX(6deg) rotateY(-14deg)', transformStyle: 'preserve-3d', transition: 'transform .25s ease-out', width: 286, height: 590, borderRadius: 44, background: '#2A2350', padding: 11, boxShadow: '0 40px 70px rgba(42,35,80,0.34), inset 0 0 0 2px rgba(255,255,255,0.06)' }}>
                <div style={{ width: '100%', height: '100%', borderRadius: 34, background: 'linear-gradient(180deg,#FFFDF8,#FFF2E4)', overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', width: 96, height: 22, background: '#2A2350', borderRadius: 999, zIndex: 5 }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 22px 6px', fontSize: 11, fontWeight: 800, color: '#2A2350' }}><span>9:41</span><span>📶 ⚡ 100%</span></div>
                  <div style={{ padding: '10px 18px 0', flex: 1, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                      <div><div style={{ fontSize: 12, fontWeight: 700, color: '#9590B5' }}>Ready to learn 🌤</div><div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 21, color: '#2A2350' }}>Hey Aarav 👋</div></div>
                      <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#FFC93C,#FF6B6B)' }} />
                    </div>
                    <div style={{ marginTop: 16, background: 'linear-gradient(135deg,#9B6BFF,#6A3CFF)', borderRadius: 22, padding: 16, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: -20, right: -10, width: 80, height: 80, background: 'rgba(255,255,255,.14)', borderRadius: '50%' }} />
                      <div style={{ fontSize: 11, fontWeight: 800, opacity: 0.85 }}>KEEP GOING</div>
                      <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 17, margin: '3px 0 12px' }}>Algebra · Lesson 4</div>
                      <div style={{ height: 8, background: 'rgba(255,255,255,.28)', borderRadius: 999, overflow: 'hidden' }}><div style={{ height: '100%', width: '68%', background: '#FFC93C', borderRadius: 999, animation: 'uProgress 1.6s 0.4s both ease-out' }} /></div>
                      <div style={{ fontSize: 11, fontWeight: 700, marginTop: 7, opacity: 0.9 }}>68% complete</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 2px 10px' }}><span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 15, color: '#2A2350' }}>Your subjects</span><span style={{ fontSize: 12, fontWeight: 800, color: '#9B6BFF' }}>See all</span></div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 11 }}>
                      {[['➗', 'Maths', '#FFE3E3'], ['🔬', 'Science', '#D8F7EE'], ['📖', 'English', '#DCECFF'], ['🌍', 'Social', '#FFF1CC']].map(([e, t, bg]) => (
                        <div key={t} style={{ background: '#fff', borderRadius: 18, padding: 13, boxShadow: '0 6px 14px rgba(42,35,80,0.06)' }}>
                          <div style={{ width: 36, height: 36, borderRadius: 11, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{e}</div>
                          <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 14, marginTop: 8, color: '#2A2350' }}>{t}</div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#9590B5' }}>lessons</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '14px 18px 18px', background: '#fff', borderTop: '1px solid rgba(42,35,80,0.05)' }}>
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: 'linear-gradient(135deg,#FF6B6B,#FF8FB1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15 }}>⌂</div>
                    <div style={{ fontSize: 17, opacity: 0.4 }}>📚</div>
                    <div style={{ fontSize: 17, opacity: 0.4 }}>🏆</div>
                    <div style={{ fontSize: 17, opacity: 0.4 }}>👤</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — real app features with the app's icons */}
      <section id="features" style={{ padding: 'clamp(50px,7vw,90px) clamp(20px,5vw,64px)', position: 'relative' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div {...reveal()} style={{ textAlign: 'center', marginBottom: 'clamp(36px,5vw,60px)' }}>
            <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 14, color: '#9B6BFF', letterSpacing: 1 }}>WHY STUDENTS LOVE IT</div>
            <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 'clamp(30px,4.5vw,52px)', letterSpacing: '-1px', margin: '8px 0 0', color: '#2A2350' }}>Everything in one app</h2>
          </div>
          <div className="u-fgrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'clamp(16px,2vw,24px)' }}>
            {FEATURES.map((f, i) => (
              <div key={f.title} {...reveal((i % 3) * 80)} style={{ background: '#fff', borderRadius: 26, padding: 28, boxShadow: '0 16px 36px rgba(42,35,80,0.07)' }}>
                <div style={{ width: 58, height: 58, borderRadius: 18, background: f.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 10px 20px ${f.sh}`, marginBottom: 18 }}>
                  <f.Icon size={28} color="#fff" />
                </div>
                <h3 style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 21, margin: '0 0 8px', color: '#2A2350' }}>{f.title}</h3>
                <p style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.5, color: '#6B6593', margin: 0 }}>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: 'clamp(50px,7vw,90px) clamp(20px,5vw,64px)', background: 'linear-gradient(180deg,#FFF9F0,#FFF1E2)' }}>
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div {...reveal()} style={{ textAlign: 'center', marginBottom: 'clamp(36px,5vw,56px)' }}>
            <div style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 14, color: '#FF6B6B', letterSpacing: 1 }}>SO EASY</div>
            <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 'clamp(30px,4.5vw,52px)', letterSpacing: '-1px', margin: '8px 0 0', color: '#2A2350' }}>Up and learning in 3 taps</h2>
          </div>
          <div className="u-steps" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 'clamp(18px,2.5vw,28px)' }}>
            {[
              { emoji: '⬇️', n: 1, c: '#FF6B6B', sh: 'rgba(255,107,107,0.18)', t: 'Tap Download APK', b: `Grab the file straight from this page${size ? ` — it's tiny, about ${size}` : ''}.` },
              { emoji: '📲', n: 2, c: '#28C7A0', sh: 'rgba(40,199,160,0.18)', t: 'Install in seconds', b: 'Open it, allow install from this source, and you\'re done.' },
              { emoji: '🚀', n: 3, c: '#9B6BFF', sh: 'rgba(155,107,255,0.18)', t: 'Sign in & dive in', b: 'Log in with your Student ID and your subjects are ready.' },
            ].map((s, i) => (
              <div key={s.n} {...reveal(i * 120)} style={{ textAlign: 'center' }}>
                <div style={{ width: 96, height: 96, margin: '0 auto 20px', borderRadius: 30, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 42, boxShadow: `0 18px 34px ${s.sh}`, animation: `uWiggle 4s ease-in-out ${i * 0.5}s infinite` }}>{s.emoji}</div>
                <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: '50%', background: s.c, color: '#fff', fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{s.n}</div>
                <h3 style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 22, margin: '0 0 8px', color: '#2A2350' }}>{s.t}</h3>
                <p style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.5, color: '#6B6593', margin: '0 auto', maxWidth: 240 }}>{s.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <section style={{ padding: 'clamp(40px,5vw,70px) clamp(20px,5vw,64px) clamp(60px,7vw,90px)' }}>
        <div {...reveal()} style={{ maxWidth: 1080, margin: '0 auto', position: 'relative', overflow: 'hidden', borderRadius: 40, background: 'linear-gradient(135deg,#9B6BFF,#6A3CFF)', padding: 'clamp(40px,6vw,72px) clamp(24px,5vw,64px)', textAlign: 'center', boxShadow: '0 30px 60px rgba(106,60,255,0.35)' }}>
          <div style={{ position: 'absolute', top: -40, left: -20, width: 160, height: 160, background: 'rgba(255,255,255,.12)', borderRadius: '50%', animation: 'uFloat 7s ease-in-out infinite' }} />
          <div style={{ position: 'absolute', bottom: -50, right: -10, width: 200, height: 200, background: 'rgba(255,201,60,.22)', borderRadius: '50%', animation: 'uFloat 9s ease-in-out infinite reverse' }} />
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ fontSize: 38, marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 700, fontSize: 'clamp(28px,4.5vw,48px)', letterSpacing: '-1px', color: '#fff', margin: '0 0 14px' }}>Ready to learn the fun way?</h2>
            <p style={{ fontWeight: 700, fontSize: 17, color: 'rgba(255,255,255,0.85)', margin: '0 auto 30px', maxWidth: 470 }}>Start learning with {name} today — free, light and made for classes 8, 9 &amp; 10.</p>
            <a href={apkUrl} style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: '#fff', color: '#6A3CFF', textDecoration: 'none', padding: '17px 30px', borderRadius: 18, boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }}>
              <span style={{ fontSize: 24 }}>⬇</span>
              <span style={{ fontFamily: "'Fredoka',sans-serif", fontWeight: 600, fontSize: 20 }}>Download the APK</span>
            </a>
            <div style={{ marginTop: 16, fontWeight: 700, fontSize: 13.5, color: 'rgba(255,255,255,0.8)' }}>Android • {meta}, ever</div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '36px clamp(20px,5vw,64px) 48px', borderTop: '1px solid rgba(42,35,80,0.07)' }}>
        <div className="u-footer" style={{ maxWidth: 1180, margin: '0 auto', display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center', justifyContent: 'space-between' }}>
          <Brand />
          <div className="u-footer-links" style={{ display: 'flex', flexWrap: 'wrap', gap: 22 }}>
            <a href="#features" style={{ fontWeight: 700, fontSize: 14, color: '#6B6593', textDecoration: 'none' }}>Features</a>
            <a href={apkUrl} style={{ fontWeight: 700, fontSize: 14, color: '#6B6593', textDecoration: 'none' }}>Download</a>
            <a href={LOCATION_URL} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, fontSize: 14, color: '#6B6593', textDecoration: 'none' }}>Get directions</a>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ fontWeight: 700, fontSize: 14, color: '#6B6593', textDecoration: 'none' }}>Contact</a>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#9590B5' }}>Made with <span style={{ color: '#FF6B6B' }}>♥</span> for students of {name}.</div>
        </div>
      </footer>
    </div>
  );
}
