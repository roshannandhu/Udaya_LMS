import React, { useState, useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Sparkles, CheckCircle2, AlertTriangle, Lightbulb, Target,
  CalendarDays, Heart, BookOpen, Zap, Play, ClipboardList, FileText, Coffee,
} from 'lucide-react';

// ── Section registry ───────────────────────────────────────────────────────────
const SECTIONS = {
  performancesummary: {
    title: 'Performance Summary',
    short: 'Summary',
    icon: Sparkles,
    tone: 'indigo',
    kind: 'summary',
  },
  whatsgoingwell: {
    title: "What's Going Well",
    short: 'Wins',
    icon: CheckCircle2,
    tone: 'emerald',
    kind: 'list',
  },
  whatneedsattention: {
    title: 'What Needs Attention',
    short: 'Focus',
    icon: AlertTriangle,
    tone: 'amber',
    kind: 'list',
  },
  solutionsstudyideas: {
    title: 'Solutions & Study Ideas',
    short: 'Ideas',
    icon: Lightbulb,
    tone: 'violet',
    kind: 'numbered',
  },
  goals: {
    title: 'Goals',
    short: 'Goals',
    icon: Target,
    tone: 'blue',
    kind: 'goals',
  },
  weeklytimetable: {
    title: 'Weekly Timetable',
    short: 'Week',
    icon: CalendarDays,
    tone: 'cyan',
    kind: 'timetable',
  },
  mentormessage: {
    title: 'Mentor Message',
    short: 'Message',
    icon: Heart,
    tone: 'rose',
    kind: 'quote',
  },
};

const TONES = {
  indigo:  { badge: 'bg-indigo-100 text-indigo-700',   accent: 'text-indigo-700',  soft: 'bg-indigo-50/70 border-indigo-100',  header: 'bg-indigo-50 border-indigo-100' },
  emerald: { badge: 'bg-emerald-100 text-emerald-700', accent: 'text-emerald-700', soft: 'bg-emerald-50/70 border-emerald-100', header: 'bg-emerald-50 border-emerald-100' },
  amber:   { badge: 'bg-amber-100 text-amber-700',     accent: 'text-amber-700',   soft: 'bg-amber-50/70 border-amber-100',     header: 'bg-amber-50 border-amber-100' },
  violet:  { badge: 'bg-violet-100 text-violet-700',   accent: 'text-violet-700',  soft: 'bg-violet-50/70 border-violet-100',   header: 'bg-violet-50 border-violet-100' },
  blue:    { badge: 'bg-blue-100 text-blue-700',       accent: 'text-blue-700',    soft: 'bg-blue-50/70 border-blue-100',       header: 'bg-blue-50 border-blue-100' },
  cyan:    { badge: 'bg-cyan-100 text-cyan-700',       accent: 'text-cyan-700',    soft: 'bg-cyan-50/70 border-cyan-100',       header: 'bg-cyan-50 border-cyan-100' },
  rose:    { badge: 'bg-rose-100 text-rose-700',       accent: 'text-rose-700',    soft: 'bg-rose-50/70 border-rose-100',       header: 'bg-rose-50 border-rose-100' },
  slate:   { badge: 'bg-slate-100 text-slate-600',     accent: 'text-slate-700',   soft: 'bg-slate-50 border-slate-100',        header: 'bg-slate-50 border-slate-100' },
};

const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');

