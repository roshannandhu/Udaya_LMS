import { useState, useMemo } from "react";

// ─── MOCK DATA ────────────────────────────────────────────────────────────────

const STUDENT = {
  name: "Aarav Sharma",
  standard: "10th Standard",
  avatar: "AS",
  points: 1390,
  rank: 3,
};

const SUBJECTS = ["Mathematics", "Physics", "Chemistry"];

const TOPICS = {
  Mathematics: ["Quadratics", "Algebra", "Trigonometry", "Geometry", "Statistics"],
  Physics: ["Newton's Laws", "Optics", "Thermodynamics", "Electrostatics", "Waves"],
  Chemistry: ["Atomic Structure", "Organic Reactions", "Acids & Bases", "Periodic Table", "Chemical Bonding"],
};

// Radar: per-subject average across all topics
const radarDataWeekly = [
  { subject: "Maths", score: 72, classAvg: 68 },
  { subject: "Physics", score: 58, classAvg: 65 },
  { subject: "Chemistry", score: 84, classAvg: 71 },
  { subject: "Attendance", score: 90, classAvg: 82 },
  { subject: "Videos", score: 78, classAvg: 74 },
];
const radarDataMonthly = [
  { subject: "Maths", score: 76, classAvg: 70 },
  { subject: "Physics", score: 63, classAvg: 66 },
  { subject: "Chemistry", score: 81, classAvg: 72 },
  { subject: "Attendance", score: 88, classAvg: 83 },
  { subject: "Videos", score: 82, classAvg: 75 },
];
const radarDataOverall = [
  { subject: "Maths", score: 79, classAvg: 71 },
  { subject: "Physics", score: 65, classAvg: 67 },
  { subject: "Chemistry", score: 83, classAvg: 73 },
  { subject: "Attendance", score: 87, classAvg: 82 },
  { subject: "Videos", score: 80, classAvg: 76 },
];

// Multi-line: topic scores per subject
const multiLineData = {
  Mathematics: {
    weeks: ["W18", "W19", "W20", "W21", "W22", "W23", "W24"],
    topics: {
      Quadratics:     [55, 62, 70, 68, 75, 80, 82],
      Algebra:        [70, 72, 68, 74, 78, 76, 79],
      Trigonometry:   [40, 48, 55, 58, 62, 65, 68],
      Geometry:       [80, 78, 82, 85, 83, 86, 88],
      Statistics:     [60, 65, 63, 70, 72, 75, 78],
    },
  },
  Physics: {
    weeks: ["W18", "W19", "W20", "W21", "W22", "W23", "W24"],
    topics: {
      "Newton's Laws":    [50, 55, 58, 62, 60, 65, 67],
      Optics:             [42, 48, 52, 55, 58, 60, 63],
      Thermodynamics:     [65, 68, 70, 72, 74, 73, 76],
      Electrostatics:     [35, 40, 45, 48, 52, 55, 58],
      Waves:              [58, 60, 63, 65, 64, 68, 70],
    },
  },
  Chemistry: {
    weeks: ["W18", "W19", "W20", "W21", "W22", "W23", "W24"],
    topics: {
      "Atomic Structure":    [70, 74, 78, 80, 82, 84, 86],
      "Organic Reactions":   [60, 65, 68, 72, 75, 78, 80],
      "Acids & Bases":       [82, 80, 84, 85, 87, 86, 88],
      "Periodic Table":      [55, 60, 63, 67, 70, 72, 75],
      "Chemical Bonding":    [48, 52, 55, 58, 62, 65, 68],
    },
  },
};

// Heatmap: 10 weeks × 7 days. 0=no class, 1-4 intensity
function genHeatmap(seed, emptyRate = 0.3) {
  const grid = [];
  for (let w = 0; w < 14; w++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      if (d === 0 || d === 6) { row.push(0); continue; }
      const r = ((seed * (w * 7 + d) * 1103515245 + 12345) & 0x7fffffff) % 100;
      row.push(r < emptyRate * 100 ? 0 : r < 40 ? 1 : r < 65 ? 2 : r < 85 ? 3 : 4);
    }
    grid.push(row);
  }
  return grid;
}

const attendanceHeatmap = genHeatmap(42, 0.25);
const videoHeatmap      = genHeatmap(77, 0.35);

