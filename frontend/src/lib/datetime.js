// Shared timestamp helpers. All backend timestamps are UTC; strings missing a
// timezone marker are legacy naive-UTC, so we append 'Z' before parsing. All
// formatters use the browser's own locale + timezone (no hardcoded zone), so
// every user sees times in their local time.

export function parseTS(dt) {
  if (!dt) return null;
  if (dt instanceof Date) return dt;
  let s = String(dt);
  if (!/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z';
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtTime(dt) {
  const d = parseTS(dt);
  return d ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
}

export function fmtDate(dt) {
  const d = parseTS(dt);
  return d ? d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

export function fmtDateTime(dt) {
  const d = parseTS(dt);
  return d ? d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

export function fmtShortDateTime(dt) {
  const d = parseTS(dt);
  return d
    ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
}

/** "Today" / "Yesterday" / "12 June 2026", comparing local calendar days. */
export function fmtChatDate(dt) {
  const d = parseTS(dt);
  if (!d) return 'Unknown Date';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' });
}
