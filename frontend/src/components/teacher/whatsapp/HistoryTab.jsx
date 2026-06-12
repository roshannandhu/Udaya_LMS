import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Tag, Skeleton, Avatar } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import { fmtDate, msgType } from './RecentMessagesTable';

const STATUS = {
  queued:        { c: 'gray',  l: 'Queued' },
  sent:          { c: 'blue',  l: 'Sent' },
  delivered:     { c: 'sky',   l: 'Delivered' },
  read:          { c: 'green', l: 'Read' },
  failed:        { c: 'red',   l: 'Failed' },
  not_configured:{ c: 'amber', l: 'Pending' },
};

export default function HistoryTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try { setData(await whatsappApi.getMessages(200)); }
    catch { setData({ messages: [], spend_total: 0 }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    let r = data?.messages || [];
    if (statusFilter === 'pending') r = r.filter((m) => m.status === 'queued' || m.status === 'not_configured');
    else if (statusFilter) r = r.filter((m) => m.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) r = r.filter((m) => (m.to_phone || '').toLowerCase().includes(q) || (m.student_name || '').toLowerCase().includes(q));
    return r;
  }, [data, statusFilter, search]);

  return (
    <div>
      {/* spend + controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <div className="glass-panel border border-[#EBEAE7] rounded-xl px-3 py-2 flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-neutral-500">Total spend</span>
          <span className="text-base font-bold">₹{(data?.spend_total ?? 0).toFixed(2)}</span>
        </div>
        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or number…"
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-white border border-[#EFEDEA] text-sm outline-none focus:border-neutral-400" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] text-sm">
            <option value="">All status</option>
            <option value="delivered">Delivered</option>
            <option value="read">Read</option>
            <option value="sent">Sent</option>
            <option value="failed">Failed</option>
            <option value="pending">Pending</option>
          </select>
          <button onClick={load} className="p-2 rounded-lg hover:bg-[#F4F2EF]"><RefreshCw size={15} className="text-neutral-500" /></button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="glass-panel rounded-card border border-[#EBEAE7] overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-6 text-center text-sm text-neutral-400">No messages match.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  {/* px-2 below sm + Cost hidden on phones: Recipient/Type/Status
                      must fit a 390px screen without forcing horizontal scroll. */}
                  <tr className="bg-[#F8F7F5] border-b border-[#EFEDEA]">
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500">Recipient</th>
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500 hidden sm:table-cell">Class</th>
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500">Type</th>
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500 hidden md:table-cell">Sent</th>
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500 text-right hidden sm:table-cell">Cost</th>
                    <th className="py-2.5 px-2 sm:px-4 text-xs font-semibold text-neutral-500 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFEDEA]">
                  {rows.map((m) => {
                    const st = STATUS[m.status] || STATUS.queued;
                    return (
                      <tr key={m.id} className="hover:bg-white/40 transition-colors">
                        <td className="py-2.5 px-2 sm:px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar name={m.student_name || m.to_phone} size="xs" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.student_name || m.to_phone}</p>
                              {m.student_name && <p className="text-[11px] text-neutral-400 truncate">{m.to_phone}</p>}
                              {m.error && <p className="text-[11px] text-red-500 truncate">{m.error}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 sm:px-4 text-sm text-neutral-600 hidden sm:table-cell">{m.standard_name || '—'}</td>
                        <td className="py-2.5 px-2 sm:px-4"><Tag color="gray">{msgType(m)}</Tag></td>
                        <td className="py-2.5 px-2 sm:px-4 text-xs text-neutral-500 hidden md:table-cell">{fmtDate(m.created_at)}</td>
                        <td className="py-2.5 px-2 sm:px-4 text-right text-xs text-neutral-500 hidden sm:table-cell">₹{Number(m.cost_amount || 0).toFixed(2)}</td>
                        <td className="py-2.5 px-2 sm:px-4 text-right"><Tag color={st.c}>{st.l}</Tag></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