const AI_SUGGESTIONS = {
  weekly: [
    "Physics — Electrostatics is your lowest-scoring topic this week (35%). Review the charge distribution concept before Monday's test.",
    "You watched only 3 videos in Physics this week vs 8 in Chemistry. Balance your study time to avoid gaps.",
    "Trigonometry improved 5 points from last week — great momentum. Keep solving one problem set daily.",
    "Your attendance dipped on Wednesdays (3 weeks in a row). Check if there's a scheduling conflict to resolve with your teacher.",
  ],
  monthly: [
    "Physics is consistently your weakest subject (avg 63% vs class avg 66%). Request an extra session with your teacher for Optics and Electrostatics.",
    "Chemistry Periodic Table improved 20 points over the month — this is working. Continue the same strategy.",
    "Your video completion rate is 82% this month. Completing the remaining 3 videos in Physics could lift your score significantly.",
    "You're ranked #3 in your standard. Closing the Physics gap could push you to #1.",
  ],
  overall: [
    "Strongest subject: Chemistry (83% avg). Weakest: Physics (65% avg). Consider spending an extra 20 minutes daily on Physics.",
    "Your video-to-score correlation is strong in Mathematics (+12 points in topics where you finished all videos).",
    "Attendance is excellent (87%) but Wednesday absences form a pattern. Addressing this could improve your weekly scores.",
    "You perform best in the first 3 questions of each test. Review time-management strategies for the final section.",
  ],
};

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = ["Weekly", "Monthly", "Overall"];

const TOPIC_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
];

function radarPath(data, cx, cy, r, valueKey) {
  const n = data.length;
  return data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const pct = d[valueKey] / 100;
    const x = cx + r * pct * Math.cos(angle);
    const y = cy + r * pct * Math.sin(angle);
    return [x, y];
  });
}

function pointsToPath(pts) {
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, background: "#F3F2EF", borderRadius: 8, padding: 3 }}>
      {PERIOD_OPTIONS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          style={{
            padding: "5px 14px",
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            background: value === p ? "#1A1A19" : "transparent",
            color: value === p ? "#fff" : "#787774",
            transition: "all 0.15s",
          }}
        >
          {p}
        </button>
      ))}
    </div>
  );
}

function RadarChart({ data }) {
  const cx = 130, cy = 130, r = 100;
  const n = data.length;
  const levels = [0.25, 0.5, 0.75, 1.0];

  const axisPoints = data.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  const studentPts = radarPath(data, cx, cy, r, "score");
  const avgPts     = radarPath(data, cx, cy, r, "classAvg");

  return (
    <svg width="260" height="260" style={{ overflow: "visible" }}>
      {levels.map((l) => {
        const pts = data.map((_, i) => {
          const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
          return [cx + r * l * Math.cos(angle), cy + r * l * Math.sin(angle)];
        });
        return (
          <polygon
            key={l}
            points={pts.map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="#EBEAE7"
            strokeWidth="0.5"
          />
        );
      })}

      {axisPoints.map((pt, i) => (
        <line key={i} x1={cx} y1={cy} x2={pt.x} y2={pt.y} stroke="#EBEAE7" strokeWidth="0.5" />
      ))}

      <path d={pointsToPath(avgPts)} fill="rgba(120,119,116,0.1)" stroke="#C2C1BE" strokeWidth="1.5" strokeDasharray="4 3" />
      <path d={pointsToPath(studentPts)} fill="rgba(26,26,25,0.08)" stroke="#1A1A19" strokeWidth="2" />

      {studentPts.map((pt, i) => (
        <circle key={i} cx={pt[0]} cy={pt[1]} r="3.5" fill="#1A1A19" />
      ))}

      {axisPoints.map((pt, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + (r + 22) * Math.cos(angle);
        const ly = cy + (r + 22) * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) < 0 ? "end" : "start";
        return (
          <text key={i} x={lx} y={ly + 4} textAnchor={anchor} fontSize="11" fill="#787774" fontWeight="500">
            {data[i].subject}
          </text>
        );
      })}
    </svg>
  );
}

function RadarTable({ data }) {
  return (
    <div style={{ border: "0.5px solid #EBEAE7", borderRadius: 10, overflow: "hidden", fontSize: 12 }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 72px 72px",
        padding: "8px 14px", background: "#FAFAF9",
        borderBottom: "0.5px solid #EBEAE7",
        color: "#787774", fontWeight: 500, fontSize: 11,
      }}>
        <span>Metric</span><span style={{ textAlign: "right" }}>You</span><span style={{ textAlign: "right" }}>Class</span>
      </div>
      {data.map((d, i) => {
        const diff = d.score - d.classAvg;
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 72px 72px",
            padding: "9px 14px",
            borderBottom: i < data.length - 1 ? "0.5px solid #EBEAE7" : "none",
            background: i % 2 === 0 ? "#fff" : "#FAFAF9",
            alignItems: "center",
          }}>
            <span style={{ color: "#1A1A19", fontWeight: 500 }}>{d.subject}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: diff >= 0 ? "#0F6E56" : "#A32D2D" }}>
              {d.score}%
            </span>
            <span style={{ textAlign: "right", color: "#787774" }}>{d.classAvg}%</span>
          </div>
        );
      })}
    </div>
  );
}

