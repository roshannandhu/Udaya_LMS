import React, { useState, useRef, useEffect } from 'react';

const VW = 280, VH = 170;
const PAD = { l: 26, r: 10, t: 8, b: 20 };
const CW = VW - PAD.l - PAD.r;
const CH = VH - PAD.t - PAD.b;

function toX(pct) { return PAD.l + (pct / 100) * CW; }
function toY(pct) { return PAD.t + CH - (pct / 100) * CH; }

function dotColor(s) {
  if (s.x >= 75 && s.y >= 40) return '#10B981'; // stars
  if (s.x >= 75)               return '#F97316'; // needs coaching
  if (s.y >= 40)               return '#EAB308'; // irregular attendance
  return '#EF4444';                              // at risk
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase() || '?';
}

const QUADS = [
  { x1: 0,  x2: 75,  y1: 0,  y2: 40,  fill: '#FEE2E2' },
  { x1: 75, x2: 100, y1: 0,  y2: 40,  fill: '#FFEDD5' },
  { x1: 0,  x2: 75,  y1: 40, y2: 100, fill: '#FEF9C3' },
  { x1: 75, x2: 100, y1: 40, y2: 100, fill: '#D1FAE5' },
];

const QUAD_LABELS = [
  { x: 37.5, y: 20,  label: 'At Risk',   color: '#EF4444' },
  { x: 87.5, y: 20,  label: 'Support',   color: '#F97316' },
  { x: 37.5, y: 70,  label: 'Irregular', color: '#CA8A04' },
  { x: 87.5, y: 70,  label: 'Stars',     color: '#059669' },
];

const Y_TICKS = [0, 40, 75, 100];
const X_TICKS = [0, 25, 50, 75, 100];

export default function QuadrantScatter({ students = [], onSelect, compact = false }) {
  const [hovered, setHovered] = useState(null);
  const [tipPos, setTipPos]   = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const hideTimer    = useRef(null);

  const trackPos = (e, s) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const src = e.touches ? e.touches[0] : e;
    setTipPos({ x: src.clientX - rect.left, y: src.clientY - rect.top });
    setHovered(s);
  };

  const hide = () => setHovered(null);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const handleTouchStart = (e, s) => {
    e.stopPropagation();
    clearTimeout(hideTimer.current);
    trackPos(e, s);
    hideTimer.current = setTimeout(hide, 1500);
  };

  if (!students.length) {
    return (
      <div className="h-full flex items-center justify-center text-neutral-400 text-sm">
        Not enough data yet
      </div>
    );
  }

  const containerWidth = containerRef.current?.offsetWidth ?? 300;

  return (
    <div ref={containerRef} className="relative w-full h-full flex flex-col">
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        className="w-full flex-1"
        style={{ display: 'block', minHeight: 0 }}
      >
        {/* Quadrant backgrounds */}
        {QUADS.map((q, i) => (
          <rect key={i}
            x={toX(q.x1)} y={toY(q.y2)}
            width={toX(q.x2) - toX(q.x1)}
            height={toY(q.y1) - toY(q.y2)}
            fill={q.fill} fillOpacity={0.55}
          />
        ))}

        {/* Reference lines */}
        <line x1={toX(75)} y1={PAD.t} x2={toX(75)} y2={PAD.t + CH}
          stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />
        <line x1={PAD.l} y1={toY(40)} x2={PAD.l + CW} y2={toY(40)}
          stroke="#94a3b8" strokeDasharray="3 3" strokeWidth={1} />

        {/* Quadrant zone labels */}
        {QUAD_LABELS.map(({ x, y, label, color }) => (
          <text key={label}
            x={toX(x)} y={toY(y)}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={7} fill={color} fontWeight="700" fillOpacity={0.65}
          >
            {label}
          </text>
        ))}

        {/* Y axis ticks + labels */}
        {Y_TICKS.map(v => (
          <text key={v}
            x={PAD.l - 3} y={toY(v)}
            textAnchor="end" dominantBaseline="middle"
            fontSize={7} fill="#9ca3af"
          >{v}</text>
        ))}

        {/* X axis ticks + labels */}
        {X_TICKS.map(v => (
          <text key={v}
            x={toX(v)} y={PAD.t + CH + 11}
            textAnchor="middle"
            fontSize={7} fill="#9ca3af"
          >{v}</text>
        ))}

        {/* Axis titles */}
        <text x={PAD.l + CW / 2} y={VH - 1}
          textAnchor="middle" fontSize={7} fill="#6b7280">Attendance %</text>
        <text
          x={7} y={PAD.t + CH / 2}
          textAnchor="middle" fontSize={7} fill="#6b7280"
          transform={`rotate(-90, 7, ${PAD.t + CH / 2})`}
        >Score %</text>

        {/* Student dots */}
        {students.map((s) => {
          const cx = toX(s.x);
          const cy = toY(s.y);
          const isHovered = hovered?.id === s.id;
          return (
            <g key={s.id}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelect?.(s.id)}
              onMouseEnter={(e) => trackPos(e, s)}
              onMouseMove={(e) => trackPos(e, s)}
              onMouseLeave={hide}
              onTouchStart={(e) => handleTouchStart(e, s)}
            >
              {/* Halo on hover */}
              {isHovered && (
                <circle cx={cx} cy={cy} r={13}
                  fill={dotColor(s)} fillOpacity={0.2} />
              )}
              <circle
                cx={cx} cy={cy} r={9}
                fill={dotColor(s)}
                stroke="white" strokeWidth={isHovered ? 2.5 : 1.5}
                fillOpacity={isHovered ? 1 : 0.88}
              />
              <text
                x={cx} y={cy}
                textAnchor="middle" dominantBaseline="middle"
                fontSize={6} fill="white" fontWeight="700"
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {initials(s.name)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip — absolute HTML div, never inside SVG */}
      {hovered && (
        <div
          className="absolute z-30 pointer-events-none bg-white rounded-xl shadow-xl border border-neutral-100 px-3 py-2 text-xs"
          style={{
            left:  Math.min(tipPos.x + 14, containerWidth - 140),
            top:   Math.max(tipPos.y - 68, 0),
            minWidth: 128,
          }}
        >
          <p className="font-bold text-neutral-900 truncate mb-0.5">{hovered.name}</p>
          <p className="text-neutral-500">Score <b className="text-neutral-800">{hovered.y}%</b></p>
          <p className="text-neutral-500">Attendance <b className="text-neutral-800">{hovered.x}%</b></p>
          {hovered.risk && <p className="text-red-500 font-semibold mt-1">⚠ At risk</p>}
          <p className="text-neutral-400 mt-1">Tap to open report</p>
        </div>
      )}

      {/* Legend — hidden in compact mode */}
      {!compact && (
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-1 text-[10px] font-medium text-neutral-500 flex-shrink-0">
          {[
            { c: '#10B981', l: 'Stars (high score + attendance)' },
            { c: '#F97316', l: 'Needs coaching (low score)' },
            { c: '#EAB308', l: 'Irregular attendance' },
            { c: '#EF4444', l: 'At risk (both low)' },
          ].map(({ c, l }) => (
            <span key={l} className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />
              <span className="truncate">{l}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
