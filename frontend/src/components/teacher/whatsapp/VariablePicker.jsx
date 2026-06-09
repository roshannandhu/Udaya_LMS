import React, { useState } from 'react';
import { Sparkles, HelpCircle, Wand2, Pencil } from 'lucide-react';

// Shared "Add student info" panel used by both the composer and the template
// builder. Clicking a chip inserts a {Named Tag} — no typing, no {{1}} syntax.
// Green chips fill themselves from data; amber chips ask the teacher to type a
// value before sending. Includes a plain-English "What is a variable?" explainer.
export default function VariablePicker({ variables = [], onInsert }) {
  const [showHelp, setShowHelp] = useState(false);

  // Preserve backend order while grouping.
  const groups = [];
  const byGroup = {};
  variables.forEach((v) => {
    if (!byGroup[v.group]) { byGroup[v.group] = []; groups.push(v.group); }
    byGroup[v.group].push(v);
  });

  return (
    <div className="rounded-xl border border-[#EBEAE7] bg-[#FBFAF8] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700">
          <Sparkles size={13} className="text-whatsapp-green-fg" /> Add student info
        </span>
        <button type="button" onClick={() => setShowHelp((s) => !s)}
          className="flex items-center gap-1 text-[11px] text-neutral-500 hover:text-neutral-800">
          <HelpCircle size={12} /> What is this?
        </button>
      </div>

      {showHelp && (
        <div className="mb-2.5 rounded-lg bg-white border border-[#EBEAE7] p-2.5 text-[11px] text-neutral-600 leading-relaxed">
          A <span className="font-semibold">variable</span> is a piece of info that changes for each student.
          Tap one to drop it into your message. For example
          <span className="mx-1 px-1 py-0.5 rounded bg-[#F1EFEC] font-mono text-[10px]">{'{Student Name}'}</span>
          becomes <span className="font-medium">“Arjun”</span> for Arjun and <span className="font-medium">“Meera”</span> for Meera —
          automatically, one message at a time.
        </div>
      )}

      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1">{g}</p>
            <div className="flex flex-wrap gap-1.5">
              {byGroup[g].map((v) => {
                const ask = v.kind === 'ask';
                return (
                  <button key={v.name} type="button" title={v.description}
                    onClick={() => onInsert && onInsert('{' + v.name + '}')}
                    className={`flex items-center gap-1 text-[11px] px-2 py-1 rounded-pill border transition-colors ${
                      ask
                        ? 'bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100'
                        : 'bg-whatsapp-green-light/50 border-whatsapp-green-fg/20 text-whatsapp-green-fg hover:bg-whatsapp-green-light'}`}>
                    {ask ? <Pencil size={10} /> : <Wand2 size={10} />} {v.name}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-[#F1EFEC] text-[10px] text-neutral-400">
        <span className="flex items-center gap-1"><Wand2 size={10} className="text-whatsapp-green-fg" /> Fills automatically</span>
        <span className="flex items-center gap-1"><Pencil size={10} className="text-amber-500" /> You type it before sending</span>
      </div>
    </div>
  );
}
