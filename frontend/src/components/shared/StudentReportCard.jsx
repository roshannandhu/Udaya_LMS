import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, BarChart, Bar, Cell,
  AreaChart, Area,
} from 'recharts';
import {
  Trophy, TrendingUp, TrendingDown, Calendar, Sparkles, ChevronUp, ChevronLeft, ChevronRight,
  Download, Target, BookOpen, Video, CheckCircle2, BarChart3,
  ClipboardList, Share2, Play, Clock, Radio, Flame, Zap, Brain, AlertTriangle, FileText,
  Heart, RefreshCw, Copy, Lightbulb,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Avatar } from '../ui';
import { aiApi } from '../../lib/api';
import SubjectIcon from './SubjectIcon';
import { CountUp, ProgressRing } from './Animated';
import { pastelFor, pastelTokens } from '../cards/pastel';
import { useTheme } from '../../lib/theme';
import { fadeUp, staggerChildren, springCard } from '../../lib/motion';
import { fmtDate } from '../../lib/datetime';

const CARD_COLORS = [
  { bg: 'bg-[#F8E1FB]', text: 'text-[#872792]', badge: 'bg-[#872792]/10 text-[#872792]' },
  { bg: 'bg-[#EAF3EB]', text: 'text-[#1D6A2B]', badge: 'bg-[#1D6A2B]/10 text-[#1D6A2B]' },
  { bg: 'bg-[#FFF6D8]', text: 'text-[#966B08]', badge: 'bg-[#966B08]/10 text-[#966B08]' },
  { bg: 'bg-[#E8F0FE]', text: 'text-[#1A56DB]', badge: 'bg-[#1A56DB]/10 text-[#1A56DB]' },
  { bg: 'bg-[#FFEBE5]', text: 'text-[#9A3B1C]', badge: 'bg-[#9A3B1C]/10 text-[#9A3B1C]' },
];

const UP_GREEN = '#16A34A';
const DOWN_RED = '#DC2626';

// ── Generic helpers ────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return 'Offline';
  const diff = (new Date() - new Date(dateStr)) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function pct(n) { return `${Math.round(n || 0)}%`; }

function gradeBand(score, dark = false) {
  const s = Math.round(score || 0);
  // Light pair by day, dark-tint + light text at night so the grade chip follows the theme.
  const band = (grade, label, color, bg, dColor, dBg) =>
    ({ grade, label, color: dark ? dColor : color, bg: dark ? dBg : bg });
  if (s >= 90) return band('A+', 'Outstanding', '#0F7B6C', '#DFF5EC', '#6ee7b7', '#16302a');
  if (s >= 80) return band('A', 'Excellent', '#0F7B6C', '#DFF5EC', '#6ee7b7', '#16302a');
  if (s >= 70) return band('B+', 'Very Good', '#2383E2', '#E3EFFB', '#93c5fd', '#14233a');
  if (s >= 60) return band('B', 'Good', '#2383E2', '#E3EFFB', '#93c5fd', '#14233a');
  if (s >= 50) return band('C', 'Average', '#B7791F', '#FBF1D9', '#fcd34d', '#2b2616');
  if (s >= 35) return band('D', 'Needs Work', '#C2410C', '#FCE6DD', '#fdba74', '#2e1d16');
  return band('E', 'At Risk', '#DC2626', '#FEE2E2', '#fca5a5', '#2e1620');
}

function localDayId(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const getHeatmapPeriods = () => {
  const options = [];
  const now = new Date();
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      id: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
    });
  }
  return options;
};
const HEATMAP_PERIODS = getHeatmapPeriods();

function sliceHeatmap(data, periodId) {
  if (!data || data.length === 0) return [];
  return data.filter(d => d.date && d.date.startsWith(periodId));
}

function buildHeatmapWeeksForMonth(periodId) {
  const [year, month] = periodId.split('-').map(Number);
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  let cur = new Date(firstDay);
  cur.setDate(cur.getDate() - cur.getDay());
  const end = new Date(lastDay);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const allDays = [];
  while (cur <= end) {
    allDays.push(localDayId(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));
  return weeks;
}

/** hex + alpha → rgba() */
function tint(hex, alpha) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── Scroll-reveal wrapper ──────────────────────────────────────────────────────

function Section({ children, className = '', delay = 0 }) {
  const reduce = useReducedMotion();
  if (reduce) return <section className={className}>{children}</section>;
  return (
    <motion.section
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.section>
  );
}

/** Horizontal bar that fills when scrolled into view. */
function GrowBar({ value, color, track = 'bg-neutral-100', height = 'h-1.5' }) {
  const reduce = useReducedMotion();
  const w = `${Math.min(100, Math.max(0, value))}%`;
  return (
    <div className={`${height} ${track} rounded-full overflow-hidden`}>
      {reduce ? (
        <div className="h-full rounded-full" style={{ width: w, background: color }} />
      ) : (
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          whileInView={{ width: w }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
        />
      )}
    </div>
  );
}

// ── Mini sparkline (reference "big number + wave" motif) ──────────────────────

function Sparkline({ values, color, width = 60, height = 22 }) {
  const reduce = useReducedMotion();
  if (!values || values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, height - ((v - min) / range) * (height - 4) - 2]);
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} className="overflow-visible">
      {reduce ? (
        <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <motion.path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
          transition={{ duration: 0.9, ease: 'easeOut' }} />
      )}
      <circle cx={last[0]} cy={last[1]} r={2.4} fill={color} />
    </svg>
  );
}

// ── Segmented stacked progress bar with legend (reference "Delenit augue") ────

