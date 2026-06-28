import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Phone, BellOff, Pencil, Plus, Check, X, Users } from 'lucide-react';
import { Toggle } from '../../ui';
import { apiClient } from '../../../lib/api';

// Class-FIRST recipient picker: one tap on a class checkbox selects every
// eligible parent in that standard; expanding the row lets the teacher exclude
// individuals or add/fix a phone number inline. Controlled: parent owns the
// `selected` Set of student ids (same contract as RecipientPicker).
export default function ClassPicker({ groups = [], selected, onChange, onStudentUpdated }) {
  const [open, setOpen] = useState(() => new Set()); // collapsed by default — classes are the unit
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  const eligible = (s) => (s.parent_phone || s.phone) && !s.opted_out;

  const toggleOpen = (id) => {
    const next = new Set(open);
    next.has(id) ? next.delete(id) : next.add(id);
    setOpen(next);
  };

  const toggleStudent = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };

  const setGroup = (group, on) => {
    const next = new Set(selected);
    group.students.forEach(s => {
      if (!eligible(s)) return;
      on ? next.add(s.id) : next.delete(s.id);
    });
    onChange(next);
  };

  const startEdit = (s) => { setEditId(s.id); setEditVal(s.parent_phone || ''); };
  const cancelEdit = () => { setEditId(null); setEditVal(''); };
  const saveEdit = async (s) => {
    const phone = editVal.trim();
    if (saving) return;
    setSaving(true);
    try {
      await apiClient(`/students/${s.id}`, { method: 'PATCH', body: JSON.stringify({ parent_phone: phone }) });
      cancelEdit();
      onStudentUpdated?.();
    } catch (e) {
      alert(e.message || 'Could not save number');
    } finally { setSaving(false); }
  };

  const selectedTotal = groups.flatMap(g => g.students).filter(s => selected.has(s.id)).length;

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-neutral-500 px-1 flex items-center gap-1.5">
        <Users size={12} /> {selectedTotal === 0 ? 'Tap a class to message all its parents' : `${selectedTotal} parent${selectedTotal === 1 ? '' : 's'} selected`}
      </p>

      {groups.length === 0 && (
        <p className="text-sm text-neutral-400 px-1">No students found.</p>
      )}

      {groups.map((g) => {
        const selectable = g.students.filter(eligible);
        const noPhone = g.students.length - selectable.length;
        const groupSelected = selectable.filter(s => selected.has(s.id)).length;
        const allOn = selectable.length > 0 && groupSelected === selectable.length;
        const someOn = groupSelected > 0 && !allOn;
        const isOpen = open.has(g.standard_id);
        return (
          <div key={g.standard_id}
            className={`glass-panel border rounded-2xl overflow-hidden transition-colors ${
              groupSelected > 0 ? 'border-whatsapp-green-fg/40 bg-whatsapp-green-light/20' : 'border-[#EBEAE7]'}`}>
            <div className="flex items-center gap-3 px-3.5 py-3">
              {/* The big class checkbox — the primary interaction */}
              <button
                onClick={() => setGroup(g, !allOn)}
                disabled={selectable.length === 0}
                className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                  allOn ? 'bg-whatsapp-green border-whatsapp-green text-white'
                    : someOn ? 'bg-whatsapp-green-light border-whatsapp-green-fg/50 text-whatsapp-green-fg'
                    : 'bg-white border-[#D9D7D3] text-transparent'} disabled:opacity-40`}>
                <Check size={14} strokeWidth={3} />
              </button>
              <button onClick={() => setGroup(g, !allOn)} disabled={selectable.length === 0}
                className="flex-1 text-left min-w-0 disabled:opacity-50">
                <p className="font-semibold text-sm truncate">{g.standard_name || 'Class'}</p>
                <p className="text-[11px] text-neutral-500">
                  {groupSelected > 0 ? `${groupSelected} of ${selectable.length} parents` : `${selectable.length} parent${selectable.length === 1 ? '' : 's'}`}
                  {noPhone > 0 && ` · ${noPhone} no number`}
                </p>
              </button>
              <button onClick={() => toggleOpen(g.standard_id)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 hover:bg-black/5 flex-shrink-0"
                title="Show students">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-[#F1EFEC] divide-y divide-[#F4F2EF] bg-white">
                {g.students.map((s) => {
                  const ok = eligible(s);
                  const editing = editId === s.id;
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3.5 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.name}</p>
                        {editing ? (
                          <div className="flex items-center gap-1.5 mt-1">
                            <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)}
                              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(s); if (e.key === 'Escape') cancelEdit(); }}
                              placeholder="+91…" type="tel"
                              className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-white border border-[#EFEDEA] text-xs outline-none focus:border-neutral-400" />
                            <button onClick={() => saveEdit(s)} disabled={saving}
                              className="p-1 rounded-md text-whatsapp-green-fg hover:bg-whatsapp-green-light"><Check size={14} /></button>
                            <button onClick={cancelEdit} className="p-1 rounded-md text-neutral-400 hover:bg-[#F4F2EF]"><X size={14} /></button>
                          </div>
                        ) : (
                          <button onClick={() => startEdit(s)}
                            className="text-xs text-neutral-500 flex items-center gap-1 hover:text-neutral-800 group">
                            <Phone size={11} />
                            {s.parent_phone
                              ? <span className="inline-flex items-center gap-1">{s.parent_phone}<Pencil size={10} className="opacity-0 group-hover:opacity-60" /></span>
                              : <span className="inline-flex items-center gap-1 text-whatsapp-green-fg"><Plus size={11} /> Add parent number</span>}
                            {s.opted_out && <span className="inline-flex items-center gap-0.5 text-amber-600 ml-1"><BellOff size={11} /> opted out</span>}
                          </button>
                        )}
                      </div>
                      <Toggle checked={selected.has(s.id)} onChange={() => ok && toggleStudent(s.id)} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
