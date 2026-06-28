import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Check, X, Loader2, FileQuestion, ClipboardList } from 'lucide-react';
import { Avatar } from '../ui';
import { testApi, assignmentApi } from '../../lib/api';
import { fadeUp } from '../../lib/motion';
import { useAutoRefresh } from '../../lib/useAutoRefresh';

// Unified dashboard surface for ALL pending re-attempt requests (tests +
// assignments) across the teacher's classes, with one-tap approve/reject.
// Self-fetching; renders nothing when there are no pending requests. This is the
// teacher's single discovery point — previously they had to open each test's
// Results sheet / each assignment's Submissions sheet to find requests.
export default function PendingReattemptsCard({ onCountChange }) {
  const [rows, setRows] = useState([]);   // unified: {key, kind, id, name, avatar, title, reason, old}
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null); // key being processed

  const load = useCallback(async () => {
    try {
      const [tests, assigns] = await Promise.all([
        testApi.getReattemptRequests().catch(() => []),
        assignmentApi.getReattemptRequests().catch(() => []),
      ]);
      const t = (Array.isArray(tests) ? tests : []).map(r => ({
        key: `t-${r.id}`, kind: 'test', id: r.id,
        name: r.students?.name || 'Student', avatar: r.students?.avatar_url,
        title: r.tests?.title || 'Test', reason: r.reason,
        old: r.old_score != null ? `${r.old_score}` : null,
      }));
      const a = (Array.isArray(assigns) ? assigns : []).map(r => ({
        key: `a-${r.id}`, kind: 'assignment', id: r.id,
        name: r.students?.name || 'Student', avatar: r.students?.avatar_url,
        title: r.assignments?.title || 'Assignment', reason: r.reason,
        old: r.old_marks != null ? `${r.old_marks}/100` : null,
      }));
      setRows([...t, ...a]);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  // Live refresh on focus / visibility / data-changed signal — a student filing a
  // new request shows up on its own (the approve/reject path keeps optimistic removal).
  useAutoRefresh(load);

  useEffect(() => { onCountChange?.(rows.length); }, [rows.length, onCountChange]);

  const act = async (row, action) => {
    setBusy(row.key);
    try {
      const api = row.kind === 'test' ? testApi : assignmentApi;
      if (action === 'approve') await api.approveReattempt(row.id);
      else await api.rejectReattempt(row.id);
      setRows(prev => prev.filter(r => r.key !== row.key));
    } catch (err) {
      alert(err?.message || 'Action failed. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (loading || rows.length === 0) return null;

  return (
    <motion.div variants={fadeUp}>
      <h2 className="text-[13px] font-extrabold uppercase tracking-widest text-neutral-500 mb-3 px-1 flex items-center gap-2">
        <RotateCcw size={15} /> Re-attempt requests
        <span className="min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-bold text-white bg-amber-500 rounded-full">
          {rows.length}
        </span>
      </h2>
      <div className="bg-white rounded-card shadow-soft border border-[#EFEDEA] overflow-hidden divide-y divide-black/5">
        {rows.map(row => {
          const isBusy = busy === row.key;
          const Icon = row.kind === 'test' ? FileQuestion : ClipboardList;
          return (
            <div key={row.key} className="flex items-start gap-3 px-4 py-3">
              <Avatar name={row.name} src={row.avatar} size="sm" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-sm font-semibold text-neutral-900 truncate">{row.name}</p>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${row.kind === 'test' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                    <Icon size={10} /> {row.kind === 'test' ? 'Test' : 'Assignment'}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 truncate mt-0.5">
                  {row.title}{row.old ? ` · current ${row.old}` : ''}
                </p>
                {row.reason && (
                  <p className="text-[11px] text-neutral-600 bg-neutral-50 border border-neutral-100 rounded-lg px-2 py-1 mt-1.5 whitespace-pre-wrap line-clamp-3">"{row.reason}"</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  disabled={isBusy}
                  onClick={() => act(row, 'reject')}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-40"
                  title="Reject"
                >
                  <X size={16} />
                </button>
                <button
                  disabled={isBusy}
                  onClick={() => act(row, 'approve')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Approve
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
