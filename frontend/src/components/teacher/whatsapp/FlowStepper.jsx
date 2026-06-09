import React from 'react';
import { Pencil, Users, Eye, Send, CheckCheck } from 'lucide-react';

// The whole WhatsApp mental model in one glance. Shown at the top of the
// "Send a Message" screen so a first-time user always knows the 5 steps and
// where they are. Steps before `current` read as done; the rest as upcoming.
const STEPS = [
  { id: 1, label: 'Write message',   icon: Pencil },
  { id: 2, label: 'Choose students', icon: Users },
  { id: 3, label: 'Preview',         icon: Eye },
  { id: 4, label: 'Send',            icon: Send },
  { id: 5, label: 'Delivery report', icon: CheckCheck },
];

export default function FlowStepper({ current = 1 }) {
  return (
    <div className="glass-panel border border-[#EBEAE7] rounded-card px-3 py-3 mb-4">
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const done = s.id < current;
          const active = s.id === current;
          const Icon = s.icon;
          return (
            <React.Fragment key={s.id}>
              <div className="flex flex-col items-center text-center flex-shrink-0 w-[58px] sm:w-auto sm:flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                  active ? 'bg-whatsapp-green text-white shadow-sm'
                    : done ? 'bg-whatsapp-green-light text-whatsapp-green-fg'
                    : 'bg-[#F1EFEC] text-neutral-400'}`}>
                  <Icon size={15} />
                </div>
                <span className={`mt-1 text-[10px] sm:text-[11px] leading-tight ${
                  active ? 'font-semibold text-neutral-800' : 'text-neutral-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 mx-0.5 sm:mx-1 -mt-4 rounded ${
                  s.id < current ? 'bg-whatsapp-green/40' : 'bg-[#EBEAE7]'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
