import React, { useEffect, useState } from 'react';
import { RefreshCw, Check, CheckCheck, X } from 'lucide-react';
import { Tag, Skeleton, SectionHeader } from '../../ui';
import { whatsappApi } from '../../../lib/api';

const STATUS = {
  queued:        { color: 'gray',  label: 'Queued' },
  sent:          { color: 'blue',  label: 'Sent' },
  delivered:     { color: 'sky',   label: 'Delivered' },
  read:          { color: 'green', label: 'Read' },
  failed:        { color: 'red',   label: 'Failed' },
  not_configured:{ color: 'amber', label: 'Not configured' },
};

function StatusIcon({ status }) {
  if (status === 'read') return <CheckCheck size={14} className="text-emerald-600" />;
  if (status === 'delivered') return <CheckCheck size={14} className="text-sky-500" />;
  if (status === 'sent') return <Check size={14} className="text-neutral-500" />;
  if (status === 'failed') return <X size={14} className="text-red-500" />;
  return null;
}

export default function HistoryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await whatsappApi.getMessages(200)); }
    catch { setData({ messages: [], spend_total: 0 }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <div>
      <SectionHeader title="History" count={data?.count}
        action={<button onClick={load} className="p-1.5 rounded-lg hover:bg-[#F4F2EF]"><RefreshCw size={15} className="text-neutral-500" /></button>} />

      <div className="glass-panel border border-[#EBEAE7] rounded-xl p-3 mb-3 flex items-center justify-between">
        <span className="text-sm text-neutral-600">Total spend</span>
        <span className="text-lg font-bold">₹{(data?.spend_total ?? 0).toFixed(2)}</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {(data?.messages || []).length === 0 && <p className="text-sm text-neutral-400 px-1">No messages sent yet.</p>}
          {(data?.messages || []).map(m => {
            const st = STATUS[m.status] || STATUS.queued;
            return (
              <div key={m.id} className="glass-panel border border-[#EBEAE7] rounded-xl px-3 py-2 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.to_phone}{m.template_name ? ` · ${m.template_name}` : ''}</p>
                  <p className="text-xs text-neutral-500 truncate">{m.body_text || m.media_type || '—'}</p>
                  {m.error && <p className="text-xs text-red-500 truncate">{m.error}</p>}
                </div>
                <span className="text-xs text-neutral-400">₹{Number(m.cost_amount || 0).toFixed(2)}</span>
                <div className="flex items-center gap-1">
                  <StatusIcon status={m.status} />
                  <Tag color={st.color}>{st.label}</Tag>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
