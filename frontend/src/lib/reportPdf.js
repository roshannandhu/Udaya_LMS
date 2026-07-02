// Shared branded PDF builders. Teacher and student report exports both go
// through this file so the downloaded PDFs and parent artifacts stay aligned.

import { useSettingsStore, DEFAULT_LMS_LOGO } from '../store';

const DARK = '#0f1014';
const INK = '#111111';
const GRAY = '#777777';
const LIGHT = '#F4F2EF';
const BORDER = '#EBEAE7';
const INDIGO = [99, 102, 241];
const MARGIN = 14; // mm
const NO_DATA = '-';

export function getBranding() {
  const s = useSettingsStore.getState();
  return {
    name: (s.lmsName || '').trim() || 'Udaya',
    logoUrl: s.lmsLogo || DEFAULT_LMS_LOGO,
  };
}

export async function fetchImageDataURL(url) {
  if (!url || typeof url !== 'string' || url.startsWith('preset:')) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), width: bitmap.width, height: bitmap.height };
  } catch {
    return null;
  }
}

const gradeFor = (score) => {
  const s = Math.round(score || 0);
  if (s >= 90) return { grade: 'A+', label: 'Outstanding' };
  if (s >= 80) return { grade: 'A', label: 'Excellent' };
  if (s >= 70) return { grade: 'B+', label: 'Very Good' };
  if (s >= 60) return { grade: 'B', label: 'Good' };
  if (s >= 50) return { grade: 'C', label: 'Average' };
  if (s >= 35) return { grade: 'D', label: 'Needs Work' };
  return { grade: 'E', label: 'At Risk' };
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return String(iso).slice(0, 10);
  }
};

const round = (value, fallback = null) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

const pctText = (value) => {
  const n = round(value);
  return n == null ? NO_DATA : `${n}%`;
};

const valueText = (value) => {
  if (value === null || value === undefined || value === '') return NO_DATA;
  return String(value);
};

const periodTitle = (period) => {
  if (period === 'weekly') return 'Weekly Report Card';
  if (period === 'monthly') return 'Monthly Report Card';
  return 'Student Report Card - Overall';
};

const periodRange = (period) => {
  const today = new Date();
  const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  if (period === 'weekly') {
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    return `${fmt(from)} - ${fmt(today)}`;
  }
  if (period === 'monthly') {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return `${fmt(from)} - ${fmt(today)}`;
  }
  return 'All time';
};

async function loadJsPdf() {
  const jsPDFModule = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const JsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
  return { JsPDF, autoTable };
}

function ensurePageSpace(doc, y, needed = 28) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed <= H - 20) return y;
  doc.addPage();
  return MARGIN + 6;
}

function initials(name) {
  const parts = String(name || 'Student').trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'S').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function fitImage(doc, image, x, y, boxW, boxH) {
  const r = Math.min(boxW / image.width, boxH / image.height);
  const w = image.width * r;
  const h = image.height * r;
  doc.addImage(image.dataUrl, 'PNG', x + (boxW - w) / 2, y + (boxH - h) / 2, w, h);
}

function drawHeader(doc, { brandName, logo, title, subtitle }) {
  const W = doc.internal.pageSize.getWidth();
  const bandH = 30;
  doc.setFillColor(DARK);
  doc.rect(0, 0, W, bandH, 'F');

  let x = MARGIN;
  if (logo) {
    const chip = 18;
    const chipY = (bandH - chip) / 2;
    doc.setFillColor('#ffffff');
    doc.roundedRect(x, chipY, chip, chip, 3, 3, 'F');
    fitImage(doc, logo, x + 1.5, chipY + 1.5, chip - 3, chip - 3);
    x += chip + 5;
  }

  const rightReserve = 58;
  const textW = Math.max(60, W - x - MARGIN - rightReserve);
  doc.setTextColor('#ffffff');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  const brandLine = doc.splitTextToSize(brandName || 'Udaya', textW)[0] || 'Udaya';
  doc.text(brandLine, x, bandH / 2 - 0.5);

  doc.setTextColor('#b9bcc7');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const sub = title + (subtitle ? ` | ${subtitle}` : '');
  const subLine = doc.splitTextToSize(sub, textW)[0] || sub;
  doc.text(subLine, x, bandH / 2 + 6);

  doc.setFontSize(8);
  doc.text(`Generated ${fmtDate(new Date().toISOString())}`, W - MARGIN, bandH / 2 + 6, { align: 'right' });
  return bandH + 10;
}

