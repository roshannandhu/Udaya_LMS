import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertCircle, BookOpen, Calendar, Check, ChevronRight, ClipboardCheck,
  FileQuestion, Loader2, Plus, UserPlus, Video, X
} from 'lucide-react';
import { Skeleton, Btn } from '../../components/ui';
import { dashboardApi, joinRequestApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import { useShallow } from 'zustand/react/shallow';
import NotificationBell from '../../components/shared/NotificationBell';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { pastelFor, pastelTokens } from '../../components/cards/pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, staggerChildren } from '../../lib/motion';
import PendingReattemptsCard from '../../components/teacher/PendingReattemptsCard';

// Teacher home = ONE simple idea: your classes, and what each class needs from
// you today, written in plain words. No stats, no grids of shortcuts — a person
// who has never used an app should be able to read this page top to bottom.

// ── sessionStorage warm-cache (instant re-render, no skeleton flash) ──────────
const readCache = (k) => { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch { return null; } };
const writeCache = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };

const getStdNum = (name = '') => { const m = String(name).match(/\d+/); return m ? m[0] : ''; };

const fmtWhen = (d) => {
  if (!d) return '';
  const date = new Date(d);
  const now = new Date();
  const time = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  if (date.toDateString() === tmr.toDateString()) return `Tomorrow, ${time}`;
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}, ${time}`;
};

// One notification line: icon + plain sentence + chevron. Tap target ≥52px.
function NoticeRow({ icon: Icon, tint, text, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 min-h-[52px] py-2.5 text-left hover:bg-neutral-50 transition-colors group"
    >
      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-neutral-800 leading-snug truncate">{text}</p>
        {sub && <p className="text-xs text-neutral-500 truncate mt-0.5">{sub}</p>}
      </div>
      <ChevronRight size={18} className="text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
    </button>
  );
}

// A student asking to join — the ONLY place in the app with approve/reject.
function JoinRow({ req, busy, onJoin }) {
  return (
    <div className="flex items-center gap-3 px-4 min-h-[56px] py-2.5">
      <div className="w-9 h-9 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
        <UserPlus size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-neutral-800 leading-snug truncate">{req.student_name} wants to join</p>
        {req.student_email && <p className="text-xs text-neutral-500 truncate mt-0.5">{req.student_email}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          disabled={busy}
          onClick={() => onJoin(req, 'reject')}
          className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
          title="Reject"
        >
          <X size={16} />
        </button>
        <button
          disabled={busy}
          onClick={() => onJoin(req, 'approve')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          Approve
        </button>
      </div>
    </div>
  );
}

function ClassCard({ card, dark, navigate, busyJoin, onJoin }) {
  const { std, sid, studentCount, subjectCount, rows } = card;
  const num = getStdNum(std.name);
  const pastel = pastelTokens(pastelFor(std.name), dark);

  return (
    <motion.div variants={fadeUp} className="bg-white rounded-card shadow-soft border border-[#EFEDEA] overflow-hidden">
      {/* Class header — whole row opens the class */}
      <button
        onClick={() => navigate(`/teacher/standards/${sid}`)}
        className="w-full flex items-center gap-4 p-4 md:p-5 text-left hover:bg-neutral-50 transition-colors group"
      >
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold flex-shrink-0"
          style={{ background: pastel.hex, color: pastel.fgHex }}
        >
          {num || <SubjectIcon value={std.emoji} size={26} fallback="graduation" />}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-neutral-900 leading-tight truncate" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            {std.name}
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            {studentCount} student{studentCount === 1 ? '' : 's'} · {subjectCount} subject{subjectCount === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronRight size={20} className="text-neutral-300 group-hover:text-neutral-500 transition-colors flex-shrink-0" />
      </button>

      {/* Class-wise notifications, needs-action first */}
      <div className="border-t border-black/5 divide-y divide-black/5">
        {rows.length === 0 ? (
          <div className="flex items-center gap-3 px-4 min-h-[52px] py-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center flex-shrink-0">
              <Check size={16} />
            </div>
            <p className="text-[15px] font-medium text-emerald-600">All good today</p>
          </div>
        ) : rows.map((row) => {
          if (row.type === 'join') return <JoinRow key={row.key} req={row.req} busy={!!busyJoin[row.req.id]} onJoin={onJoin} />;
          if (row.type === 'joinMore') return (
            <p key={row.key} className="px-4 py-2.5 pl-16 text-xs font-bold text-neutral-500">
              +{row.count} more waiting to join
            </p>
          );
          return (
            <NoticeRow key={row.key} icon={row.icon} tint={row.tint} text={row.text} sub={row.sub} onClick={() => navigate(row.to)} />
          );
        })}
      </div>
    </motion.div>
  );
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const dark = useTheme(s => s.dark);
  const { standards, subjects, students, standardsReady, refreshStandards, refreshSubjects, refreshStudents } =
    useAppCache(useShallow(s => ({
      standards:        s.standards,
      subjects:         s.subjects,
      students:         s.students,
      standardsReady:   s.standardsReady,
      refreshStandards: s.refreshStandards,
      refreshSubjects:  s.refreshSubjects,
      refreshStudents:  s.refreshStudents,
    })));

  const [overview, setOverview] = useState(() => readCache('tutoria_dash_overview'));
  const [loading, setLoading]   = useState(!readCache('tutoria_dash_overview'));
  const [busyJoin, setBusyJoin] = useState({}); // {requestId: true}

  const now = new Date();
  const displayName = user?.name?.split(' ')[0] || 'Teacher';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const loadDashboard = useCallback(async () => {
    refreshStandards?.();
    refreshSubjects?.();
    refreshStudents?.();
    try {
      const ov = await dashboardApi.getOverview();
      setOverview(ov);
      writeCache('tutoria_dash_overview', ov);
    } catch (err) {
      console.error('Dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, [refreshStandards, refreshSubjects, refreshStudents]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useAutoRefresh(loadDashboard);

  const handleJoin = async (req, action) => {
    setBusyJoin(prev => ({ ...prev, [req.id]: true }));
    try {
      await joinRequestApi[action](req.id);
      setOverview(prev => {
        if (!prev) return prev;
        const items = (prev.join_requests?.items || []).filter(r => r.id !== req.id);
        const next = { ...prev, join_requests: { count: Math.max(0, (prev.join_requests?.count || 1) - 1), items } };
        const sid = req.standard_id;
        if (sid && prev.per_standard?.[sid]) {
          next.per_standard = {
            ...prev.per_standard,
            [sid]: { ...prev.per_standard[sid], join_requests: Math.max(0, (prev.per_standard[sid].join_requests || 1) - 1) },
          };
        }
        writeCache('tutoria_dash_overview', next);
        return next;
      });
      if (action === 'approve') refreshStudents?.();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Action failed');
    } finally {
      setBusyJoin(prev => { const n = { ...prev }; delete n[req.id]; return n; });
    }
  };

  // ── Per-class model: [{std, counts, notification rows}] ────────────────────
  const classCards = useMemo(() => {
    const stdOf = new Map(subjects.map(c => [c.id, c.standard_id]));
    const per = overview?.per_standard || {};
    const joinItems  = overview?.join_requests?.items || [];
    const gradeItems = overview?.grading_queue?.items || [];
    const lowItems   = overview?.low_attendance?.items || [];
    const liveItems  = overview?.today_live || [];
    const testItems  = overview?.upcoming_tests || [];

    return standards.map(std => {
      const sid = std.id;
      // standard_id is missing on items cached from the old overview shape —
      // fall back to name matching (joins) / item grouping (counts).
      const joins  = joinItems.filter(r => (r.standard_id ? r.standard_id === sid : r.standard_name === std.name));
      const live   = liveItems.filter(l => stdOf.get(l.class_id) === sid);
      const tests  = testItems.filter(t => stdOf.get(t.class_id) === sid);
      const grades = gradeItems.filter(g => stdOf.get(g.class_id) === sid);
      const lows   = lowItems.filter(x => x.standard_id === sid);

      const joinTotal  = per[sid]?.join_requests ?? joins.length;
      const gradeTotal = per[sid]?.grading ?? grades.length;
      const lowTotal   = per[sid]?.low_attendance ?? lows.length;

      const rows = [];
      joins.slice(0, 3).forEach(req => rows.push({ key: `j-${req.id}`, type: 'join', req }));
      const shownJoins = Math.min(joins.length, 3);
      if (joinTotal > shownJoins) rows.push({ key: 'j-more', type: 'joinMore', count: joinTotal - shownJoins });

      live.slice(0, 2).forEach(l => rows.push({
        key: `l-${l.id}`, type: 'live', icon: Video, tint: 'bg-rose-50 text-rose-500',
        text: `Live class: ${l.subject || l.title || ''}`.trim(),
        sub: l.status === 'live' ? 'Happening now' : fmtWhen(l.scheduled_at),
        to: '/teacher/live-classes',
      }));

      tests.slice(0, 2).forEach(t => rows.push({
        key: `t-${t.id}`, type: 'test', icon: FileQuestion, tint: 'bg-amber-50 text-amber-600',
        text: `Test: ${t.title}`,
        sub: [t.status === 'active' ? 'Running now' : fmtWhen(t.scheduled_for), t.subject].filter(Boolean).join(' · '),
        to: '/teacher/tests',
      }));

      if (gradeTotal > 0) rows.push({
        key: 'g', type: 'grade', icon: ClipboardCheck, tint: 'bg-violet-50 text-violet-600',
        text: `${gradeTotal} answer${gradeTotal === 1 ? '' : 's'} to check`,
        sub: grades[0] ? `${grades[0].student_name} · ${grades[0].assignment_title}` : '',
        to: grades[0]?.class_id ? `/teacher/standards/${sid}/subjects/${grades[0].class_id}` : `/teacher/standards/${sid}`,
      });

      if (lowTotal > 0) rows.push({
        key: 'a', type: 'attend', icon: AlertCircle, tint: 'bg-orange-50 text-orange-600',
        text: `${lowTotal} student${lowTotal === 1 ? '' : 's'} missing classes often`,
        sub: lows.slice(0, 2).map(x => x.name).join(', '),
        to: '/teacher/reports',
      });

      return {
        std, sid, rows,
        studentCount: students.filter(s => s.standard_id === sid).length,
        subjectCount: subjects.filter(c => c.standard_id === sid).length,
      };
    });
  }, [standards, subjects, students, overview]);

  if (loading && !overview) {
    return (
      <div className="px-3 md:px-8 py-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-56 rounded-card" />
        <div className="grid lg:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-44 rounded-card" />)}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Mobile header (desktop uses the TopNav) */}
      <div className="lg:hidden sticky top-0 z-30 bg-canvas">
        <div className="px-5 py-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs text-neutral-500">{greeting},</p>
            <h1 className="text-base font-semibold leading-tight">{displayName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/teacher/attendance')} className="p-2 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 rounded-full transition-colors">
              <Calendar size={20} />
            </button>
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-3 md:px-8 py-6 max-w-6xl mx-auto">
        <motion.div variants={staggerChildren} initial="hidden" animate="show" className="flex flex-col gap-6">

          {/* ── Header (desktop) ── */}
          <motion.div variants={fadeUp} className="hidden lg:flex items-end justify-between">
            <div>
              <p className="text-sm text-neutral-500">{greeting}, {displayName}</p>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
                My Classes
              </h1>
            </div>
            <p className="text-sm text-neutral-500">{now.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </motion.div>

          {/* Pending re-attempt requests (tests + assignments) — self-hides when none */}
          <PendingReattemptsCard />

          {/* ── Classes, with class-wise notifications ── */}
          <motion.div variants={fadeUp}>
            <h2 className="lg:hidden text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1">My Classes</h2>
            {classCards.length === 0 ? (
              standardsReady ? (
                <div className="bg-white rounded-card shadow-soft border border-[#EFEDEA] flex flex-col items-center text-center py-14 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-pastel-sky text-pastel-sky-fg flex items-center justify-center mb-4">
                    <BookOpen size={28} />
                  </div>
                  <p className="text-lg font-bold text-neutral-900">No classes yet</p>
                  <p className="text-sm text-neutral-500 mt-1 mb-5">Create your first class to get started.</p>
                  <Btn variant="primary" onClick={() => navigate('/teacher/standards')}>
                    <Plus size={16} /> Add your first class
                  </Btn>
                </div>
              ) : (
                <div className="grid lg:grid-cols-2 gap-4">{[1, 2].map(i => <Skeleton key={i} className="h-44 rounded-card" />)}</div>
              )
            ) : (
              <motion.div variants={staggerChildren} className="grid lg:grid-cols-2 gap-4 items-start">
                {classCards.map(card => (
                  <ClassCard key={card.sid} card={card} dark={dark} navigate={navigate} busyJoin={busyJoin} onJoin={handleJoin} />
                ))}
              </motion.div>
            )}
          </motion.div>

        </motion.div>
      </div>
    </div>
  );
}
