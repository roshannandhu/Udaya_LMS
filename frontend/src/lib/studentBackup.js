// Shared student-backup export helpers.
//
// Single source of truth for downloading student records to a spreadsheet, so the
// "Backup" button on the Students page and the mandatory backup step in
// TerminateStandardModal behave identically. xlsx is lazy-imported so the heavy
// library stays out of the main bundle, with a plain-CSV fallback if it fails to
// load/write (flaky network, mobile-browser quirks) — the teacher never gets stuck
// without a backup.

// ── small utilities ──────────────────────────────────────────────────────────

function fmtJoined(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Safe for use inside a download filename (not for Excel sheet names).
function safeFilePart(name) {
  return (
    String(name || 'Udaya')
      .replace(/[^a-z0-9._-]+/gi, '_')
      .replace(/^_+|_+$/g, '') || 'Udaya'
  );
}

// Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ] and must be unique.
function uniqueSheetName(name, used) {
  let base = String(name || 'Sheet').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = `-${i++}`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function downloadCsv(header, rows, filename) {
  const all = [header, ...rows];
  const csv = all
    .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── full backup: every student, one sheet per standard ───────────────────────

const FULL_HEADER = ['Student ID', 'Name', 'Username', 'Email', 'Phone', 'Standard', 'Points', 'Attendance %', 'Avg Score', 'Joined'];
const FULL_COLS = [{ wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 28 }, { wch: 16 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 14 }];

function fullRow(s, standardName) {
  return [
    s.student_code || '',
    s.name || '',
    s.username || '',
    s.email || '',
    s.phone || '',
    standardName || '',
    s.points ?? 0,
    s.attendance_pct ?? '',
    s.avg_score ?? '',
    fmtJoined(s.created_at),
  ];
}

/**
 * Download a backup of all given students, grouped one sheet per standard.
 * Students whose standard is missing/unknown go into an "Unassigned" sheet so
 * nobody is dropped. Falls back to a single CSV (with a Standard column) if xlsx fails.
 *
 * @returns {Promise<{ ok: boolean, format: 'xlsx'|'csv', count: number }>}
 */
export async function exportStudentsBackup(students, standards, { filenamePrefix = 'Udaya' } = {}) {
  const list = Array.isArray(students) ? students : [];
  const stds = Array.isArray(standards) ? standards : [];
  const stdById = new Map(stds.map((s) => [String(s.id), s]));

  // Group by standard, preserving the standards' own order; unknown -> Unassigned.
  const groups = new Map(); // key -> { name, students: [] }
  for (const s of list) {
    const sid = s.standard_id != null ? String(s.standard_id) : '';
    const std = stdById.get(sid);
    const key = std ? sid : '__unassigned__';
    const name = std ? std.name : 'Unassigned';
    if (!groups.has(key)) groups.set(key, { name, students: [] });
    groups.get(key).students.push(s);
  }

  const orderedKeys = [
    ...stds.map((s) => String(s.id)).filter((k) => groups.has(k)),
    ...(groups.has('__unassigned__') ? ['__unassigned__'] : []),
  ];

  const sheets = [];
  const flatRows = [];
  for (const key of orderedKeys) {
    const { name, students: gStudents } = groups.get(key);
    const rows = gStudents.map((s) => fullRow(s, name));
    sheets.push({ name, aoa: [FULL_HEADER, ...rows] });
    flatRows.push(...rows);
  }
  if (sheets.length === 0) sheets.push({ name: 'Students', aoa: [FULL_HEADER] });

  const filename = `${safeFilePart(filenamePrefix)}_Students_Backup_${todayStamp()}`;

  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const used = new Set();
    for (const { name, aoa } of sheets) {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = FULL_COLS;
      XLSX.utils.book_append_sheet(wb, ws, uniqueSheetName(name, used));
    }
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return { ok: true, format: 'xlsx', count: flatRows.length };
  } catch (err) {
    console.error('xlsx students backup failed, falling back to CSV:', err);
    downloadCsv(FULL_HEADER, flatRows, `${filename}.csv`);
    return { ok: true, format: 'csv', count: flatRows.length };
  }
}

// ── single-standard backup (used by TerminateStandardModal) ──────────────────

/**
 * Download a single standard's students as Name · Email · Phone · Standard.
 * Preserves the exact file the termination flow has always produced.
 *
 * @returns {Promise<{ ok: boolean, format: 'xlsx'|'csv' }>}
 */
export async function exportStandardBackup(standard, students) {
  const safeName = String(standard?.name || 'Standard').replace(/\s+/g, '_');
  const header = ['Student ID', 'Name', 'Email', 'Phone', 'Standard'];
  const rows = (students || []).map((s) => [s.student_code || '', s.name || '', s.email || '', s.phone || '', standard?.name || '']);
  const filename = `${safeName}_Students_Backup`;

  try {
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 16 }, { wch: 22 }, { wch: 28 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    return { ok: true, format: 'xlsx' };
  } catch (err) {
    console.error('xlsx backup failed, falling back to CSV:', err);
    downloadCsv(header, rows, `${filename}.csv`);
    return { ok: true, format: 'csv' };
  }
}
