import React from 'react';
import { Send, FileBarChart, KeyRound, LayoutTemplate, Clock, Inbox } from 'lucide-react';
import { useTheme } from '../../../lib/theme';

const ACTIONS = [
  { id: 'compose',     label: 'Send Message',    icon: Send,           color: '#0B6E3E', bg: '#E7FDDE', dcolor: '#86efac', dbg: '#0f2417' },
  { id: 'reports',     label: 'Progress Report', icon: FileBarChart,   color: '#2383E2', bg: '#E3EFFB', dcolor: '#93c5fd', dbg: '#14233a' },
  { id: 'credentials', label: 'Login Details',   icon: KeyRound,       color: '#0F7B6C', bg: '#DFF5EC', dcolor: '#6ee7b7', dbg: '#16302a' },
  { id: 'templates',   label: 'Templates',       icon: LayoutTemplate, color: '#6940A5', bg: '#EAE4F2', dcolor: '#c4b5fd', dbg: '#221d33' },
  { id: 'automation',  label: 'Automation',      icon: Clock,          color: '#B7791F', bg: '#FBF1D9', dcolor: '#fcd34d', dbg: '#2b2616' },
  { id: 'inbox',       label: 'Inbox',           icon: Inbox,          color: '#AD1A72', bg: '#F7E3F0', dcolor: '#f9a8d4', dbg: '#2e1c2a' },
];

export default function QuickActions({ onAction }) {
  const dark = useTheme(s => s.dark);
  return (
    <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Quick actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACTIONS.map((a) => (
          <button key={a.id} onClick={() => onAction?.(a.id)}
            className="flex flex-col items-start gap-2 p-3 rounded-xl border border-[#EFEDEA] bg-white hover:bg-[#F4F2EF] transition-colors text-left">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: dark ? a.dbg : a.bg, color: dark ? a.dcolor : a.color }}>
              <a.icon size={16} />
            </span>
            <span className="text-xs font-medium text-neutral-700">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