// ── Markdown parsing ───────────────────────────────────────────────────────────
function matchHeading(line) {
  const hashed = line.match(/^#{1,6}\s+(.+?)\s*$/);
  if (hashed) return hashed[1].replace(/:$/, '').trim();
  const bolded = line.match(/^\*\*(.+?)\*\*:?\s*$/);
  if (bolded && SECTIONS[normalize(bolded[1])]) return bolded[1].replace(/:$/, '').trim();
  return null;
}

export function parseMentorReport(markdown) {
  const sections = [];
  let current = null;
  const pushCurrent = () => {
    if (current && current.lines.some((l) => l.trim())) sections.push(current);
  };
  for (const raw of String(markdown || '').split('\n')) {
    const line = raw.trimEnd();
    const headingTitle = line.trim() ? matchHeading(line.trim()) : null;
    if (headingTitle) {
      pushCurrent();
      const cfg = SECTIONS[normalize(headingTitle)];
      current = {
        key: cfg ? normalize(headingTitle) : `other-${sections.length}`,
        title: cfg ? cfg.title : headingTitle,
        short: cfg ? cfg.short : headingTitle.split(' ')[0],
        icon: cfg ? cfg.icon : BookOpen,
        tone: cfg ? cfg.tone : 'slate',
        kind: cfg ? cfg.kind : 'summary',
        lines: [],
      };
    } else {
      if (!current) {
        current = { key: 'intro', title: null, short: null, icon: Sparkles, tone: 'indigo', kind: 'summary', lines: [] };
      }
      current.lines.push(line);
    }
  }
  pushCurrent();
  return sections;
}

// One-line takeaway from a full mentor analysis
export function extractMentorHeadline(markdown) {
  const sections = parseMentorReport(markdown);
  const src =
    sections.find((s) => s.key === 'performancesummary') ||
    sections.find((s) => s.key === 'whatneedsattention') ||
    sections.find((s) => s.key === 'solutionsstudyideas');
  if (!src) return null;
  const first = sectionItems(src.lines)[0];
  if (!first) return null;
  const plain = first.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\s+/g, ' ').trim();
  const sentences = (plain.match(/[^.!?]+[.!?]*/g) || [plain]).map((s) => s.trim()).filter(Boolean);
  let out = '';
  for (const s of sentences) {
    if (!out) out = s;
    else if ((out + ' ' + s).length <= 150) out += ' ' + s;
    else break;
  }
  if (out.length > 170) out = out.slice(0, 167).trimEnd() + '…';
  return out || null;
}

function stripMarker(line) {
  const m = line.match(/^\s*(?:[-*•]\s+|(\d+)[.)]\s+)(.*)$/);
  if (m) return { text: m[2], num: m[1] || null };
  return { text: line.trim(), num: null };
}

function sectionItems(lines) {
  const items = [];
  for (const raw of lines) {
    if (!raw.trim()) continue;
    const isBullet = /^\s*(?:[-*•]|\d+[.)])\s+/.test(raw);
    const { text } = stripMarker(raw);
    if (isBullet || items.length === 0) items.push(text);
    else items[items.length - 1] += ' ' + text;
  }
  return items;
}

// ── Inline markdown ───────────────────────────────────────────────────────────
function renderInline(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|"([^"\n]{2,80})"/g;
  let last = 0;
  let m;
  let k = 0;
  const pushPlain = (chunk) => {
    const numRe = /(\d+(?:\.\d+)?%|#\d+)/g;
    let pLast = 0;
    let pm;
    while ((pm = numRe.exec(chunk)) !== null) {
      if (pm.index > pLast) out.push(<React.Fragment key={`p${k++}`}>{chunk.slice(pLast, pm.index)}</React.Fragment>);
      out.push(<span key={`n${k++}`} className="font-extrabold text-slate-900 tabular-nums">{pm[0]}</span>);
      pLast = pm.index + pm[0].length;
    }
    if (pLast < chunk.length) out.push(<React.Fragment key={`p${k++}`}>{chunk.slice(pLast)}</React.Fragment>);
  };
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) pushPlain(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`b${k++}`} className="font-extrabold text-slate-900">{m[1]}</strong>);
    } else {
      out.push(
        <span key={`q${k++}`} className="font-bold text-slate-800 bg-slate-100 rounded-md px-1 py-px">
          "{m[2]}"
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) pushPlain(text.slice(last));
  return out;
}

