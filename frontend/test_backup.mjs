// Temporary test for the student-backup helper. Runs the REAL shipped code,
// writes actual .xlsx files, reads them back, and verifies correctness +
// round-trip through the Bulk Import column detection.
import * as XLSX from 'xlsx';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { exportStudentsBackup, exportStandardBackup } from './src/lib/studentBackup.js';

// Work in a throwaway dir so generated files don't litter the repo.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'udaya-backup-'));
process.chdir(tmp);

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  PASS:', msg); } else { fail++; console.log('  XXXX FAIL:', msg); } };

// ── Importer column detection (copied from lib/bulkImport.js) ──
const NAME_KEYS = ['name', 'student name', 'full name', 'student', 'sname'];
const EMAIL_KEYS = ['email', 'email address', 'mail', 'e-mail'];
const PHONE_KEYS = ['phone', 'mobile', 'contact', 'phone number', 'mob', 'phno'];
const STANDARD_KEYS = ['standard', 'class', 'std', 'grade', 'batch', 'section'];
const matchKey = (headers, keys) => {
  for (const h of headers) {
    const clean = h.toLowerCase().trim();
    if (keys.some(k => clean.includes(k) || clean === k)) return h;
  }
  return null;
};

const standards = [
  { id: 's8',   name: 'Class 8th' },
  { id: 's9',   name: 'Class 9th' },
  { id: 's10a', name: 'Class 10' },
  { id: 's10b', name: 'Class 10' },            // duplicate name -> sheet dedup
  { id: 'sx',   name: 'Maths / Science [A]' }, // illegal sheet chars -> sanitize
];
const students = [
  { name: 'Midhun', username: 'midhun', email: 'midhun@x.com', phone: '9990001111', standard_id: 's8', points: 10, attendance_pct: 92, avg_score: 78, created_at: '2026-01-10T00:00:00Z' },
  { name: 'Ahamad', username: 'ahamad', email: '',             phone: '9990002222', standard_id: 's8', points: 5,  attendance_pct: 88, avg_score: 70, created_at: '2026-01-11T00:00:00Z' },
  { name: 'Priya',  username: 'priya',  email: 'priya@x.com',  phone: '9990003333', standard_id: 's9' },
  { name: 'Rahul',  username: 'rahul',  email: 'rahul@x.com',  phone: '9990004444', standard_id: 's10a' },
  { name: 'Sneha',  username: 'sneha',  email: 'sneha@x.com',  phone: '9990005555', standard_id: 's10b' },
  { name: 'Karan',  username: 'karan',  email: 'karan@x.com',  phone: '9990006666', standard_id: 'sx' },
  { name: 'Ghost',  username: 'ghost',  email: 'ghost@x.com',  phone: '9990007777', standard_id: null },      // no standard
  { name: 'Orphan', username: 'orphan', email: 'orphan@x.com', phone: '9990008888', standard_id: 'deleted' }, // standard gone
];

console.log('\n=== exportStudentsBackup (all students, one sheet per standard) ===');
const res = await exportStudentsBackup(students, standards, { filenamePrefix: 'Udaya' });
ok(res.ok && res.format === 'xlsx', `returns xlsx ok (got ${res.format})`);
ok(res.count === students.length, `count === ${students.length} (got ${res.count}) — no students dropped`);

const file = fs.readdirSync('.').find(f => /_Students_Backup_.*\.xlsx$/.test(f));
ok(!!file, `xlsx file written (${file})`);

const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
const names = wb.SheetNames;
console.log('  sheets:', JSON.stringify(names));
ok(names.length === 6, `6 sheets — 5 standards (one empty? no) + Unassigned (got ${names.length})`);
ok(names.includes('Class 8th') && names.includes('Class 9th'), 'has Class 8th & Class 9th sheets');
ok(names.filter(n => n.startsWith('Class 10')).length === 2, 'two "Class 10" sheets deduped (Class 10 / Class 10-2)');
ok(names.includes('Unassigned'), 'has Unassigned sheet for student with no/deleted standard');
ok(names.every(n => !/[:\\/?*[\]]/.test(n) && n.length <= 31), 'all sheet names are Excel-legal (no : \\ / ? * [ ], <=31 chars)');

// Count data rows across all sheets (minus header each) == total students
let totalRows = 0;
for (const sn of names) {
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1 });
  totalRows += Math.max(0, aoa.length - 1);
}
ok(totalRows === students.length, `data rows across sheets === ${students.length} (got ${totalRows})`);

// Header + a specific row are correct
const c8 = XLSX.utils.sheet_to_json(wb.Sheets['Class 8th'], { header: 1 });
ok(JSON.stringify(c8[0]) === JSON.stringify(['Name','Username','Email','Phone','Standard','Points','Attendance %','Avg Score','Joined']), 'header row matches FULL_HEADER');
const midhun = c8.find(r => r[0] === 'Midhun');
ok(midhun && midhun[2] === 'midhun@x.com' && String(midhun[3]) === '9990001111' && midhun[4] === 'Class 8th', 'Midhun row has correct email/phone/standard');
const unassigned = XLSX.utils.sheet_to_json(wb.Sheets['Unassigned'], { header: 1 });
ok(unassigned.length - 1 === 2, 'Unassigned sheet has both no-standard students (Ghost + Orphan)');

console.log('\n=== round-trip: parse generated file like Bulk Import does ===');
let parsed = [];
for (const sn of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn]); // header:true
  if (!rows.length) continue;
  const headers = Object.keys(rows[0]);
  const col = { name: matchKey(headers, NAME_KEYS), email: matchKey(headers, EMAIL_KEYS), phone: matchKey(headers, PHONE_KEYS), standard: matchKey(headers, STANDARD_KEYS) };
  for (const r of rows) parsed.push({ name: r[col.name], email: r[col.email], phone: r[col.phone], standard: r[col.standard] });
}
ok(parsed.length === students.length, `importer parses all ${students.length} students back (got ${parsed.length})`);
ok(parsed.some(p => p.name === 'Midhun' && p.phone == 9990001111), 'importer reads "Name" column (not Username) — Midhun mapped correctly');
ok(parsed.every(p => p.name), 'every parsed row has a Name — column detection picked the right header');

console.log('\n=== exportStandardBackup (single standard, modal behavior) ===');
const res2 = await exportStandardBackup({ name: 'Class 8th' }, students.filter(s => s.standard_id === 's8'));
ok(res2.ok && res2.format === 'xlsx', `single-standard xlsx ok (got ${res2.format})`);
const file2 = fs.readdirSync('.').find(f => /^Class_8th_Students_Backup\.xlsx$/.test(f));
ok(!!file2, `single-standard file written (${file2})`);
const wb2 = XLSX.read(fs.readFileSync(file2), { type: 'buffer' });
ok(wb2.SheetNames.length === 1 && wb2.SheetNames[0] === 'Students', 'single sheet named "Students"');
const s8aoa = XLSX.utils.sheet_to_json(wb2.Sheets['Students'], { header: 1 });
ok(JSON.stringify(s8aoa[0]) === JSON.stringify(['Name','Email','Phone','Standard']), 'modal header is Name·Email·Phone·Standard');
ok(s8aoa.length - 1 === 2, 'single-standard file has 2 student rows');

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===`);
// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
process.exit(fail ? 1 : 0);
