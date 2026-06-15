// Maps a pastel colour name to Tailwind classes (fill + foreground).
// Keep in sync with tailwind.config.js `colors.pastel`.
export const PASTEL = {
  mint:     { bg: 'bg-pastel-mint',     fg: 'text-pastel-mint-fg',     hex: '#DFF5EC', fgHex: '#0F7B6C' },
  pink:     { bg: 'bg-pastel-pink',     fg: 'text-pastel-pink-fg',     hex: '#F7E3F0', fgHex: '#AD1A72' },
  lavender: { bg: 'bg-pastel-lavender', fg: 'text-pastel-lavender-fg', hex: '#EAE4F2', fgHex: '#6940A5' },
  cream:    { bg: 'bg-pastel-cream',    fg: 'text-pastel-cream-fg',    hex: '#FBF1D9', fgHex: '#B7791F' },
  sky:      { bg: 'bg-pastel-sky',      fg: 'text-pastel-sky-fg',      hex: '#E3EFFB', fgHex: '#2383E2' },
  peach:    { bg: 'bg-pastel-peach',    fg: 'text-pastel-peach-fg',    hex: '#FCE6DD', fgHex: '#C2410C' },
  whatsapp: { bg: 'bg-whatsapp-green-light', fg: 'text-whatsapp-green-fg', hex: '#E7FDDE', fgHex: '#0B6E3E' },
};

// Dark-mode tile variants — dark-tinted fill + a light foreground that pops on
// it. The fills are kept in sync with the `html.dark .bg-pastel-*` rules in
// index.css so class-based and inline pastel surfaces look identical.
export const PASTEL_DARK = {
  mint:     { hex: '#16302a', fgHex: '#6ee7b7' },
  pink:     { hex: '#2e1c2a', fgHex: '#f9a8d4' },
  lavender: { hex: '#221d33', fgHex: '#c4b5fd' },
  cream:    { hex: '#2b2616', fgHex: '#fcd34d' },
  sky:      { hex: '#14233a', fgHex: '#7dd3fc' },
  peach:    { hex: '#2e1d16', fgHex: '#fdba74' },
  whatsapp: { hex: '#0f2417', fgHex: '#86efac' },
};

// Theme-aware tile colours: light pastel by day, dark-tinted + light fg at night.
// Use for inline `style` surfaces, which the CSS `html.dark` overrides can't reach
// (inline styles win over stylesheet rules unless we duplicate every shade here).
export function pastelTokens(name, dark) {
  const base = PASTEL[name] || PASTEL.sky;
  if (!dark) return base;
  const d = PASTEL_DARK[name] || PASTEL_DARK.sky;
  return { ...base, hex: d.hex, fgHex: d.fgHex };
}

// Pick the light value by day, the dark value at night. For bespoke inline
// `style` colours that aren't pastel tokens (chart strokes, one-off tints, etc.).
export function tone(lightHex, darkHex, dark) {
  return dark ? darkHex : lightHex;
}

// WhatsApp green is an accent, not a rotation colour — keep it out of pastelFor().
export const PASTEL_NAMES = Object.keys(PASTEL).filter((n) => n !== 'whatsapp');

// Deterministic pastel from a string (e.g. subject name) so colours are stable.
export function pastelFor(key = '') {
  const code = String(key).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return PASTEL_NAMES[code % PASTEL_NAMES.length];
}