// ── Section body renderers ─────────────────────────────────────────────────────
function SummaryBody({ lines }) {
  const paras = sectionItems(lines);
  return (
    <div className="space-y-2.5">
      {paras.map((p, i) => (
        <p key={i} className="text-[14px] md:text-[15px] font-semibold text-slate-700 leading-relaxed">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function ListBody({ lines, tone, icon: ItemIcon }) {
  const t = TONES[tone] || TONES.slate;
  const items = sectionItems(lines);
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${t.soft}`}>
          <ItemIcon size={16} className={`${t.accent} mt-0.5 flex-shrink-0`} />
          <span className="text-[13px] md:text-[14px] font-semibold text-slate-700 leading-relaxed">
            {renderInline(item)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function NumberedBody({ lines, tone }) {
  const t = TONES[tone] || TONES.slate;
  const items = sectionItems(lines);
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 ${t.soft}`}>
          <span className={`w-6 h-6 rounded-full ${t.badge} flex items-center justify-center text-[11px] font-black flex-shrink-0 mt-0.5`}>
            {i + 1}
          </span>
          <span className="text-[13px] md:text-[14px] font-semibold text-slate-700 leading-relaxed">
            {renderInline(item)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function parseGoal(item) {
  const percents = [...item.matchAll(/(\d+(?:\.\d+)?)\s*%/g)];
  const target = percents.length ? percents[percents.length - 1][1] : null;
  const dl = item.match(/\bby\s+((?:\d{1,2}\s)?[A-Z][a-z]{2,8}(?:\s\d{1,2})?(?:\s\d{4})?|[A-Z][a-z]+day)/);
  return { target, deadline: dl ? dl[1] : null };
}

function GoalsBody({ lines }) {
  const items = sectionItems(lines);
  return (
    <ul className="space-y-2">
      {items.map((item, i) => {
        const { target, deadline } = parseGoal(item);
        return (
          <li key={i} className="flex items-stretch gap-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2.5">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <span className="flex items-start gap-2.5">
                <span className="w-[18px] h-[18px] rounded-full border-2 border-blue-400 bg-white flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span className="text-[13px] md:text-[14px] font-semibold text-slate-700 leading-relaxed">
                  {renderInline(item)}
                </span>
              </span>
              {deadline && (
                <span className="self-start inline-flex items-center gap-1 ml-[28px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-black uppercase tracking-wide">
                  <CalendarDays size={10} /> by {deadline}
                </span>
              )}
            </div>
            {target && (
              <div className="flex flex-col items-center justify-center flex-shrink-0 pl-3 border-l border-blue-100 min-w-[64px]">
                <span className="text-xl md:text-2xl font-black text-blue-700 tabular-nums leading-none">{target}%</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-blue-400 mt-1">Target</span>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function planIcon(plan) {
  const p = plan.toLowerCase();
  if (/\btest\b|\bexam\b|\bquiz\b/.test(p)) return ClipboardList;
  if (/\bwatch\b|\bvideo\b/.test(p)) return Play;
  if (/\bassignment\b|\bsubmit\b|\bhomework\b/.test(p)) return FileText;
  if (/\brest\b|catch[- ]up|light day/.test(p)) return Coffee;
  if (/\breview\b|\brevise\b|\brecall\b/.test(p)) return BookOpen;
  return Sparkles;
}

function isToday(dayLabel) {
  const now = new Date();
  const dd = String(now.getDate());
  const mon = now.toLocaleString('en', { month: 'short' });
  const wd = now.toLocaleString('en', { weekday: 'short' });
  const hasDate = new RegExp(`\\b${dd}\\b`).test(dayLabel) && dayLabel.toLowerCase().includes(mon.toLowerCase());
  const hasWeekday = dayLabel.toLowerCase().startsWith(wd.toLowerCase());
  return hasDate || (hasWeekday && !/\d/.test(dayLabel));
}

function TimetableBody({ lines }) {
  const rows = [];
  const extras = [];
  for (const item of sectionItems(lines)) {
    const m = item.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/) || item.match(/^([A-Z][a-z]{2}(?:day)?\s?\d{0,2}\s?[A-Za-z]{0,4}\d{0,4}):\s+(.*)$/);
    if (m && m[2]) rows.push({ day: m[1].replace(/:$/, ''), plan: m[2] });
    else extras.push(item);
  }
  if (rows.length === 0) return <ListBody lines={lines} tone="cyan" icon={CalendarDays} />;
  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-cyan-100">
        {rows.map((r, i) => {
          const Icon = planIcon(r.plan);
          const today = isToday(r.day);
          return (
            <div
              key={i}
              className={`flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-3 px-3 py-2.5 ${
                today ? 'bg-cyan-100/70 ring-1 ring-inset ring-cyan-300' : i % 2 === 0 ? 'bg-cyan-50/60' : 'bg-white'
              } ${i > 0 ? 'border-t border-cyan-100/70' : ''}`}
            >
              <span className="flex items-center gap-1.5 flex-shrink-0 sm:min-w-[118px]">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-black whitespace-nowrap ${today ? 'bg-cyan-600 text-white' : 'bg-cyan-100 text-cyan-800'}`}>
                  {r.day}
                </span>
                {today && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-cyan-700">Today</span>
                )}
              </span>
              <span className="flex items-start gap-2 min-w-0">
                <span className="w-6 h-6 rounded-lg bg-white border border-cyan-100 text-cyan-600 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={13} />
                </span>
                <span className="text-[13px] md:text-[14px] font-semibold text-slate-700 leading-relaxed pt-0.5">
                  {renderInline(r.plan)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {extras.map((p, i) => (
        <p key={i} className="text-[12px] font-semibold text-slate-500 leading-relaxed px-1">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

function QuoteBody({ lines }) {
  const paras = sectionItems(lines);
  return (
    <div className="rounded-xl bg-gradient-to-br from-rose-50 to-orange-50 border border-rose-100 px-4 py-3.5">
      {paras.map((p, i) => (
        <p key={i} className="text-[14px] font-bold text-slate-800 leading-relaxed">
          {renderInline(p)}
        </p>
      ))}
    </div>
  );
}

const BODY = {
  summary: SummaryBody,
  quote: QuoteBody,
  numbered: NumberedBody,
  goals: GoalsBody,
  timetable: TimetableBody,
};

// ── Writing indicator — gradient dots ─────────────────────────────────────────
function WritingIndicator() {
  return (
    <div className="flex items-center gap-3 py-3 px-1" aria-live="polite">
      <span className="flex gap-1.5" aria-hidden="true">
        {[0, 160, 320].map((d) => (
          <span
            key={d}
            className="w-2 h-2 rounded-full animate-bounce"
            style={{
              animationDelay: `${d}ms`,
              background: 'linear-gradient(135deg, #14B8A6, #635BFF)',
            }}
          />
        ))}
      </span>
      <span className="text-[11px] font-black uppercase tracking-widest"
        style={{ background: 'linear-gradient(90deg,#14B8A6,#635BFF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        Mentor is writing…
      </span>
    </div>
  );
}

// ── "Do this first" hero card ─────────────────────────────────────────────────
function FocusFirstCard({ text }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="rounded-2xl p-[1.5px] bg-gradient-to-r from-[#14B8A6] via-[#22C7C9] to-[#635BFF]"
    >
      <div className="rounded-[14.5px] bg-white px-4 py-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="w-7 h-7 rounded-xl bg-gradient-to-br from-teal-400 to-indigo-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Zap size={14} />
          </span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-600">Do this first</span>
        </div>
        <p className="text-[14px] md:text-[15px] font-bold text-slate-800 leading-relaxed">
          {renderInline(text)}
        </p>
      </div>
    </motion.div>
  );
}

// ── Main view ──────────────────────────────────────────────────────────────────
export default function MentorReportView({ report, streaming = false }) {
  const [activeNav, setActiveNav] = useState(null);
  const reduce = useReducedMotion();
  const sections = parseMentorReport(report);
  const navItems = sections.filter((s) => s.title && s.short);

  // Track which section is visible as the user scrolls
  useEffect(() => {
    if (!navItems.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveNav(visible[0].target.id.replace('mentor-sec-', ''));
        }
      },
      { threshold: 0.25, rootMargin: '-54px 0px -50% 0px' }
    );
    navItems.forEach((s) => {
      const el = document.getElementById(`mentor-sec-${s.key}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItems.map((s) => s.key).join(',')]);

  if (sections.length === 0) {
    return (
      <div className="px-5 md:px-7 py-5">
        <div className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{report}</div>
        {streaming && <WritingIndicator />}
      </div>
    );
  }

  const ideas     = sections.find((s) => s.key === 'solutionsstudyideas');
  const attention = sections.find((s) => s.key === 'whatneedsattention');
  const focusFirst = sectionItems((ideas || attention || {}).lines || [])[0] || null;
  const hasSummary = sections.some((s) => s.key === 'performancesummary');

  const jumpTo = (key) => {
    setActiveNav(key);
    const el = document.getElementById(`mentor-sec-${key}`);
    if (el) el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="flex flex-col">
      {/* ── Sticky quick-jump nav ──────────────────────────────────────────────
          z-[60] beats any Framer Motion transform stacking context.
          bg-white (fully opaque) prevents content bleed-through.
          No negative-margin hacks — MentorReportView owns its padding.          */}
      {navItems.length > 2 && (
        <div className="sticky top-0 z-[60] bg-white border-b border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.06)]">
          <div
            className="flex gap-1.5 overflow-x-auto px-5 md:px-7 py-2.5"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {navItems.map((s) => {
              const t = TONES[s.tone] || TONES.slate;
              const Icon = s.icon;
              const isActive = activeNav === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => jumpTo(s.key)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-black transition-all duration-200 ${
                    isActive
                      ? `${t.badge} shadow-sm scale-[1.04]`
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  <Icon size={11} />
                  {s.short}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Sections ──────────────────────────────────────────────────────────── */}
      <div className="px-5 md:px-7 pt-4 pb-6 space-y-4">
        {!hasSummary && focusFirst && !streaming && <FocusFirstCard text={focusFirst} />}

        {sections.map((s, idx) => {
          const t = TONES[s.tone] || TONES.slate;
          const Icon = s.icon;
          const Body = BODY[s.kind];
          const isActive = activeNav === s.key;

          return (
            <motion.div
              key={s.key}
              id={`mentor-sec-${s.key}`}
              initial={reduce ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : Math.min(idx * 0.07, 0.5), ease: 'easeOut' }}
              style={{ scrollMarginTop: '60px' }}
              className={`rounded-2xl overflow-hidden border transition-shadow duration-300 bg-white ${
                isActive ? 'border-slate-200 shadow-[0_4px_16px_rgba(0,0,0,0.09)]' : 'border-slate-100 shadow-sm'
              }`}
            >
              {/* Card header */}
              {s.title && (
                <div className={`flex items-center gap-3 px-4 pt-3.5 pb-3 border-b ${t.header}`}>
                  <span className={`w-7 h-7 rounded-lg ${t.badge} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={15} />
                  </span>
                  <h3 className="text-[12px] font-black uppercase tracking-widest text-slate-900 flex-1 leading-none">
                    {s.title}
                  </h3>
                </div>
              )}

              {/* Card body */}
              <div className="px-4 py-3.5">
                {Body
                  ? <Body lines={s.lines} tone={s.tone} icon={Icon} />
                  : <ListBody lines={s.lines} tone={s.tone} icon={s.tone === 'amber' ? AlertTriangle : CheckCircle2} />
                }
                {/* Best action card injected right after the summary */}
                {s.key === 'performancesummary' && focusFirst && !streaming && (
                  <div className="mt-3">
                    <FocusFirstCard text={focusFirst} />
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}

        {streaming && <WritingIndicator />}
      </div>
    </div>
  );
}
