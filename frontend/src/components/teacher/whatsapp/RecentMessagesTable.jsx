import React from 'react';
import { Tag, Avatar } from '../../ui';

const STATUS = {
  queued:        { c: 'gray',  l: 'Queued' },
  sent:          { c: 'blue',  l: 'Sent' },
  delivered:     { c: 'sky',   l: 'Delivered' },
  read:          { c: 'green', l: 'Read' },
  failed:        { c: 'red',   l: 'Failed' },
  not_configured:{ c: 'amber', l: 'Pending' },
};

export function fmtDate(dt) {
  if (!dt) return '—';
  try { return new Date(dt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return dt; }
}

export function msgType(m) {
  if (m.media_type) {
    if (/pdf|document/i.test(m.media_type)) return 'PDF';
    if (/image/i.test(m.media_type)) return 'Image';
    if (/audio/i.test(m.media_type)) return 'Audio';
    return 'Media';
  }
  return m.template_name ? 'Template' : 'Text';
}

export default function RecentMessagesTable({ messages = [] }) {
  return (
    <div className="glass-panel rounded-card border border-[#EBEAE7] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#EFEDEA]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Recent messages</h3>
      </div>
      {messages.length === 0 ? (
        <div className="p-6 text-center text-sm text-neutral-400">No messages sent yet</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F8F7F5] border-b border-[#EFEDEA]">
                <th className="py-2.5 px-4 text-xs font-semibold text-neutral-500">Recipient</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-neutral-500 hidden sm:table-cell">Class</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-neutral-500">Type</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-neutral-500 hidden md:table-cell">Sent</th>
                <th className="py-2.5 px-4 text-xs font-semibold text-neutral-500 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EFEDEA]">
              {messages.map((m) => {
                const st = STATUS[m.status] || STATUS.queued;
                return (
                  <tr key={m.id} className="hover:bg-white/40 transition-colors">
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.student_name || m.to_phone} size="xs" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-neutral-900 truncate">{m.student_name || m.to_phone}</p>
                          {m.student_name && <p className="text-[11px] text-neutral-400 truncate">{m.to_phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-sm text-neutral-600 hidden sm:table-cell">{m.standard_name || '—'}</td>
                    <td className="py-2.5 px-4"><Tag color="gray">{msgType(m)}</Tag></td>
                    <td className="py-2.5 px-4 text-xs text-neutral-500 hidden md:table-cell">{fmtDate(m.created_at)}</td>
                    <td className="py-2.5 px-4 text-right"><Tag color={st.c}>{st.l}</Tag></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
