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
  if (n === 'student name') return sample.name;
  if (n === 'class') return sample.standard_name;
  if (n === 'student id') return sample.student_code;
  if (n === 'username') return sample.username;
  return null;
}

// Render a template/message body for the LIVE PREVIEW by replacing every {Named Tag}:
//   • a tag the teacher already typed a value for (manualValues) → that value
//   • an "auto" tag → the selected student's real value, else the registry example
//   • an "ask" tag not yet filled → its example value (e.g. "5000")
//   • an unknown word in braces → shown as plain text
// One variable format only — no {{1}} positions, no [Label] brackets.
export function renderPreview(body = '', registry = [], manualValues = {}, sample = {}) {
  const byName = {};
  (registry || []).forEach((v) => { byName[String(v.name).toLowerCase()] = v; });
  const mv = {};
  Object.keys(manualValues || {}).forEach((k) => { mv[k.trim().toLowerCase()] = manualValues[k]; });

  const b = String(body || '').replace(/\{\{/g, '{').replace(/\}\}/g, '}');
  return b.replace(/\{([^{}]+)\}/g, (_m, raw) => {
    const key = String(raw).trim().toLowerCase();
    if (mv[key] != null && String(mv[key]).trim() !== '') return mv[key];
    const v = byName[key];
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
