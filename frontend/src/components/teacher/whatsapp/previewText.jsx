import React from 'react';

// Classify a MIME type into the three WhatsApp bubble media kinds.
export function mediaKind(type = '') {
  if (!type) return null;
  if (type.startsWith('image')) return 'image';
  if (type.startsWith('audio')) return 'audio';
  return 'document';
}

// Pull a believable sample value for an "auto" variable from the selected student,
// so the live preview reads like a real message instead of a placeholder.
function sampleFor(name, sample = {}) {
  const n = String(name || '').toLowerCase();
  const now = new Date();
  if (n === 'student name') return sample.name;
  if (n === 'class') return sample.standard_name;
  if (n === 'student id') return sample.student_code;
  if (n === 'username') return sample.username;
  if (n === 'password') return '••••••';
  if (n === 'student phone') return sample.student_phone;
  if (n === 'parent phone') return sample.parent_phone || sample.phone;
  if (n === 'parent name') return 'Parent';
  if (n === 'attendance') return sample.attendance_pct != null ? `${sample.attendance_pct}%` : null;
  if (n === 'score') return sample.avg_score != null ? `${sample.avg_score}%` : null;
  if (n === 'points') return sample.points != null ? String(sample.points) : null;
  if (n === 'latest exam') return sample.latest_test;
  if (n === 'latest assignment') return sample.latest_assignment;
  if (n === 'study material') return sample.latest_material;
  if (n === 'live class') return sample.upcoming_live_class;
  if (n === 'latest video') return sample.latest_video;
  if (n === 'date') return now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  if (n === 'time') return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (n === 'month') return now.toLocaleDateString('en-IN', { month: 'long' });
  if (n === 'year') return String(now.getFullYear());
  return null;
}

// Static fallback only — the live table ships with GET /teacher/whatsapp/variables
// (response `aliases`) and is merged in via applyServerAliases() so this copy can
// never silently drift from the backend's _WA_ALIAS again.
export const VARIABLE_ALIASES = {
  student_name: 'student name', name: 'student name', child: 'student name',
  student_code: 'student id', studentid: 'student id', id: 'student id', 'roll no': 'student id',
  class_name: 'class', standard: 'class', grade: 'class',
  school_name: 'institute name', school: 'institute name', institute: 'institute name',
  login_url: 'login link', link: 'login link', url: 'login link',
  parent_name: 'parent name', guardian: 'parent name',
  parent_phone: 'parent phone', parent_mobile: 'parent phone', 'parent mobile': 'parent phone',
  guardian_phone: 'parent phone', 'guardian phone': 'parent phone',
  student_phone: 'student phone', phone: 'student phone', mobile: 'student phone',
  test: 'latest exam', exam: 'latest exam', exam_name: 'latest exam', 'exam name': 'latest exam',
  latest_test: 'latest exam',
  assignment: 'latest assignment', homework: 'latest assignment', latest_assignment: 'latest assignment',
  study_material: 'study material', material: 'study material', notes: 'study material',
  live_class: 'live class', zoom: 'live class', meeting: 'live class',
  latest_video: 'latest video', video: 'latest video', lesson: 'latest video',
  marks: 'score', average: 'score', percentage: 'score',
  app_download_link: 'app download link', app_link: 'app download link', apk: 'app download link',
  'app link': 'app download link', app: 'app download link',
  'download link': 'app download link', download_link: 'app download link',
};

let ALIASES = { ...VARIABLE_ALIASES };

// Merge the backend's alias table (from GET /variables) over the static fallback.
export function applyServerAliases(serverAliases) {
  if (serverAliases && typeof serverAliases === 'object') {
    ALIASES = { ...VARIABLE_ALIASES, ...serverAliases };
  }
}

export function registryLookup(registry, raw) {
  const byName = {};
  (registry || []).forEach((v) => { byName[String(v.name).toLowerCase()] = v; });
  const key = String(raw || '').trim().toLowerCase();
  return byName[key] || byName[ALIASES[key]];
}

// Render a template/message body for the LIVE PREVIEW by replacing every {Named Tag}:
//   • a tag the teacher already typed a value for (manualValues) → that value
//   • an "auto" tag → the selected student's real value, else the registry example
//   • an "ask" tag not yet filled → its example value (e.g. "5000")
//   • an unknown word in braces → shown as plain text
// One variable format only — no {{1}} positions, no [Label] brackets.
export function renderPreview(body = '', registry = [], manualValues = {}, sample = {}) {
  const mv = {};
  Object.keys(manualValues || {}).forEach((k) => { mv[k.trim().toLowerCase()] = manualValues[k]; });

  const b = String(body || '').replace(/\{\{/g, '{').replace(/\}\}/g, '}');
  return b.replace(/\{([^{}]+)\}/g, (_m, raw) => {
    const key = String(raw).trim().toLowerCase();
    if (mv[key] != null && String(mv[key]).trim() !== '') return mv[key];
    const v = registryLookup(registry, raw);
    if (v) {
      if (v.kind === 'auto') {
        const s = sampleFor(v.name, sample);
        return s != null && String(s).trim() !== '' ? s : (v.example || v.name);
      }
      return v.example || v.name;
    }
    return raw; // unknown tag → just show the word, never raw braces
  });
}

// Render WhatsApp markup (*bold*, _italic_, ~strike~) + line breaks as safe React
// nodes — no dangerouslySetInnerHTML, so user text can never inject markup.
export function formatWhatsApp(text = '') {
  return String(text || '').split('\n').map((line, li) => (
    <React.Fragment key={li}>
      {li > 0 && <br />}
      {tokenizeLine(line)}
    </React.Fragment>
  ));
}

function tokenizeLine(line) {
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g;
  const parts = String(line).split(re).filter((p) => p !== '');
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i}>{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(p)) return <span key={i} className="line-through">{p.slice(1, -1)}</span>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
