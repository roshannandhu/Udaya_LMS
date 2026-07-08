// ─────────────────────────────────────────────────────────────────────────────
// reportPdf.js  —  Premium branded PDF builders for Udaya LMS
//
//  • buildStudentReportPdf({ data, period })    → Overall / Weekly / Monthly report
//  • buildExamResultPdf({ reviewData, result, student, testMeta }) → Per-exam sheet
//
// Both PDFs share the same gradient header, colour system, and helper kit.
// ─────────────────────────────────────────────────────────────────────────────
import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';

// ── Palette ──────────────────────────────────────────────────────────────────
const P = {
  // Header gradient (indigo → violet), simulated via step-rects
  hdrFrom:  [63,  58, 199],   // indigo-700
  hdrTo:    [109, 40, 217],   // violet-700
  hdrH:     54,               // mm — header height

  // Semantic
  good:     '#10b981',  // emerald-500
  mid:      '#f59e0b',  // amber-500
  bad:      '#ef4444',  // red-500
  na:       '#9ca3af',  // neutral-400
  white:    '#ffffff',

  // Attendance cells
  present:  '#10b981',
  late:     '#f59e0b',
  absent:   '#ef4444',
  noClass:  '#e2e8f0',

  // Text
  ink:      '#111827',
  gray:     '#6b7280',
  lightGray:'#9ca3af',

  // Backgrounds
  light:    '#F8F7F5',
  border:   '#E5E7EB',

  // Chart accent arrays [r,g,b]
  indigo:   [99, 102, 241],
  teal:     [20, 184, 166],
  amber:    [245, 158, 11],
  rose:     [244, 63,  94],
  violet:   [139, 92, 246],
  emerald:  [16, 185, 129],
};

const MARGIN = 13;  // mm
const NO_DATA = '—';

// ── Branding ─────────────────────────────────────────────────────────────────
export function getBranding() {
  const s = useSettingsStore.getState();
  return {
    name:    (s.lmsName  || '').trim() || 'Udaya',
    logoUrl:  s.lmsLogo  || DEFAULT_LMS_LOGO,
  };
}

// ── Image helpers ─────────────────────────────────────────────────────────────
export async function fetchImageDataURL(url) {
  if (!url || typeof url !== 'string' || url.startsWith('preset:')) return null;
  try {
    const res    = await fetch(url);
    if (!res.ok) return null;
    const blob   = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width  = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), width: bitmap.width, height: bitmap.height };
  } catch { return null; }
}

function fitImage(doc, image, x, y, boxW, boxH) {
  const r = Math.min(boxW / image.width, boxH / image.height);
  const w = image.width  * r;
  const h = image.height * r;
  doc.addImage(image.dataUrl, 'PNG', x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

// ── Text / number helpers ─────────────────────────────────────────────────────
const fmtDate = (iso) => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return String(iso).slice(0, 10); }
};

const round = (v, fb = null) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : fb; };
const pctText   = (v) => { const n = round(v); return n == null ? NO_DATA : `${n}%`; };
const valueText = (v) => (v === null || v === undefined || v === '') ? NO_DATA : String(v);

const gradeFor = (score) => {
  const s = round(score || 0);
  if (s >= 90) return { grade: 'A+', label: 'Outstanding' };
  if (s >= 80) return { grade: 'A',  label: 'Excellent'   };
  if (s >= 70) return { grade: 'B+', label: 'Very Good'   };
  if (s >= 60) return { grade: 'B',  label: 'Good'        };
  if (s >= 50) return { grade: 'C',  label: 'Average'     };
  if (s >= 35) return { grade: 'D',  label: 'Needs Work'  };
  return             { grade: 'E',  label: 'At Risk'      };
};

const initials = (name) => {
  const p = String(name || 'S').trim().split(/\s+/).filter(Boolean);
  return (p[0]?.[0] || 'S').toUpperCase() + (p[1]?.[0] || '').toUpperCase();
};

const scoreFillColor = (doc, pct) => {
  const n = round(pct) || 0;
  if (n >= 70) doc.setFillColor(P.good);
  else if (n >= 40) doc.setFillColor(P.mid);
  else doc.setFillColor(P.bad);
};

const scoreTextColor = (doc, pct) => {
  const n = round(pct) || 0;
  if (n >= 70) doc.setTextColor(P.good);
  else if (n >= 40) doc.setTextColor(P.mid);
  else doc.setTextColor(P.bad);
};

const periodTitle = (p) => p === 'weekly' ? 'Weekly Report Card' : p === 'monthly' ? 'Monthly Report Card' : 'Overall Report Card';
const periodRange = (p) => {
  const today = new Date();
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (p === 'weekly')  { const f = new Date(today); f.setDate(f.getDate() - 7);  return `${fmt(f)} – ${fmt(today)}`; }
  if (p === 'monthly') { const f = new Date(today); f.setDate(f.getDate() - 30); return `${fmt(f)} – ${fmt(today)}`; }
  return 'All time';
};

// ── jsPDF loader ──────────────────────────────────────────────────────────────
async function loadJsPdf() {
  const jsPDFModule = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const JsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  return { JsPDF, autoTable };
}

// ── Page helpers ──────────────────────────────────────────────────────────────
function pageW(doc) { return doc.internal.pageSize.getWidth(); }
function pageH(doc) { return doc.internal.pageSize.getHeight(); }

function ensurePageSpace(doc, y, needed = 28) {
  if (y + needed <= pageH(doc) - 20) return y;
  doc.addPage();
  return MARGIN + 4;
}

