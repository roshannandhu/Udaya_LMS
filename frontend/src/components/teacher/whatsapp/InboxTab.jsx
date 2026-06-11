import React, { useEffect, useState } from 'react';
import { RefreshCw, Inbox as InboxIcon, MessageSquare } from 'lucide-react';
import { Avatar, Tag, Skeleton } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import { fmtDateTime } from '../../../lib/datetime';

function fmt(dt) {
  if (!dt) return '';
  return fmtDateTime(dt) || dt;
}

export default function InboxTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null); // from_phone

  const load = async () => {
    setLoading(true);
    try { setData(await whatsappApi.getInbox()); }
    catch { setData({ threads: [], unread: 0 }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openThread = async (t) => {
    setActive(t.from_phone);
    if (t.unread > 0) {
      try { await whatsappApi.markInboxRead({ from_phone: t.from_phone }); load(); } catch { /* ignore */ }
    }
  };

  const threads = data?.threads || [];
  const current = threads.find((t) => t.from_phone === active) || null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Inbox</h3>
          {data?.unread > 0 && <Tag color="green">{data.unread} unread</Tag>}
        </div>
        <button onClick={load} className="p-1.5 rounded-lg hover:bg-[#F4F2EF]"><RefreshCw size={15} className="text-neutral-500" /></button>
      </div>

      {loading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : threads.length === 0 ? (
        <div className="glass-panel border border-[#EBEAE7] rounded-card p-8 text-center">
          <InboxIcon size={28} className="mx-auto text-neutral-300 mb-2" />
          <p className="text-sm text-neutral-500">No replies yet.</p>
          <p className="text-xs text-neutral-400 mt-1">Parent replies appear here once your provider webhook is connected.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Thread list */}
          <div className="space-y-2">
            {threads.map((t) => (
              <button key={t.from_phone} onClick={() => openThread(t)}
                className={`w-full text-left glass-panel border rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  active === t.from_phone ? 'border-whatsapp-green-fg/40 bg-whatsapp-green-light/40' : 'border-[#EBEAE7] hover:bg-[#F4F2EF]'
                }`}>
                <Avatar name={t.student_name || t.from_phone} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.student_name || t.from_phone}</p>
                  <p className="text-xs text-neutral-500 truncate">{t.messages?.[0]?.body || '📎 Attachment'}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-[10px] text-neutral-400">{fmt(t.last_at)}</span>
                  {t.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-whatsapp-green text-white text-[10px] font-bold flex items-center justify-center">{t.unread}</span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Conversation */}
          <div className="glass-panel border border-[#EBEAE7] rounded-card p-3 min-h-[200px]">
            {current ? (
              <>
                <div className="flex items-center gap-2 pb-2 mb-2 border-b border-[#F1EFEC]">
                  <Avatar name={current.student_name || current.from_phone} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{current.student_name || current.from_phone}</p>
                    <p className="text-[11px] text-neutral-400 truncate">
                      {current.from_phone}{current.standard_name ? ` · ${current.standard_name}` : ''}
                    </p>
                  </div>
                </div>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {[...current.messages].reverse().map((m) => (
                    <div key={m.id} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-[#F4F2EF] px-3 py-2">
                      {m.body && <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words">{m.body}</p>}
                      {m.media_url && (
                        <a href={m.media_url} target="_blank" rel="noreferrer" className="text-xs text-whatsapp-green-fg underline">View attachment</a>
                      )}
                      <p className="text-[10px] text-neutral-400 mt-1">{fmt(m.received_at)}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-3 flex items-center gap-1">
                  <MessageSquare size={12} /> Read-only — reply from your WhatsApp Business app.
                </p>
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-neutral-400">Select a conversation</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
