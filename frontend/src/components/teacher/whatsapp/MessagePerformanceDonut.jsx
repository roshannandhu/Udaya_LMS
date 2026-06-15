import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTheme } from '../../../lib/theme';

// Status → colour (reuse the app's pastel foregrounds + WhatsApp green).
const COLORS = {
  delivered: '#0F7B6C', // mint-fg
  read:      '#25D366', // whatsapp green
  sent:      '#2383E2', // sky-fg
  queued:    '#B7791F', // cream-fg (pending)
  failed:    '#C2410C', // peach-fg
};
// Lighter variants so the donut + legend read on a dark card.
const COLORS_DARK = {
  delivered: '#6ee7b7', read: '#4ade80', sent: '#93c5fd', queued: '#fcd34d', failed: '#fdba74',
};
const LABELS = { delivered: 'Delivered', read: 'Read', sent: 'Sent', queued: 'Pending', failed: 'Failed' };

export default function MessagePerformanceDonut({ performance = [] }) {
  const dark = useTheme(s => s.dark);
  const colorFor = (status) => (dark ? COLORS_DARK[status] : COLORS[status]) || '#A3A3A3';
  const data = performance.filter((p) => p.count > 0);
  const total = performance.reduce((a, p) => a + (p.count || 0), 0);

  return (
    <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Message performance</h3>
      {total === 0 ? (
        <div className="h-44 flex items-center justify-center text-sm text-neutral-400">No messages yet</div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="relative w-36 h-36 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="count" nameKey="status" cx="50%" cy="50%"
                  innerRadius={45} outerRadius={68} paddingAngle={2} stroke="none">
                  {data.map((e) => <Cell key={e.status} fill={colorFor(e.status)} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [v, LABELS[n] || n]}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12, backgroundColor: dark ? '#1a1b33' : '#fff', color: dark ? '#e5e7eb' : undefined }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-semibold leading-none" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{total}</span>
              <span className="text-[10px] text-neutral-500 mt-0.5">total</span>
            </div>
          </div>
          <div className="flex-1 space-y-1.5">
            {performance.map((p) => (
              <div key={p.status} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: colorFor(p.status) }} />
                <span className="flex-1 text-neutral-600">{LABELS[p.status] || p.status}</span>
                <span className="font-semibold text-neutral-800">{p.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
