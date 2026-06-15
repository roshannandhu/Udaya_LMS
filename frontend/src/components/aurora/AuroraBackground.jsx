import React from 'react';

// Four large blurred radial-gradient blobs, fixed behind ALL content (-z-10 so
// they paint in front of the body canvas but behind every page element, whatever
// its positioning). They slowly float via CSS keyframes (blobFloat1..4) defined
// in index.css. Opacity drops in dark mode via the `html.dark .aurora-blob` rule.
// Pure CSS — no JS animation loop, so it costs ~nothing and respects reduced-motion.
const BLOBS = [
  { className: 'aurora-blob aurora-blob-1', style: { top: '-12%', left: '-10%', width: 540, height: 540, background: 'radial-gradient(circle at 30% 30%, #fda4af, #c4b5fd)' } },
  { className: 'aurora-blob aurora-blob-2', style: { top: '6%', right: '-12%', width: 600, height: 600, background: 'radial-gradient(circle at 40% 40%, #7dd3fc, #bae6fd)' } },
  { className: 'aurora-blob aurora-blob-3', style: { bottom: '-14%', left: '8%', width: 560, height: 560, background: 'radial-gradient(circle at 35% 35%, #fbcfe8, #ddd6fe)' } },
  { className: 'aurora-blob aurora-blob-4', style: { bottom: '-6%', right: '4%', width: 500, height: 500, background: 'radial-gradient(circle at 40% 40%, #6ee7b7, #a5f3fc)' } },
];

export default function AuroraBackground() {
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      {BLOBS.map((b, i) => (
        <div key={i} className={b.className} style={{ position: 'absolute', borderRadius: '50%', filter: 'blur(80px)', ...b.style }} />
      ))}
    </div>
  );
}
