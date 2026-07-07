import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles, X, ChevronRight, Target, Zap, TrendingUp, Users, BarChart3, Brain } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';

// ── Message pools per role ─────────────────────────────────────────────────────
const STUDENT_MESSAGES = [
  "You're building great habits! Your consistency is paying off.",
  "Based on your scores, you're on the right track. Keep pushing!",
  "Every lesson you complete gets you closer to your goal.",
  "Your performance is improving! Stay consistent and you'll ace it.",
  "You're doing great! A little effort each day makes a big difference.",
];

const TEACHER_MESSAGES = [
  "Your class data is ready — check who needs extra support today.",
  "Stay ahead of the curve. Review the latest class analytics now.",
  "Some students may need attention. A quick look at reports can help.",
  "Great teaching shapes futures. See how your class is progressing.",
  "Your insights are updated. Spot trends before they become problems.",
];

// ── Word-by-word reveal with blur-fade animation ───────────────────────────────
function WordReveal({ text, isActive, onDone }) {
  const reduce = useReducedMotion();
  const words  = text.split(' ');
  const lastIdx = words.length - 1;

  if (reduce) return <span>{text}</span>;

  return (
    <span aria-label={text}>
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          initial={{ opacity: 0, y: 8, filter: 'blur(5px)' }}
          animate={
            isActive
              ? { opacity: 1, y: 0, filter: 'blur(0px)' }
              : { opacity: 0, y: 8, filter: 'blur(5px)' }
          }
          transition={{
            delay: isActive ? 0.25 + i * 0.065 : 0,
            duration: 0.38,
            ease: 'easeOut',
          }}
          onAnimationComplete={i === lastIdx && isActive ? onDone : undefined}
          className="inline-block mr-[0.27em]"
        >
          {word}
        </motion.span>
      ))}
    </span>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────
