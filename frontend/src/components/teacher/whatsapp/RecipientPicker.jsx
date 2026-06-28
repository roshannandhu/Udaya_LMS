import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Phone, BellOff, Pencil, Plus, Check, X } from 'lucide-react';
import { Toggle, Tag } from '../../ui';
import { apiClient } from '../../../lib/api';

// Class accordions with per-student include toggles. Controlled: parent owns the
// `selected` Set of student ids. Students without a phone, or opted-out parents,
// can't be selected — but a phone can now be added/edited inline (writes
// students.phone via PATCH /students/{id}). `onStudentUpdated` lets the page
// refetch recipients so the new number appears.
export default function RecipientPicker({ groups = [], selected, onChange, onStudentUpdated }) {
  const [open, setOpen] = useState(() => new Set(groups.map(g => g.standard_id)));
  const [editId, setEditId] = useState(null);
  const [editVal, setEditVal] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleOpen = (id) => {
    const next = new Set(open);
    next.has(id) ? next.delete(id) : next.add(id);
    setOpen(next);
  };

  const eligible = (s) => s.phone && s.phone.trim() !== '' && !s.opted_out;

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
      onStudentUpdated?.();   // page refetches recipients (cache is cleared by the PATCH)
    } catch (e) {
      alert(e.message || 'Could not save number');
    } finally { setSaving(false); }
  };

  const allSelectableIds = groups.flatMap(g => g.students.filter(eligible).map(s => s.id));
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selected.has(id));
  const selectedTotal = allSelectableIds.filter(id => selected.has(id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-neutral-500">
          {selectedTotal} of {allSelectableIds.length} parents selected
        </span>
        <button
          className="text-xs font-medium text-whatsapp-green-fg hover:underline"
          onClick={() => onChange(allSelected ? new Set() : new Set(allSelectableIds))}>
          {allSelected ? 'Clear all' : 'Select all classes'}
        </button>
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-neutral-400 px-1">No students found.</p>
      )}

      {groups.map((g) => {
        const selectable = g.students.filter(eligible);
        const groupSelected = selectable.filter(s => selected.has(s.id)).length;
        const isOpen = open.has(g.standard_id);
        return (
          <div key={g.standard_id} className="glass-panel border border-[#EBEAE7] rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button onClick={() => toggleOpen(g.standard_id)} className="flex items-center gap-2 flex-1 text-left">
                {isOpen ? <ChevronDown size={16} className="text-neutral-400" /> : <ChevronRight size={16} className="text-neutral-400" />}
                <span className="font-medium text-sm">{g.standard_name || 'Class'}</span>
                <Tag color="gray">{groupSelected}/{selectable.length}</Tag>
              </button>
              <button
                className="text-xs font-medium text-neutral-600 hover:underline"
                onClick={() => setGroup(g, groupSelected < selectable.length)}>
                {groupSelected < selectable.length ? 'Select' : 'Clear'}
              </button>
            </div>

            {isOpen && (
              <div className="border-t border-[#F1EFEC] divide-y divide-[#F4F2EF]">
                {g.students.map((s) => {
                  const ok = eligible(s);
                  const editing = editId === s.id;
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2">
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