function MultiLineGraph({ subject }) {
  const data = multiLineData[subject];
  if (!data) return null;
  const { weeks, topics } = data;
  const topicNames = Object.keys(topics);
  const W = 440, H = 200, padL = 32, padB = 24, padT = 12, padR = 12;
  const gW = W - padL - padR, gH = H - padB - padT;

  const xPos = (i) => padL + (i / (weeks.length - 1)) * gW;
  const yPos = (v) => padT + gH - (v / 100) * gH;

  // Find weakest topic (lowest last value)
  const weakest = topicNames.reduce((a, b) =>
    topics[a][topics[a].length - 1] < topics[b][topics[b].length - 1] ? a : b
  );

  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 10 }}>
        {topicNames.map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#787774" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: TOPIC_COLORS[i], opacity: t === weakest ? 1 : 0.8 }} />
            <span style={{ fontWeight: t === weakest ? 600 : 400, color: t === weakest ? "#A32D2D" : "#787774" }}>
              {t}{t === weakest ? " ↓" : ""}
            </span>
          </div>
        ))}
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
        {[25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={padL} y1={yPos(v)} x2={W - padR} y2={yPos(v)} stroke="#EBEAE7" strokeWidth="0.5" />
            <text x={padL - 4} y={yPos(v) + 4} textAnchor="end" fontSize="9" fill="#C2C1BE">{v}</text>
          </g>
        ))}
        {weeks.map((w, i) => (
          <text key={i} x={xPos(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="#B4B2A9">{w}</text>
        ))}

        {topicNames.map((t, ti) => {
          const pts = topics[t];
          const isWeak = t === weakest;
          const pathD = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(" ");
          return (
            <g key={t}>
              <path
                d={pathD}
                fill="none"
                stroke={TOPIC_COLORS[ti]}
                strokeWidth={isWeak ? 2.5 : 1.5}
                strokeDasharray={isWeak ? "5 3" : "none"}
                opacity={hovered && hovered !== t ? 0.25 : 1}
                style={{ transition: "opacity 0.15s" }}
              />
              {pts.map((v, i) => (
                <circle
                  key={i}
                  cx={xPos(i)} cy={yPos(v)} r={3}
                  fill={TOPIC_COLORS[ti]}
                  opacity={hovered && hovered !== t ? 0.2 : 1}
                  onMouseEnter={() => setHovered(t)}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "pointer" }}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{
        marginTop: 8, padding: "8px 12px",
        background: "#FDEBEC", border: "0.5px solid #F7C1C1",
        borderRadius: 6, fontSize: 11, color: "#A32D2D",
      }}>
        Weakest topic: <strong>{weakest}</strong> — needs focused attention this week.
      </div>
    </div>
  );
}

function HeatmapCalendar({ grid, title, colorFn }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const days   = ["S","M","T","W","T","F","S"];
  const now = new Date();
  const [tooltip, setTooltip] = useState(null);

  return (
    <div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-start", overflowX: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 16, marginRight: 2 }}>
          {days.map((d, i) => (
            <div key={i} style={{ height: 10, fontSize: 8, color: "#B4B2A9", lineHeight: "10px" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {grid.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {week.map((val, di) => {
                const [bg, border] = colorFn(val);
                return (
                  <div
                    key={di}
                    title={val === 0 ? "No class" : `Intensity ${val}/4`}
                    style={{
                      width: 10, height: 10, borderRadius: 2,
                      background: bg, border: `0.5px solid ${border}`,
                      cursor: val > 0 ? "pointer" : "default",
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 10, color: "#787774" }}>
        <span>Less</span>
        {[0,1,2,3,4].map(v => {
          const [bg] = colorFn(v);
          return <div key={v} style={{ width: 10, height: 10, borderRadius: 2, background: bg }} />;
        })}
        <span>More</span>
      </div>
    </div>
  );
}

function AttendanceColor(val) {
  if (val === 0) return ["#F3F2EF", "#EBEAE7"];
  if (val === 1) return ["#C0DD97", "#9FCC6B"];
  if (val === 2) return ["#639922", "#4A7518"];
  if (val === 3) return ["#3B6D11", "#27500A"];
  return ["#173404", "#0E2202"];
}

function VideoColor(val) {
  if (val === 0) return ["#F3F2EF", "#EBEAE7"];
  if (val === 1) return ["#B5D4F4", "#85B7EB"];
  if (val === 2) return ["#378ADD", "#185FA5"];
  if (val === 3) return ["#0C447C", "#042C53"];
  return ["#042C53", "#021A38"];
}

function AISuggestionBox({ suggestions, loading, onGenerate }) {
  return (
    <div style={{
      border: "0.5px solid #EBEAE7", borderRadius: 12, overflow: "hidden",
    }}>
      <div style={{
        padding: "12px 16px",
        background: "#1A1A19",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: loading ? "#F59E0B" : "#10B981",
            boxShadow: `0 0 6px ${loading ? "#F59E0B" : "#10B981"}`,
          }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>AI suggestions</span>
        </div>
        {!loading && !suggestions && (
          <button
            onClick={onGenerate}
            style={{
              padding: "5px 12px", borderRadius: 6,
              background: "#fff", border: "none",
              fontSize: 11, fontWeight: 500, color: "#1A1A19",
              cursor: "pointer",
            }}
          >
            Analyse & suggest
          </button>
        )}
      </div>
      <div style={{ padding: "14px 16px", background: "#FAFAF9" }}>
        {loading && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#787774", fontSize: 12 }}>
            <div style={{
              width: 14, height: 14, border: "1.5px solid #EBEAE7",
              borderTopColor: "#1A1A19", borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            Analysing performance patterns...
          </div>
        )}
        {!loading && !suggestions && (
          <p style={{ fontSize: 12, color: "#B4B2A9", textAlign: "center", padding: "8px 0" }}>
            Click "Analyse &amp; suggest" to get personalised recommendations based on this student's performance.
          </p>
        )}
        {suggestions && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {suggestions.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <div style={{
                  width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                  background: "#EAF3DE", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 10, fontWeight: 600, color: "#3B6D11",
                }}>
                  {i + 1}
                </div>
                <p style={{ fontSize: 12, color: "#444441", lineHeight: 1.6, margin: 0 }}>{s}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── MAIN REPORT CARD ────────────────────────────────────────────────────────

export default function StudentReportCard() {
  const [period, setPeriod] = useState("Weekly");
  const [subject, setSubject] = useState("Mathematics");
  const [attPeriod, setAttPeriod] = useState("Weekly");
  const [vidPeriod, setVidPeriod] = useState("Weekly");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);

  const radarData = period === "Weekly" ? radarDataWeekly : period === "Monthly" ? radarDataMonthly : radarDataOverall;
  const suggestions = showSuggestions ? AI_SUGGESTIONS[period.toLowerCase()] : null;

  const handleGenerate = () => {
    setLoadingSuggestions(true);
    setShowSuggestions(false);
    setTimeout(() => {
      setLoadingSuggestions(false);
      setShowSuggestions(true);
    }, 1800);
  };

  const card = (children, extra = {}) => (
    <div style={{
      background: "#fff", border: "0.5px solid #EBEAE7",
      borderRadius: 12, padding: "16px",
      ...extra,
    }}>
      {children}
    </div>
  );

  const sectionLabel = (text) => (
    <p style={{ fontSize: 11, fontWeight: 500, color: "#B4B2A9", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 12 }}>
      {text}
    </p>
  );

  return (
    <div style={{
      fontFamily: "'DM Sans', system-ui, sans-serif",
      background: "#FAFAF9", minHeight: "100vh",
      padding: "0 0 40px",
      color: "#1A1A19",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        select { appearance: none; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23787774' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center; padding-right: 28px !important; cursor: pointer; }
        select:focus { outline: none; }
      `}</style>

      {/* ── HEADER ── */}
      <div style={{ background: "#fff", borderBottom: "0.5px solid #EBEAE7", padding: "16px 20px 14px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "#1A1A19", color: "#fff",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 14, fontWeight: 600,
              }}>
                {STUDENT.avatar}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h1 style={{ fontSize: 17, fontWeight: 600, color: "#1A1A19" }}>{STUDENT.name}</h1>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: "2px 8px",
                    background: "#EAF3DE", color: "#3B6D11", borderRadius: 4,
                  }}>
                    Rank #{STUDENT.rank}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "#787774" }}>{STUDENT.standard} · {STUDENT.points} pts</p>
              </div>
            </div>
            <PeriodSelector value={period} onChange={(p) => { setPeriod(p); setShowSuggestions(false); }} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── SECTION 1: RADAR + TABLE ── */}
        <div>
          {sectionLabel("Overall performance snapshot")}
          <div style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: 16,
            alignItems: "start",
          }}>
            {card(
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <RadarChart data={radarData} />
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#787774" }}>
                    <div style={{ width: 20, height: 2, background: "#1A1A19", borderRadius: 1 }} />
                    You
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#787774" }}>
                    <div style={{ width: 20, height: 1.5, background: "#C2C1BE", borderRadius: 1, borderTop: "1.5px dashed #C2C1BE" }} />
                    Class avg
                  </div>
                </div>
              </div>,
              { padding: "16px 20px", display: "inline-block" }
            )}
            {card(
              <>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", marginBottom: 10 }}>
                  Score breakdown — {period}
                </p>
                <RadarTable data={radarData} />
                <div style={{
                  marginTop: 10, padding: "8px 10px",
                  background: "#FAFAF9", borderRadius: 6,
                  border: "0.5px solid #EBEAE7",
                  fontSize: 11, color: "#787774", lineHeight: 1.5,
                }}>
                  Green = above class average · Red = below class average
                </div>
              </>,
              { flex: 1 }
            )}
          </div>
        </div>

        {/* ── SECTION 2: MULTI-LINE GRAPH ── */}
        <div>
          {sectionLabel("Topic-level performance")}
          {card(
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19" }}>Score by topic over time</p>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    border: "0.5px solid #EBEAE7", borderRadius: 7,
                    padding: "5px 10px", fontSize: 12, color: "#1A1A19",
                    background: "#FAFAF9",
                  }}
                >
                  {SUBJECTS.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <MultiLineGraph subject={subject} />
            </>
          )}
        </div>

        {/* ── SECTION 3: HEATMAPS ── */}
        <div>
          {sectionLabel("Activity calendars")}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

            {card(
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19" }}>Attendance</p>
                    <p style={{ fontSize: 11, color: "#787774" }}>Darker = more classes attended</p>
                  </div>
                  <select
                    value={attPeriod}
                    onChange={(e) => setAttPeriod(e.target.value)}
                    style={{ border: "0.5px solid #EBEAE7", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#1A1A19", background: "#FAFAF9" }}
                  >
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                </div>
                <HeatmapCalendar grid={attendanceHeatmap} title="Attendance" colorFn={AttendanceColor} />
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Present days", value: "47", color: "#3B6D11" },
                    { label: "Absent days", value: "8", color: "#A32D2D" },
                    { label: "Late arrivals", value: "3", color: "#854F0B" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: "6px 12px", borderRadius: 6,
                      border: "0.5px solid #EBEAE7",
                      background: "#FAFAF9",
                      fontSize: 11,
                    }}>
                      <span style={{ color: "#787774" }}>{s.label}: </span>
                      <span style={{ fontWeight: 600, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {card(
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19" }}>Video watching</p>
                    <p style={{ fontSize: 11, color: "#787774" }}>Darker = more videos watched that day</p>
                  </div>
                  <select
                    value={vidPeriod}
                    onChange={(e) => setVidPeriod(e.target.value)}
                    style={{ border: "0.5px solid #EBEAE7", borderRadius: 7, padding: "5px 10px", fontSize: 12, color: "#1A1A19", background: "#FAFAF9" }}
                  >
                    <option>Weekly</option>
                    <option>Monthly</option>
                  </select>
                </div>
                <HeatmapCalendar grid={videoHeatmap} title="Videos" colorFn={VideoColor} />
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Videos watched", value: "34", color: "#185FA5" },
                    { label: "Completed", value: "28", color: "#0F6E56" },
                    { label: "In progress", value: "6", color: "#854F0B" },
                  ].map((s) => (
                    <div key={s.label} style={{
                      padding: "6px 12px", borderRadius: 6,
                      border: "0.5px solid #EBEAE7",
                      background: "#FAFAF9",
                      fontSize: 11,
                    }}>
                      <span style={{ color: "#787774" }}>{s.label}: </span>
                      <span style={{ fontWeight: 600, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── SECTION 4: AI SUGGESTIONS ── */}
        <div>
          {sectionLabel("Smart suggestions")}
          <AISuggestionBox
            suggestions={suggestions}
            loading={loadingSuggestions}
            onGenerate={handleGenerate}
          />
        </div>

      </div>
    </div>
  );
}
