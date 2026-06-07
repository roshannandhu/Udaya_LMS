import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input, Textarea, Toggle, Btn } from '../../ui';

const PRESET = [
  { min: 0, max: 20, message: 'Your child needs to focus — let us work together to improve.', attach_report: true },
  { min: 20, max: 50, message: 'Your child is performing at an average level. Room to grow!', attach_report: true },
  { min: 50, max: null, message: 'Great work! Your child is doing well.', attach_report: true },
];

// Build score bands [{min,max,message,template_name,attach_report}]. `value` is
// owned by the parent.
export default function CriteriaBuilder({ value = [], onChange, templates = [] }) {
  const approved = templates.filter(t => t.status === 'approved');

  const update = (i, patch) => onChange(value.map((b, idx) => idx === i ? { ...b, ...patch } : b));
  const remove = (i) => onChange(value.filter((_, idx) => idx !== i));
  const add = () => onChange([...value, { min: 0, max: null, message: '', attach_report: true }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Different message by score
        </span>
        <div className="flex gap-2">
          {value.length === 0 && (
            <button className="text-xs font-medium text-whatsapp-green-fg hover:underline"
              onClick={() => onChange(PRESET)}>Use preset</button>
          )}
          <button className="text-xs font-medium text-whatsapp-green-fg hover:underline flex items-center gap-1"
            onClick={add}><Plus size={13} /> Add band</button>
        </div>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-neutral-400 px-1">
          Optional — every selected student gets the same message. Add bands (e.g. below 20%, 20–50%, above 50%) to send different wording by score.
        </p>
      )}

      {value.map((band, i) => (
        <div key={i} className="glass-panel border border-[#EBEAE7] rounded-xl p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <Input label="Min %" type="number" value={band.min ?? ''}
                onChange={(e) => update(i, { min: e.target.value === '' ? null : Number(e.target.value) })} />
              <Input label="Max % (blank = no upper)" type="number" value={band.max ?? ''}
                onChange={(e) => update(i, { max: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
            <button onClick={() => remove(i)} className="text-red-500 hover:bg-red-50 p-2 rounded-lg mt-4">
              <Trash2 size={15} />
            </button>
          </div>

          <Textarea label="Message" rows={2} placeholder="e.g. Needs to focus…"
            value={band.message || ''} onChange={(e) => update(i, { message: e.target.value })} />

          {approved.length > 0 && (
            <div>
              <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Template (optional)</label>
              <select value={band.template_name || ''}
                onChange={(e) => update(i, { template_name: e.target.value || null })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none">
                <option value="">Free-form message</option>
                {approved.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-neutral-700">Attach report card</span>
            <Toggle checked={band.attach_report !== false}
              onChange={(v) => update(i, { attach_report: v })} />
          </div>
        </div>
      ))}
    </div>
  );
}
