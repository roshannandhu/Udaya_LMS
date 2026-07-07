import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Sparkles, X, ChevronRight, Target, Zap, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../lib/auth';

// ── Messages pool (pick one randomly each time the card opens) ─────────────────
const MESSAGES = [
  "You're building great habits! Your consistency is paying off.",
  "Based on your scores, you're on the right track. Keep pushing!",
  "Every lesson you complete gets you closer to your goal.",
  "Your performance is improving! Stay consistent and you'll ace it.",
  "You're doing great! A little effort each day makes a big difference.",
];

// ── Word-by-word reveal with blur-fade animation ───────────────────────────────
function WordReveal({ text, isActive, onDone }) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
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
    purple: 'bg-purple-50 text-purple-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    emerald: 'bg-emerald-50 text-emerald-700',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold ${palette[color]}`}>
      <Icon size={11} />
      {label}
      <span className="opacity-50">·</span>
      {value}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function AIMentorFAB({ hidden }) {
  const [open, setOpen]       = useState(false);
  const [msgDone, setMsgDone] = useState(false);
  const [message, setMessage] = useState(MESSAGES[0]);
  const { user } = useAuthStore();
  const navigate  = useNavigate();
  const reduce    = useReducedMotion();

  // Pick a fresh random message each time the card opens
  useEffect(() => {
    if (open) {
      setMsgDone(false);
      setMessage(MESSAGES[Math.floor(Math.random() * MESSAGES.length)]);
    }
  }, [open]);

  if (hidden) return null;

  const name     = user?.name?.split(' ')[0] || 'there';
  const avgScore = user?.avg_score != null ? Math.round(user.avg_score) : null;
  const greeting = `Hey ${name}! ${message}`;

  const handleClose  = () => setOpen(false);
  const handleReport = () => { setOpen(false); navigate('/student/report?ai=1'); };

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
              // Phone: sits above the FAB (FAB is at ~bottom-28 = 112px, FAB height 56px → popup bottom = 180px)
              'right-4 bottom-[180px]',
              // Desktop: FAB at bottom-8 (32px), height 56px → popup bottom ≈ 100px
              'lg:right-8 lg:bottom-[100px]',
              'w-[min(340px,calc(100vw-2rem))]',
              'bg-white rounded-[1.75rem]',
              'shadow-[0_12px_48px_rgba(109,40,217,0.14),0_4px_16px_rgba(0,0,0,0.08)]',
              'overflow-hidden',
            ].join(' ')}
          >
            {/* Top gradient accent bar */}
            <div className="h-[3px] w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-purple-400" />

            <div className="p-5">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-200/70 flex-shrink-0">
                    <Sparkles size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-extrabold text-[15px] text-neutral-900 leading-tight">AI Mentor</p>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-purple-500 leading-none mt-0.5">
                      Personalised for you
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
                  {/* Cursor: blinks while text is animating, fades out once done */}
                  {!msgDone && (
                    <motion.span
                      className="inline-block w-[2px] h-[13px] ml-0.5 bg-purple-500 rounded-full align-middle"
                      animate={{ opacity: [1, 0] }}
                      transition={{ duration: 0.65, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
                    />
                  )}
                  {msgDone && (
                    <motion.span
                      className="inline-block w-[2px] h-[13px] ml-0.5 bg-purple-500 rounded-full align-middle"
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
                {avgScore != null && (
                  <Chip icon={Target} label="Avg score" value={`${avgScore}%`} color="purple" />
                )}
                <Chip icon={Zap}        label="Streak"    value="Active"  color="indigo"  />
                <Chip icon={TrendingUp} label="Progress"  value="↑"       color="emerald" />
              </motion.div>

              {/* CTA button */}
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: msgDone ? 1 : 0, y: msgDone ? 0 : 6 }}
                transition={{ duration: 0.35, delay: 0.08, ease: 'easeOut' }}
                onClick={handleReport}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold text-[13px] shadow-md shadow-purple-300/40 hover:from-violet-700 hover:to-purple-700 active:scale-[0.98] transition-all"
              >
                <span>See my full report</span>
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
          // Phone: above bottom nav (nav ~90px, add 22px gap = 112px from bottom)
          'right-4 bottom-28',
          // Desktop: no bottom nav, just 32px from edges
          'lg:right-8 lg:bottom-8',
          'w-14 h-14 rounded-full',
          'bg-gradient-to-br from-violet-500 to-purple-600',
          'flex items-center justify-center',
          'shadow-lg shadow-purple-400/40',
          'hover:shadow-xl hover:shadow-purple-400/50',
          'transition-shadow',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2',
        ].join(' ')}
      >
        {/* Outer pulse ring 1 */}
        {!open && (
          <motion.span
            className="absolute inset-0 rounded-full bg-violet-400/30"
            animate={{ scale: [1, 1.65], opacity: [0.55, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
          />
        )}
        {/* Outer pulse ring 2 (offset) */}
        {!open && (
          <motion.span
            className="absolute inset-0 rounded-full bg-violet-400/20"
            animate={{ scale: [1, 2.1], opacity: [0.4, 0] }}
            transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut', delay: 0.45 }}
          />
        )}

        {/* Icon: Sparkles ↔ X with rotation */}
        <motion.div
          animate={open ? { rotate: 90, scale: 0.9 } : { rotate: 0, scale: 1 }}
          transition={{ duration: 0.28, ease: 'easeInOut' }}
        >
          {open
            ? <X size={22} className="text-white" />
            : <Sparkles size={22} className="text-white" />
          }
        </motion.div>
      </motion.button>
    </>
  );
}
