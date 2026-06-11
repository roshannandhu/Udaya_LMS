import React, { useState } from "react";
import { resolveAvatar } from "../ui";

const PERIOD_OPTIONS = ["Weekly", "Monthly", "Overall"];

const TOPIC_COLORS = [
  "#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16"
];

function radarPath(data, cx, cy, r, valueKey) {
  const n = data.length || 1;
  return data.map((d, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const pct = Math.max(0, Math.min((d[valueKey] || 0) / 100, 1));
    const x = cx + r * pct * Math.cos(angle);
    const y = cy + r * pct * Math.sin(angle);
    return [x, y];
  });
}

function pointsToPath(pts) {
  if (!pts || pts.length === 0) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ") + " Z";
}

function PeriodSelector({ value, onChange }) {
  const capitalized = value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
  return (
    <div style={{ display: "flex", gap: 4, background: "#EFEDEA", borderRadius: 999, padding: 3 }}>
      {PERIOD_OPTIONS.map((p) => (
        <button
          key={p}
          onClick={() => onChange(p.toLowerCase())}
          style={{
            padding: "5px 14px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 500,
            background: capitalized === p ? "#1A1A19" : "transparent",
            color: capitalized === p ? "#fff" : "#787774",
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
  const n = data.length || 1;
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

      {data.length > 2 && (
        <>
          <path d={pointsToPath(avgPts)} fill="rgba(120,119,116,0.1)" stroke="#C2C1BE" strokeWidth="1.5" strokeDasharray="4 3" />
          <path d={pointsToPath(studentPts)} fill="rgba(26,26,25,0.08)" stroke="#1A1A19" strokeWidth="2" />
        </>
      )}

      {studentPts.map((pt, i) => (
        <circle key={i} cx={pt[0]} cy={pt[1]} r="3.5" fill="#1A1A19" />
      ))}

      {axisPoints.map((pt, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        const lx = cx + (r + 22) * Math.cos(angle);
        const ly = cy + (r + 22) * Math.sin(angle);
        const anchor = Math.abs(Math.cos(angle)) < 0.1 ? "middle" : Math.cos(angle) < 0 ? "end" : "start";
        const subjectName = (data[i].subject || "").length > 12 ? (data[i].subject || "").slice(0,10) + "..." : data[i].subject;
        return (
          <text key={i} x={lx} y={ly + 4} textAnchor={anchor} fontSize="11" fill="#787774" fontWeight="500">
            {subjectName}
          </text>
        );
      })}
    </svg>
  );
}

function RadarTable({ data }) {
  if (!data || data.length === 0) return <div style={{ fontSize: 12, padding: 16, color: "#787774" }}>No data</div>;
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
        const diff = (d.score || 0) - (d.classAvg || 0);
        return (
          <div key={i} style={{
            display: "grid", gridTemplateColumns: "1fr 72px 72px",
            padding: "9px 14px",
            borderBottom: i < data.length - 1 ? "0.5px solid #EBEAE7" : "none",
            background: i % 2 === 0 ? "#fff" : "#FAFAF9",
            alignItems: "center",
          }}>
            <span style={{ color: "#1A1A19", fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.subject}</span>
            <span style={{ textAlign: "right", fontWeight: 600, color: diff >= 0 ? "#0F6E56" : "#A32D2D" }}>
              {Math.round(d.score || 0)}%
            </span>
            <span style={{ textAlign: "right", color: "#787774" }}>{Math.round(d.classAvg || 0)}%</span>
          </div>
        );
      })}
    </div>
  );
}

function MultiLineGraph({ subject, multiLineData }) {
  const data = multiLineData[subject];
  if (!data || !data.topics || Object.keys(data.topics).length === 0) {
    return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 12, color: "#B4B2A9" }}>No topic data available for {subject}</div>;
  }
  
  const { weeks, topics } = data;
  const topicNames = Object.keys(topics);
  const W = 440, H = 200, padL = 32, padB = 24, padT = 12, padR = 12;
  const gW = W - padL - padR, gH = H - padB - padT;

  const xPos = (i) => padL + (i / Math.max(1, weeks.length - 1)) * gW;
  const yPos = (v) => padT + gH - (Math.max(0, Math.min(v || 0, 100)) / 100) * gH;

  // Find weakest topic (lowest last value)
  let weakest = topicNames[0];
  let minVal = 101;
  topicNames.forEach(t => {
    const pts = topics[t] || [];
    const last = pts[pts.length - 1] || 0;
    if (last < minVal) { minVal = last; weakest = t; }
  });

  const [hovered, setHovered] = useState(null);

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginBottom: 10 }}>
        {topicNames.map((t, i) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#787774" }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: TOPIC_COLORS[i % TOPIC_COLORS.length], opacity: t === weakest ? 1 : 0.8 }} />
            <span style={{ fontWeight: t === weakest ? 600 : 400, color: t === weakest ? "#A32D2D" : "#787774" }}>
              {t}{t === weakest ? " ↓" : ""}
            </span>
          </div>
        ))}
      </div>
      <div style={{ overflowX: "auto", overflowY: "hidden", paddingBottom: 10 }}>
        <svg width="100%" minWidth={440} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>
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
            const pts = topics[t] || [];
            if (pts.length === 0) return null;
            const isWeak = t === weakest;
            const pathD = pts.map((v, i) => `${i === 0 ? "M" : "L"} ${xPos(i).toFixed(1)} ${yPos(v).toFixed(1)}`).join(" ");
            return (
              <g key={t}>
                {pts.length > 1 && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={TOPIC_COLORS[ti % TOPIC_COLORS.length]}
                    strokeWidth={isWeak ? 2.5 : 1.5}
                    strokeDasharray={isWeak ? "5 3" : "none"}
                    opacity={hovered && hovered !== t ? 0.25 : 1}
                    style={{ transition: "opacity 0.15s" }}
                  />
                )}
                {pts.map((v, i) => (
                  <circle
                    key={i}
                    cx={xPos(i)} cy={yPos(v)} r={3}
                    fill={TOPIC_COLORS[ti % TOPIC_COLORS.length]}
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
      </div>
      {weakest && (
        <div style={{
          marginTop: 8, padding: "8px 12px",
          background: "#FDEBEC", border: "0.5px solid #F7C1C1",
          borderRadius: 6, fontSize: 11, color: "#A32D2D",
        }}>
          Weakest topic: <strong>{weakest}</strong> — needs focused attention this period.
        </div>
      )}
    </div>
  );
}

function HeatmapCalendar({ grid, title, colorFn }) {
  const days = ["S","M","T","W","T","F","S"];
  if (!grid || grid.length === 0) {
    return <div style={{ fontSize: 12, padding: "20px 0", color: "#B4B2A9", textAlign: "center" }}>No {title.toLowerCase()} data</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-start", overflowX: "auto", paddingBottom: 10 }}>
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
                    title={val === 0 ? "No activity" : `Intensity ${val}/4`}
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, fontSize: 10, color: "#787774" }}>
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
        {!loading && (!suggestions || suggestions.length === 0) && (
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
        {!loading && (!suggestions || suggestions.length === 0) && (
          <p style={{ fontSize: 12, color: "#B4B2A9", textAlign: "center", padding: "8px 0", margin: 0 }}>
            Click "Analyse & suggest" to get personalised recommendations based on this student's performance.
          </p>
        )}
        {!loading && suggestions && suggestions.length > 0 && (
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

// ─── MAIN REPORT CARD UI ──────────────────────────────────────────────────────

export default function ReportCardUI({
  student,
  period,
  onPeriodChange,
  radarData,
  performanceData,
  multiLineData,
  attendanceGrid,
  attendanceStats,
  videoGrid,
  videoStats,
  suggestions,
  loadingSuggestions,
  onGenerateSuggestions,
}) {
  const subjects = Object.keys(multiLineData || {});
  const [subject, setSubject] = useState(subjects[0] || "");
  const [attPeriod, setAttPeriod] = useState("Weekly");
  const [vidPeriod, setVidPeriod] = useState("Weekly");

  const sName = student?.name || "Student";
  const sAvatar = student?.avatar_url ? <img src={resolveAvatar(student.avatar_url)} alt="" style={{width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover'}} /> : (sName.slice(0,2).toUpperCase());

  const card = (children, extra = {}) => (
    <div style={{
      background: "#fff", border: "1px solid #EFEDEA",
      borderRadius: 20, padding: "16px",
      boxShadow: "0 4px 20px rgba(17,24,39,0.05)",
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
      fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
      background: "transparent", minHeight: "100%",
      padding: "0 0 40px",
      color: "#1A1A19",
    }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        select.rc-select { appearance: none; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23787774' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 10px center; padding-right: 28px !important; cursor: pointer; }
        select.rc-select:focus { outline: none; }
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
                fontSize: 14, fontWeight: 600, overflow: 'hidden'
              }}>
                {sAvatar}
              </div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <h1 style={{ fontSize: 17, fontWeight: 600, color: "#1A1A19", margin: 0 }}>{sName}</h1>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: "2px 8px",
                    background: "#EAF3DE", color: "#3B6D11", borderRadius: 4,
                  }}>
                    {student?.points || 0} pts
                  </span>
                </div>
                <p style={{ fontSize: 11, color: "#787774", margin: "2px 0 0" }}>{student?.standard?.name || "Standard"}</p>
              </div>
            </div>
            <PeriodSelector value={period} onChange={onPeriodChange} />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── SECTION 1: RADAR + TABLE ── */}
        <div>
          {sectionLabel("Overall performance snapshot")}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "start",
          }}>
            {performanceData && performanceData.length > 0 && card(
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: "0 0 10px" }}>Core Metrics</p>
                <RadarChart data={performanceData} />
              </div>,
              { padding: "16px 20px" }
            )}
            {radarData && radarData.length > 0 && card(
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: "0 0 10px" }}>Subject Overview</p>
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
              { padding: "16px 20px" }
            )}
            {card(
              <>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: "0 0 10px" }}>
                  Score breakdown — {period.charAt(0).toUpperCase() + period.slice(1)}
                </p>
                <RadarTable data={radarData || []} />
                <div style={{
                  marginTop: 10, padding: "8px 10px",
                  background: "#FAFAF9", borderRadius: 6,
                  border: "0.5px solid #EBEAE7",
                  fontSize: 11, color: "#787774", lineHeight: 1.5,
                }}>
                  Green = above class average · Red = below class average
                </div>
              </>,
              { flex: 1, minHeight: 334 }
            )}
          </div>
        </div>

        {/* ── SECTION 2: MULTI-LINE GRAPH ── */}
        <div>
          {sectionLabel("Topic-level performance")}
          {card(
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: 0 }}>Score by topic over time</p>
                <select
                  className="rc-select"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    border: "0.5px solid #EBEAE7", borderRadius: 7,
                    padding: "5px 10px", fontSize: 12, color: "#1A1A19",
                    background: "#FAFAF9", minWidth: 120
                  }}
                >
                  {subjects.length === 0 && <option value="">No subjects</option>}
                  {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <MultiLineGraph subject={subject} multiLineData={multiLineData || {}} />
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
                    <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: 0 }}>Attendance</p>
                    <p style={{ fontSize: 11, color: "#787774", margin: "2px 0 0" }}>Darker = more classes attended</p>
                  </div>
                </div>
                <HeatmapCalendar grid={attendanceGrid || []} title="Attendance" colorFn={AttendanceColor} />
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Present", value: attendanceStats?.present || 0, color: "#3B6D11" },
                    { label: "Absent", value: attendanceStats?.absent || 0, color: "#A32D2D" },
                    { label: "Late", value: attendanceStats?.late || 0, color: "#854F0B" },
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
                    <p style={{ fontSize: 12, fontWeight: 500, color: "#1A1A19", margin: 0 }}>Video watching</p>
                    <p style={{ fontSize: 11, color: "#787774", margin: "2px 0 0" }}>Darker = more videos watched that day</p>
                  </div>
                </div>
                <HeatmapCalendar grid={videoGrid || []} title="Videos" colorFn={VideoColor} />
                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {[
                    { label: "Days watched", value: videoStats?.days || 0, color: "#185FA5" },
                    { label: "Total minutes", value: videoStats?.mins || 0, color: "#0F6E56" },
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
            onGenerate={onGenerateSuggestions}
          />
        </div>

      </div>
    </div>
  );
}