function SegmentedBar({ segments }) {
  const reduce = useReducedMotion();
  const total = segments.reduce((a, s) => a + (s.value || 0), 0) || 1;
  return (
    <div>
      <div className="flex h-3 rounded-full overflow-hidden bg-neutral-100">
        {segments.map((s, i) => (s.value > 0) && (
          reduce ? (
            <div key={i} className="h-full" style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
          ) : (
            <motion.div key={i} className="h-full" style={{ background: s.color }}
              initial={{ width: 0 }} whileInView={{ width: `${(s.value / total) * 100}%` }} viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: i * 0.12 }} />
          )
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-neutral-500">
            <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
            {s.label} <strong className="text-neutral-900">{s.value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Subject comparison: grouped multi-series bars (reference "Adipiscing") ─────

const SUBJECT_SERIES = [
  { k: 'Tests', c: '#1A56DB', cDark: '#93c5fd' },
  { k: 'Videos', c: '#6940A5', cDark: '#c4b5fd' },
  { k: 'Attendance', c: '#0F7B6C', cDark: '#6ee7b7' },
];

function SubjectGroupedBars({ subjectRadar, dark }) {
  const reduce = useReducedMotion();
  const rows = useMemo(() => subjectRadar.map(r => ({
    name: r.subject,
    Tests: r.test_count > 0 ? Math.round(r.test_avg || 0) : 0,
    Videos: r.video_total > 0 ? Math.round(((r.video_done || 0) / r.video_total) * 100) : 0,
    Attendance: r.att_total > 0 ? Math.round(r.attendance_pct || 0) : 0,
  })), [subjectRadar]);
  if (rows.length === 0) return null;
  return (
    <div className="bg-white rounded-[2rem] shadow-card p-5 md:p-6 mb-4">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <div>
          <h4 className="text-[16px] font-black text-neutral-900">Subject Comparison</h4>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Tests · Videos · Attendance %</p>
        </div>
        <div className="flex items-center gap-3">
          {SUBJECT_SERIES.map(s => (
            <span key={s.k} className="inline-flex items-center gap-1.5 text-[10px] font-extrabold text-neutral-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: dark ? s.cDark : s.c }} />{s.k}
            </span>
          ))}
        </div>
      </div>
      <div className="h-[200px] md:h-[220px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 6, right: 4, left: -24, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'} />
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} tickFormatter={t => (t || '').length > 7 ? t.slice(0, 7) + '…' : t} axisLine={false} tickLine={false} interval={0} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 10, fontWeight: 'bold', backgroundColor: dark ? '#1a1b33' : '#fff', color: dark ? '#e5e7eb' : undefined }} cursor={{ fill: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6' }} />
            {SUBJECT_SERIES.map((s, si) => (
              <Bar key={s.k} dataKey={s.k} fill={dark ? s.cDark : s.c} radius={[4, 4, 0, 0]} maxBarSize={13}
                animationDuration={reduce ? 0 : 1000} animationBegin={si * 120} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Test timeline rail: horizontal node chips (reference "Delenit" timeline) ──

function TestTimelineRail({ testTimeline, dark }) {
  const reduce = useReducedMotion();
  const items = useMemo(
    () => testTimeline.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).slice(-10),
    [testTimeline]
  );
  if (items.length === 0) return null;
  return (
    <div className="bg-white rounded-[2rem] shadow-card p-5 md:p-6">
      <div className="mb-3">
        <h4 className="text-[16px] font-black text-neutral-900">Test Timeline</h4>
        <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Recent tests, in order</p>
      </div>
      <div className="overflow-x-auto scrollbar-hide pb-1">
        <div className="min-w-max">
          {/* dots + connecting line */}
          <div className="relative flex items-center">
            <div className="absolute left-0 right-0 h-[2px] rounded-full" style={{ top: '50%', background: dark ? 'rgba(255,255,255,0.10)' : '#EFEDEA' }} />
            {items.map((t, i) => {
              const p = pastelTokens(pastelFor(t.subject || ''), dark);
              const dot = (
                <span className="w-3.5 h-3.5 rounded-full border-2 z-10"
                  style={{ background: t.flagged ? DOWN_RED : p.fgHex, borderColor: dark ? '#12132b' : '#fff', boxShadow: `0 0 0 3px ${p.hex}` }} />
              );
              return (
                <div key={i} className="w-[132px] flex-shrink-0 flex justify-center">
                  {reduce ? dot : (
                    <motion.span initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
                      transition={{ delay: i * 0.06, type: 'spring', stiffness: 300, damping: 18 }} className="inline-flex">
                      {dot}
                    </motion.span>
                  )}
                </div>
              );
            })}
          </div>
          {/* chips */}
          <div className="flex mt-3">
            {items.map((t, i) => {
              const p = pastelTokens(pastelFor(t.subject || ''), dark);
              const score = Math.round(t.score_pct || 0);
              const chip = (
                <div className="rounded-2xl px-3 py-2.5 w-full text-center shadow-sm" style={{ background: p.hex }}>
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <SubjectIcon value={t.emoji} size={13} className="flex-shrink-0" />
                    <span className="text-[15px] font-black leading-none" style={{ color: t.flagged ? DOWN_RED : p.fgHex }}>{score}%</span>
                  </div>
                  <p className="text-[10px] font-black text-neutral-700 leading-tight truncate">{t.test_title || 'Test'}</p>
                  <p className="text-[9px] font-bold text-neutral-400 mt-0.5">{t.date ? fmtDate(t.date).replace(/, \d{4}$/, '') : ''}</p>
                </div>
              );
              return (
                <div key={i} className="w-[132px] flex-shrink-0 px-1.5">
                  {reduce ? chip : (
                    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                      transition={{ delay: 0.1 + i * 0.06, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
                      {chip}
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Skill comparison: diverging You-vs-Class bars (replaces the radar) ─────────
// Bars grow outward from a centre axis — right (green) above class average,
// left (red) below. Grade-B radar swapped for precise, colour-blind-safe reading.

function DivergingSkillBars({ data, hasClass, classCount }) {
  const reduce = useReducedMotion();
  const n = data.length || 1;
  const composite = Math.round(data.reduce((a, d) => a + (d.value || 0), 0) / n);
  const classComposite = hasClass ? Math.round(data.reduce((a, d) => a + (d.classAvg || 0), 0) / n) : null;

  return (
    <div className="w-full">
      {/* overall composite header */}
      <div className="flex items-center justify-center gap-2.5 mb-4">
        <span className="text-[30px] font-black text-[#1A56DB] leading-none"><CountUp value={composite} /></span>
        <div className="text-left leading-none">
          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Overall</p>
          {classComposite != null && <p className="text-[10px] font-extrabold text-neutral-400 mt-1">Class avg {classComposite}</p>}
        </div>
      </div>

      <div className="space-y-3">
        {data.map((d, i) => {
          const you = Math.round(d.value || 0);
          const cls = Math.round(d.classAvg || 0);
          const diff = you - cls;
          const up = diff >= 0;
          const barColor = up ? UP_GREEN : DOWN_RED;
          const w = hasClass ? Math.min(50, Math.abs(diff) * 1.3) : you;
          return (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-black text-neutral-700">{d.metric}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] font-black text-[#1A56DB]">{you}%</span>
                  {hasClass && <span className="text-[10px] font-extrabold text-neutral-400">/ {cls}%</span>}
                  {hasClass && diff !== 0 && (
                    <span className="text-[10px] font-black inline-flex items-center gap-0.5" style={{ color: barColor }}>
                      {up ? <TrendingUp size={10} /> : <TrendingDown size={10} />}{Math.abs(diff)}
                    </span>
                  )}
                </span>
              </div>
              {hasClass ? (
                <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
                  <div className="absolute top-0 bottom-0 left-1/2 w-px bg-neutral-300" />
                  {reduce ? (
                    <div className="absolute top-0 bottom-0 rounded-full" style={{ background: barColor, [up ? 'left' : 'right']: '50%', width: `${w}%` }} />
                  ) : (
                    <motion.div className="absolute top-0 bottom-0 rounded-full" style={{ background: barColor, [up ? 'left' : 'right']: '50%' }}
                      initial={{ width: 0 }} whileInView={{ width: `${w}%` }} viewport={{ once: true }}
                      transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 + i * 0.05 }} />
                  )}
                </div>
              ) : (
                <GrowBar value={you} color="#1A56DB" height="h-3" />
              )}
            </div>
          );
        })}
      </div>

      {/* legend */}
      <div className="flex items-center justify-center gap-4 text-[10px] font-extrabold text-neutral-400 mt-4">
        {hasClass ? (
          <>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: UP_GREEN }} /> Above class</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: DOWN_RED }} /> Below class{classCount ? ` (${classCount})` : ''}</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#1A56DB]" /> Your score</span>
        )}
      </div>
    </div>
  );
}

// ── Stock-style score trend ────────────────────────────────────────────────────

function TrendTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div className="bg-[#0f1014] text-white rounded-xl px-3.5 py-2.5 shadow-xl text-[11px] font-bold max-w-[220px]">
      <p className="text-white/50 text-[9px] font-black uppercase tracking-widest mb-1">{p.dateLabel}</p>
      <p className="leading-snug mb-1">{p.fullTitle}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-white/60 inline-flex items-center gap-1">
          <SubjectIcon value={p.emoji} size={11} />{p.subject}
        </span>
        <span className={`font-black text-[13px] ${p.score >= 60 ? 'text-emerald-400' : 'text-red-400'}`}>{p.score}%</span>
      </div>
      {p.flagged && <p className="text-red-400 text-[9px] font-black uppercase tracking-widest mt-1">⚠ Flagged attempt</p>}
    </div>
  );
}

// Reference-styled hero: smooth spline of test scores, a floating badge on the
// latest point, and a dashed class-average line (colour-blind-safe vs the solid You line).
const HERO_LINE = '#2383E2';

function StockTrend({ testTimeline, subjects, classAvg }) {
  const dark = useTheme(s => s.dark);
  const reduce = useReducedMotion();
  const [selSubject, setSelSubject] = useState('all');

  const { points, stats } = useMemo(() => {
    const filtered = (selSubject === 'all'
      ? testTimeline
      : testTimeline.filter(t => t.subject_id === selSubject || t.subject === subjects.find(s => s.id === selSubject)?.name))
      .slice()
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const pts = filtered.map((t, i) => ({
      i,
      name: t.date ? fmtDate(t.date).replace(/, \d{4}$/, '') : `#${i + 1}`,
      dateLabel: t.date ? fmtDate(t.date) : '',
      fullTitle: t.test_title,
      subject: t.subject || '',
      emoji: t.emoji,
      score: Math.round(t.score_pct || 0),
      flagged: !!t.flagged,
    }));
    if (pts.length === 0) return { points: [], stats: null };
    const scores = pts.map(p => p.score);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const delta = scores[scores.length - 1] - scores[0];
    return {
      points: pts,
      stats: {
        avg: Math.round(avg),
        delta: Math.round(delta * 10) / 10,
        high: Math.max(...scores),
        low: Math.min(...scores),
        count: pts.length,
        latest: scores[scores.length - 1],
        up: delta >= 0,
      },
    };
  }, [testTimeline, selSubject, subjects]);

  const deltaColor = stats?.up ? UP_GREEN : DOWN_RED;
  const classAvgRounded = Number.isFinite(classAvg) ? Math.round(classAvg) : null;
  const lastIndex = points.length - 1;

  return (
    <div className="bg-white rounded-[2rem] shadow-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <div>
          <h4 className="text-[16px] font-black text-neutral-900">Score Trend</h4>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Test performance over time</p>
        </div>
        {stats && (
          <div className="flex items-end gap-3">
            <div className="text-right">
              <p className="text-3xl font-black text-neutral-900 leading-none"><CountUp value={stats.avg} />%</p>
              <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mt-1">Period Avg</p>
            </div>
            <motion.span
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-black mb-0.5"
              style={{ color: deltaColor, background: tint(deltaColor, 0.12) }}
              initial={{ scale: 0 }} whileInView={{ scale: 1 }} viewport={{ once: true }}
              transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.3 }}
            >
              {stats.up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
              {stats.delta > 0 ? '+' : ''}{stats.delta}%
            </motion.span>
          </div>
        )}
      </div>

      {/* subject filter chips */}
      {/* no -mx-1: a negative right margin on an overflow-x rail pokes past the
          page edge and lets the whole page pan sideways on phones */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide py-2">
        <button onClick={() => setSelSubject('all')}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors ${selSubject === 'all' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
          All
        </button>
        {subjects.map(s => (
          <button key={s.id} onClick={() => setSelSubject(s.id)}
            className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-colors ${selSubject === s.id ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}>
            <SubjectIcon value={s.emoji} size={12} />{s.name}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-[220px] text-center">
          <BarChart3 size={30} className="text-neutral-300 mb-2" />
          <p className="text-xs font-bold text-neutral-400">No test data for this selection yet</p>
        </div>
      ) : (
        <>
          <div className="h-[230px] md:h-[270px] w-full min-w-0 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 26, right: 24, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={HERO_LINE} stopOpacity={0.20} />
                    <stop offset="100%" stopColor={HERO_LINE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dy={8} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dx={-6} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: dark ? 'rgba(255,255,255,0.25)' : '#d4d4d4', strokeDasharray: '3 3' }} />
                {classAvgRounded != null && (
                  <ReferenceLine y={classAvgRounded} stroke="#9ca3af" strokeDasharray="5 4" strokeWidth={1.5}
                    label={{ value: `Class ${classAvgRounded}%`, position: 'insideTopLeft', fontSize: 8.5, fontWeight: 900, fill: '#9ca3af' }} />
                )}
                <ReferenceLine y={60} stroke="#fca5a5" strokeDasharray="2 4" strokeWidth={1} />
                <Area
                  type="monotone" dataKey="score" stroke={HERO_LINE} strokeWidth={3}
                  fill="url(#stockFill)" animationDuration={reduce ? 0 : 1200}
                  dot={(props) => {
                    const { cx, cy, payload, index } = props;
                    if (payload.flagged) {
                      return (
                        <svg key={`dot-${index}`} x={cx - 6} y={cy - 6} width="12" height="12">
                          <circle cx="6" cy="6" r="5" fill="#fff" stroke={DOWN_RED} strokeWidth="2" />
                          <circle cx="6" cy="6" r="2" fill={DOWN_RED} />
                        </svg>
                      );
                    }
                    if (index === lastIndex) {
                      // floating value badge on the most recent score (reference "120" pill)
                      const by = Math.max(14, cy - 22);
                      return (
                        <g key={`dot-${index}`}>
                          <line x1={cx} y1={cy} x2={cx} y2={by + 9} stroke={HERO_LINE} strokeWidth={1.5} strokeDasharray="2 2" />
                          <circle cx={cx} cy={cy} r={4.5} fill="#fff" stroke={HERO_LINE} strokeWidth={2.5} />
                          <g transform={`translate(${cx}, ${by})`}>
                            <rect x={-19} y={-11} width={38} height={20} rx={10} fill={HERO_LINE} />
                            <text x={0} y={4} textAnchor="middle" fontSize={11} fontWeight={900} fill="#fff">{payload.score}%</text>
                          </g>
                        </g>
                      );
                    }
                    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2.5} fill="#fff" stroke={HERO_LINE} strokeWidth={2} />;
                  }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: HERO_LINE }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {/* ticker stats row */}
          <div className="grid grid-cols-4 gap-2 mt-3 pt-3 border-t border-black/5">
            {[
              { label: 'High', value: `${stats.high}%`, c: UP_GREEN },
              { label: 'Low', value: `${stats.low}%`, c: DOWN_RED },
              { label: 'Tests', value: stats.count, c: '#171717' },
              { label: 'Change', value: `${stats.delta > 0 ? '+' : ''}${stats.delta}%`, c: deltaColor },
            ].map((s, i) => (
              <div key={i} className="text-center">
                <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">{s.label}</p>
                <p className="text-[15px] font-black mt-0.5" style={{ color: s.c }}>{s.value}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Unified activity calendar ──────────────────────────────────────────────────

const CAL_TYPES = [
  { id: 'all',         label: 'All',         icon: Zap,           hex: '#0F7B6C' },
  { id: 'attendance',  label: 'Attendance',  icon: Calendar,      hex: '#0F7B6C' },
  { id: 'tests',       label: 'Tests',       icon: Target,        hex: '#2383E2' },
  { id: 'videos',      label: 'Videos',      icon: Video,         hex: '#6940A5' },
  { id: 'assignments', label: 'Assignments', icon: ClipboardList, hex: '#C2410C' },
];

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Month-grid activity calendar with ringed dates (reference-styled).
    Each active day shows a coloured ring by activity type; tap a day for detail. */
function ActivityCalendar({ attData, testData, vidData, assignData, subjects, heatmapSubject, setHeatmapSubject, streak }) {
  const dark = useTheme(s => s.dark);
  const reduce = useReducedMotion();
  const [type, setType] = useState('all');
  const [periodIdx, setPeriodIdx] = useState(0); // index into HEATMAP_PERIODS (0 = this month)
  const [selectedDay, setSelectedDay] = useState(null);
  const periodId = HEATMAP_PERIODS[periodIdx].id;
  const todayId = localDayId(new Date());

  const maps = useMemo(() => {
    const mk = (arr) => {
      const m = {};
      (arr || []).forEach(d => { m[d.date] = d; });
      return m;
    };
    return { att: mk(attData), test: mk(testData), vid: mk(vidData), assign: mk(assignData) };
  }, [attData, testData, vidData, assignData]);

  const weeks = useMemo(() => buildHeatmapWeeksForMonth(periodId), [periodId]);

  // Active activity types on a day (each with 0..1 intensity), respecting the type filter.
  const dayTypes = useCallback((day) => {
    const att = maps.att[day], test = maps.test[day], vid = maps.vid[day], assign = maps.assign[day];
    const attV = att && att.total > 0 ? Math.max(0.25, (att.present + (att.late || 0) * 0.5) / att.total) : 0;
    const testV = test ? Math.min(1, (test.count || 0) / 2) : 0;
    const vidV = vid ? Math.min(1, (vid.minutes || 0) / 45) : 0;
    const assignV = assign ? Math.min(1, (assign.count || 0) / 2) : 0;
    const all = [
      { id: 'attendance', hex: CAL_TYPES[1].hex, v: attV },
      { id: 'tests', hex: CAL_TYPES[2].hex, v: testV },
      { id: 'videos', hex: CAL_TYPES[3].hex, v: vidV },
      { id: 'assignments', hex: CAL_TYPES[4].hex, v: assignV },
    ].filter(t => t.v > 0);
    return type === 'all' ? all : all.filter(t => t.id === type);
  }, [maps, type]);

  const dayLabel = useCallback((day) => {
    const att = maps.att[day], test = maps.test[day], vid = maps.vid[day], assign = maps.assign[day];
    const bits = [];
    if (att && att.total > 0) bits.push(att.present > 0 ? 'Present' : att.late > 0 ? 'Late' : 'Absent');
    if (test?.count) bits.push(`${test.count} test${test.count > 1 ? 's' : ''}`);
    if (vid?.minutes) bits.push(`${Math.round(vid.minutes)} min videos`);
    if (assign?.count) bits.push(`${assign.count} submission${assign.count > 1 ? 's' : ''}`);
    const d = new Date(`${day}T00:00:00`);
    const label = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    return bits.length ? `${label} — ${bits.join(' · ')}` : `${label} — No activity`;
  }, [maps]);

  // month summary under the grid
  const summary = useMemo(() => {
    const att = sliceHeatmap(attData, periodId);
    const present = att.reduce((a, d) => a + (d.present || 0), 0);
    const absent = att.reduce((a, d) => a + (d.absent || 0), 0);
    const late = att.reduce((a, d) => a + (d.late || 0), 0);
    const total = present + absent + late;
    const tests = sliceHeatmap(testData, periodId).reduce((a, d) => a + (d.count || 0), 0);
    const vids = sliceHeatmap(vidData, periodId);
    const mins = Math.round(vids.reduce((a, d) => a + (d.minutes || 0), 0));
    const activeDays = vids.filter(d => (d.minutes || 0) > 0).length;
    const assigns = sliceHeatmap(assignData, periodId).reduce((a, d) => a + (d.count || 0), 0);
    return {
      attPct: total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : null,
      present, absent, tests, mins, activeDays, assigns,
    };
  }, [attData, testData, vidData, assignData, periodId]);

  const idleCellBg = dark ? '#15162e' : '#F5F4F2';

  return (
    <div className="bg-white rounded-[2rem] shadow-card p-5 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h4 className="text-[16px] font-black text-neutral-900">Activity Calendar</h4>
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Every study action, day by day</p>
        </div>
        <div className="flex items-center gap-2">
          {subjects.length > 0 && (
            <select value={heatmapSubject} onChange={e => setHeatmapSubject(e.target.value)}
              className="text-[11px] font-extrabold bg-neutral-100 px-2.5 py-1.5 rounded-full border-none outline-none text-neutral-600 cursor-pointer max-w-[120px]">
              <option value="all">All Subjects</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1 bg-neutral-100 rounded-full px-1 py-1">
            <button aria-label="Previous month" onClick={() => { setSelectedDay(null); setPeriodIdx(i => Math.min(HEATMAP_PERIODS.length - 1, i + 1)); }}
              disabled={periodIdx >= HEATMAP_PERIODS.length - 1}
              className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:bg-white disabled:opacity-30 transition-colors">
              <ChevronLeft size={13} strokeWidth={3} />
            </button>
            <span className="text-[11px] font-extrabold text-neutral-700 w-[72px] text-center">{HEATMAP_PERIODS[periodIdx].label}</span>
            <button aria-label="Next month" onClick={() => { setSelectedDay(null); setPeriodIdx(i => Math.max(0, i - 1)); }}
              disabled={periodIdx <= 0}
              className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:bg-white disabled:opacity-30 transition-colors">
              <ChevronRight size={13} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>

      {/* type filter chips */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {CAL_TYPES.map(t => {
          const Icon = t.icon;
          const on = type === t.id;
          return (
            <button key={t.id} onClick={() => setType(t.id)}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold transition-all ${on ? 'text-white shadow-sm' : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'}`}
              style={on ? { background: t.hex } : undefined}>
              <Icon size={12} />{t.label}
            </button>
          );
        })}
      </div>

      {/* weekday header */}
      <div className="grid grid-cols-7 gap-1 md:gap-1.5">
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-black text-neutral-400 uppercase tracking-wider py-1">{d}</div>
        ))}
      </div>

      {/* month grid */}
      <motion.div
        key={`${periodId}-${type}-${heatmapSubject}`}
        className="grid grid-cols-7 gap-1 md:gap-1.5"
        variants={reduce ? undefined : staggerChildren}
        initial={reduce ? false : 'hidden'}
        whileInView={reduce ? undefined : 'show'}
        viewport={{ once: true }}
      >
        {weeks.flat().map((day, idx) => {
          const inRange = day.startsWith(periodId);
          if (!inRange) return <div key={idx} className="aspect-square" />;
          const dayNum = Number(day.slice(8, 10));
          const types = dayTypes(day);
          const dominant = types.length ? types.reduce((a, b) => (a.v >= b.v ? a : b)) : null;
          const isToday = day === todayId;
          const isSel = day === selectedDay;
          const ringColor = dominant ? dominant.hex : null;
          const cell = (
            <button
              type="button"
              title={dayLabel(day)}
              aria-label={dayLabel(day)}
              onClick={() => setSelectedDay(isSel ? null : day)}
              className="relative w-full aspect-square min-h-[34px] rounded-full flex flex-col items-center justify-center transition-transform"
              style={{
                background: dominant ? tint(ringColor, dark ? 0.22 : 0.12) : idleCellBg,
                border: isSel ? `2px solid ${ringColor || (dark ? '#6b7280' : '#9ca3af')}`
                  : ringColor ? `2px solid ${tint(ringColor, 0.55)}`
                  : isToday ? `1.5px solid ${dark ? '#3b3d63' : '#D6D4D0'}` : '1.5px solid transparent',
              }}
            >
              <span className="text-[12px] md:text-[13px] font-black leading-none"
                style={{ color: dominant ? ringColor : (isToday ? (dark ? '#e5e7eb' : '#111827') : (dark ? '#8b8ca8' : '#9ca3af')) }}>
                {dayNum}
              </span>
              {types.length > 0 && (
                <span className="absolute bottom-[3px] flex gap-[2px]">
                  {types.slice(0, 4).map(t => (
                    <span key={t.id} className="w-[3px] h-[3px] rounded-full" style={{ background: t.hex }} />
                  ))}
                </span>
              )}
              {isToday && <span className="absolute -top-[1px] w-1 h-1 rounded-full" style={{ background: '#EA580C' }} />}
            </button>
          );
          if (reduce) return <div key={idx}>{cell}</div>;
          return (
            <motion.div key={idx} variants={fadeUp} whileHover={{ scale: 1.08 }} transition={springCard}>
              {cell}
            </motion.div>
          );
        })}
      </motion.div>

      {/* tapped-day detail */}
      <AnimatePresence mode="wait">
        {selectedDay && (
          <motion.div
            key={selectedDay}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -4 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="flex items-center gap-2 bg-neutral-50 rounded-2xl px-4 py-2.5 text-[12px] font-bold text-neutral-700"
          >
            <Calendar size={13} className="text-neutral-400 flex-shrink-0" />
            {dayLabel(selectedDay)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* legend + summary */}
      <div className="flex items-center justify-between flex-wrap gap-3 pt-3 border-t border-black/5">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {summary.attPct != null && (
            <span className="text-[11px] font-extrabold text-neutral-500">Attendance <strong className="text-neutral-900">{summary.attPct}%</strong></span>
          )}
          <span className="text-[11px] font-extrabold text-neutral-500">Tests <strong className="text-neutral-900">{summary.tests}</strong></span>
          <span className="text-[11px] font-extrabold text-neutral-500">Watch time <strong className="text-neutral-900">{summary.mins}m</strong></span>
          <span className="text-[11px] font-extrabold text-neutral-500">Submissions <strong className="text-neutral-900">{summary.assigns}</strong></span>
          {streak && (
            <span className="text-[11px] font-extrabold text-orange-600 inline-flex items-center gap-1">
              <Flame size={12} /> {streak.current}d streak <span className="text-neutral-400">(best {streak.best}d)</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {CAL_TYPES.slice(1).map(t => (
            <span key={t.id} className="inline-flex items-center gap-1 text-[9px] font-extrabold text-neutral-400">
              <span className="w-2 h-2 rounded-full" style={{ background: t.hex }} />{t.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── AI Mentor (streaming, section-aware) ──────────────────────────────────────

const MENTOR_SECTIONS = [
  { title: 'Performance Summary', icon: BarChart3, hex: '#872792' },
  { title: "What's Going Well", icon: CheckCircle2, hex: '#0F7B6C' },
  { title: 'What Needs Attention', icon: AlertTriangle, hex: '#B7791F' },
  { title: 'Solutions & Study Ideas', icon: Lightbulb, hex: '#2383E2' },
  { title: 'Goals', icon: Target, hex: '#C2410C' },
  { title: 'Weekly Timetable', icon: Calendar, hex: '#6940A5' },
  { title: 'Mentor Message', icon: Heart, hex: '#AD1A72' },
];
// Light variants of the mentor section colours, used in dark mode (the originals
// are dark and applied inline, so CSS can't reach them).
const MENTOR_HEX_DARK = {
  '#872792': '#f0abfc', '#0F7B6C': '#6ee7b7', '#B7791F': '#fcd34d',
  '#2383E2': '#93c5fd', '#C2410C': '#fdba74', '#6940A5': '#c4b5fd', '#AD1A72': '#f9a8d4',
};
const mentorHex = (hex, dark) => (dark ? (MENTOR_HEX_DARK[hex] || '#e9d5ff') : hex);
const SECTION_RE = /^(Performance Summary|What's Going Well|What Needs Attention|Solutions & Study Ideas|Goals|Weekly Timetable|Mentor Message|Focus of the Week|What I Noticed|Recommended Actions|Next Level Goal|AI Mentor Message)\s*$/i;

const DAY_LINE_RE = /^[-*\s]*\*{0,2}(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\*{0,2}\s*[:—-]\s*(.+)/i;
const DAY_PASTELS = ['mint', 'sky', 'peach', 'lavender', 'cream', 'pink', 'mint'];

/** Split the (possibly still-streaming) markdown into known sections.
    Headings may arrive as plain text, `## Heading` or `**Heading**`. */
function parseMentorSections(text) {
  const sections = [];
  let cur = { title: null, lines: [] };
  const flush = () => {
    if (cur.title || cur.lines.some(l => l.trim())) sections.push(cur);
  };
  text.split('\n').forEach(raw => {
    const plain = raw.replace(/^#{1,4}\s*/, '').replace(/\*/g, '').trim();
    if (SECTION_RE.test(plain)) {
      flush();
      cur = { title: plain, lines: [] };
    } else {
      cur.lines.push(raw);
    }
  });
  flush();
  return sections;
}

function MentorBold({ text, color = '#872792' }) {
  return text.split(/(\*\*.*?\*\*)/g).map((p, j) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4
      ? <strong key={j} className="font-extrabold" style={{ color }}>{p.slice(2, -2)}</strong>
      : p
  );
}

function MentorBody({ lines, color, cursor }) {
  const items = lines.map(l => l.trim()).filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== ''));
  return (
    <div className="text-[13.5px] font-medium leading-relaxed text-neutral-700">
      {items.map((l, i) => {
        const isLast = i === items.length - 1;
        const cur = isLast && cursor ? <span className="animate-pulse font-black ml-0.5" style={{ color }}>▍</span> : null;
        if (l === '') return <div key={i} className="h-1.5" />;
        if (/^(\*|-|\d+\.)\s/.test(l)) {
          const body = l.replace(/^(\*|-|\d+\.)\s/, '');
          const num = l.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} className="flex gap-2 mb-1.5">
              <span className="flex-shrink-0 w-4 text-center font-black" style={{ color }}>{num ? `${num}.` : '•'}</span>
              <span><MentorBold text={body} color={color} />{cur}</span>
            </div>
          );
        }
        return <p key={i} className="mb-1.5"><MentorBold text={l} color={color} />{cur}</p>;
      })}
    </div>
  );
}

/** Day-by-day timetable rows with pastel day chips; non-day lines fall back to prose. */
function TimetableBody({ lines, color, cursor }) {
  const reduce = useReducedMotion();
  const dark = useTheme(s => s.dark);
  const rows = [];
  const prose = [];
  lines.forEach(l => {
    const m = l.trim().match(DAY_LINE_RE);
    if (m) rows.push({ day: m[1], text: m[2].replace(/\*\*/g, '') });
    else if (l.trim()) prose.push(l);
  });
  if (rows.length === 0) return <MentorBody lines={lines} color={color} cursor={cursor} />;
  return (
    <div>
      {prose.length > 0 && <MentorBody lines={prose} color={color} cursor={false} />}
      <div className="space-y-1.5 mt-1">
        {rows.map((r, i) => {
          const p = pastelTokens(DAY_PASTELS[i % DAY_PASTELS.length], dark);
          const row = (
            <div className="flex items-start gap-2.5">
              <span
                className="flex-shrink-0 w-11 text-center px-1.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide"
                style={{ background: p.hex, color: p.fgHex }}
              >
                {r.day.slice(0, 3)}
              </span>
              <span className="text-[13px] font-medium text-neutral-700 leading-snug pt-0.5">
                {r.text}
                {cursor && i === rows.length - 1 && <span className="animate-pulse font-black ml-0.5" style={{ color }}>▍</span>}
              </span>
            </div>
          );
          if (reduce) return <div key={`${r.day}-${i}`}>{row}</div>;
          return (
            <motion.div
              key={`${r.day}-${i}`}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 280, damping: 24 }}
            >
              {row}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#6D28D9]/70">
      <span className="flex gap-1">
        {[0, 1, 2].map(i => (
          <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[#6D28D9]"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
        ))}
      </span>
      Reading your learning patterns...
    </div>
  );
}

// ── AI Mentor trigger button (sits inside the report card) ────────────────────
function AIMentorTrigger({ onClick, hasData, loading }) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      onClick={onClick}
      whileHover={reduce ? undefined : { scale: 1.015 }}
      whileTap={reduce ? undefined : { scale: 0.975 }}
      className="relative w-full flex items-center gap-4 rounded-[1.75rem] overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
      style={{ background: 'linear-gradient(135deg,#6D28D9 0%,#7C3AED 50%,#A855F7 100%)' }}
    >
      {/* shimmer sweep */}
      {!reduce && (
        <motion.span
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none"
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.8, ease: 'easeInOut' }}
        />
      )}
      {/* pulse ring when unused */}
      {!hasData && !loading && !reduce && (
        <motion.span
          className="absolute left-4 w-11 h-11 rounded-full bg-white/20"
          animate={{ scale: [1, 1.7], opacity: [0.5, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
      )}
      <div className="relative flex items-center gap-4 px-5 py-4 w-full">
        <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center flex-shrink-0 backdrop-blur-sm">
          {loading ? (
            <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="inline-flex">
              <Sparkles size={20} className="text-white" />
            </motion.span>
          ) : (
            reduce ? <Sparkles size={20} className="text-white" /> : (
              <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex">
                <Sparkles size={20} className="text-white" />
              </motion.span>
            )
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-extrabold text-[15px] leading-tight">AI Mentor</p>
          <p className="text-white/70 text-[11px] font-semibold leading-snug mt-0.5">
            {loading ? 'Reading your learning patterns…' : hasData ? 'Tap to view personalised insights' : 'Get personalised coaching now'}
          </p>
        </div>
        <motion.div
          animate={loading ? { rotate: [0, 15, -15, 0] } : { x: [0, 4, 0] }}
          transition={loading
            ? { duration: 0.6, repeat: Infinity }
            : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          }
          className="flex-shrink-0"
        >
          <ChevronRight size={20} className="text-white/80" />
        </motion.div>
      </div>
    </motion.button>
  );
}

// ── AI Mentor popup (bottom sheet on phone, centered modal on desktop) ─────────
function AIMentorPopup({ open, onClose, onRegenerate, suggestions, loading, isStreaming, error, generatedAt, tokens }) {
  const reduce = useReducedMotion();
  const dark   = useTheme(s => s.dark);
  const [copiedAI, setCopiedAI] = useState(false);
  const sections = useMemo(() => (suggestions ? parseMentorSections(suggestions) : []), [suggestions]);
  const active   = isStreaming || loading;

  const copyAI = async () => {
    try {
      await navigator.clipboard.writeText(suggestions);
      setCopiedAI(true);
      setTimeout(() => setCopiedAI(false), 2000);
    } catch (e) { console.error(e); }
  };


  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ai-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Sheet wrapper — bottom on phone, centered on desktop */}
          <div className="fixed inset-0 z-[61] flex items-end justify-center lg:items-center pointer-events-none">
            <motion.div
              key="ai-sheet"
              initial={reduce ? { opacity: 0 } : { y: '100%', opacity: 0, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { y: '100%', opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 320, damping: 32, mass: 0.9 }}
              className={[
                'pointer-events-auto w-full bg-white',
                'rounded-t-[2rem] lg:rounded-[2rem]',
                'max-h-[92dvh] lg:max-h-[85vh] lg:max-w-2xl lg:mx-4',
                'flex flex-col overflow-hidden',
                'shadow-[0_-8px_48px_rgba(109,40,217,0.18),0_0_0_1px_rgba(109,40,217,0.06)]',
                dark ? 'bg-neutral-900' : 'bg-white',
              ].join(' ')}
              style={reduce ? undefined : { transformOrigin: 'bottom center' }}
            >
              {/* Drag handle (phone) */}
              <div className="flex justify-center pt-3 pb-1 lg:hidden flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-neutral-200" />
              </div>

              {/* Top gradient accent + shimmer while streaming */}
              <div className="relative h-[3px] w-full overflow-hidden flex-shrink-0">
                {active && !reduce ? (
                  <motion.div
                    className="absolute h-full w-1/2 bg-gradient-to-r from-transparent via-violet-500 to-transparent"
                    animate={{ x: ['-120%', '320%'] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-purple-400" />
                )}
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EFEDEA] flex-shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-200/60 flex-shrink-0">
                  {reduce ? <Sparkles size={17} className="text-white" /> : (
                    <motion.span animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 2.4, repeat: Infinity }} className="inline-flex">
                      <Sparkles size={17} className="text-white" />
                    </motion.span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-extrabold text-[16px] text-neutral-900 leading-tight">AI Mentor</p>
                  <p className="text-[10px] font-extrabold uppercase tracking-widest text-violet-500 leading-none mt-0.5">Personalised coaching</p>
                </div>
                <motion.button
                  onClick={onClose}
                  whileHover={reduce ? undefined : { scale: 1.08 }}
                  whileTap={reduce ? undefined : { scale: 0.92 }}
                  className="w-9 h-9 rounded-full bg-neutral-100 hover:bg-neutral-200 flex items-center justify-center transition-colors flex-shrink-0"
                  aria-label="Close AI Mentor"
                >
                  <ChevronUp size={18} className="text-neutral-600" />
                </motion.button>
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5 space-y-3">
                {loading && !suggestions ? (
                  <div className="space-y-4 py-4">
                    <ThinkingDots />
                    {[85, 95, 65].map((w, i) => (
                      <motion.div key={i} className="h-3 rounded-full bg-neutral-200" style={{ width: `${w}%` }}
                        animate={reduce ? undefined : { opacity: [0.4, 0.9, 0.4] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-4 bg-red-50 rounded-2xl text-[13px] font-bold text-red-600 flex items-center gap-2">
                    <AlertTriangle size={16} /> {error}
                  </div>
                ) : suggestions ? (
                  <>
                    {sections.map((s, i) => {
                      const meta = MENTOR_SECTIONS.find(m => m.title.toLowerCase() === (s.title || '').toLowerCase());
                      const Icon = meta?.icon || Sparkles;
                      const hex  = mentorHex(meta?.hex || '#6D28D9', dark);
                      const isLastSection = i === sections.length - 1;
                      const isTimetable   = /weekly timetable/i.test(s.title || '');
                      const Body = isTimetable ? TimetableBody : MentorBody;
                      const block = (
                        <div className="bg-[#FAFAF9] rounded-2xl p-4">
                          {s.title && (
                            <p className="flex items-center gap-2 text-[13px] font-black mb-2" style={{ color: hex }}>
                              <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tint(hex, 0.12) }}>
                                <Icon size={13} />
                              </span>
                              {s.title}
                            </p>
                          )}
                          <Body lines={s.lines} color={hex} cursor={isStreaming && isLastSection} />
                        </div>
                      );
                      if (reduce) return <div key={s.title || i}>{block}</div>;
                      return (
                        <motion.div
                          key={s.title || i}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, ease: 'easeOut' }}
                        >
                          {block}
                        </motion.div>
                      );
                    })}
                    {!isStreaming && !loading && (
                      <motion.div
                        className="flex items-center gap-2 pt-2 flex-wrap"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        {tokens && !tokens.unlimited && tokens.remaining === 0 ? (
                          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-neutral-100 text-neutral-400 text-[11px] font-extrabold cursor-not-allowed select-none">
                            <RefreshCw size={12} /> Limit reached · resets tomorrow
                          </span>
                        ) : (
                          <button onClick={onRegenerate}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-neutral-900 text-white text-[11px] font-extrabold shadow-sm hover:bg-neutral-800 transition-colors">
                            <RefreshCw size={12} /> Regenerate
                            {tokens && !tokens.unlimited && (
                              <span className="ml-0.5 opacity-60">{tokens.remaining}/{tokens.limit}</span>
                            )}
                          </button>
                        )}
                        <button onClick={copyAI}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-neutral-700 text-[11px] font-extrabold shadow-sm border border-[#EBEAE7] hover:bg-neutral-50 transition-colors">
                          {copiedAI ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          {copiedAI ? 'Copied' : 'Copy'}
                        </button>
                        {generatedAt && (
                          <span className="text-[10px] font-extrabold text-neutral-400 ml-0.5">
                            Generated {timeAgo(generatedAt)}
                          </span>
                        )}
                      </motion.div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] font-extrabold text-neutral-700 py-2">
                    <CheckCircle2 size={16} className="text-emerald-600" /> Looking sharp! Keep up the good work.
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Share text (public API — unchanged shape) ─────────────────────────────────

export function shareReportText(data, period) {
  if (!data) return '';
  const s = data.student || {};
  const pText = period ? (period.charAt(0).toUpperCase() + period.slice(1)) : 'Overall';
  const subjects = data.subject_radar || [];
  let text = `*Student Report Card - ${s.name}*\n*Period:* ${pText}\n*Average Score:* ${Math.round(s.avg_score || 0)}%\n*Attendance:* ${Math.round(s.attendance_pct || 0)}%\n`;
  if (data.rank) text += `*Class Rank:* ${data.rank}/${data.total_students}\n`;
  if (subjects.length > 0) {
    text += `\n*Subject Details:*\n`;
    subjects.forEach(sub => {
      const avg = sub.test_count > 0 ? `${Math.round(sub.test_avg)}%` : '—';
      const att = sub.att_total > 0 ? `${Math.round(sub.attendance_pct)}%` : '—';
      text += `• ${sub.subject}: Avg ${avg} | Att. ${att}\n`;
    });
  }
  return text + `\nGenerated via Udaya LMS.`;
}

// ── Main component ─────────────────────────────────────────────────────────────

const PERIODS = [
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
  { id: 'overall', label: 'Overall' },
];

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, onDownloadPDF, canExport = true, autoOpenAI = false }) {
  const reduce = useReducedMotion();
  const dark = useTheme(s => s.dark);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
  const [generatedAt, setGeneratedAt] = useState(null);
  const [aiTokens, setAiTokens] = useState(null); // { remaining, limit, unlimited }
  const [heatmapSubject, setHeatmapSubject] = useState('all');
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    const text = shareReportText(data, period);
    if (!text) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${data.student?.name || 'Student'} - Report Card`, text });
        return;
      } catch (err) {
        console.error('Share dialog closed or failed', err);
        return; // Do not fallback to clipboard if share was cancelled
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy fail', err);
    }
  }, [data, period]);

  const student = data?.student || {}, subjects = data?.subjects || [], subjectRadar = data?.subject_radar || [];
  const testTimeline = data?.test_timeline || [], topicMap = data?.topic_map || [];
  const attHeatmapRaw = data?.attendance_heatmap || [], vidHeatmapRaw = data?.video_heatmap || [], testHeatmapRaw = data?.test_heatmap || [];
  const assignHeatmapRaw = data?.assignment_heatmap || [];
  const assignStats = data?.assignment_stats || { total: 0, submitted: 0, graded: 0, avg_marks_pct: 0, total_points_from_assignments: 0 };
  const assignScores = data?.assignment_scores || [];
  const liveStats = data?.live_classes_stats || { total: 0, attended: 0, attendance_pct: 0 };

  const attData = heatmapSubject === 'all' ? attHeatmapRaw : (data?.attendance_heatmap_by_subject?.[heatmapSubject] || []);
  const vidData = heatmapSubject === 'all' ? vidHeatmapRaw : (data?.video_heatmap_by_subject?.[heatmapSubject] || []);
  const testData = heatmapSubject === 'all' ? testHeatmapRaw : (data?.test_heatmap_by_subject?.[heatmapSubject] || []);

  const totalVids = subjectRadar.reduce((a, s) => a + (s.video_total || 0), 0);
  const doneVids = subjectRadar.reduce((a, s) => a + (s.video_done || 0), 0);
  const videoPct = totalVids > 0 ? Math.round((doneVids / totalVids) * 100) : 0;
  const rank = data?.rank, totalStudents = data?.total_students || 0;
  const grade = gradeBand(student.avg_score, dark);
  const percentile = rank && totalStudents > 0 ? Math.max(1, Math.round((rank / totalStudents) * 100)) : null;

  // ── Derived insights (streak, improvement, consistency, best/worst, coverage) ──
  const insights = useMemo(() => {
    // streak: any day with any activity counts
    const activeDays = new Set();
    attHeatmapRaw.forEach(d => { if ((d.present || 0) + (d.late || 0) > 0) activeDays.add(d.date); });
    testHeatmapRaw.forEach(d => { if ((d.count || 0) > 0) activeDays.add(d.date); });
    vidHeatmapRaw.forEach(d => { if ((d.minutes || 0) > 0) activeDays.add(d.date); });
    assignHeatmapRaw.forEach(d => { if ((d.count || 0) > 0) activeDays.add(d.date); });
    const sorted = [...activeDays].sort();
    let best = 0, run = 0, prev = null;
    sorted.forEach(day => {
      if (prev) {
        const diff = (new Date(`${day}T00:00:00`) - new Date(`${prev}T00:00:00`)) / 86400000;
        run = diff === 1 ? run + 1 : 1;
      } else run = 1;
      best = Math.max(best, run);
      prev = day;
    });
    let current = 0;
    const today = new Date();
    const cursor = new Date(today);
    if (!activeDays.has(localDayId(cursor))) cursor.setDate(cursor.getDate() - 1); // streak may end yesterday
    while (activeDays.has(localDayId(cursor))) { current += 1; cursor.setDate(cursor.getDate() - 1); }

    // improvement: second half vs first half of the timeline
    const sortedTests = testTimeline.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let improvement = null;
    if (sortedTests.length >= 4) {
      const mid = Math.floor(sortedTests.length / 2);
      const avgOf = arr => arr.reduce((a, t) => a + (t.score_pct || 0), 0) / (arr.length || 1);
      improvement = Math.round(avgOf(sortedTests.slice(mid)) - avgOf(sortedTests.slice(0, mid)));
    }

    // consistency: std deviation of scores
    let consistency = null;
    if (sortedTests.length >= 3) {
      const scores = sortedTests.map(t => t.score_pct || 0);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const sd = Math.sqrt(scores.reduce((a, s) => a + (s - mean) ** 2, 0) / scores.length);
      consistency = { sd: Math.round(sd), label: sd <= 10 ? 'Steady' : sd <= 20 ? 'Variable' : 'Erratic' };
    }

    // best / weakest subject by test average (needs at least one test)
    const tested = subjectRadar.filter(s => (s.test_count || 0) > 0);
    const bestSub = tested.length ? tested.reduce((a, b) => (a.test_avg >= b.test_avg ? a : b)) : null;
    const worstSub = tested.length > 1 ? tested.reduce((a, b) => (a.test_avg <= b.test_avg ? a : b)) : null;

    const coverage = data?.total_tests_in_standard > 0
      ? Math.round((testTimeline.length / data.total_tests_in_standard) * 100)
      : null;

    return { streak: { current, best }, improvement, consistency, bestSub, worstSub, coverage };
  }, [attHeatmapRaw, testHeatmapRaw, vidHeatmapRaw, assignHeatmapRaw, testTimeline, subjectRadar, data?.total_tests_in_standard]);

  // Real class baselines from the backend (null on older payloads → overlay hidden).
  const classAvgs = data?.class_averages || null;
  const radarData = useMemo(() => {
    // Consistency: prefer the test-score deviation (same definition as the class
    // baseline); fall back to video-activity regularity when too few tests.
    const vhm = vidHeatmapRaw, activeDays = vhm.filter(d => d.minutes > 0).length;
    const vidConsistency = vhm.length > 0 ? Math.round((activeDays / vhm.length) * 100) : 0;
    const myConsistency = insights.consistency
      ? Math.round(Math.max(0, Math.min(100, 100 - 2 * insights.consistency.sd)))
      : vidConsistency;
    const ca = classAvgs || {};
    return [
      { metric: 'Accuracy', value: Math.round(student.avg_score || 0), classAvg: Math.round(ca.avg_score || 0) },
      { metric: 'Attendance', value: Math.round(student.attendance_pct || 0), classAvg: Math.round(ca.attendance_pct || 0) },
      { metric: 'Videos', value: videoPct, classAvg: Math.round(ca.video_pct || 0) },
      { metric: 'Consistency', value: myConsistency, classAvg: Math.round(ca.consistency || 0) },
      { metric: 'Mastery', value: Math.round(data?.topic_mastery_pct || 0), classAvg: Math.round(ca.mastery || 0) },
      { metric: 'Points', value: Math.min(100, Math.round(((student.points || 0) / 500) * 100)), classAvg: Math.min(100, Math.round(((ca.points || 0) / 500) * 100)) },
    ];
  }, [data, videoPct, vidHeatmapRaw, student.avg_score, student.attendance_pct, student.points, classAvgs, insights.consistency]);

  const weakestTopics = useMemo(() => {
    const rows = topicMap.map(t => ({ topic: t.topic, subject: t.subject, videoStatus: t.video_completed ? 'Watched' : 'Not Watched', score: t.score_pct }));
    const mappedTests = new Set(topicMap.map(t => t.test_title));
    testTimeline.forEach(t => {
      if (!mappedTests.has(t.test_title)) rows.push({ topic: t.test_title, subject: t.subject, videoStatus: '—', score: t.score_pct });
    });
    return rows.sort((a, b) => a.score - b.score).slice(0, 10);
  }, [topicMap, testTimeline]);

  const gradedAssignments = useMemo(
    () => assignScores.filter(s => s.status === 'Graded' || s.marks_obtained != null).map(s => ({ ...s, marks_obtained: Math.round(s.marks_obtained || 0) })),
    [assignScores]
  );

  const testsAttempted = testTimeline.length;
  const testsMissed = Math.max(0, (data?.total_tests_in_standard || 0) - testsAttempted);

  // ── AI mentor: backend owns ALL the analysis data — the browser only says
  // which student and which period. Stream a fresh analysis on demand.
  const fetchTokens = useCallback(async () => {
    try { setAiTokens(await aiApi.getTokens()); } catch { /* non-critical */ }
  }, []);

  const runAnalysis = useCallback(async () => {
    setSuggestionsLoading(true); setSuggestionsError(''); setSuggestions(''); setGeneratedAt(null);
    try {
      let acc = '';
      await aiApi.generateInsightsStream(student.id, { period: period || 'overall' }, (chunk) => { acc += chunk; setSuggestionsLoading(false); setIsStreaming(true); setSuggestions(acc); });
      setSuggestions(acc);
      setGeneratedAt(new Date().toISOString());
      fetchTokens(); // refresh count after a successful generation
    } catch (e) { setSuggestionsError(e.message || 'Failed to generate insights.'); } finally { setSuggestionsLoading(false); setIsStreaming(false); }
  }, [student?.id, period, fetchTokens]);

  // Cache-first open: the backend keeps the last analysis per student+period,
  // so most opens render instantly without an LLM call. Regenerate streams fresh.
  const loadInsights = useCallback(async () => {
    setSuggestionsError('');
    try {
      const cached = await aiApi.getCachedInsights(student.id, period || 'overall');
      if (cached?.insights) {
        setSuggestions(cached.insights);
        setGeneratedAt(cached.generated_at || null);
        return;
      }
    } catch { /* cache unavailable → just generate fresh */ }
    await runAnalysis();
  }, [student?.id, period, runAnalysis]);

  const handleAnalyzePerformance = useCallback(() => {
    if (showSuggestions) { setShowSuggestions(false); return; }
    setShowSuggestions(true);
    fetchTokens();
    if (!suggestions) loadInsights();
  }, [showSuggestions, suggestions, loadInsights, fetchTokens]);

  // When opened via the home "AI Mentor" shortcut (?ai=1), auto-open the popup.
  // Ref-guarded so it fires a single time even as data/loadInsights identities change.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!autoOpenAI || autoOpenedRef.current || !student?.id) return;
    autoOpenedRef.current = true;
    setShowSuggestions(true);
    loadInsights();
  }, [autoOpenAI, student?.id, loadInsights]);

  // The cache is per-period: switching tabs must drop the old text and, if the
  // panel is open, pull the right period's analysis.
  const periodRef = useRef(period);
  useEffect(() => {
    if (periodRef.current === period) return;
    periodRef.current = period;
    setSuggestions(''); setGeneratedAt(null); setSuggestionsError('');
    if (showSuggestions) loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  // ── PDF export — shared branded builder (logo header, photo, full data) ──────
  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    if (onDownloadPDF) { onDownloadPDF(data); return; }
    try {
      const { buildStudentReportPdf } = await import('../../lib/reportPdf');
      await buildStudentReportPdf({ data, period });
    } catch (e) {
      console.error('Failed to generate PDF', e);
      alert('Failed to generate PDF. Please ensure you have a stable connection.');
    }
  }, [data, period, onDownloadPDF]);

  if (!data) return (
    <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
      <BarChart3 size={40} className="mb-4 opacity-30" />
      <p className="text-lg font-bold">No report data available yet.</p>
    </div>
  );

  const statTiles = [
    { label: 'Avg Score', value: Math.round(student.avg_score || 0), suffix: '%', pastel: 'mint', icon: Target, ring: Math.round(student.avg_score || 0) },
    { label: 'Attendance', value: Math.round(student.attendance_pct || 0), suffix: '%', pastel: 'sky', icon: Calendar, ring: Math.round(student.attendance_pct || 0) },
    { label: 'Videos', value: videoPct, suffix: '%', pastel: 'cream', icon: Video, ring: videoPct },
    { label: 'Assignments', value: assignStats.total > 0 ? Math.round((assignStats.submitted / assignStats.total) * 100) : 0, suffix: '%', pastel: 'peach', icon: ClipboardList, ring: assignStats.total > 0 ? Math.round((assignStats.submitted / assignStats.total) * 100) : 0 },
    { label: 'Live Classes', value: Math.round(liveStats.attendance_pct || 0), suffix: '%', pastel: 'lavender', icon: Radio, ring: Math.round(liveStats.attendance_pct || 0) },
    { label: 'Points', value: student.points || 0, suffix: '', pastel: 'pink', icon: Trophy, ring: null, spark: testTimeline.slice(-8).map(t => Math.round(t.score_pct || 0)) },
  ];

  const insightChips = [
    { icon: Flame, label: 'Study Streak', value: `${insights.streak.current} days`, sub: `Best ${insights.streak.best}d`, pastel: 'peach', show: true },
    { icon: insights.improvement != null && insights.improvement < 0 ? TrendingDown : TrendingUp, label: 'Improvement', value: insights.improvement != null ? `${insights.improvement > 0 ? '+' : ''}${insights.improvement}%` : '—', sub: 'vs earlier tests', pastel: insights.improvement != null && insights.improvement < 0 ? 'pink' : 'mint', show: insights.improvement != null },
    { icon: Zap, label: 'Consistency', value: insights.consistency ? insights.consistency.label : '—', sub: insights.consistency ? `±${insights.consistency.sd}%` : '', pastel: 'sky', show: !!insights.consistency },
    { icon: Trophy, label: 'Best Subject', value: insights.bestSub ? insights.bestSub.subject : '—', sub: insights.bestSub ? `${Math.round(insights.bestSub.test_avg)}% avg` : '', pastel: 'cream', show: !!insights.bestSub },
    { icon: AlertTriangle, label: 'Needs Attention', value: insights.worstSub ? insights.worstSub.subject : '—', sub: insights.worstSub ? `${Math.round(insights.worstSub.test_avg)}% avg` : '', pastel: 'pink', show: !!insights.worstSub && insights.worstSub !== insights.bestSub },
    { icon: FileText, label: 'Test Coverage', value: insights.coverage != null ? `${insights.coverage}%` : '—', sub: `${testsAttempted} taken`, pastel: 'lavender', show: insights.coverage != null },
    { icon: Brain, label: 'Topic Mastery', value: pct(data?.topic_mastery_pct), sub: 'across topics', pastel: 'mint', show: data?.topic_mastery_pct != null },
  ].filter(c => c.show);

  return (
    <div className={`font-sans ${showHeader ? 'bg-transparent' : 'bg-transparent'} text-neutral-900 min-h-screen`}>
      <div className={`mx-auto ${showHeader ? 'max-w-[1400px] lg:px-4 lg:py-6' : 'w-full'}`}>
        <div className={`${showHeader ? 'bg-white shadow-[0_8px_40px_rgb(0,0,0,0.06)] lg:rounded-[3rem] overflow-hidden' : ''}`}>

          {/* ── HEADER (dark) ── */}
          {showHeader && (
            <div className="bg-[#0f1014] text-white px-5 py-6 md:px-8 md:py-8 relative overflow-hidden">
              {!reduce && (
                <motion.div
                  className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/5 pointer-events-none"
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <div className="relative flex items-center justify-between gap-5 flex-wrap">
                <div className="flex items-center gap-3 md:gap-4">
                  <Avatar name={student.name || 'S'} src={student.avatar_url} size="lg" />
                  <div>
                    <div className="flex items-center gap-2.5 mb-1 flex-wrap">
                      <h2 className="text-xl md:text-2xl font-black text-white tracking-wide leading-tight">{student.name || 'Student'}</h2>
                      <motion.span
                        className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-[13px] font-black"
                        style={{ background: grade.bg, color: grade.color }}
                        initial={reduce ? false : { scale: 0, rotate: -10 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.3 }}
                        title={grade.label}
                      >
                        {grade.grade}
                      </motion.span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* bg-[rgba(...)] (not bg-white/20): index.css forces .bg-white\/xx
                          opaque white for the light pastel theme, which would render this
                          chip white-on-white on the dark header. */}
                      {student.standard_name && <span className="text-[11px] font-extrabold bg-[rgba(255,255,255,0.18)] text-white px-2.5 py-0.5 rounded-full">{student.standard_name}</span>}
                      {rank && (
                        <span className="text-[11px] font-extrabold text-amber-300 bg-amber-300/10 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                          <Trophy size={11} /> #{rank} of {totalStudents}{percentile != null && ` · Top ${percentile}%`}
                        </span>
                      )}
                      <span className="text-[11px] font-bold text-[#84cc16] bg-[#84cc16]/10 px-2.5 py-0.5 rounded-full flex items-center gap-1"><Clock size={12} /> {timeAgo(student.last_active_at)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto flex-wrap">
                  {onPeriodChange && (
                    <div className="flex bg-white/10 rounded-full p-1 border border-white/10">
                      {PERIODS.map(p => (
                        <button key={p.id} onClick={() => onPeriodChange(p.id)}
                          className={`px-3.5 py-1.5 rounded-full text-[12px] font-extrabold transition-colors ${period === p.id ? 'bg-white text-[#0f1014]' : 'text-white/60 hover:text-white'}`}>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={handleShare} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-extrabold bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/10">
                    {copied ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Share2 size={15} />}
                    {copied ? 'Copied' : 'Share'}
                  </button>
                  {canExport && (
                    <button onClick={handleDownloadPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-extrabold bg-white hover:bg-neutral-100 text-[#0f1014] rounded-full shadow-sm transition-all">
                      <Download size={15} /> Export PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={`${showHeader ? 'p-4 md:p-8' : 'p-0'} space-y-5 md:space-y-8`}>

            {/* ── 1. STAT BAND ── */}
            <Section>
              <motion.div
                className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 md:gap-4"
                variants={reduce ? undefined : staggerChildren}
                initial={reduce ? false : 'hidden'}
                whileInView={reduce ? undefined : 'show'}
                viewport={{ once: true }}
              >
                {statTiles.map((t) => {
                  const p = pastelTokens(t.pastel, dark);
                  const Icon = t.icon;
                  return (
                    <motion.div
                      key={t.label}
                      variants={reduce ? undefined : fadeUp}
                      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                      transition={springCard}
                      className="rounded-[1.75rem] p-4 flex items-center gap-3 shadow-card"
                      style={{ background: p.hex }}
                    >
                      {t.ring != null ? (
                        <ProgressRing pct={t.ring} size={44} stroke={4.5} color={p.fgHex}>
                          <Icon size={14} style={{ color: p.fgHex }} />
                        </ProgressRing>
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-white/70 flex items-center justify-center flex-shrink-0" style={{ color: p.fgHex }}>
                          <Icon size={18} />
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[22px] font-black leading-none" style={{ color: p.fgHex }}>
                          <CountUp value={t.value} />{t.suffix}
                        </p>
                        <p className="text-[9px] font-black uppercase tracking-widest mt-1.5 truncate" style={{ color: p.fgHex, opacity: 0.65 }}>{t.label}</p>
                        {t.spark && t.spark.length >= 2 && (
                          <div className="mt-1.5 -mb-0.5"><Sparkline values={t.spark} color={p.fgHex} /></div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </motion.div>
            </Section>

            {/* ── 2. INSIGHTS STRIP ── */}
            {insightChips.length > 0 && (
              <Section>
                <div className="flex gap-2.5 overflow-x-auto scrollbar-hide pb-1">
                  {insightChips.map((c, i) => {
                    const p = pastelTokens(c.pastel, dark);
                    const Icon = c.icon;
                    const chip = (
                      <div className="flex-shrink-0 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 shadow-sm bg-white">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: p.hex, color: p.fgHex }}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-black text-neutral-900 leading-tight whitespace-nowrap">{c.value}</p>
                          <p className="text-[9px] font-extrabold text-neutral-400 uppercase tracking-widest whitespace-nowrap">{c.label}{c.sub ? ` · ${c.sub}` : ''}</p>
                        </div>
                      </div>
                    );
                    if (reduce) return <div key={c.label}>{chip}</div>;
                    return (
                      <motion.div key={c.label}
                        initial={{ opacity: 0, scale: 0.8, y: 8 }}
                        whileInView={{ opacity: 1, scale: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 20 }}>
                        {chip}
                      </motion.div>
                    );
                  })}
                </div>
              </Section>
            )}

            {/* ── AI MENTOR trigger button (opens popup) ── */}
            <Section>
              <AIMentorTrigger
                onClick={handleAnalyzePerformance}
                hasData={!!suggestions}
                loading={suggestionsLoading}
              />
            </Section>

            {/* ── AI MENTOR popup (bottom sheet / modal) ── */}
            <AIMentorPopup
              open={showSuggestions}
              onClose={() => setShowSuggestions(false)}
              onRegenerate={runAnalysis}
              suggestions={suggestions}
              loading={suggestionsLoading}
              isStreaming={isStreaming}
              error={suggestionsError}
              generatedAt={generatedAt}
              tokens={aiTokens}
            />

            {/* ── 3. MAIN GRID ── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 md:gap-8">
              <div className="xl:col-span-8 space-y-5 md:space-y-8 min-w-0">
                <Section><StockTrend testTimeline={testTimeline} subjects={subjects} classAvg={classAvgs?.avg_score} /></Section>
                <Section>
                  <ActivityCalendar
                    attData={attData} testData={testData} vidData={vidData} assignData={assignHeatmapRaw}
                    subjects={subjects} heatmapSubject={heatmapSubject} setHeatmapSubject={setHeatmapSubject}
                    streak={insights.streak}
                  />
                </Section>
                {testTimeline.length > 0 && (
                  <Section><TestTimelineRail testTimeline={testTimeline} dark={dark} /></Section>
                )}
              </div>

              {/* SIDEBAR */}
              <div className="xl:col-span-4 space-y-5 md:space-y-8 min-w-0">
                <Section>
                  <div className="bg-white rounded-[2rem] shadow-card p-5 md:p-6">
                    <div className="text-center mb-1">
                      <h4 className="text-[16px] font-black text-neutral-900 mb-0.5">Skill Profile</h4>
                      <p className="text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-widest">
                        {classAvgs ? 'You vs Class Average' : 'Your skill breakdown'}
                      </p>
                    </div>
                    <DivergingSkillBars data={radarData} hasClass={!!classAvgs} classCount={classAvgs?.students_counted} />
                  </div>
                </Section>

                {/* FOCUS AREAS */}
                <Section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Target size={14} strokeWidth={2.5} /></div>
                    <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Focus Areas</h3>
                  </div>
                  {weakestTopics.length === 0 ? (
                    <div className="bg-white rounded-[2rem] p-6 text-center text-neutral-400 text-sm font-bold shadow-sm">No weak topics identified yet. Great job!</div>
                  ) : (
                    <div className="space-y-3">
                      {weakestTopics.slice(0, 5).map((topic, i) => {
                        const theme = CARD_COLORS[i % CARD_COLORS.length];
                        const card = (
                          <div className={`${theme.bg} rounded-[1.5rem] p-4 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2`}>
                            <div>
                              <p className={`text-[9px] font-black uppercase tracking-widest ${theme.text} opacity-60 mb-0.5`}>{topic.subject}</p>
                              <p className={`text-[14px] font-black leading-tight ${theme.text}`}>{topic.topic}</p>
                            </div>
                            <div className="mt-1"><GrowBar value={topic.score} color="rgba(0,0,0,0.35)" track="bg-white/50" /></div>
                            <div className="flex items-center gap-2 pt-1">
                              <span className={`bg-white/60 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm ${theme.text}`}>{Math.round(topic.score)}% Score</span>
                              {topic.videoStatus === 'Watched' ? (
                                <span className="bg-emerald-100/80 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm">Watched</span>
                              ) : topic.videoStatus === 'Not Watched' ? (
                                <span className="bg-red-100/80 text-red-700 px-2.5 py-1 rounded-full text-[10px] font-black shadow-sm">Not Watched</span>
                              ) : null}
                            </div>
                          </div>
                        );
                        if (reduce) return <div key={i}>{card}</div>;
                        return (
                          <motion.div key={i}
                            initial={{ opacity: 0, x: 24 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                            {card}
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </Section>

                {/* ASSIGNMENTS */}
                {assignStats.total > 0 && (
                  <Section>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600"><ClipboardList size={14} strokeWidth={2.5} /></div>
                      <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Assignments</h3>
                    </div>
                    <div className="bg-white rounded-[2rem] shadow-card p-5 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Submitted</p>
                          <p className="text-xl font-black text-neutral-900"><CountUp value={assignStats.submitted} /><span className="text-xs text-neutral-400">/{assignStats.total}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Avg Score</p>
                          <p className="text-xl font-black text-neutral-900"><CountUp value={assignStats.avg_marks_pct} />%</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest">Points</p>
                          <p className="text-xl font-black text-[#872792]">+<CountUp value={assignStats.total_points_from_assignments} /></p>
                        </div>
                      </div>

                      <SegmentedBar segments={[
                        { label: 'Graded', value: assignStats.graded || 0, color: '#0F7B6C' },
                        { label: 'Submitted', value: Math.max(0, (assignStats.submitted || 0) - (assignStats.graded || 0)), color: '#2383E2' },
                        { label: 'Pending', value: Math.max(0, (assignStats.total || 0) - (assignStats.submitted || 0)), color: '#E5E3DF' },
                      ]} />

                      {gradedAssignments.length > 0 && (
                        <div className="pt-3 border-t border-black/5">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-3">Scores</p>
                          <ResponsiveContainer width="100%" height={160}>
                            <BarChart data={gradedAssignments} margin={{ top: 4, right: 0, left: -25, bottom: 0 }} barCategoryGap="28%">
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'} />
                              <XAxis dataKey="assignment_title" tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} tickFormatter={t => t.length > 8 ? t.slice(0, 8) + '…' : t} axisLine={false} tickLine={false} interval={0} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: dark ? '#9aa4b2' : '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 10, fontWeight: 'bold', backgroundColor: dark ? '#1a1b33' : '#fff', color: dark ? '#e5e7eb' : undefined }} cursor={{ fill: dark ? 'rgba(255,255,255,0.06)' : '#f3f4f6' }} />
                              <Bar dataKey="marks_obtained" radius={[6, 6, 0, 0]} maxBarSize={26} animationDuration={reduce ? 0 : 1100}>
                                {gradedAssignments.map((e, idx) => <Cell key={idx} fill={e.marks_obtained >= 60 ? (dark ? '#6ee7b7' : '#0F7B6C') : (dark ? '#fca5a5' : '#ef4444')} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}

                      {subjectRadar.filter(s => (s.assignment_total || 0) > 0).length > 0 && (
                        <div className="space-y-3 pt-3 border-t border-black/5">
                          {subjectRadar.filter(s => (s.assignment_total || 0) > 0).map(s => {
                            const p = Math.round(((s.assignment_submitted || 0) / (s.assignment_total || 1)) * 100);
                            return (
                              <div key={s.subject_id}>
                                <div className="flex justify-between text-[10px] font-black mb-1.5">
                                  <span className="text-neutral-700 inline-flex items-center gap-1.5"><SubjectIcon value={s.emoji} size={12} />{s.subject}</span>
                                  <span className="text-neutral-400">{s.assignment_submitted}/{s.assignment_total}</span>
                                </div>
                                <GrowBar value={p} color="#1A56DB" height="h-1" />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Section>
                )}
              </div>
            </div>

            {/* ── 4. SUBJECT BREAKDOWN (animated bars, mobile-safe) ── */}
            {subjectRadar.length > 0 && (
              <Section>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600"><BookOpen size={14} strokeWidth={2.5} /></div>
                  <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Subject Breakdown</h3>
                </div>
                <SubjectGroupedBars subjectRadar={subjectRadar} dark={dark} />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subjectRadar.map((r, i) => {
                    const p = pastelTokens(pastelFor(r.subject), dark);
                    const testAvg = Math.round(r.test_avg || 0);
                    const vidP = r.video_total > 0 ? Math.round((r.video_done / r.video_total) * 100) : 0;
                    const attP = Math.round(r.attendance_pct || 0);
                    const assignP = r.assignment_total > 0 ? Math.round(((r.assignment_submitted || 0) / r.assignment_total) * 100) : null;
                    const status = (r.test_count || 0) === 0 ? null : testAvg >= 75 ? { t: 'Excellent', c: '#0F7B6C', bg: '#DFF5EC' } : testAvg >= 50 ? { t: 'Good', c: '#B7791F', bg: '#FBF1D9' } : { t: 'Needs Work', c: '#DC2626', bg: '#FEE2E2' };
                    const bars = [
                      { label: 'Tests', value: r.test_count > 0 ? testAvg : null, suffix: r.test_count > 0 ? `${testAvg}% · ${r.test_count} test${r.test_count > 1 ? 's' : ''}` : 'No tests' },
                      { label: 'Videos', value: r.video_total > 0 ? vidP : null, suffix: r.video_total > 0 ? `${r.video_done}/${r.video_total}` : 'No videos' },
                      { label: 'Attendance', value: r.att_total > 0 ? attP : null, suffix: r.att_total > 0 ? `${attP}%` : '—' },
                      { label: 'Assignments', value: assignP, suffix: assignP != null ? `${r.assignment_submitted}/${r.assignment_total}` : '—' },
                    ];
                    const card = (
                      <div className="bg-white rounded-[2rem] shadow-card p-5">
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: p.hex, color: p.fgHex }}>
                              <SubjectIcon value={r.emoji} size={17} />
                            </div>
                            <p className="text-[15px] font-black text-neutral-900 truncate">{r.subject}</p>
                          </div>
                          {status && (
                            <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-black" style={{ color: status.c, background: status.bg }}>{status.t}</span>
                          )}
                        </div>
                        <div className="space-y-3">
                          {bars.map(b => (
                            <div key={b.label}>
                              <div className="flex justify-between text-[10px] font-black mb-1">
                                <span className="text-neutral-500 uppercase tracking-widest">{b.label}</span>
                                <span className="text-neutral-400">{b.suffix}</span>
                              </div>
                              <GrowBar value={b.value ?? 0} color={b.value == null ? '#E5E5E5' : p.fgHex} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                    if (reduce) return <div key={r.subject_id || i}>{card}</div>;
                    return (
                      <motion.div key={r.subject_id || i}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        whileHover={{ y: -3 }}
                        transition={{ delay: (i % 2) * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
                        {card}
                      </motion.div>
                    );
                  })}
                </div>
              </Section>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