function Chip({ icon: Icon, label, value, color }) {
  const palette = {
    purple:  'bg-purple-50 text-purple-700',
    indigo:  'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber:   'bg-amber-50 text-amber-700',
    rose:    'bg-rose-50 text-rose-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold ${palette[color]}`}>
      <Icon size={11} />
      {label}
      {value && <><span className="opacity-50">·</span>{value}</>}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// type: "student" | "teacher"
export default function AIMentorFAB({ hidden, type = 'student' }) {
  const [open, setOpen]       = useState(false);
  const [msgDone, setMsgDone] = useState(false);
  const [message, setMessage] = useState('');
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const reduce   = useReducedMotion();

  const isTeacher = type === 'teacher';
  const pool      = isTeacher ? TEACHER_MESSAGES : STUDENT_MESSAGES;

  // Pick a fresh random message each time the card opens
  useEffect(() => {
    if (open) {
      setMsgDone(false);
      setMessage(pool[Math.floor(Math.random() * pool.length)]);
    }
  }, [open]);

  // Seed message on mount so it's ready when the popup first opens
  useEffect(() => {
    setMessage(pool[Math.floor(Math.random() * pool.length)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (hidden) return null;

  const name     = user?.name?.split(' ')[0] || (isTeacher ? 'Teacher' : 'there');
  const avgScore = !isTeacher && user?.avg_score != null ? Math.round(user.avg_score) : null;

  const greeting = isTeacher
    ? `Hi ${name}! ${message}`
    : `Hey ${name}! ${message}`;

  const handleClose  = () => setOpen(false);
  const handleCTA    = () => {
    setOpen(false);
    navigate(isTeacher ? '/teacher/reports' : '/student/report?ai=1');
  };

  // ── Config per role ──────────────────────────────────────────────────────────
  const cfg = isTeacher ? {
    subtitle:   'Class performance overview',
    ctaLabel:   'View class analytics',
    chips: [
      <Chip key="a" icon={Users}    label="Students"  color="indigo"  />,
      <Chip key="b" icon={BarChart3} label="Analytics" color="purple"  />,
      <Chip key="c" icon={Brain}    label="AI Insights" color="emerald" />,
    ],
  } : {
    subtitle:   'Personalised for you',
    ctaLabel:   'See my full report',
    chips: [
      avgScore != null
        ? <Chip key="a" icon={Target}    label="Avg score" value={`${avgScore}%`} color="purple" />
        : null,
      <Chip key="b" icon={Zap}        label="Streak"   value="Active" color="indigo"  />,
      <Chip key="c" icon={TrendingUp}  label="Progress" value="↑"     color="emerald" />,
    ].filter(Boolean),
  };

  return (
    <>
      {/* ── Mobile backdrop (closes popup on outside tap) ─────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[48] lg:hidden"
            onClick={handleClose}
          />
        )}
      </AnimatePresence>

      {/* ── Popup card ───────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="ai-popup"
            initial={{ opacity: 0, scale: 0.86, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.86, y: 18 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28 }}
            style={{ transformOrigin: 'bottom right' }}
            className={[
              'fixed z-[49]',
              // Phone: above FAB (FAB bottom-28=112px + h-14=56px + 12px gap = 180px)
              'right-4 bottom-[180px]',
              // Desktop: FAB bottom-8=32px + h-14=56px + 12px gap = 100px
              'lg:right-8 lg:bottom-[100px]',
              'w-[min(340px,calc(100vw-2rem))]',
              'bg-white rounded-[1.75rem]',
              'shadow-[0_12px_48px_rgba(109,40,217,0.14),0_4px_16px_rgba(0,0,0,0.08)]',
              'overflow-hidden',
            ].join(' ')}
          >
            {/* Top gradient accent bar */}
            <div className="h-[2px] w-full bg-neutral-900/10" />

            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-neutral-900 flex items-center justify-center shadow-sm flex-shrink-0">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-extrabold text-[15px] text-neutral-900 leading-tight">AI Mentor</p>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400 leading-none mt-0.5">
                      {cfg.subtitle}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleClose}
                  className="w-8 h-8 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors flex-shrink-0"
                  aria-label="Close AI Mentor"
                >
                  <X size={14} className="text-neutral-600" />
                </button>
              </div>

              {/* Animated message + blinking cursor */}
              <div className="min-h-[60px] mb-4">
                <p className="text-[14px] font-semibold text-neutral-800 leading-relaxed">
                  <WordReveal text={greeting} isActive={open} onDone={() => setMsgDone(true)} />
                  {!msgDone && (
                    <motion.span
                      className="inline-block w-[2px] h-[13px] ml-0.5 bg-neutral-700 rounded-full align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.65, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                    />
                  )}
                  {msgDone && (
                    <motion.span
                      className="inline-block w-[2px] h-[13px] ml-0.5 bg-neutral-700 rounded-full align-middle"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
                    />
                  )}
                </p>
              </div>

              {/* Stat chips — fade in after text finishes */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: msgDone ? 1 : 0, y: msgDone ? 0 : 6 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="flex flex-wrap gap-2 mb-4"
              >
                {cfg.chips}
              </motion.div>

              {/* CTA button */}
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: msgDone ? 1 : 0, y: msgDone ? 0 : 6 }}
                transition={{ duration: 0.35, delay: 0.08, ease: 'easeOut' }}
                onClick={handleCTA}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-neutral-900 text-white font-bold text-[13px] shadow-sm hover:bg-neutral-800 active:scale-[0.98] transition-all"
              >
                <span>{cfg.ctaLabel}</span>
                <ChevronRight size={16} />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Floating action button ────────────────────────────────────────────── */}
      <motion.button
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Close AI Mentor' : 'Open AI Mentor'}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.7, type: 'spring', stiffness: 260, damping: 20 }}
        whileTap={reduce ? undefined : { scale: 0.9 }}
        className={[
          'fixed z-50',
          'right-4 bottom-28',
          'lg:right-8 lg:bottom-8',
          'w-12 h-12 rounded-full',
          'bg-neutral-900',
          'flex items-center justify-center',
          'shadow-md shadow-neutral-900/20',
          'hover:bg-neutral-800 transition-colors',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2',
        ].join(' ')}
      >
        {/* Pulse ring */}
        {!open && !reduce && (
          <motion.span
            className="absolute inset-0 rounded-full bg-neutral-900/20"
            animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
          />
        )}

        {/* Icon: Sparkles ↔ X */}
        <motion.div
          animate={open ? { rotate: 90, scale: 0.9 } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
        >
          {open
            ? <X size={18} className="text-white" />
            : <Sparkles size={18} className="text-white" />
          }
        </motion.div>
      </motion.button>
    </>
  );
}
