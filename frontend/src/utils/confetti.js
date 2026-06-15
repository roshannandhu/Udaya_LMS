// Lightweight pastel confetti — pure DOM, no dependency. Spawns particles that
// fall + rotate + fade via the `floatUp` keyframe (index.css) and remove
// themselves on animationend. Respects prefers-reduced-motion (no-op).
const COLORS = ['#fda4af', '#7dd3fc', '#c4b5fd', '#6ee7b7', '#fde68a', '#818cf8'];

export function burst(count = 120) {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden;';
  document.body.appendChild(container);

  let remaining = count;
  const cleanup = () => { if (--remaining <= 0) container.remove(); };

  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      const size = 6 + Math.random() * 8;
      const color = COLORS[i % COLORS.length];
      const left = Math.random() * 100;
      const duration = 2.6 + Math.random() * 1.8;
      const round = Math.random() > 0.5;
      p.style.cssText =
        `position:absolute;top:-20px;left:${left}vw;width:${size}px;height:${size}px;` +
        `background:${color};border-radius:${round ? '50%' : '2px'};opacity:0.95;` +
        `will-change:transform,opacity;animation:floatUp ${duration}s cubic-bezier(.3,.6,.5,1) forwards;`;
      p.addEventListener('animationend', () => { p.remove(); cleanup(); });
      container.appendChild(p);
    }, i * 14);
  }

  // Safety net: remove the container even if some animationend events are missed.
  setTimeout(() => container.remove(), count * 14 + 6000);
}
