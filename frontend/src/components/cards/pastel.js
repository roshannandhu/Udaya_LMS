// Maps a pastel colour name to Tailwind classes (fill + foreground).
// Keep in sync with tailwind.config.js `colors.pastel`.
export const PASTEL = {
  mint:     { bg: 'bg-pastel-mint',     fg: 'text-pastel-mint-fg',     hex: '#DFF5EC', fgHex: '#0F7B6C' },
  pink:     { bg: 'bg-pastel-pink',     fg: 'text-pastel-pink-fg',     hex: '#F7E3F0', fgHex: '#AD1A72' },
  lavender: { bg: 'bg-pastel-lavender', fg: 'text-pastel-lavender-fg', hex: '#EAE4F2', fgHex: '#6940A5' },
  cream:    { bg: 'bg-pastel-cream',    fg: 'text-pastel-cream-fg',    hex: '#FBF1D9', fgHex: '#B7791F' },
  sky:      { bg: 'bg-pastel-sky',      fg: 'text-pastel-sky-fg',      hex: '#E3EFFB', fgHex: '#2383E2' },
  peach:    { bg: 'bg-pastel-peach',    fg: 'text-pastel-peach-fg',    hex: '#FCE6DD', fgHex: '#C2410C' },
};

export const PASTEL_NAMES = Object.keys(PASTEL);

// Deterministic pastel from a string (e.g. subject name) so colours are stable.
export function pastelFor(key = '') {
  const code = String(key).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return PASTEL_NAMES[code % PASTEL_NAMES.length];
}
