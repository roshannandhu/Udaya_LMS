import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import { Btn, Modal } from '../../ui';
import { liveClassApi } from '../../../lib/api';

export default function ScheduleSubjectLiveModal({ open, onClose, classId, subjectName, onScheduled }) {
  const [title, setTitle]       = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [duration, setDuration] = useState(60);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!open) { setTitle(''); setDate(''); setTime(''); setDuration(60); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim() || !date || !time) return;
    setSaving(true); setError('');
    try {
      await liveClassApi.create({ class_id: classId, title: title.trim(), scheduled_at: `${date}T${time}:00`, duration_mins: duration });
      onScheduled();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to schedule. Check Zoom credentials.');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Schedule live class — ${subjectName || ''}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Title</label>
          <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Chapter 5 — Quadratic Equations"
            className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Date</label>
            <input type="date" value={date} min={today} onChange={e=>setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Time</label>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Duration</label>
          <select value={duration} onChange={e=>setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm">
            {[30,45,60,90,120].map(m=><option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        {error && <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{error}</div>}
        <Btn variant="primary" onClick={handleSubmit} disabled={!title.trim()||!date||!time||saving} className="w-full justify-center">
          {saving ? 'Scheduling…' : 'Schedule class'}
        </Btn>
      </div>
    </Modal>
  );
}
