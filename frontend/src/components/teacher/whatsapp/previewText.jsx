import React from 'react';

// Classify a MIME type into the three WhatsApp bubble media kinds.
export function mediaKind(type = '') {
  if (!type) return null;
  if (type.startsWith('image')) return 'image';
  if (type.startsWith('audio')) return 'audio';
  return 'document';
}

// Replace {{1}}, {{2}}… in a template body with:
//   1) the teacher's entered variable value, else
//   2) the matching variable label wrapped in braces (e.g. "{Parent name}"),
//   3) else the raw {{n}} token.
// So an unfilled slot reads like a readable placeholder, not "{{1}}".
export function fillTemplate(bodyText = '', variables = [], labels = []) {
  return String(bodyText || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const i = Number(n) - 1;
    const v = variables?.[i];
    if (v != null && String(v).trim() !== '') return v;
    const label = labels?.[i];
    return label ? `{${label}}` : `{{${n}}}`;
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
