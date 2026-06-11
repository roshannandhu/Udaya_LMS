import React, { useState, useMemo, useCallback } from 'react';
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
import { PASTEL, pastelFor } from '../cards/pastel';
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

function gradeBand(score) {
  const s = Math.round(score || 0);
  if (s >= 90) return { grade: 'A+', label: 'Outstanding', color: '#0F7B6C', bg: '#DFF5EC' };
  if (s >= 80) return { grade: 'A', label: 'Excellent', color: '#0F7B6C', bg: '#DFF5EC' };
  if (s >= 70) return { grade: 'B+', label: 'Very Good', color: '#2383E2', bg: '#E3EFFB' };
  if (s >= 60) return { grade: 'B', label: 'Good', color: '#2383E2', bg: '#E3EFFB' };
  if (s >= 50) return { grade: 'C', label: 'Average', color: '#B7791F', bg: '#FBF1D9' };
  if (s >= 35) return { grade: 'D', label: 'Needs Work', color: '#C2410C', bg: '#FCE6DD' };
  return { grade: 'E', label: 'At Risk', color: '#DC2626', bg: '#FEE2E2' };
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

// ── Skill radar (interactive showpiece) ───────────────────────────────────────

function radarPath(data, cx, cy, r, valueKey) {
  const n = data.length || 1;
  return data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const p = Math.max(0, Math.min((d[valueKey] || 0) / 100, 1));
    return [cx + r * p * Math.cos(angle), cy + r * p * Math.sin(angle)];
  });
}

