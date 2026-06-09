import React, { useEffect, useState } from 'react';
import { GraduationCap, Send, Eye, X, Loader2, CheckCircle2, Bell } from 'lucide-react';
import { whatsappApi } from '../../../lib/api';
import { examResultsPayload } from './reportDefaults';

// Smart "Pending Actions" card — auto-detected exams whose results haven't been
// sent to parents yet. One click sends all, or jump to the Reports flow to review
// first, or dismiss. Renders nothing when the teacher is all caught up.
export default function PendingActions({ onReview, onSent }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);   // test_id currently sending/dismissing
  const [done, setDone] = useState({});     // test_id -> confirmation label

  const load = async () => {
    try { setData(await whatsappApi.getPending()); }
    catch { setData(null); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return null;  // stay quiet until we know there's something to show
  const exams = data?.exam_results?.exams || [];
  const total = data?.exam_results?.total_parents || 0;
  if (total === 0) return null;

  const sendAll = async (exam) => {
    if (!confirm(`Send results to ${exam.pending_parents} parent${exam.pending_parents === 1 ? '' : 's'} for “${exam.title}”?`)) return;
    setBusy(exam.test_id);
    try {
      const r = await whatsappApi.sendReports(examResultsPayload(exam.test_id));
      setDone(d => ({ ...d, [exam.test_id]: `Sent ${r.sent}/${r.results.length}` }));
      onSent?.();
      await load();
    } catch (e) { alert(e.message); } finally { setBusy(null); }
  };

  const dismiss = async (exam) => {
    setBusy(exam.test_id);
    try { await whatsappApi.dismissPending(exam.test_id); await load(); }
    catch (e) { alert(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="mb-4 glass-panel border border-[#EBEAE7] rounded-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[#F1EFEC] bg-[#FBFBFA]">
        <Bell size={15} className="text-whatsapp-green-fg" />
        <h3 className="text-sm font-semibold text-neutral-800 flex-1">Pending Actions</h3>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill text-xs font-semibold bg-red-50 text-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Exam Results: {total}
        </span>
      </div>

      <div className="divide-y divide-[#F4F2EF]">
        {exams.map((exam) => {
          const sent = done[exam.test_id];
          const isBusy = busy === exam.test_id;
          return (
            <div key={exam.test_id} className="px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-whatsapp-green-light flex items-center justify-center flex-shrink-0">
                <GraduationCap size={15} className="text-whatsapp-green-fg" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-800 truncate">{exam.title}</p>
                <p className="text-[11px] text-neutral-500 truncate">
                  {[exam.standard_name, exam.subject_name].filter(Boolean).join(' · ')}
                  {(exam.standard_name || exam.subject_name) ? ' · ' : ''}
                  {exam.pending_parents} parent{exam.pending_parents === 1 ? '' : 's'} to notify
                </p>
              </div>
              {sent ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-whatsapp-green-fg flex-shrink-0">
                  <CheckCircle2 size={14} /> {sent}
                </span>
              ) : (
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => sendAll(exam)} disabled={isBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold bg-whatsapp-green text-white hover:opacity-90 disabled:opacity-50">
                    {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Send all
                  </button>
                  <button onClick={() => onReview?.(exam.test_id)} disabled={isBusy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill text-xs font-semibold bg-white border border-[#EBEAE7] text-neutral-700 hover:bg-[#F4F2EF] disabled:opacity-50">
                    <Eye size={13} /> Review
                  </button>
                  <button onClick={() => dismiss(exam)} disabled={isBusy} title="Dismiss"
                    className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-[#F4F2EF] disabled:opacity-50">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-4 py-2 text-[11px] text-neutral-400 bg-[#FBFBFA] border-t border-[#F1EFEC]">
        Total pending: {total} parent{total === 1 ? '' : 's'} across {exams.length} exam{exams.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
