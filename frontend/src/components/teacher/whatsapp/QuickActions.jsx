import React from 'react';
import { Send, FileBarChart, LayoutTemplate, Clock, Inbox } from 'lucide-react';

const ACTIONS = [
  { id: 'compose',    label: 'New Broadcast', icon: Send,           color: '#0B6E3E', bg: '#E7FDDE' },
  { id: 'reports',    label: 'Send Report',   icon: FileBarChart,   color: '#2383E2', bg: '#E3EFFB' },
  { id: 'templates',  label: 'Templates',     icon: LayoutTemplate, color: '#6940A5', bg: '#EAE4F2' },
  { id: 'automation', label: 'Automation',    icon: Clock,          color: '#B7791F', bg: '#FBF1D9' },
  { id: 'inbox',      label: 'Inbox',         icon: Inbox,          color: '#AD1A72', bg: '#F7E3F0' },
];

export default function QuickActions({ onAction }) {
  return (
    <div className="glass-panel border border-[#EBEAE7] rounded-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Quick actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ACTIONS.map((a) => (
          <button key={a.id} onClick={() => onAction?.(a.id)}
            className="flex flex-col items-start gap-2 p-3 rounded-xl border border-[#EFEDEA] bg-white hover:bg-[#F4F2EF] transition-colors text-left">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: a.bg, color: a.color }}>
              <a.icon size={16} />
            </span>
            <span className="text-xs font-medium text-neutral-700">{a.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