function pointsToPath(pts) {
  if (!pts || pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + ' Z';
}

function SkillRadar({ data, hasClass, classCount }) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState(0);
  const cx = 135, cy = 135, r = 85, n = data.length || 1, levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  const axisPoints = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  const studentPts = radarPath(data, cx, cy, r, 'value');
  const avgPts = hasClass ? radarPath(data, cx, cy, r, 'classAvg') : [];
  const composite = Math.round(data.reduce((a, d) => a + (d.value || 0), 0) / n);
  const sel = data[selected];
  const selDiff = hasClass && sel ? Math.round((sel.value || 0) - (sel.classAvg || 0)) : null;

  return (
    <div className="w-full flex flex-col items-center min-w-0">
      <div className="w-full flex justify-center py-1 min-w-0 overflow-hidden">
        <svg width="100%" height="100%" viewBox="-50 -30 370 330" style={{ maxWidth: '350px' }} className="mx-auto select-none">
          <defs>
            <radialGradient id="youGlowSvg" cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor="#1A56DB" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#1A56DB" stopOpacity={0.06} />
            </radialGradient>
          </defs>

          {/* grid rings: staggered pop-in */}
          {levels.map((l, li) => {
            const pts = data.map((_, i) => {
              const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
              return [cx + r * l * Math.cos(angle), cy + r * l * Math.sin(angle)];
            });
            const poly = <polygon points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="#f0efed" strokeWidth="1.5" />;
            if (reduce) return <g key={l}>{poly}</g>;
            return (
              <motion.g key={l}
                initial={{ opacity: 0, scale: 0.4 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: li * 0.06, type: 'spring', stiffness: 200, damping: 20 }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}>
                {poly}
              </motion.g>
            );
          })}

          {/* spokes: draw out from center; selected spoke highlighted */}
          {axisPoints.map((pt, i) => (
            <motion.line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y}
              stroke={i === selected ? '#1A56DB' : '#f0efed'}
              strokeWidth={i === selected ? 2 : 1.5}
              strokeOpacity={i === selected ? 0.45 : 1}
              initial={reduce ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.25 + i * 0.05, duration: 0.4, ease: 'easeOut' }}
            />
          ))}

          {data.length > 2 && (
            <>
              {/* class average overlay (only when real data exists) */}
              {hasClass && (
                <motion.path
                  d={pointsToPath(avgPts)} fill="rgba(156, 163, 175, 0.06)" stroke="#9ca3af"
                  strokeWidth="1.5" strokeDasharray="4 4"
                  initial={reduce ? false : { opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                />
              )}
              {/* ambient glow fill (slow pulse) */}
              <motion.path
                d={pointsToPath(studentPts)} fill="url(#youGlowSvg)" stroke="none"
                initial={reduce ? { opacity: 0.7 } : { scale: 0.5, opacity: 0 }}
                whileInView={reduce ? { opacity: 0.7 } : { scale: 1, opacity: [0.55, 0.95, 0.55] }}
                viewport={{ once: true }}
                transition={reduce ? undefined : { scale: { type: 'spring', stiffness: 150, damping: 18, delay: 0.45 }, opacity: { duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 0.45 } }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
              {/* student outline */}
              <motion.path
                d={pointsToPath(studentPts)} fill="none" stroke="#1A56DB" strokeWidth="3" strokeLinejoin="round"
                initial={reduce ? false : { scale: 0.5, opacity: 0 }}
                whileInView={{ scale: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ type: 'spring', stiffness: 150, damping: 18, delay: 0.45 }}
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              />
            </>
          )}

          {/* vertices: sequential pop, tappable */}
          {studentPts.map((pt, i) => (
            <motion.circle
              key={i} cx={pt[0]} cy={pt[1]} r={i === selected ? 6.5 : 5}
              fill={i === selected ? '#fff' : '#1A56DB'} stroke={i === selected ? '#1A56DB' : '#fff'} strokeWidth={i === selected ? 3 : 2}
              className="cursor-pointer"
              onClick={() => setSelected(i)}
              initial={reduce ? false : { opacity: 0, scale: 0 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              whileHover={reduce ? undefined : { scale: 1.4 }}
              transition={{ delay: 0.65 + i * 0.07, type: 'spring', stiffness: 260, damping: 16 }}
              style={{ transformOrigin: `${pt[0]}px ${pt[1]}px` }}
            />
          ))}

          {/* center hub: composite score */}
          <motion.circle cx={cx} cy={cy} r="27" fill="#ffffff" stroke="#EBEAE7" strokeWidth="1.5"
            initial={reduce ? false : { scale: 0 }}
            whileInView={{ scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.9, type: 'spring', stiffness: 240, damping: 15 }}
            style={{ transformOrigin: `${cx}px ${cy}px` }}
          />
          <foreignObject x={cx - 26} y={cy - 20} width="52" height="40">
            <div className="w-full h-full flex flex-col items-center justify-center leading-none">
              <span className="text-[15px] font-black text-neutral-900"><CountUp value={composite} /></span>
              <span className="text-[6.5px] font-black text-neutral-400 uppercase tracking-widest mt-0.5">Overall</span>
            </div>
          </foreignObject>

          {/* axis labels: tappable, ▲/▼ vs class */}
          {data.map((d, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
            const lx = cx + (r + 18) * Math.cos(angle), ly = cy + (r + 18) * Math.sin(angle);
            const anchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) < 0 ? 'end' : 'start';
            let dy = 4; if (Math.sin(angle) < -0.9) dy = -5; else if (Math.sin(angle) > 0.9) dy = 10;
            const diff = hasClass ? (d.value || 0) - (d.classAvg || 0) : null;
            return (
              <g key={i} onClick={() => setSelected(i)} className="cursor-pointer">
                <text x={lx} y={ly + dy} textAnchor={anchor} fontSize={i === selected ? 11 : 10}
                  className={i === selected ? 'fill-[#1A56DB] font-black' : 'fill-neutral-600 font-extrabold'}>
                  {d.metric}
                </text>
                {diff != null && diff !== 0 && (
                  <text x={lx} y={ly + dy + 11} textAnchor={anchor} fontSize="8"
                    className="font-black" fill={diff > 0 ? UP_GREEN : DOWN_RED}>
                    {diff > 0 ? '▲' : '▼'} {Math.abs(Math.round(diff))}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* selected metric detail chip */}
      {sel && (
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            initial={reduce ? false : { opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="flex items-center gap-2.5 bg-neutral-50 border border-black/5 rounded-full px-4 py-2 mb-1"
          >
            <span className="text-[11px] font-black text-neutral-900">{sel.metric}</span>
            <span className="text-[11px] font-extrabold text-[#1A56DB]">You {Math.round(sel.value || 0)}%</span>
            {hasClass && (
              <>
                <span className="text-[11px] font-extrabold text-neutral-400">Class {Math.round(sel.classAvg || 0)}%</span>
                {selDiff !== 0 && (
                  <span className="text-[11px] font-black" style={{ color: selDiff > 0 ? UP_GREEN : DOWN_RED }}>
                    {selDiff > 0 ? '▲' : '▼'} {Math.abs(selDiff)}
                  </span>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* legend */}
      <div className="flex items-center gap-4 text-[10px] font-extrabold text-neutral-400">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#1A56DB]" /> You</span>
        {hasClass && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-neutral-400" /> Class avg{classCount ? ` (${classCount} students)` : ''}
          </span>
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

function StockTrend({ testTimeline, subjects }) {
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
        up: delta >= 0,
      },
    };
  }, [testTimeline, selSubject, subjects]);

  const color = stats?.up ? UP_GREEN : DOWN_RED;

  return (
    <div className="bg-white rounded-[2rem] border border-black/5 shadow-card p-5 md:p-6">
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
              style={{ color, background: tint(color, 0.12) }}
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
        <div className="flex items-center justify-center h-[220px] text-xs font-bold text-neutral-400">No test data for this selection</div>
      ) : (
        <>
          <div className="h-[220px] md:h-[260px] w-full min-w-0 mt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 10, right: 6, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="stockFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dy={8} minTickGap={24} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} dx={-6} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#d4d4d4', strokeDasharray: '3 3' }} />
                <ReferenceLine y={stats.avg} stroke="#a3a3a3" strokeDasharray="4 4" strokeWidth={1}
                  label={{ value: 'AVG', position: 'insideTopRight', fontSize: 8, fontWeight: 900, fill: '#a3a3a3' }} />
                <ReferenceLine y={60} stroke="#fca5a5" strokeDasharray="2 4" strokeWidth={1} />
                <Area
                  type="monotone" dataKey="score" stroke={color} strokeWidth={2.5}
                  fill="url(#stockFill)" animationDuration={1200}
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
                    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={2.5} fill="#fff" stroke={color} strokeWidth={2} />;
                  }}
                  activeDot={{ r: 5, strokeWidth: 0, fill: color }}
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
              { label: 'Change', value: `${stats.delta > 0 ? '+' : ''}${stats.delta}%`, c: color },
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

function ActivityCalendar({ attData, testData, vidData, assignData, subjects, heatmapSubject, setHeatmapSubject, streak }) {
  const reduce = useReducedMotion();
  const [type, setType] = useState('all');
  const [periodIdx, setPeriodIdx] = useState(0); // index into HEATMAP_PERIODS (0 = this month)
  const periodId = HEATMAP_PERIODS[periodIdx].id;

  const maps = useMemo(() => {
    const mk = (arr) => {
      const m = {};
      (arr || []).forEach(d => { m[d.date] = d; });
      return m;
    };
    return { att: mk(attData), test: mk(testData), vid: mk(vidData), assign: mk(assignData) };
  }, [attData, testData, vidData, assignData]);

  const weeks = useMemo(() => buildHeatmapWeeksForMonth(periodId), [periodId]);

  // 0..1 intensity for a day under the active filter
  const intensity = useCallback((day) => {
    const att = maps.att[day], test = maps.test[day], vid = maps.vid[day], assign = maps.assign[day];
    const attV = att && att.total > 0 ? (att.present + (att.late || 0) * 0.5) / att.total : 0;
    const testV = test ? Math.min(1, (test.count || 0) / 2) : 0;
    const vidV = vid ? Math.min(1, (vid.minutes || 0) / 45) : 0;
    const assignV = assign ? Math.min(1, (assign.count || 0) / 2) : 0;
    switch (type) {
      case 'attendance': return att ? Math.max(0.25, attV) : 0;
      case 'tests': return testV;
      case 'videos': return vidV;
      case 'assignments': return assignV;
      default: {
        const parts = [att ? attV : 0, testV, vidV, assignV];
        const active = parts.filter(p => p > 0).length;
        if (active === 0) return 0;
        return Math.min(1, (parts.reduce((a, b) => a + b, 0) / active) * (0.55 + active * 0.15));
      }
    }
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

  const activeType = CAL_TYPES.find(t => t.id === type) || CAL_TYPES[0];
  const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  return (
    <div className="bg-white rounded-[2rem] border border-black/5 shadow-card p-5 md:p-6 space-y-4">
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
            <button onClick={() => setPeriodIdx(i => Math.min(HEATMAP_PERIODS.length - 1, i + 1))}
              disabled={periodIdx >= HEATMAP_PERIODS.length - 1}
              className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-500 hover:bg-white disabled:opacity-30 transition-colors">
              <ChevronLeft size={13} strokeWidth={3} />
            </button>
            <span className="text-[11px] font-extrabold text-neutral-700 w-[72px] text-center">{HEATMAP_PERIODS[periodIdx].label}</span>
            <button onClick={() => setPeriodIdx(i => Math.max(0, i - 1))}
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

      {/* grid */}
      <div className="overflow-x-auto pb-1 scrollbar-hide">
        <div key={`${periodId}-${type}-${heatmapSubject}`} className="flex gap-1.5 min-w-max">
          <div className="flex flex-col gap-1.5 mr-1 text-center">
            {DAY_LABELS.map((d, i) => (
              <div key={i} className="h-6 w-3 flex items-center justify-center text-[9px] text-neutral-400 font-extrabold">{i % 2 === 1 ? d : ''}</div>
            ))}
          </div>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1.5">
              {week.map((day, di) => {
                const inRange = day.startsWith(periodId);
                if (!inRange) return <div key={di} className="w-6 h-6" />;
                const v = intensity(day);
                const idx = wi * 7 + di;
                const cell = (
                  <div
                    title={dayLabel(day)}
                    className="w-6 h-6 rounded-[6px] cursor-default"
                    style={{ background: v > 0 ? tint(activeType.hex, 0.15 + v * 0.85) : '#F3F2F0' }}
                  />
                );
                if (reduce) return <div key={di}>{cell}</div>;
                return (
                  <motion.div
                    key={di}
                    initial={{ opacity: 0, scale: 0.5 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    whileHover={{ scale: 1.25 }}
                    transition={{ delay: Math.min(0.5, idx * 0.008), type: 'spring', stiffness: 300, damping: 20 }}
                  >
                    {cell}
                  </motion.div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

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
        <div className="flex items-center gap-1">
          <span className="text-[9px] font-extrabold text-neutral-400 mr-0.5">Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map(v => (
            <span key={v} className="w-3 h-3 rounded-[3px]" style={{ background: v > 0 ? tint(activeType.hex, 0.15 + v * 0.85) : '#F3F2F0' }} />
          ))}
          <span className="text-[9px] font-extrabold text-neutral-400 ml-0.5">More</span>
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
          const p = PASTEL[DAY_PASTELS[i % DAY_PASTELS.length]] || PASTEL.sky;
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
    <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#872792]/70">
      <span className="flex gap-1">
        {[0, 1, 2].map(i => (
          <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-[#872792]"
            animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }} />
        ))}
      </span>
      Reading your learning patterns...
    </div>
  );
}

function AIMentorCard({ show, onToggle, onRegenerate, suggestions, loading, isStreaming, error }) {
  const reduce = useReducedMotion();
  const [copiedAI, setCopiedAI] = useState(false);
  const sections = useMemo(() => (suggestions ? parseMentorSections(suggestions) : []), [suggestions]);
  const active = isStreaming || loading;

  const copyAI = async () => {
    try {
      await navigator.clipboard.writeText(suggestions);
      setCopiedAI(true);
      setTimeout(() => setCopiedAI(false), 2000);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="relative rounded-[2rem] p-[2px] overflow-hidden">
      {/* conic border sweep while the answer streams in */}
      {active && !reduce ? (
        <motion.div
          className="absolute left-1/2 top-1/2 w-[300%] aspect-square pointer-events-none"
          style={{
            x: '-50%', y: '-50%',
            background: 'conic-gradient(from 0deg, #F1C2F7 0%, #872792 18%, #F1C2F7 32%, #F1C2F7 60%, #AD1A72 78%, #F1C2F7 100%)',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
        />
      ) : (
        <div className="absolute inset-0 bg-[#F1C2F7]" />
      )}

      <div className="relative bg-[#F8E1FB] rounded-[calc(2rem-2px)] p-5 sm:p-6 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[20px] font-black text-[#872792] leading-tight flex items-center gap-2 mb-1">
              {reduce ? <Sparkles size={20} /> : (
                <motion.span animate={{ scale: [1, 1.18, 1], rotate: [0, 8, 0] }} transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex">
                  <Sparkles size={20} />
                </motion.span>
              )}
              AI Mentor Analysis
            </h3>
            <p className="text-[12px] font-bold text-[#872792]/70 leading-snug">Personalized coaching based on your streaks, trends and weak topics.</p>
          </div>
          <motion.button
            onClick={onToggle}
            whileHover={reduce ? undefined : { scale: 1.08 }}
            whileTap={reduce ? undefined : { scale: 0.92 }}
            className="flex-shrink-0 w-10 h-10 bg-white rounded-full flex items-center justify-center text-[#872792] shadow-sm border border-[#F1C2F7]/50"
          >
            {show ? <ChevronUp size={18} strokeWidth={3} /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
          </motion.button>
        </div>

        <AnimatePresence>
          {show && (
            <motion.div
              key="mentor-body"
              initial={reduce ? false : { opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={reduce ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-5 pt-4 border-t border-[#872792]/10">
                {loading && !suggestions ? (
                  <div className="space-y-3">
                    <ThinkingDots />
                    {[80, 95, 60].map((w, i) => (
                      <motion.div key={i} className="h-3 rounded-full bg-[#872792]/10" style={{ width: `${w}%` }}
                        animate={reduce ? undefined : { opacity: [0.4, 0.9, 0.4] }}
                        transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                ) : error ? (
                  <div className="p-3 bg-white/60 rounded-xl text-[12px] font-bold text-red-600 flex items-center gap-2">
                    <AlertTriangle size={14} /> {error}
                  </div>
                ) : suggestions ? (
                  <motion.div layout className="space-y-3">
                    {sections.map((s, i) => {
                      const meta = MENTOR_SECTIONS.find(m => m.title.toLowerCase() === (s.title || '').toLowerCase());
                      const Icon = meta?.icon || Sparkles;
                      const hex = meta?.hex || '#872792';
                      const isLastSection = i === sections.length - 1;
                      const isTimetable = /weekly timetable/i.test(s.title || '');
                      const Body = isTimetable ? TimetableBody : MentorBody;
                      const block = (
                        <div className="bg-white/65 rounded-2xl p-4 border border-white/80">
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
                          layout
                          initial={{ opacity: 0, y: 16, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ type: 'spring', stiffness: 240, damping: 24 }}
                        >
                          {block}
                        </motion.div>
                      );
                    })}
                    {!isStreaming && !loading && (
                      <motion.div
                        className="flex items-center gap-2 pt-1"
                        initial={reduce ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.2 }}
                      >
                        <button onClick={onRegenerate}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-[#872792] text-[11px] font-extrabold shadow-sm border border-[#F1C2F7]/60 hover:bg-[#FDF4FE] transition-colors">
                          <RefreshCw size={12} /> Regenerate
                        </button>
                        <button onClick={copyAI}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white text-[#872792] text-[11px] font-extrabold shadow-sm border border-[#F1C2F7]/60 hover:bg-[#FDF4FE] transition-colors">
                          {copiedAI ? <CheckCircle2 size={12} className="text-emerald-600" /> : <Copy size={12} />}
                          {copiedAI ? 'Copied' : 'Copy'}
                        </button>
                      </motion.div>
                    )}
                  </motion.div>
                ) : (
                  <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#872792]">
                    <CheckCircle2 size={16} /> Looking sharp! Keep up the good work.
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
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

export default function StudentReportCard({ data, period, onPeriodChange, showHeader = true, onDownloadPDF }) {
  const reduce = useReducedMotion();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState('');
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState('');
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
  const grade = gradeBand(student.avg_score);
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

  // ── AI mentor: stream a fresh analysis (richer payload than before) ──────────
  const runAnalysis = useCallback(async () => {
    setSuggestionsLoading(true); setSuggestionsError(''); setSuggestions('');
    const subjectBreakdown = subjectRadar.map(s => `${s.subject}: test ${Math.round(s.test_avg || 0)}%, attendance ${Math.round(s.attendance_pct || 0)}%, videos ${s.video_done || 0}/${s.video_total || 0}`).join(' | ') || 'No subject data';
    const recentTests = testTimeline.slice(-5).map(t => `${t.test_title} (${t.subject || ''}) ${Math.round(t.score_pct || 0)}%${t.date ? ` on ${t.date}` : ''}`).join('; ') || 'No recent tests';
    const weakTopicsDetail = weakestTopics.slice(0, 5).map(t => `${t.topic} — ${Math.round(t.score || 0)}% — ${t.videoStatus}`).join('; ') || 'None';
    const stats = {
      student_name: student.name || 'Student',
      standard_name: student.standard_name || 'N/A',
      period: period || 'overall',
      standing_data: `Grade ${grade.grade} (${grade.label})${rank ? `, rank ${rank}/${totalStudents}` : ''}${percentile != null ? ` (top ${percentile}%)` : ''}, test coverage ${insights.coverage != null ? `${insights.coverage}%` : 'unknown'}, live class attendance ${Math.round(liveStats.attendance_pct || 0)}%`,
      streak_data: `Current study streak ${insights.streak.current} day(s), best ever ${insights.streak.best} day(s)`,
      trend_data: `${insights.improvement != null ? `Score trend ${insights.improvement > 0 ? '+' : ''}${insights.improvement}% (recent tests vs earlier ones)` : 'Not enough tests for a trend yet'}${insights.consistency ? `; consistency is ${insights.consistency.label} (±${insights.consistency.sd}%)` : ''}`,
      best_subject: insights.bestSub ? `${insights.bestSub.subject} (${Math.round(insights.bestSub.test_avg)}% avg)` : 'N/A',
      weakest_subject: insights.worstSub ? `${insights.worstSub.subject} (${Math.round(insights.worstSub.test_avg)}% avg)` : 'N/A',
      attendance_data: `Attendance is ${Math.round(student.attendance_pct || 0)}%`,
      video_progress_data: `Video completion is ${videoPct}% (${doneVids}/${totalVids} videos)`,
      assignment_data: `Assignment average is ${assignStats.avg_marks_pct}% (submitted ${assignStats.submitted}/${assignStats.total})`,
      test_data: `Test average is ${Math.round(student.avg_score || 0)}%, attempted ${testsAttempted}, missed ${testsMissed}`,
      subject_breakdown: subjectBreakdown,
      recent_tests: recentTests,
      weak_topics_detail: weakTopicsDetail,
    };
    try {
      let acc = '';
      await aiApi.generateInsightsStream(student.id, stats, (chunk) => { acc += chunk; setSuggestionsLoading(false); setIsStreaming(true); setSuggestions(acc); });
      setSuggestions(acc);
    } catch (e) { setSuggestionsError(e.message || 'Failed to generate insights.'); } finally { setSuggestionsLoading(false); setIsStreaming(false); }
  }, [student, period, grade, rank, totalStudents, percentile, insights, liveStats, videoPct, doneVids, totalVids, subjectRadar, testTimeline, weakestTopics, testsAttempted, testsMissed, assignStats]);

  const handleAnalyzePerformance = useCallback(() => {
    if (showSuggestions) { setShowSuggestions(false); return; }
    setShowSuggestions(true);
    if (!suggestions) runAnalysis();
  }, [showSuggestions, suggestions, runAnalysis]);

  // ── PDF export (carried over, enriched) ───────────────────────────────────────
  const handleDownloadPDF = useCallback(async () => {
    if (!data) return;
    if (onDownloadPDF) { onDownloadPDF(data); return; }
    try {
      const jsPDFModule = await import('jspdf');
      await import('jspdf-autotable');
      const JsPDFConstructor = jsPDFModule.default || jsPDFModule.jsPDF;
      const doc = new JsPDFConstructor();
      const s = student || {};
      const pText = period ? (period.charAt(0).toUpperCase() + period.slice(1)) : 'Overall';

      doc.setFontSize(20); doc.text('Student Report Card', 14, 20); doc.setFontSize(12);
      doc.text(`Name: ${s.name || 'Unknown'}  |  Grade: ${grade.grade} (${grade.label})`, 14, 30);
      doc.text(`Period: ${pText}  |  Avg Score: ${Math.round(s.avg_score || 0)}%  |  Attendance: ${Math.round(s.attendance_pct || 0)}%  |  Rank: ${rank ? `${rank}/${totalStudents}` : 'N/A'}`, 14, 38);
      doc.text(`Streak: ${insights.streak.current} days  |  Tests Taken: ${testsAttempted}  |  Videos: ${videoPct}%  |  Live Classes: ${liveStats.attendance_pct}%`, 14, 46);

      if (subjectRadar && subjectRadar.length > 0) {
        doc.setFontSize(14); doc.text('Subject Performance', 14, 58);
        doc.autoTable({
          startY: 62,
          head: [['Subject', 'Avg Score', 'Videos Done', 'Attendance', 'Assignments']],
          body: subjectRadar.map(r => [
            r.subject,
            r.test_count > 0 ? `${Math.round(r.test_avg || 0)}%` : '—',
            r.video_total > 0 ? `${r.video_done}/${r.video_total}` : '—',
            r.att_total > 0 ? `${Math.round(r.attendance_pct || 0)}%` : '—',
            r.assignment_total > 0 ? `${r.assignment_submitted}/${r.assignment_total}` : '—',
          ]),
          theme: 'striped',
          headStyles: { fillColor: [99, 102, 241] },
        });
      }
      doc.save(`${(s.name || 'Student').replace(/\s+/g, '_')}_Report_${pText}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF', e);
      alert('Failed to generate PDF. Please ensure you have a stable connection.');
    }
  }, [data, period, rank, totalStudents, subjectRadar, student, onDownloadPDF, grade, insights, testsAttempted, videoPct, liveStats]);

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
    { label: 'Points', value: student.points || 0, suffix: '', pastel: 'pink', icon: Trophy, ring: null },
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
        <div className={`${showHeader ? 'bg-white shadow-[0_8px_40px_rgb(0,0,0,0.06)] lg:rounded-[3rem] border border-black/5 overflow-hidden' : ''}`}>

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
                  <button onClick={handleDownloadPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 text-[13px] font-extrabold bg-white hover:bg-neutral-100 text-[#0f1014] rounded-full shadow-sm transition-all">
                    <Download size={15} /> Export PDF
                  </button>
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
                  const p = PASTEL[t.pastel] || PASTEL.sky;
                  const Icon = t.icon;
                  return (
                    <motion.div
                      key={t.label}
                      variants={reduce ? undefined : fadeUp}
                      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                      transition={springCard}
                      className="rounded-[1.75rem] p-4 flex items-center gap-3 shadow-card border border-black/5"
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
                    const p = PASTEL[c.pastel] || PASTEL.sky;
                    const Icon = c.icon;
                    const chip = (
                      <div className="flex-shrink-0 flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5 border border-black/5 shadow-sm bg-white">
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

            {/* ── 3. MAIN GRID ── */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 md:gap-8">
              <div className="xl:col-span-8 space-y-5 md:space-y-8 min-w-0">
                <Section><StockTrend testTimeline={testTimeline} subjects={subjects} /></Section>
                <Section>
                  <ActivityCalendar
                    attData={attData} testData={testData} vidData={vidData} assignData={assignHeatmapRaw}
                    subjects={subjects} heatmapSubject={heatmapSubject} setHeatmapSubject={setHeatmapSubject}
                    streak={insights.streak}
                  />
                </Section>

                {/* AI mentor */}
                <Section>
                  <AIMentorCard
                    show={showSuggestions}
                    onToggle={handleAnalyzePerformance}
                    onRegenerate={runAnalysis}
                    suggestions={suggestions}
                    loading={suggestionsLoading}
                    isStreaming={isStreaming}
                    error={suggestionsError}
                  />
                </Section>
              </div>

              {/* SIDEBAR */}
              <div className="xl:col-span-4 space-y-5 md:space-y-8 min-w-0">
                <Section>
                  <div className="bg-white rounded-[2rem] border border-black/5 shadow-card p-5 md:p-6 flex flex-col items-center text-center">
                    <h4 className="text-[16px] font-black text-neutral-900 mb-0.5">Skill Radar</h4>
                    <p className="text-[10px] font-bold text-neutral-400 mb-2 uppercase tracking-widest">
                      {classAvgs ? 'You vs Class Avg · tap a skill' : 'Your skill profile · tap a skill'}
                    </p>
                    <SkillRadar data={radarData} hasClass={!!classAvgs} classCount={classAvgs?.students_counted} />
                  </div>
                </Section>

                {/* FOCUS AREAS */}
                <Section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600"><Target size={14} strokeWidth={2.5} /></div>
                    <h3 className="text-[17px] font-black text-neutral-900 tracking-tight">Focus Areas</h3>
                  </div>
                  {weakestTopics.length === 0 ? (
                    <div className="bg-white rounded-[2rem] border border-black/5 p-6 text-center text-neutral-400 text-sm font-bold shadow-sm">No weak topics identified yet. Great job!</div>
                  ) : (
                    <div className="space-y-3">
                      {weakestTopics.slice(0, 5).map((topic, i) => {
                        const theme = CARD_COLORS[i % CARD_COLORS.length];
                        const card = (
                          <div className={`${theme.bg} rounded-[1.5rem] p-4 shadow-sm hover:shadow-md transition-shadow border border-black/5 flex flex-col gap-2`}>
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
                    <div className="bg-white rounded-[2rem] border border-black/5 shadow-card p-5 space-y-4">
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

                      {gradedAssignments.length > 0 && (
                        <div className="pt-3 border-t border-black/5">
                          <p className="text-[9px] font-black text-neutral-400 uppercase tracking-widest mb-3">Scores</p>
                          <ResponsiveContainer width="100%" height={120}>
                            <BarChart data={gradedAssignments} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                              <XAxis dataKey="assignment_title" tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} tickFormatter={t => t.length > 8 ? t.slice(0, 8) + '…' : t} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#9ca3af', fontWeight: 700 }} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ borderRadius: 10, border: 'none', boxShadow: '0 8px 30px rgba(0,0,0,0.08)', fontSize: 10, fontWeight: 'bold' }} cursor={{ fill: '#f3f4f6' }} />
                              <Bar dataKey="marks_obtained" radius={[3, 3, 0, 0]} animationDuration={1100}>
                                {gradedAssignments.map((e, idx) => <Cell key={idx} fill={e.marks_obtained >= 60 ? '#1A56DB' : '#ef4444'} />)}
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {subjectRadar.map((r, i) => {
                    const p = PASTEL[pastelFor(r.subject)] || PASTEL.sky;
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
                      <div className="bg-white rounded-[2rem] border border-black/5 shadow-card p-5">
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
