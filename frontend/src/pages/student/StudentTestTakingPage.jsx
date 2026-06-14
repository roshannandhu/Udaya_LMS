import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Flag, Clock, AlertTriangle, ChevronLeft, ChevronRight, Maximize2, Loader2 } from 'lucide-react';
import { Btn } from '../../components/ui';
import { testApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';

function useTimer(seconds, onExpire) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) { onExpire(); return; }
    const id = setInterval(() => setRemaining((r) => r - 1), 1000);
    return () => clearInterval(id);
  }, [remaining]);
  return remaining;
}

function fmt(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function StudentTestTakingPage() {
  const { testId } = useParams();
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const user = useAuthStore(s => s.user);
  
  const [test, setTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warnCount, setWarnCount] = useState(0);
  const [showWarn, setShowWarn] = useState(false);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isFocused, setIsFocused] = useState(true); // Track window focus
  const cheatEvents = useRef([]);
  const lastWarnRef = useRef(0); // de-dupe: one leave-screen action fires both
                                 // visibilitychange AND blur — count it once.

  useEffect(() => {
    const fetchTest = async () => {
      try {
        const data = await testApi.getTestForTaking(testId);
        setTest(data.test);
        setQuestions(data.questions || []);
      } catch (err) {
        setError(err.message || 'Failed to load test');
      } finally {
        setLoading(false);
      }
    };
    fetchTest();
  }, [testId]);

  const totalSecs = (test?.duration_mins ?? 30) * 60;
  
  // Custom timer logic that only starts after hasStarted
  const [remaining, setRemaining] = useState(totalSecs);
  
  useEffect(() => {
    if (test && !hasStarted) {
      let allocatedSeconds = (test.duration_mins || 30) * 60;
      if (test.expires_at) {
        const now = new Date().getTime();
        const expiry = new Date(test.expires_at).getTime();
        const secondsUntilExpiry = Math.floor((expiry - now) / 1000);
        if (secondsUntilExpiry > 0 && secondsUntilExpiry < allocatedSeconds) {
           allocatedSeconds = secondsUntilExpiry;
        }
      }
      setRemaining(allocatedSeconds);
    }
  }, [test, hasStarted]);

  useEffect(() => {
    if (!hasStarted || submitted || remaining <= 0) return;
    const id = setInterval(() => {
      setRemaining(r => {
        if (r <= 1) {
          clearInterval(id);
          handleSubmit(true);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [hasStarted, submitted, remaining]);

  // Auto-submit on 3rd warning (outside state updater to avoid strict-mode double-fire)
  useEffect(() => {
    if (warnCount >= 3 && hasStarted && !submitted) {
      handleSubmit(true);
    }
  }, [warnCount]);

  const q = questions[current];

  useEffect(() => {
    if (!hasStarted) return;
    
    const handleVisibility = () => {
      if (document.hidden && !submitted) {
        cheatEvents.current.push({ type: 'tab_switched', timestamp: new Date().toISOString() });
        triggerWarning();
      }
    };

    const handleBlur = () => {
      if (!submitted) {
        setIsFocused(false);
        cheatEvents.current.push({ type: 'window_blur', timestamp: new Date().toISOString() });
        triggerWarning();
      }
    };

    const handleFocus = () => setIsFocused(true);

    const triggerWarning = () => {
      // Switching tab/window fires visibilitychange + blur back-to-back; collapse
      // them (and any rapid repeats) into a single warning so the first offence
      // shows "1/3", not "2/3".
      const now = Date.now();
      if (now - lastWarnRef.current < 1000) return;
      lastWarnRef.current = now;
      setShowWarn(true);
      setWarnCount((w) => w + 1);
    };

    const handleFullscreenChange = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull && !submitted) {
        cheatEvents.current.push({ type: 'exited_fullscreen', timestamp: new Date().toISOString() });
      }
    };

    // Anti-Copy & Anti-AI features
    const preventAction = (e) => e.preventDefault();
    
    const handleKeydown = (e) => {
      // Prevent Ctrl+C, Ctrl+V, Ctrl+P, Ctrl+S, F12, etc.
      if (
        (e.ctrlKey || e.metaKey) &&
        ['c', 'v', 'p', 's', 'x', 'a'].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        cheatEvents.current.push({ type: 'keyboard_shortcut_blocked', timestamp: new Date().toISOString() });
      }
      if (e.key === 'F12') {
        e.preventDefault();
        cheatEvents.current.push({ type: 'dev_tools_blocked', timestamp: new Date().toISOString() });
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        try { navigator.clipboard.writeText(''); } catch {}
        cheatEvents.current.push({ type: 'screenshot_attempt', timestamp: new Date().toISOString() });
        triggerWarning();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handleBlur); // Mobile app switch
    window.addEventListener('focus', handleFocus);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    
    // Prevent copying, selecting, and right-click
    document.addEventListener('contextmenu', preventAction);
    document.addEventListener('copy', preventAction);
    document.addEventListener('cut', preventAction);
    document.addEventListener('selectstart', preventAction);
    document.addEventListener('keydown', handleKeydown);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', preventAction);
      document.removeEventListener('copy', preventAction);
      document.removeEventListener('cut', preventAction);
      document.removeEventListener('selectstart', preventAction);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [hasStarted, submitted]);

  const enterFullscreen = async () => {
    try {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
      if (!hasStarted) setHasStarted(true);
    } catch (err) {
      console.error('Error attempting to enable fullscreen:', err);
      // Fallback if blocked
      setHasStarted(true);
    }
  };

  const handleSubmit = useCallback(async (auto = false) => {
    if (submitted) return;
    setSubmitted(true);
    setConfirmSubmit(false);
    setIsSubmitting(true);

    try {
      const res = await testApi.submitTest(testId, {
        answers,
        cheat_events: cheatEvents.current
      });
      
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(e => console.error(e));
      }

      navigate('/student/tests/result', {
        replace: true,
        state: {
          result: {
            ...res,
            total: questions.length,
            testTitle: test?.title,
            total_marks: test?.total_marks,
            auto,
            test_id: testId,
          }
        },
      });
    } catch (err) {
      console.error(err);
      alert('Failed to submit test. Please try again.');
      setSubmitted(false);
      setIsSubmitting(false);
    }
  }, [submitted, answers, test, testId, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin text-neutral-400" /></div>;
  }

  if (error || !test || questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-neutral-500">{error || 'Test not found or has no questions.'}</p>
        <Btn variant="default" onClick={() => navigate('/student/tests')}>Back to tests</Btn>
      </div>
    );
  }

  if (!hasStarted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-transparent px-6">
        <div className="max-w-md w-full glass-panel p-8 rounded-2xl shadow-xl border-white/60 text-center">
          <h2 className="text-xl font-bold mb-2">{test.title}</h2>
          <p className="text-neutral-500 mb-6">{questions.length} Questions • {test.duration_mins} Minutes</p>
          
          <div className="text-sm text-left bg-blue-50 text-blue-900 p-4 rounded-lg mb-6 space-y-2">
            <p className="font-semibold flex items-center gap-2"><AlertTriangle size={16}/> Before you begin:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Test runs in fullscreen mode.</li>
              <li>Do not exit fullscreen or switch tabs.</li>
              <li>Warnings will be issued if you leave the screen. Auto-submit on 3rd warning.</li>
              {test.negative_marking && <li>Negative marking (−{test.penalty}) is enabled.</li>}
            </ul>
          </div>
          
          <Btn variant="primary" size="lg" className="w-full" onClick={enterFullscreen} icon={Maximize2}>
            Enter Fullscreen & Start Test
          </Btn>
        </div>
      </div>
    );
  }

  const answered = Object.keys(answers).length;
  const pct = Math.round((answered / questions.length) * 100);
  const urgent = remaining < 120;

  return (
    <div 
      className="min-h-screen bg-transparent flex flex-col select-none relative"
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none' }} // Crucial for iOS Safari
    >

      {/* Distraction/Focus lost overlay */}
      {!isFocused && !submitted && hasStarted && (
        <div className="absolute inset-0 z-50 bg-neutral-900/90 backdrop-blur-md flex flex-col items-center justify-center text-white px-6 text-center">
          <AlertTriangle size={48} className="text-red-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">Focus Lost!</h2>
          <p className="text-neutral-300 max-w-md">
            You have switched away from the test window. This action has been recorded. 
            Click anywhere here to resume the test.
          </p>
          <p className="text-red-400 mt-4 font-medium">Auto-submit on 3rd warning!</p>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-3xl mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-500 truncate">{test.title}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="flex-1 h-1 bg-white/50 rounded-full overflow-hidden">
                <div className="h-full bg-neutral-900 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-xs text-neutral-500">{answered}/{questions.length}</span>
            </div>
          </div>
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-sm font-mono font-semibold ${urgent ? 'bg-red-50 text-red-600' : 'bg-white/50 text-neutral-700'}`}>
            <Clock size={13} />
            {fmt(remaining)}
          </div>
        </div>
      </div>

      {/* Anti-cheat warning */}
      {showWarn && (
        <div className="mx-5 mt-4 max-w-3xl md:mx-auto p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertTriangle size={16} />
          <span>Warning {warnCount}/3: Don't leave the test tab. Auto-submit on 3rd warning.</span>
          <button onClick={() => setShowWarn(false)} className="ml-auto text-red-400 hover:text-red-700 text-lg leading-none">×</button>
        </div>
      )}

      {/* Question — slides between questions (kept light: this is the anti-cheat page) */}
      {q && (
        <div className="flex-1 px-5 md:px-8 py-6 max-w-3xl mx-auto w-full overflow-x-clip">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={q.id}
              initial={reduce ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? undefined : { opacity: 0, x: -24 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-neutral-400 font-mono">Q{current + 1} of {questions.length}</span>
                <button onClick={() => setFlagged((prev) => {
                  const next = new Set(prev);
                  next.has(q.id) ? next.delete(q.id) : next.add(q.id);
                  return next;
                })} className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${flagged.has(q.id) ? 'text-amber-600 bg-amber-50' : 'text-neutral-400 hover:text-neutral-700'}`}>
                  <Flag size={12} />{flagged.has(q.id) ? 'Flagged' : 'Flag'}
                </button>
              </div>

              <p className="text-base font-medium mb-6 leading-relaxed">{q.question}</p>

              <div className="space-y-2.5">
                {q.options.map((opt, i) => {
                  const selected = answers[q.id] === i;
                  return (
                    <motion.button key={i} onClick={() => setAnswers({ ...answers, [q.id]: i })}
                      whileTap={reduce ? undefined : { scale: 0.985 }}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${selected ? 'border-neutral-900 bg-neutral-900 text-white shadow-md' : 'border-white/60 bg-white/50 hover:bg-[#F4F2EF]'}`}>
                      <span className={`font-mono text-xs mr-2 ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>{String.fromCharCode(65 + i)}.</span>
                      {opt}
                    </motion.button>
                  );
                })}
              </div>

              {test.negative_marking && (
                <p className="text-xs text-red-500 mt-3">Negative marking: −{test.penalty} for wrong answers.</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Footer nav */}
      <div className="sticky bottom-0 bg-canvas border-t border-[#EFEDEA] px-5 md:px-8 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}
            className="flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-white/60 disabled:opacity-40 hover:bg-[#F4F2EF] transition-colors">
            <ChevronLeft size={15} />Prev
          </button>

          {/* Question dots */}
          <div className="flex gap-1 flex-wrap justify-center flex-1">
            {questions.map((q2, i) => (
              <button key={q2.id} onClick={() => setCurrent(i)}
                className={`w-6 h-6 rounded text-xs font-medium transition-colors ${i === current ? 'bg-neutral-900 text-white shadow-md' : answers[q2.id] !== undefined ? 'bg-white border border-neutral-300 text-neutral-700' : flagged.has(q2.id) ? 'bg-amber-100 text-amber-700' : 'bg-white/40 text-neutral-500 border border-transparent'}`}>
                {i + 1}
              </button>
            ))}
          </div>

          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              className="flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-white/60 hover:bg-[#F4F2EF] transition-colors">
              Next<ChevronRight size={15} />
            </button>
          ) : (
            <Btn variant="primary" size="sm" onClick={() => setConfirmSubmit(true)} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </Btn>
          )}
        </div>
      </div>

      {/* Confirm submit overlay */}
      {confirmSubmit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-6">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 26 }}
            className="glass-panel border border-white/60 rounded-2xl shadow-xl p-6 w-full max-w-sm">
            <h3 className="font-semibold mb-1">Submit test?</h3>
            <p className="text-sm text-neutral-500 mb-1">Answered: {answered} / {questions.length}</p>
            {flagged.size > 0 && <p className="text-sm text-amber-600 mb-4">{flagged.size} question{flagged.size > 1 ? 's' : ''} flagged for review.</p>}
            <div className="flex gap-2 justify-end mt-4">
              <Btn variant="ghost" onClick={() => setConfirmSubmit(false)} disabled={isSubmitting}>Keep going</Btn>
              <Btn variant="primary" onClick={() => handleSubmit(false)} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit now'}
              </Btn>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