function drawFooters(doc, brandName) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(BORDER);
    doc.line(MARGIN, H - 12, W - MARGIN, H - 12);
    doc.setTextColor(GRAY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Generated by ${brandName || 'Udaya'} | ${fmtDate(new Date().toISOString())}`, MARGIN, H - 8);
    doc.text(`Page ${i} of ${n}`, W - MARGIN, H - 8, { align: 'right' });
  }
}

function drawPhotoOrInitials(doc, { photo, name, x, y, width, height }) {
  doc.setDrawColor(BORDER);
  doc.setFillColor('#ffffff');
  doc.roundedRect(x - 1, y - 1, width + 2, height + 2, 2, 2, 'FD');
  if (photo) {
    fitImage(doc, photo, x, y, width, height);
    return;
  }
  doc.setFillColor(LIGHT);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, 'F');
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(initials(name), x + width / 2, y + height / 2 + 2, { align: 'center' });
}

function drawKpiCards(doc, kpis, y) {
  if (!kpis.length) return y;
  const W = doc.internal.pageSize.getWidth();
  const gap = 4;
  const perRow = Math.min(kpis.length, 4);
  const rows = Math.ceil(kpis.length / perRow);
  const cardW = (W - 2 * MARGIN - gap * (perRow - 1)) / perRow;
  const cardH = 17;
  y = ensurePageSpace(doc, y, rows * cardH + (rows - 1) * gap + 10);

  kpis.forEach((k, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = MARGIN + col * (cardW + gap);
    const cy = y + row * (cardH + gap);
    doc.setFillColor(LIGHT);
    doc.roundedRect(x, cy, cardW, cardH, 2.5, 2.5, 'F');
    doc.setTextColor(INK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(doc.splitTextToSize(String(k.value), cardW - 8)[0] || NO_DATA, x + 4, cy + 8);
    doc.setTextColor(GRAY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(k.label.toUpperCase(), x + 4, cy + 13.5);
  });

  return y + rows * cardH + (rows - 1) * gap + 10;
}

const tableDefaults = {
  theme: 'striped',
  headStyles: { fillColor: INDIGO, fontStyle: 'bold' },
  alternateRowStyles: { fillColor: LIGHT },
  styles: { fontSize: 8.5, cellPadding: 2.2, overflow: 'linebreak', valign: 'middle' },
  margin: { left: MARGIN, right: MARGIN, bottom: 18 },
};

function sectionTitle(doc, text, y) {
  y = ensurePageSpace(doc, y, 18);
  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(text, MARGIN, y);
  return y + 4;
}

function computeStreak(data) {
  const activeDays = new Set();
  (data?.attendance_heatmap || []).forEach((d) => { if ((d.present || 0) + (d.late || 0) > 0) activeDays.add(d.date); });
  (data?.test_heatmap || []).forEach((d) => { if ((d.count || 0) > 0) activeDays.add(d.date); });
  (data?.video_heatmap || []).forEach((d) => { if ((d.minutes || 0) > 0) activeDays.add(d.date); });
  (data?.assignment_heatmap || []).forEach((d) => { if ((d.count || 0) > 0) activeDays.add(d.date); });
  const dayId = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  let current = 0;
  const cursor = new Date();
  if (!activeDays.has(dayId(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(dayId(cursor))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return current;
}

function periodAverageScore(data, student, period) {
  if (period === 'overall') return student.avg_score;
  const scores = (data?.test_timeline || [])
    .map((t) => Number(t.score_pct))
    .filter((n) => Number.isFinite(n));
  if (!scores.length) return null;
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function periodAttendance(data, student, period) {
  if (period === 'overall') return student.attendance_pct;
  const radar = data?.subject_radar || [];
  const total = radar.reduce((sum, r) => sum + (r.att_total || 0), 0);
  if (!total) return null;
  return radar.reduce((sum, r) => sum + (r.attendance_pct || 0) * (r.att_total || 0), 0) / total;
}

function activitySummaryRows(data) {
  const attendanceTotal = (data?.attendance_heatmap || []).reduce((sum, d) => sum + (d.total || 0), 0);
  const attendancePresent = (data?.attendance_heatmap || []).reduce((sum, d) => sum + (d.present || 0) + (d.late || 0), 0);
  const testCount = (data?.test_heatmap || []).reduce((sum, d) => sum + (d.count || 0), 0);
  const videoMinutes = (data?.video_heatmap || []).reduce((sum, d) => sum + (Number(d.minutes) || 0), 0);
  const videoSessions = (data?.video_heatmap || []).reduce((sum, d) => sum + (d.count || 0), 0);
  const assignmentCount = (data?.assignment_heatmap || []).reduce((sum, d) => sum + (d.count || 0), 0);
  const live = data?.live_classes_stats || {};
  return [
    ['Attendance Records', attendanceTotal ? `${attendancePresent}/${attendanceTotal} present or late` : NO_DATA],
    ['Tests Taken', testCount || NO_DATA],
    ['Video Study', videoSessions ? `${Math.round(videoMinutes)} min across ${videoSessions} sessions` : NO_DATA],
    ['Assignments Submitted', assignmentCount || NO_DATA],
    ['Live Classes', live.total ? `${live.attended || 0}/${live.total} attended` : NO_DATA],
  ];
}

export async function buildStudentReportPdf({ data, period = 'overall' }) {
  if (!data) return;
  const { JsPDF, autoTable } = await loadJsPdf();
  const brand = getBranding();
  const s = data.student || {};
  const [logo, photo] = await Promise.all([
    fetchImageDataURL(brand.logoUrl),
    fetchImageDataURL(s.avatar_url),
  ]);

  const doc = new JsPDF();
  const W = doc.internal.pageSize.getWidth();

  let y = drawHeader(doc, {
    brandName: brand.name,
    logo,
    title: periodTitle(period),
    subtitle: periodRange(period),
  });

  const avgForPeriod = periodAverageScore(data, s, period);
  const attendanceForPeriod = periodAttendance(data, s, period);
  const grade = gradeFor(avgForPeriod ?? s.avg_score);

  const photoW = 24;
  const photoH = 28;
  const px = W - MARGIN - photoW;
  drawPhotoOrInitials(doc, { photo, name: s.name, x: px, y: y - 5, width: photoW, height: photoH });

  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(doc.splitTextToSize(s.name || 'Student', W - 2 * MARGIN - photoW - 10), MARGIN, y + 2);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(GRAY);
  const idBits = [];
  if (s.student_code) idBits.push(`Student ID: ${s.student_code}`);
  if (s.standard_name) idBits.push(s.standard_name);
  if (s.username) idBits.push(`@${s.username}`);
  if (idBits.length) {
    doc.text(doc.splitTextToSize(idBits.join(' | '), W - 2 * MARGIN - photoW - 10), MARGIN, y);
    y += 6;
  }

  doc.setTextColor(INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Grade: ${grade.grade} (${grade.label})`, MARGIN, y);
  y = Math.max(y + 9, 40 + photoH + 3);

  const radar = data.subject_radar || [];
  const totalVids = radar.reduce((a, r) => a + (r.video_total || 0), 0);
  const doneVids = radar.reduce((a, r) => a + (r.video_done || 0), 0);
  const videoPct = totalVids > 0 ? Math.round((doneVids / totalVids) * 100) : null;
  const assignStats = data.assignment_stats || {};
  const assignPct = assignStats.total > 0 ? Math.round((assignStats.submitted / assignStats.total) * 100) : null;
  const liveStats = data.live_classes_stats || {};
  const timeline = (data.test_timeline || []).slice();
  const streak = computeStreak(data);
  const displayPoints = data.period_points ?? s.points ?? 0;

  y = drawKpiCards(doc, [
    { label: period === 'overall' ? 'Avg Score' : 'Period Score', value: pctText(avgForPeriod) },
    { label: 'Attendance', value: pctText(attendanceForPeriod) },
    { label: 'Class Rank', value: data.rank ? `${data.rank} / ${data.total_students}` : NO_DATA },
    { label: period === 'overall' ? 'Points' : 'Period Points', value: valueText(displayPoints) },
    { label: 'Videos Watched', value: videoPct != null ? `${videoPct}%` : NO_DATA },
    { label: 'Assignments', value: assignPct != null ? `${assignPct}%` : NO_DATA },
    { label: 'Live Classes', value: liveStats.total > 0 ? `${Math.round(liveStats.attendance_pct || 0)}%` : NO_DATA },
    { label: 'Study Streak', value: `${streak} day${streak === 1 ? '' : 's'}` },
  ], y);

  y = sectionTitle(doc, 'Student Details', y);
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [],
    body: [
      ['Student ID', valueText(s.student_code)],
      ['Standard', valueText(s.standard_name)],
      ['Username', s.username ? `@${s.username}` : NO_DATA],
      ['Email', valueText(s.email)],
      ['Report Period', `${periodTitle(period)} (${periodRange(period)})`],
      ['Grade', `${grade.grade} - ${grade.label}`],
      ['Last Active', s.last_active_at ? fmtDate(s.last_active_at) : NO_DATA],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 42 }, 1: { cellWidth: 'auto' } },
  });
  y = doc.lastAutoTable.finalY + 10;

  y = sectionTitle(doc, 'Activity Summary', y);
  autoTable(doc, {
    ...tableDefaults,
    startY: y,
    head: [],
    body: activitySummaryRows(data),
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 } },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (radar.length > 0) {
    y = sectionTitle(doc, 'Subject Performance', y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Subject', 'Avg Score', 'Tests', 'Attendance', 'Videos', 'Assignments']],
      body: radar.map((r) => [
        r.subject || NO_DATA,
        r.test_count > 0 ? pctText(r.test_avg) : NO_DATA,
        r.test_count || 0,
        r.att_total > 0 ? pctText(r.attendance_pct) : NO_DATA,
        r.video_total > 0 ? `${r.video_done || 0}/${r.video_total}` : NO_DATA,
        r.assignment_total > 0 ? `${r.assignment_submitted || 0}/${r.assignment_total}` : NO_DATA,
      ]),
      columnStyles: { 0: { cellWidth: 42 }, 2: { halign: 'center' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (timeline.length > 0) {
    y = sectionTitle(doc, `Exams and Tests (${timeline.length})`, y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Date', 'Test', 'Subject', 'Score', 'Rank', 'Status']],
      body: timeline
        .slice()
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map((t) => [
          fmtDate(t.date),
          t.test_title || 'Test',
          t.subject || NO_DATA,
          pctText(t.score_pct),
          t.rank && t.total_attempts ? `${t.rank} of ${t.total_attempts}` : NO_DATA,
          t.flagged ? 'Flagged' : 'Completed',
        ]),
      columnStyles: { 0: { cellWidth: 24 }, 3: { halign: 'center' }, 4: { halign: 'center' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const assignments = data.assignment_scores || [];
  if (assignments.length > 0) {
    y = sectionTitle(doc, `Assignments (${assignments.length})`, y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Assignment', 'Subject', 'Status', 'Marks', 'Points']],
      body: assignments.map((a) => {
        const submitted = Boolean(a.submitted_at || a.graded_at || a.marks_obtained != null);
        const graded = a.marks_obtained != null;
        return [
          a.assignment_title || 'Assignment',
          a.subject_name || NO_DATA,
          graded ? 'Graded' : (submitted ? 'Submitted' : 'Pending'),
          graded ? pctText(a.marks_obtained) : NO_DATA,
          valueText(a.points_earned),
        ];
      }),
      columnStyles: { 0: { cellWidth: 56 }, 4: { halign: 'center' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  if (data.class_averages) {
    const ca = data.class_averages;
    y = sectionTitle(doc, 'Performance vs Class Average', y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Metric', 'Student', 'Class Average']],
      body: [
        ['Average Score', pctText(avgForPeriod ?? s.avg_score), pctText(ca.avg_score)],
        ['Attendance', pctText(attendanceForPeriod ?? s.attendance_pct), pctText(ca.attendance_pct)],
        ['Points', valueText(displayPoints), valueText(round(ca.points, 0))],
        ['Video Completion', videoPct != null ? `${videoPct}%` : NO_DATA, pctText(ca.video_pct)],
        ['Consistency', NO_DATA, pctText(ca.consistency)],
        ['Mastery', pctText(data.topic_mastery_pct), pctText(ca.mastery)],
      ],
      columnStyles: { 0: { fontStyle: 'bold' } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const tested = radar.filter((r) => (r.test_count || 0) > 0);
  const bestSub = tested.length ? tested.reduce((a, b) => (a.test_avg >= b.test_avg ? a : b)) : null;
  const worstSub = tested.length > 1 ? tested.reduce((a, b) => (a.test_avg <= b.test_avg ? a : b)) : null;
  const highlights = [];
  if (bestSub) highlights.push(['Best Subject', `${bestSub.subject} (${Math.round(bestSub.test_avg)}% avg)`]);
  if (worstSub && worstSub !== bestSub) highlights.push(['Needs Attention', `${worstSub.subject} (${Math.round(worstSub.test_avg)}% avg)`]);
  const sortedTests = timeline.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  if (sortedTests.length >= 4) {
    const mid = Math.floor(sortedTests.length / 2);
    const avgOf = (arr) => arr.reduce((a, t) => a + (t.score_pct || 0), 0) / (arr.length || 1);
    const improvement = Math.round(avgOf(sortedTests.slice(mid)) - avgOf(sortedTests.slice(0, mid)));
    highlights.push(['Improvement', `${improvement > 0 ? '+' : ''}${improvement}% vs earlier tests`]);
  }
  if (data.total_tests_in_standard > 0) {
    highlights.push(['Test Coverage', `${Math.round((timeline.length / data.total_tests_in_standard) * 100)}% (${timeline.length} of ${data.total_tests_in_standard} taken)`]);
  }
  if (data.topic_mastery_pct != null) highlights.push(['Topic Mastery', pctText(data.topic_mastery_pct)]);
  if (highlights.length > 0) {
    y = sectionTitle(doc, 'Highlights', y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [],
      body: highlights,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
    });
  }

  drawFooters(doc, brand.name);
  const pText = period ? period.charAt(0).toUpperCase() + period.slice(1) : 'Overall';
  doc.save(`${(s.name || 'Student').replace(/\s+/g, '_')}_Report_${pText}.pdf`);
}

export async function buildClassAnalyticsPdf({ analytics, standardName }) {
  if (!analytics) return;
  const { JsPDF, autoTable } = await loadJsPdf();
  const brand = getBranding();
  const logo = await fetchImageDataURL(brand.logoUrl);

  const doc = new JsPDF();
  let y = drawHeader(doc, {
    brandName: brand.name,
    logo,
    title: 'Class Analytics Report',
    subtitle: standardName || '',
  });

  const overview = analytics.overview || {};
  y = drawKpiCards(doc, [
    { label: 'Students', value: valueText(overview.total_students ?? 0) },
    { label: 'Avg Score', value: pctText(overview.avg_score ?? 0) },
    { label: 'Avg Attendance', value: pctText(overview.avg_attendance ?? 0) },
    { label: 'Total Points', value: valueText(overview.total_points ?? 0) },
  ], y);

  const students = [...(analytics.students || [])].sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0));
  if (students.length > 0) {
    y = sectionTitle(doc, 'Student Rankings', y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Rank', 'Name', 'Avg Score', 'Attendance', 'Points']],
      body: students.map((st, i) => [
        st.rank || i + 1,
        st.name || NO_DATA,
        st.has_tests ? pctText(st.avg_score) : NO_DATA,
        st.has_attendance ? pctText(st.attendance_pct) : NO_DATA,
        valueText(st.points || 0),
      ]),
      columnStyles: { 0: { cellWidth: 14 } },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const subjectPerf = analytics.subject_performance || [];
  if (subjectPerf.length > 0) {
    y = sectionTitle(doc, 'Subject Performance', y);
    autoTable(doc, {
      ...tableDefaults,
      startY: y,
      head: [['Subject', 'Avg Score', 'Avg Attendance']],
      body: subjectPerf.map((sp) => [sp.subject_name || NO_DATA, pctText(sp.avg_score), pctText(sp.avg_attendance)]),
    });
  }

  drawFooters(doc, brand.name);
  doc.save(`${(standardName || 'Class').replace(/\s+/g, '_')}_Analytics_Report.pdf`);
}