// ── GRADIENT HEADER (shared by both PDFs) ─────────────────────────────────────
// Returns the y-position immediately below the header band.
function drawGradientHeader(doc, {
  brandName, logo,
  leftTitle,          // e.g. "Overall Report Card"
  leftSubtitle,       // e.g. "All time · Class 10-A"
  student,            // { name, student_code, standard_name, username }
  photo,              // image data URL object or null
  gradeLabel,         // e.g. "A+ · Outstanding"  (optional)
  rightChip,          // e.g. "Rank 3 / 28"      (optional)
}) {
  const W  = pageW(doc);
  const H  = P.hdrH;
  const steps = 20;

  // ── Gradient band
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const r = Math.round(P.hdrFrom[0] + (P.hdrTo[0] - P.hdrFrom[0]) * t);
    const g = Math.round(P.hdrFrom[1] + (P.hdrTo[1] - P.hdrFrom[1]) * t);
    const b = Math.round(P.hdrFrom[2] + (P.hdrTo[2] - P.hdrFrom[2]) * t);
    doc.setFillColor(r, g, b);
    doc.rect((W / steps) * i, 0, W / steps + 0.5, H, 'F');
  }

  // ── Decorative circle accents (subtle)
  doc.setFillColor(255, 255, 255);
  doc.setGState && doc.setGState(doc.GState({ opacity: 0.05 }));
  doc.circle(W - 18, -8, 22, 'F');
  doc.circle(W - 40, H + 5, 16, 'F');
  doc.setGState && doc.setGState(doc.GState({ opacity: 1.0 }));

  // ── Photo box (right side)
  const photoW = 28, photoH = 34;
  const px = W - MARGIN - photoW;
  const py = (H - photoH) / 2;

  // White rounded frame
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(255, 255, 255);
  doc.roundedRect(px - 1.5, py - 1.5, photoW + 3, photoH + 3, 2, 2, 'F');

  if (photo) {
    fitImage(doc, photo, px, py, photoW, photoH);
  } else {
    // Coloured initial circle
    doc.setFillColor(P.hdrTo[0], P.hdrTo[1], P.hdrTo[2]);
    doc.roundedRect(px, py, photoW, photoH, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(initials(student?.name), px + photoW / 2, py + photoH / 2 + 2, { align: 'center' });
  }

  // ── Left text column
  let tx = MARGIN;
  let ty = 8;

  // Logo + LMS name row
  if (logo) {
    const chipSz = 12;
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(tx, ty, chipSz, chipSz, 2, 2, 'F');
    fitImage(doc, logo, tx + 1, ty + 1, chipSz - 2, chipSz - 2);
    tx += chipSz + 4;
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(brandName || 'Udaya', tx, ty + 8);
  tx = MARGIN;
  ty += 16;

  // Student name (large)
  const maxNameW = W - MARGIN * 2 - photoW - 6;
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  const nameLine = doc.splitTextToSize(student?.name || 'Student', maxNameW)[0];
  doc.text(nameLine, tx, ty);
  ty += 7;

  // Student ID / standard
  const idBits = [];
  if (student?.student_code)  idBits.push(student.student_code);
  if (student?.standard_name) idBits.push(student.standard_name);
  if (student?.username)      idBits.push(`@${student.username}`);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 190, 255);
  if (idBits.length) {
    doc.text(doc.splitTextToSize(idBits.join('  ·  '), maxNameW)[0], tx, ty);
    ty += 5.5;
  }

  // Report type + range
  doc.setFontSize(7.5);
  doc.setTextColor(180, 170, 240);
  doc.text(`${leftTitle}  ·  ${leftSubtitle || fmtDate(new Date().toISOString())}`, tx, ty);
  ty += 5;

  // Grade label pill (if present)
  if (gradeLabel) {
    doc.setFillColor(255, 255, 255);
    const pillW = doc.getTextWidth(gradeLabel) + 8;
    doc.roundedRect(tx, ty, pillW, 5.5, 1.5, 1.5, 'F');
    doc.setTextColor(P.hdrFrom[0], P.hdrFrom[1], P.hdrFrom[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(gradeLabel, tx + 4, ty + 3.8);
    ty += 7.5;
  }

  // Right chip (rank, etc.)
  if (rightChip) {
    doc.setFillColor(255, 255, 255);
    doc.setFillColor(255, 255, 255);
    const cw = doc.getTextWidth(rightChip) + 10;
    doc.roundedRect(W - MARGIN - photoW - cw - 4, H - 13, cw, 7, 2, 2, 'F');
    doc.setTextColor(P.hdrFrom[0], P.hdrFrom[1], P.hdrFrom[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(rightChip, W - MARGIN - photoW - cw/2 - 4, H - 8.5, { align: 'center' });
  }

  // ── Generated date stamp (bottom right of header)
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(170, 160, 230);
  doc.text(`Generated ${fmtDate(new Date().toISOString())}`, W - MARGIN - photoW - 4, H - 4, { align: 'right' });

  // ── Thin separator line below header
  doc.setDrawColor(P.border);
  doc.setLineWidth(0.2);
  doc.line(0, H, W, H);

  return H + 8;
}

// ── Footers ───────────────────────────────────────────────────────────────────
function drawFooters(doc, brandName) {
  const W = pageW(doc);
  const H = pageH(doc);
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);

    // Left gradient accent bar
    doc.setFillColor(P.hdrFrom[0], P.hdrFrom[1], P.hdrFrom[2]);
    doc.rect(0, H - 10, W, 10, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(200, 190, 255);
    doc.text(`${brandName || 'Udaya'}  ·  ${fmtDate(new Date().toISOString())}`, MARGIN, H - 3.5);
    doc.text(`Page ${i} of ${n}`, W - MARGIN, H - 3.5, { align: 'right' });
  }
}

// ── Section heading ───────────────────────────────────────────────────────────
function sectionHeading(doc, text, y, iconColor = null) {
  y = ensurePageSpace(doc, y, 20);
  const W = pageW(doc);

  // Left accent bar
  doc.setFillColor(iconColor ? iconColor[0] : P.indigo[0], iconColor ? iconColor[1] : P.indigo[1], iconColor ? iconColor[2] : P.indigo[2]);
  doc.roundedRect(MARGIN, y - 2, 2.5, 8, 0.8, 0.8, 'F');

  doc.setTextColor(P.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(text, MARGIN + 5, y + 4.5);

  // Separator line
  doc.setDrawColor(P.border);
  doc.setLineWidth(0.3);
  doc.line(MARGIN + 5 + doc.getTextWidth(text) + 3, y + 2, W - MARGIN, y + 2);

  return y + 12;
}

// ── KPI Card Strip ────────────────────────────────────────────────────────────
// Each card: coloured left-border + big value + small label
function drawKpiStrip(doc, kpis, y) {
  if (!kpis.length) return y;
  const W   = pageW(doc);
  const gap = 3;
  const perRow = Math.min(kpis.length, 4);
  const rows   = Math.ceil(kpis.length / perRow);
  const cardW  = (W - 2 * MARGIN - gap * (perRow - 1)) / perRow;
  const cardH  = 20;

  y = ensurePageSpace(doc, y, rows * cardH + 12);

  kpis.forEach((k, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const cx  = MARGIN + col * (cardW + gap);
    const cy  = y + row * (cardH + gap);
    const color = k.color || P.indigo;

    // Card background
    doc.setFillColor(P.light);
    doc.roundedRect(cx, cy, cardW, cardH, 2, 2, 'F');

    // Coloured left accent bar
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(cx, cy, 2.5, cardH, 1, 1, 'F');

    // Value
    doc.setTextColor(P.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13.5);
    doc.text(String(k.value ?? NO_DATA), cx + 6, cy + 11.5);

    // Label
    doc.setTextColor(P.gray);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.text(String(k.label).toUpperCase(), cx + 6, cy + 17);
  });

  return y + rows * (cardH + gap) + 8;
}

// ── Ring Gauge ────────────────────────────────────────────────────────────────
function drawRingGauge(doc, cx, cy, r, pct, colorHex, label = null) {
  const frac  = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  const track = '#E5E7EB';

  // Track circle
  doc.setDrawColor(track);
  doc.setLineWidth(1.8);
  doc.circle(cx, cy, r, 'S');

  // Filled arc
  if (frac > 0.005) {
    doc.setDrawColor(colorHex);
    doc.setLineWidth(2.2);
    const steps = Math.max(3, Math.round(frac * 60));
    const start = -Math.PI / 2;
    let prev = null;
    for (let i = 0; i <= steps; i++) {
      const a  = start + frac * 2 * Math.PI * (i / steps);
      const px = cx + r * Math.cos(a);
      const py = cy + r * Math.sin(a);
      if (prev) doc.line(prev[0], prev[1], px, py);
      prev = [px, py];
    }
  }

  // Centre text
  doc.setTextColor(P.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(`${Math.round(Number(pct) || 0)}%`, cx, cy + 1.5, { align: 'center' });

  if (label) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.setTextColor(P.gray);
    doc.text(label.toUpperCase(), cx, cy + r + 5, { align: 'center' });
  }
}

// ── Filled Area (score trend) ─────────────────────────────────────────────────
function drawAreaChart(doc, x, y, w, h, values, colorHex) {
  const vals = (values || []).filter(v => Number.isFinite(Number(v)));
  if (vals.length < 2) return;
  const max   = Math.max(...vals, 1);
  const stepX = w / (vals.length - 1);
  const pts   = vals.map((v, i) => [x + i * stepX, y + h - (Number(v) / max) * h]);

  // Filled area (light tint)
  const hex2rgb = (hex) => [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  const [cr, cg, cb] = hex2rgb(colorHex);
  doc.setFillColor(cr, cg, cb);

  // Build fill polygon: points → bottom-right → bottom-left
  const fillPoints = [...pts, [pts[pts.length-1][0], y+h], [pts[0][0], y+h]];
  // jsPDF polygon
  doc.saveGraphicsState && doc.saveGraphicsState();
  try { doc.setGState(doc.GState({ opacity: 0.12 })); } catch {}
  doc.setFillColor(cr, cg, cb);
  // Simple rects stacking for fill effect (portable across jsPDF versions)
  for (let i = 0; i < pts.length - 1; i++) {
    const x1 = pts[i][0], y1 = pts[i][1];
    const x2 = pts[i+1][0], y2 = pts[i+1][1];
    const top = Math.min(y1, y2);
    const bot = y + h;
    doc.rect(x1, top, x2 - x1, bot - top, 'F');
  }
  try { doc.setGState(doc.GState({ opacity: 1.0 })); } catch {}
  doc.restoreGraphicsState && doc.restoreGraphicsState();

  // Line
  doc.setDrawColor(colorHex);
  doc.setLineWidth(0.85);
  for (let i = 1; i < pts.length; i++) doc.line(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);

  // Dots + value labels
  pts.forEach((p, i) => {
    // dot
    doc.setFillColor(colorHex);
    doc.circle(p[0], p[1], 1.1, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(p[0], p[1], 0.5, 'F');
    // label above dot
    if (vals.length <= 12) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(P.ink);
      doc.text(`${Math.round(vals[i])}%`, p[0], p[1] - 2.2, { align: 'center' });
    }
  });
}

// ── Attendance Heatmap ────────────────────────────────────────────────────────
// heatmap: array of { date, present, late, total }
function drawAttendanceHeatmap(doc, x, y, w, heatmap) {
  if (!heatmap || !heatmap.length) return y;

  const cellSz = 3.4, gap = 0.7, colW = cellSz + gap;
  const daysOfWeek = ['M','T','W','T','F','S','S'];
  const weeks = Math.min(14, Math.ceil(heatmap.length / 7));
  const totalW = 7 * colW;
  const startX = x + (w - totalW) / 2;

  // Day labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(P.gray);
  daysOfWeek.forEach((d, i) => {
    doc.text(d, startX + i * colW + cellSz / 2, y, { align: 'center' });
  });
  y += 3;

  // Cells
  heatmap.slice(0, weeks * 7).forEach((day, i) => {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const cx  = startX + col * colW;
    const cy  = y + row * colW;

    if ((day.present || 0) > 0)      doc.setFillColor(P.present);
    else if ((day.late || 0) > 0)    doc.setFillColor(P.late);
    else if ((day.total || 0) > 0)   doc.setFillColor(P.absent);
    else                              doc.setFillColor(P.noClass);

    doc.roundedRect(cx, cy, cellSz, cellSz, 0.6, 0.6, 'F');
  });

  // Legend
  const legendY = y + weeks * colW + 3;
  const legendItems = [
    { color: P.present, label: 'Present' },
    { color: P.late,    label: 'Late'    },
    { color: P.absent,  label: 'Absent'  },
    { color: P.noClass, label: 'No class'},
  ];
  let lx = x;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  legendItems.forEach(li => {
    doc.setFillColor(li.color);
    doc.roundedRect(lx, legendY, 4, 4, 0.8, 0.8, 'F');
    doc.setTextColor(P.gray);
    doc.text(li.label, lx + 5.5, legendY + 3);
    lx += 5.5 + doc.getTextWidth(li.label) + 5;
  });

  return legendY + 8;
}

// ── Horizontal Subject Bars ───────────────────────────────────────────────────
function drawSubjectBars(doc, x, y, w, radar) {
  if (!radar || !radar.length) return y;
  const barH = 5, gap = 5.5, labelW = 38, valW = 13;
  const barW = w - labelW - valW;

  radar.forEach((r, i) => {
    const ry = y + i * (barH + gap);
    const pct = Math.max(0, Math.min(100, r.test_avg || 0));

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(P.ink);
    doc.text((r.subject || '').slice(0, 18), x, ry + barH - 0.5);

    // Track
    doc.setFillColor(P.border);
    doc.roundedRect(x + labelW, ry, barW, barH, 1, 1, 'F');

    // Score bar
    if (pct > 0) {
      scoreFillColor(doc, pct);
      doc.roundedRect(x + labelW, ry, barW * (pct / 100), barH, 1, 1, 'F');
    }

    // Sub-bar for attendance (teal, offset)
    const attPct = Math.max(0, Math.min(100, r.attendance_pct || 0));
    if (attPct > 0) {
      doc.setFillColor(P.teal[0], P.teal[1], P.teal[2]);
      doc.setFillColor(20, 184, 166);
      const attBarY = ry + barH + 0.5;
      doc.setFillColor(P.noClass);
      doc.roundedRect(x + labelW, attBarY, barW, 2.5, 0.5, 0.5, 'F');
      doc.setFillColor(20, 184, 166);
      doc.roundedRect(x + labelW, attBarY, barW * (attPct / 100), 2.5, 0.5, 0.5, 'F');
    }

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    scoreTextColor(doc, pct);
    doc.text(`${Math.round(pct)}%`, x + labelW + barW + 2, ry + barH - 0.5);
  });

  // Legend
  const legendY = y + radar.length * (barH + gap) + 2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.5);
  doc.setFillColor(P.good);
  doc.roundedRect(x, legendY, 4, 2.5, 0.5, 0.5, 'F');
  doc.setTextColor(P.gray);
  doc.text('Avg Score', x + 5.5, legendY + 2);
  doc.setFillColor(20, 184, 166);
  doc.roundedRect(x + 28, legendY, 4, 2.5, 0.5, 0.5, 'F');
  doc.text('Attendance', x + 33.5, legendY + 2);

  return legendY + 8;
}

// ── Progress Pill ─────────────────────────────────────────────────────────────
function drawProgressPill(doc, x, y, w, pct, colorHex, label, value) {
  const barH = 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(P.ink);
  doc.text(label, x, y + barH - 0.5);

  const labelWidth = 36;
  const valWidth   = 14;
  const bw = w - labelWidth - valWidth;

  doc.setFillColor(P.border);
  doc.roundedRect(x + labelWidth, y, bw, barH, 1, 1, 'F');
  const p = Math.max(0, Math.min(100, Number(pct) || 0));
  if (p > 0) {
    const [r2,g2,b2] = colorHex;
    doc.setFillColor(r2, g2, b2);
    doc.roundedRect(x + labelWidth, y, bw * (p / 100), barH, 1, 1, 'F');
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(P.gray);
  doc.text(value, x + labelWidth + bw + 2, y + barH - 0.5);

  return y + barH + 4;
}

// ── Score-trend strip (ring + area chart) ─────────────────────────────────────
function drawScoreTrendStrip(doc, y, trendScores, avgPct) {
  if (trendScores.length < 2) return y;
  const W     = pageW(doc);
  const cardH = 34;
  y = ensurePageSpace(doc, y, cardH + 8);

  doc.setFillColor(P.light);
  doc.roundedRect(MARGIN, y, W - 2 * MARGIN, cardH, 3, 3, 'F');

  // Ring gauge left
  drawRingGauge(doc, MARGIN + 14, y + cardH / 2, 11, avgPct, P.good, 'Score');

  // Chart right
  const chartX = MARGIN + 34;
  const chartW = W - 2 * MARGIN - 38;
  const chartH = cardH - 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(P.ink);
  doc.text('Score Trend', chartX, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(P.gray);
  doc.text(`${trendScores.length} exam${trendScores.length !== 1 ? 's' : ''}`, chartX, y + 10.5);

  // Baseline
  doc.setDrawColor(P.border);
  doc.setLineWidth(0.3);
  doc.line(chartX, y + cardH - 5, chartX + chartW, y + cardH - 5);

  drawAreaChart(doc, chartX, y + 12, chartW - 4, cardH - 18, trendScores, P.good);

  return y + cardH + 8;
}

// ── autotable defaults ────────────────────────────────────────────────────────
const TABLE_DEFAULTS = {
  theme: 'plain',
  headStyles: {
    fillColor:  P.indigo,
    textColor:  [255, 255, 255],
    fontStyle:  'bold',
    fontSize:    8,
    cellPadding: 3,
  },
  alternateRowStyles: { fillColor: [248, 247, 245] },
  bodyStyles: { fontSize: 8, cellPadding: 2.5 },
  margin: { left: MARGIN, right: MARGIN, bottom: 18 },
};

// ── Activity Summary ──────────────────────────────────────────────────────────
function computeStreak(data) {
  const activeDays = new Set();
  (data?.attendance_heatmap || []).forEach(d => { if ((d.present||0)+(d.late||0) > 0) activeDays.add(d.date); });
  (data?.test_heatmap        || []).forEach(d => { if ((d.count||0) > 0) activeDays.add(d.date); });
  (data?.video_heatmap       || []).forEach(d => { if ((d.minutes||0) > 0) activeDays.add(d.date); });
  (data?.assignment_heatmap  || []).forEach(d => { if ((d.count||0) > 0) activeDays.add(d.date); });
  const dayId = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let cur = 0;
  const cursor = new Date();
  if (!activeDays.has(dayId(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayId(cursor))) { cur++; cursor.setDate(cursor.getDate() - 1); }
  return cur;
}

function periodAverageScore(data, student, period) {
  if (period === 'overall') return student.avg_score;
  const scores = (data?.test_timeline || []).map(t => Number(t.score_pct)).filter(n => Number.isFinite(n));
  return scores.length ? scores.reduce((a,b) => a+b, 0) / scores.length : null;
}

function periodAttendance(data, student, period) {
  if (period === 'overall') return student.attendance_pct;
  const radar = data?.subject_radar || [];
  const total = radar.reduce((s,r) => s + (r.att_total||0), 0);
  if (!total) return null;
  return radar.reduce((s,r) => s + (r.attendance_pct||0)*(r.att_total||0), 0) / total;
}

// ── Guidance text ─────────────────────────────────────────────────────────────
function reportGuidanceText(avgScore, atRisk, improvement) {
  const s = Math.round(avgScore || 0);
  const lines = [];
  if (s >= 90) {
    lines.push('Outstanding academic performance! You are consistently scoring at the top of the class.');
    lines.push('Challenge yourself further by exploring advanced topics and helping your peers.');
  } else if (s >= 70) {
    lines.push(`Great work maintaining an average of ${s}%! You are performing well above expectations.`);
    lines.push('Focus on your weaker subjects (highlighted above) to push into the top tier.');
  } else if (s >= 50) {
    lines.push(`You have a solid foundation with a ${s}% average. Consistency is key to improvement.`);
    lines.push('Review subject-level breakdowns above and prioritise re-watching videos for low-scoring topics.');
  } else if (s >= 35) {
    lines.push(`Your current average is ${s}%. There is significant room for growth — and you can absolutely get there.`);
    lines.push('Attend all live classes, submit assignments on time, and retake tests to rebuild confidence.');
  } else {
    lines.push(`Your average of ${s}% tells us you need extra support right now. That is completely okay.`);
    lines.push('Please speak with your teacher and set a daily study routine. Small consistent steps lead to big results.');
  }
  if (atRisk) {
    lines.push('');
    lines.push('⚠️  Attendance below 75% is flagged. Low attendance directly impacts learning and exam readiness.');
  }
  if (improvement != null) {
    lines.push('');
    if (improvement >= 5)       lines.push(`📈  Excellent progress! Your score improved by +${improvement}% compared to earlier exams.`);
    else if (improvement >= 0)  lines.push(`📊  Your score is stable. Keep pushing for consistent improvement each exam.`);
    else                        lines.push(`📉  Your score dipped by ${Math.abs(improvement)}% recently. Revisit missed concepts and seek teacher feedback.`);
  }
  return lines;
}

function examGuidanceText({ score_pct, flagged, terminated, correct_count, wrong_count, total_questions }) {
  const lines = [];
  if (terminated) {
    lines.push('This exam was terminated due to a security policy violation. Your score has been recorded as 0.');
    lines.push('Please speak with your teacher for guidance on the next steps.');
    return lines;
  }
  const s = Math.round(score_pct || 0);
  if (s >= 90) {
    lines.push(`🌟 Outstanding! You answered ${correct_count || 0} out of ${total_questions || '?'} questions correctly — an incredible result.`);
    if (s === 100) lines.push('🎉 Perfect score! You have completely mastered this topic. Well done!');
    else lines.push('Keep up this standard and challenge yourself with even harder material.');
  } else if (s >= 70) {
    lines.push(`✅ Great performance with a score of ${s}%. You answered ${correct_count || 0} questions correctly.`);
    lines.push(`Review the ${wrong_count || 0} incorrect answers highlighted in red above to reach excellence.`);
  } else if (s >= 50) {
    lines.push(`📈 Decent effort — ${s}%. You have the foundation, but the ${wrong_count || 0} wrong answers show gaps in some areas.`);
    lines.push('Revisit lesson videos and notes for the questions you got wrong before the next test.');
  } else if (s >= 35) {
    lines.push(`📚 You scored ${s}% — there is clear room to grow. Study the correct answers shown above carefully.`);
    lines.push('Consider requesting a reattempt from your teacher after revising the relevant topics.');
  } else {
    lines.push(`💪 Don't be discouraged by a ${s}% score. Every exam is a learning opportunity, not a final verdict.`);
    lines.push(`You answered ${correct_count || 0} correctly. Focus on those topics and ask your teacher for help with the rest.`);
  }
  if (flagged && !terminated) {
    lines.push('');
    lines.push('⚠️  Integrity Alert: Suspicious activity was detected during this exam. Your teacher has been notified.');
    lines.push('In future tests, ensure you are in a quiet environment with no other apps or tabs open.');
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF 1 — STUDENT OVERALL REPORT CARD
// ─────────────────────────────────────────────────────────────────────────────
export async function buildStudentReportPdf({ data, period = 'overall' }) {
  if (!data) return;
  const { JsPDF, autoTable } = await loadJsPdf();
  const brand = getBranding();
  const s     = data.student || {};

  const [logo, photo] = await Promise.all([
    fetchImageDataURL(brand.logoUrl),
    fetchImageDataURL(s.avatar_url),
  ]);

  const doc  = new JsPDF({ compress: true });
  const W    = pageW(doc);

  const avgForPeriod  = periodAverageScore(data, s, period);
  const attForPeriod  = periodAttendance(data, s, period);
  const grade         = gradeFor(avgForPeriod ?? s.avg_score);
  const streak        = computeStreak(data);
  const radar         = data.subject_radar || [];
  const timeline      = data.test_timeline || [];
  const assignments   = data.assignment_scores || [];
  const liveStats     = data.live_classes_stats || {};
  const assignStats   = data.assignment_stats || {};
  const displayPoints = data.period_points ?? s.points ?? 0;

  const totalVids = radar.reduce((a,r) => a+(r.video_total||0), 0);
  const doneVids  = radar.reduce((a,r) => a+(r.video_done||0),  0);
  const videoPct  = totalVids > 0 ? Math.round((doneVids/totalVids)*100) : null;
  const assignPct = assignStats.total > 0 ? Math.round((assignStats.submitted/assignStats.total)*100) : null;

  // ── Header
  let y = drawGradientHeader(doc, {
    brandName:   brand.name,
    logo,
    leftTitle:   periodTitle(period),
    leftSubtitle: periodRange(period),
    student:     s,
    photo,
    gradeLabel:  `${grade.grade}  ·  ${grade.label}`,
    rightChip:   data.rank ? `Rank  ${data.rank} / ${data.total_students}` : null,
  });

  // ── KPI Strip
  y = drawKpiStrip(doc, [
    { label: period === 'overall' ? 'Avg Score'    : 'Period Score', value: pctText(avgForPeriod ?? s.avg_score), color: P.indigo },
    { label: 'Attendance',  value: pctText(attForPeriod ?? s.attendance_pct), color: P.teal    },
    { label: 'Class Rank',  value: data.rank ? `${data.rank} / ${data.total_students}` : NO_DATA, color: P.amber  },
    { label: period === 'overall' ? 'Points' : 'Period Pts', value: valueText(displayPoints),    color: P.violet  },
    { label: 'Videos',      value: videoPct != null ? `${videoPct}%` : NO_DATA,                  color: P.rose    },
    { label: 'Assignments', value: assignPct != null ? `${assignPct}%` : NO_DATA,                color: P.emerald },
    { label: 'Live Classes',value: liveStats.total > 0 ? `${Math.round(liveStats.attendance_pct||0)}%` : NO_DATA, color: P.indigo },
    { label: 'Study Streak',value: `${streak}d`,                                                 color: P.amber   },
  ], y);

  // ── Score Trend
  const trendScores = [...timeline]
    .sort((a,b) => (a.date||'').localeCompare(b.date||''))
    .map(t => Math.round(Number(t.score_pct)||0))
    .filter(n => Number.isFinite(n));

  if (trendScores.length >= 2) {
    y = sectionHeading(doc, 'Score Trend', y, P.indigo);
    y = drawScoreTrendStrip(doc, y, trendScores, avgForPeriod ?? s.avg_score ?? 0);
  }

  // ── Attendance Heatmap
  const heatmap = data.attendance_heatmap || [];
  if (heatmap.length) {
    y = sectionHeading(doc, 'Attendance Calendar', y, P.teal);
    y = drawAttendanceHeatmap(doc, MARGIN, y, W - 2 * MARGIN, heatmap);
  }

  // ── Subject Performance Bars
  if (radar.length) {
    y = sectionHeading(doc, 'Subject Performance', y, P.violet);
    y = ensurePageSpace(doc, y, radar.length * 11 + 20);
    y = drawSubjectBars(doc, MARGIN, y, W - 2 * MARGIN, radar);
  }

  // ── Activity Progress Bars
  y = sectionHeading(doc, 'Activity Overview', y, P.emerald);
  y = ensurePageSpace(doc, y, 50);
  const attTotal   = (data?.attendance_heatmap||[]).reduce((s,d)=>s+(d.total||0),0);
  const attPresent = (data?.attendance_heatmap||[]).reduce((s,d)=>s+(d.present||0)+(d.late||0),0);
  if (attTotal) y = drawProgressPill(doc, MARGIN, y, W-2*MARGIN, (attPresent/attTotal)*100, P.teal,    'Attendance',      `${attPresent}/${attTotal} sessions`,      );
  if (videoPct  != null) y = drawProgressPill(doc, MARGIN, y, W-2*MARGIN, videoPct,  P.indigo,  'Videos Watched',  `${doneVids}/${totalVids} videos`              );
  if (assignPct != null) y = drawProgressPill(doc, MARGIN, y, W-2*MARGIN, assignPct, P.emerald, 'Assignments',     `${assignStats.submitted}/${assignStats.total} submitted` );
  if (liveStats.total) {
    const livePct = Math.round((liveStats.attended||0)/liveStats.total*100);
    y = drawProgressPill(doc, MARGIN, y, W-2*MARGIN, livePct, P.rose, 'Live Classes', `${liveStats.attended||0}/${liveStats.total} attended`);
  }
  y += 4;

  // ── Ring gauges row (visual summary)
  y = ensurePageSpace(doc, y, 44);
  const rings = [
    { label: 'Score',        pct: avgForPeriod ?? s.avg_score ?? 0, color: P.good  },
    { label: 'Attendance',   pct: attForPeriod ?? s.attendance_pct ?? 0, color: '#14b8a6' },
    { label: 'Videos',       pct: videoPct ?? 0,   color: '#6366f1'  },
    { label: 'Assignments',  pct: assignPct ?? 0,  color: '#10b981'  },
    { label: 'Live Classes', pct: liveStats.total > 0 ? Math.round((liveStats.attendance_pct||0)) : 0, color: '#f43f5e' },
  ].filter(r => r.pct >= 0);

  const ringSpacing = (W - 2 * MARGIN) / rings.length;
  rings.forEach((r, i) => {
    const cx = MARGIN + ringSpacing * i + ringSpacing / 2;
    drawRingGauge(doc, cx, y + 16, 13, r.pct, r.color, r.label);
  });
  y += 44;

  // ── Exam History Table
  if (timeline.length) {
    y = sectionHeading(doc, `Exam & Test History  (${timeline.length})`, y, P.amber);
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Date', 'Exam / Test', 'Subject', 'Score', 'Marks', 'Rank', 'Status']],
      body: [...timeline]
        .sort((a,b) => (b.date||'').localeCompare(a.date||''))
        .map(t => [
          fmtDate(t.date),
          t.test_title || 'Test',
          t.subject    || NO_DATA,
          pctText(t.score_pct),
          t.score != null && t.total_marks != null ? `${Math.round(t.score)} / ${t.total_marks}` : NO_DATA,
          t.rank && t.total_attempts ? `${t.rank} / ${t.total_attempts}` : NO_DATA,
          t.flagged ? '⚠ Flagged' : 'Completed',
        ]),
      columnStyles: {
        0: { cellWidth: 22 },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      },
      didParseCell(data2) {
        if (data2.section === 'body' && data2.column.index === 3) {
          const pct = parseInt(data2.cell.raw || 0);
          if      (pct >= 70) data2.cell.styles.textColor = [16, 185, 129];
          else if (pct >= 40) data2.cell.styles.textColor = [217, 119, 6];
          else                data2.cell.styles.textColor = [220, 38,  38];
          data2.cell.styles.fontStyle = 'bold';
        }
        if (data2.section === 'body' && data2.column.index === 6) {
          if (String(data2.cell.raw).includes('Flagged')) {
            data2.cell.styles.textColor = [220, 38, 38];
            data2.cell.styles.fontStyle = 'bold';
          }
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Assignments Table
  if (assignments.length) {
    y = sectionHeading(doc, `Assignments  (${assignments.length})`, y, P.rose);
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Assignment', 'Subject', 'Status', 'Marks', 'Points']],
      body: assignments.map(a => {
        const submitted = Boolean(a.submitted_at || a.graded_at || a.marks_obtained != null);
        const graded    = a.marks_obtained != null;
        return [
          a.assignment_title || 'Assignment',
          a.subject_name     || NO_DATA,
          graded ? 'Graded' : submitted ? 'Submitted' : 'Pending',
          graded ? pctText(a.marks_obtained) : NO_DATA,
          valueText(a.points_earned),
        ];
      }),
      columnStyles: { 0: { cellWidth: 60 }, 4: { halign: 'center' } },
      didParseCell(data2) {
        if (data2.section === 'body' && data2.column.index === 2) {
          if (data2.cell.raw === 'Graded')    data2.cell.styles.textColor = [16, 185, 129];
          if (data2.cell.raw === 'Pending')   data2.cell.styles.textColor = [245, 158, 11];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Performance vs Class Average
  if (data.class_averages) {
    const ca = data.class_averages;
    y = sectionHeading(doc, 'You vs Class Average', y, P.indigo);
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Metric', 'You', 'Class Avg', 'Δ']],
      body: [
        ['Avg Score',    pctText(avgForPeriod ?? s.avg_score),         pctText(ca.avg_score),    delta(avgForPeriod ?? s.avg_score, ca.avg_score)],
        ['Attendance',   pctText(attForPeriod ?? s.attendance_pct),    pctText(ca.attendance_pct), delta(attForPeriod ?? s.attendance_pct, ca.attendance_pct)],
        ['Videos',       videoPct != null ? `${videoPct}%` : NO_DATA, pctText(ca.video_pct),    delta(videoPct, ca.video_pct)],
        ['Points',       valueText(displayPoints),                     valueText(round(ca.points,0)), NO_DATA],
        ['Topic Mastery',pctText(data.topic_mastery_pct),              pctText(ca.mastery),      delta(data.topic_mastery_pct, ca.mastery)],
      ],
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 40 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      didParseCell(data2) {
        if (data2.section === 'body' && data2.column.index === 3) {
          const v = String(data2.cell.raw || '');
          if (v.startsWith('+')) data2.cell.styles.textColor = [16, 185, 129];
          if (v.startsWith('-')) data2.cell.styles.textColor = [220, 38, 38];
          data2.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Guidance
  y = sectionHeading(doc, 'Guidance & Insights', y, P.violet);
  y = ensurePageSpace(doc, y, 30);

  const sortedTests = [...timeline].sort((a,b) => (a.date||'').localeCompare(b.date||''));
  let improvement = null;
  if (sortedTests.length >= 4) {
    const mid    = Math.floor(sortedTests.length / 2);
    const avgOf  = arr => arr.reduce((a,t) => a+(t.score_pct||0),0) / (arr.length||1);
    improvement  = Math.round(avgOf(sortedTests.slice(mid)) - avgOf(sortedTests.slice(0,mid)));
  }
  const atRisk = (attForPeriod ?? s.attendance_pct ?? 100) < 75;
  const lines  = reportGuidanceText(avgForPeriod ?? s.avg_score ?? 0, atRisk, improvement);

  // Guidance box
  const boxH = lines.length * 5.5 + 10;
  doc.setFillColor(240, 238, 255);
  doc.roundedRect(MARGIN, y, W - 2 * MARGIN, boxH, 3, 3, 'F');
  doc.setFillColor(P.hdrFrom[0], P.hdrFrom[1], P.hdrFrom[2]);
  doc.roundedRect(MARGIN, y, 3, boxH, 1, 1, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(P.ink);
  lines.forEach((line, i) => {
    doc.text(line, MARGIN + 7, y + 7 + i * 5.5);
  });
  y += boxH + 8;

  drawFooters(doc, brand.name);
  const pText = period ? period.charAt(0).toUpperCase() + period.slice(1) : 'Overall';
  doc.save(`${(s.name || 'Student').replace(/\s+/g,'_')}_Report_${pText}.pdf`);
}

// Helper — delta label
function delta(a, b) {
  const n1 = Number(a), n2 = Number(b);
  if (!Number.isFinite(n1) || !Number.isFinite(n2)) return NO_DATA;
  const d = Math.round(n1 - n2);
  return d > 0 ? `+${d}%` : d < 0 ? `${d}%` : '0%';
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF 2 — EXAM RESULT SHEET
// ─────────────────────────────────────────────────────────────────────────────
// reviewData: { questions: [...], answers: { [questionId]: idx } }
// result    : { score, total_marks, percentage, correct_count, wrong_count,
//               marks_deducted, total, flagged, cancelled, testTitle,
//               points_earned, started_at, submitted_at }
// student   : { name, student_code, standard_name, avatar_url, username }
// testMeta  : { title, subject_name, duration_mins, total_marks, scheduled_for }
export async function buildExamResultPdf({ reviewData, result, student, testMeta }) {
  if (!result) return;

  const { JsPDF, autoTable } = await loadJsPdf();
  const brand = getBranding();
  const s     = student || {};

  const [logo, photo] = await Promise.all([
    fetchImageDataURL(brand.logoUrl),
    fetchImageDataURL(s.avatar_url),
  ]);

  const doc = new JsPDF({ compress: true });
  const W   = pageW(doc);

  const score_pct    = result.percentage ?? (result.total_marks ? Math.round((result.score/result.total_marks)*100) : 0);
  const grade        = gradeFor(score_pct);
  const correct      = result.correct_count || 0;
  const wrong        = result.wrong_count   || 0;
  const total_q      = result.total          || (correct + wrong) || reviewData?.questions?.length || 0;
  const skipped      = Math.max(0, total_q - correct - wrong);
  const flagged      = result.flagged        || false;
  const terminated   = result.cancelled      || false;
  const testTitle    = testMeta?.title        || result.testTitle || 'Exam';
  const subjectName  = testMeta?.subject_name || '';
  const durationMins = testMeta?.duration_mins || null;
  const totalMarks   = testMeta?.total_marks   || result.total_marks || null;

  // Time calculation
  let timeTaken = null;
  if (result.started_at && result.submitted_at) {
    const ms = new Date(result.submitted_at) - new Date(result.started_at);
    if (ms > 0) {
      const mins = Math.floor(ms / 60000);
      const secs = Math.floor((ms % 60000) / 1000);
      timeTaken  = `${mins}m ${secs}s`;
    }
  }

  // ── Header
  let y = drawGradientHeader(doc, {
    brandName:   brand.name,
    logo,
    leftTitle:   testTitle,
    leftSubtitle: [subjectName, testMeta?.scheduled_for ? fmtDate(testMeta.scheduled_for) : fmtDate(new Date().toISOString())].filter(Boolean).join('  ·  '),
    student:     s,
    photo,
    gradeLabel:  `${grade.grade}  ·  ${grade.label}`,
    rightChip:   result.rank ? `Rank  ${result.rank} / ${result.total_attempts || '?'}` : null,
  });

  // ── Score Hero Band
  y = ensurePageSpace(doc, y, 36);
  const heroH = 32;
  // Background
  doc.setFillColor(P.light);
  doc.roundedRect(MARGIN, y, W - 2*MARGIN, heroH, 3, 3, 'F');

  const heroCards = [
    { label: 'Score',   value: totalMarks ? `${Math.round(result.score||0)} / ${totalMarks}` : `${Math.round(score_pct)}%` },
    { label: 'Percent', value: `${Math.round(score_pct)}%` },
    { label: 'Grade',   value: `${grade.grade}` },
    { label: 'Rank',    value: result.rank ? `${result.rank} / ${result.total_attempts||'?'}` : NO_DATA },
  ];
  const heroCardW = (W - 2*MARGIN) / heroCards.length;

  heroCards.forEach((c, i) => {
    const hx  = MARGIN + i * heroCardW;
    // Divider
    if (i > 0) {
      doc.setDrawColor(P.border);
      doc.setLineWidth(0.3);
      doc.line(hx, y+4, hx, y+heroH-4);
    }
    // Value
    const color = i === 0 ? (score_pct >= 70 ? P.good : score_pct >= 40 ? P.mid : P.bad) : P.ink;
    doc.setTextColor(color);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 0 ? 16 : 14);
    doc.text(c.value, hx + heroCardW/2, y + 15, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(P.gray);
    doc.text(c.label.toUpperCase(), hx + heroCardW/2, y + 22, { align: 'center' });
  });
  y += heroH + 8;

  // ── Stats mini-cards row
  const statCards = [
    { icon: '✅', label: 'Correct',  value: String(correct), color: P.good    },
    { icon: '❌', label: 'Wrong',    value: String(wrong),   color: P.bad     },
    { icon: '—',  label: 'Skipped',  value: String(skipped), color: P.gray    },
    { icon: '⏱',  label: 'Time',     value: timeTaken || NO_DATA, color: '#6366f1' },
    { icon: '📝', label: 'Questions',value: String(total_q), color: P.mid     },
    { icon: '⭐', label: 'Points',   value: String(result.points_earned || 0), color: '#f59e0b' },
  ];
  y = drawKpiStrip(doc, statCards.map(sc => ({ label: sc.label, value: sc.value, color: sc.color === P.good ? P.emerald : sc.color === P.bad ? P.rose : P.indigo })), y);

  // ── Integrity Alert (if flagged/terminated)
  if (flagged || terminated) {
    y = ensurePageSpace(doc, y, 22);
    const alertH = 18;
    doc.setFillColor(terminated ? 250 : 254, terminated ? 220 : 226, terminated ? 220 : 226);
    doc.roundedRect(MARGIN, y, W-2*MARGIN, alertH, 2, 2, 'F');
    doc.setFillColor(P.bad);
    doc.roundedRect(MARGIN, y, 3, alertH, 1, 1, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(P.bad);
    doc.text(terminated ? '⛔  Exam Terminated' : '⚠️  Integrity Alert', MARGIN + 7, y + 7.5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor('#7f1d1d');
    const alertMsg = terminated
      ? 'This exam was terminated (e.g. screenshot detected). Score recorded as 0. Contact your teacher.'
      : 'Suspicious activity was detected during this exam. Results have been flagged for teacher review.';
    doc.text(doc.splitTextToSize(alertMsg, W - 2*MARGIN - 12)[0], MARGIN + 7, y + 13.5);
    y += alertH + 8;
  }

  // ── Question Review Table
  const qs  = reviewData?.questions || [];
  const ans = reviewData?.answers   || {};

  if (qs.length > 0) {
    y = sectionHeading(doc, `Question Review  (${qs.length} questions)`, y, P.indigo);
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['#', 'Question', 'Your Answer', 'Correct Answer', '✓/✗']],
      body: qs.map((q, qi) => {
        const studentAns = ans[String(q.id)];
        const answered   = studentAns !== undefined && studentAns !== null;
        const isCorrect  = answered && studentAns === q.correct_idx;
        const isSkipped  = !answered;
        const opts       = q.options || [];
        const letters    = 'ABCDE';
        return [
          qi + 1,
          (q.question || '').slice(0, 90) + (q.question?.length > 90 ? '…' : ''),
          isSkipped ? '(skipped)' : `${letters[studentAns] || '?'}: ${(opts[studentAns] || '').slice(0, 30)}`,
          `${letters[q.correct_idx]}: ${(opts[q.correct_idx] || '').slice(0, 30)}`,
          isSkipped ? '–' : isCorrect ? '✓' : '✗',
        ];
      }),
      columnStyles: {
        0: { cellWidth: 8,  halign: 'center' },
        2: { cellWidth: 45 },
        3: { cellWidth: 45 },
        4: { cellWidth: 10, halign: 'center' },
      },
      didParseCell(data2) {
        if (data2.section !== 'body') return;
        const row = data2.row.index;
        const q   = qs[row];
        if (!q) return;
        const studentAns = ans[String(q.id)];
        const answered   = studentAns !== undefined && studentAns !== null;
        const isCorrect  = answered && studentAns === q.correct_idx;
        const isSkipped  = !answered;

        // Row tint
        if (data2.column.index === 4) {
          if      (isCorrect)  { data2.cell.styles.textColor = [16, 185, 129]; data2.cell.styles.fontStyle = 'bold'; }
          else if (isSkipped)  { data2.cell.styles.textColor = [156, 163, 175]; }
          else                 { data2.cell.styles.textColor = [220, 38,  38];  data2.cell.styles.fontStyle = 'bold'; }
        }
        if (!isCorrect && !isSkipped) {
          // Tint entire wrong row
          data2.cell.styles.fillColor = [255, 247, 247];
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // ── Guidance
  y = sectionHeading(doc, 'Teacher Guidance', y, P.violet);
  y = ensurePageSpace(doc, y, 30);
  const gLines = examGuidanceText({ score_pct, flagged, terminated, correct_count: correct, wrong_count: wrong, total_questions: total_q });
  const gBoxH  = gLines.length * 5.5 + 12;
  doc.setFillColor(240, 238, 255);
  doc.roundedRect(MARGIN, y, W-2*MARGIN, gBoxH, 3, 3, 'F');
  doc.setFillColor(P.hdrFrom[0], P.hdrFrom[1], P.hdrFrom[2]);
  doc.roundedRect(MARGIN, y, 3, gBoxH, 1, 1, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(P.ink);
  gLines.forEach((line, i) => {
    if (line) doc.text(line, MARGIN + 7, y + 8 + i * 5.5);
  });
  y += gBoxH + 4;

  drawFooters(doc, brand.name);
  const safeName  = (s.name || 'Student').replace(/\s+/g, '_');
  const safeTitle = testTitle.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30);
  doc.save(`${safeName}_${safeTitle}_Result.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Class Analytics PDF (teacher overview — unchanged signature, refreshed style)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildClassAnalyticsPdf({ analytics, standardName }) {
  if (!analytics) return;
  const { JsPDF, autoTable } = await loadJsPdf();
  const brand = getBranding();
  const logo  = await fetchImageDataURL(brand.logoUrl);

  const doc      = new JsPDF({ compress: true });
  const W        = pageW(doc);
  const overview = analytics.overview || {};

  let y = drawGradientHeader(doc, {
    brandName:   brand.name,
    logo,
    leftTitle:   'Class Analytics Report',
    leftSubtitle: standardName || '',
    student:     { name: standardName || 'Class', student_code: fmtDate(new Date().toISOString()) },
    photo:       null,
    gradeLabel:  null,
    rightChip:   `${overview.total_students || 0} Students`,
  });

  y = drawKpiStrip(doc, [
    { label: 'Students',     value: valueText(overview.total_students ?? 0), color: P.indigo },
    { label: 'Avg Score',    value: pctText(overview.avg_score    ?? 0),     color: P.teal   },
    { label: 'Avg Attend.',  value: pctText(overview.avg_attendance ?? 0),   color: P.emerald},
    { label: 'Total Points', value: valueText(overview.total_points ?? 0),   color: P.amber  },
  ], y);

  const students = [...(analytics.students || [])].sort((a,b) => (b.avg_score||0)-(a.avg_score||0));
  if (students.length) {
    y = sectionHeading(doc, 'Student Rankings', y, P.indigo);
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Rank', 'Student', 'Avg Score', 'Attendance', 'Points']],
      body: students.map((st, i) => [
        st.rank || i+1,
        st.name || NO_DATA,
        st.has_tests      ? pctText(st.avg_score)      : NO_DATA,
        st.has_attendance ? pctText(st.attendance_pct) : NO_DATA,
        valueText(st.points || 0),
      ]),
      columnStyles: {
        0: { cellWidth: 14, halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
      },
      didParseCell(data2) {
        if (data2.section === 'body' && data2.column.index === 2) {
          const pct = parseInt(data2.cell.raw || 0);
          if      (pct >= 70) data2.cell.styles.textColor = [16, 185, 129];
          else if (pct >= 40) data2.cell.styles.textColor = [217, 119, 6];
          else if (data2.cell.raw !== NO_DATA) data2.cell.styles.textColor = [220, 38, 38];
          if (data2.cell.raw !== NO_DATA) data2.cell.styles.fontStyle = 'bold';
        }
        if (data2.section === 'body' && data2.column.index === 0 && data2.row.index < 3) {
          data2.cell.styles.textColor  = [99, 102, 241];
          data2.cell.styles.fontStyle  = 'bold';
          data2.cell.styles.fontSize   = 10;
        }
      },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const subjectPerf = analytics.subject_performance || [];
  if (subjectPerf.length) {
    y = sectionHeading(doc, 'Subject Performance', y, P.teal);
    if (subjectPerf.length >= 2) {
      y = ensurePageSpace(doc, y, subjectPerf.length * 10 + 16);
      y = drawSubjectBars(doc, MARGIN, y, W - 2*MARGIN, subjectPerf.map(sp => ({
        subject:     sp.subject_name || '—',
        test_avg:    sp.avg_score    || 0,
        attendance_pct: sp.avg_attendance || 0,
      })));
    }
    autoTable(doc, {
      ...TABLE_DEFAULTS,
      startY: y,
      head: [['Subject', 'Avg Score', 'Avg Attendance']],
      body: subjectPerf.map(sp => [sp.subject_name || NO_DATA, pctText(sp.avg_score), pctText(sp.avg_attendance)]),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
    });
  }

  drawFooters(doc, brand.name);
  doc.save(`${(standardName||'Class').replace(/\s+/g,'_')}_Analytics_Report.pdf`);
}
