import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Bell, Trash2, Check, Loader2 } from 'lucide-react';
import { Btn, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient } from '../../lib/api';

function fmtDue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function RemindersPage() {
  const navigate = useNavigate();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ title: '', note: '', due: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await apiClient('/reminders');
        setReminders(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = async (r) => {
    const updated = { done: !r.done };
    setReminders(rs => rs.map(x => x.id === r.id ? { ...x, ...updated } : x));
    try {
      await apiClient(`/reminders/${r.id}`, { method: 'PATCH', body: JSON.stringify(updated) });
    } catch (err) {
      console.error(err);
      setReminders(rs => rs.map(x => x.id === r.id ? { ...x, done: r.done } : x));
    }
  };

  const remove = async (id) => {
    setReminders(rs => rs.filter(r => r.id !== id));
    try {
      await apiClient(`/reminders/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleAdd = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const created = await apiClient('/reminders', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          context: form.note.trim() || null,
          scheduled_for: form.due || null,
        }),
      });
      setReminders(rs => [created, ...rs]);
      setForm({ title: '', note: '', due: '' });
      setModalOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const active = reminders.filter(r => !r.done);
  const done   = reminders.filter(r =>  r.done);

  const ReminderCard = ({ r }) => (
    <div className={`flex items-start gap-3 px-4 py-3 glass-panel rounded-xl shadow-sm transition-colors ${r.done ? 'border-white/40 opacity-60 bg-white/20' : 'border-white/60 hover:bg-[#F4F2EF]'}`}>
      <button onClick={() => toggle(r)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${r.done ? 'bg-green-500 border-green-500 text-white' : 'border-neutral-300 hover:border-neutral-500'}`}>
        {r.done && <Check size={11} strokeWidth={3} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${r.done ? 'line-through text-neutral-400' : ''}`}>{r.title}</p>
        {r.context && <p className="text-xs text-neutral-500 mt-0.5">{r.context}</p>}
        {r.scheduled_for && <p className="text-xs text-neutral-400 mt-1"><Bell size={10} className="inline mr-1" />{fmtDue(r.scheduled_for)}</p>}
      </div>
      <button onClick={() => remove(r.id)} className="p-1.5 text-neutral-300 hover:text-red-500 transition-colors rounded">
        <Trash2 size={13} />
      </button>
    </div>
  );

  return (
    <div>
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-3 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md"><ArrowLeft size={16} /></button>
          <h1 className="text-lg md:text-xl font-semibold flex-1">Reminders</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => setModalOpen(true)}>Add</Btn>
        </div>
      </div>

      <div className="px-3 md:px-8 py-6 max-w-5xl mx-auto space-y-6">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div>
              <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Upcoming · {active.length}</p>
              {active.length === 0 ? (
                <div className="text-center py-10 glass-panel border-dashed border-[#D8D6D2] rounded-xl">
                  <Bell size={28} className="mx-auto mb-2 text-neutral-400" />
                  <p className="text-sm text-neutral-600">No pending reminders.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {active.map(r => <ReminderCard key={r.id} r={r} />)}
                </div>
              )}
            </div>

            {done.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Done · {done.length}</p>
                <div className="space-y-2">
                  {done.map(r => <ReminderCard key={r.id} r={r} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New reminder">
        <div className="space-y-4">
          <Input label="Title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Grade weekly test" autoFocus />
          <Input label="Note (optional)" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Any extra detail" />
          <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">Due date & time</label>
            <input type="datetime-local" value={form.due} onChange={e => setForm({ ...form, due: e.target.value })}
              className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 outline-none text-sm" />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <Btn variant="ghost" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</Btn>
            <Btn variant="primary" onClick={handleAdd} disabled={saving}>
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Add reminder'}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
