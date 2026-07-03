import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Check, CheckCheck, Clock, MessagesSquare, Paperclip,
  RefreshCw, Search, Send, WifiOff,
} from 'lucide-react';
import { Avatar, Skeleton } from '../../ui';
import { whatsappApi } from '../../../lib/api';
import useWaInboxSocket from '../../../hooks/useWaInboxSocket';

// WhatsApp-style two-way parent chat. Desktop: thread list + conversation side by
// side. Phone: list first, tapping opens the conversation full-width with a back
// button. Threads always show the matched student's NAME (unmatched numbers are
// never stored by the backend).

const keyOf = (phone) => {
  const d = String(phone || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-10) : (d || '?');
};

const timeShort = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

const dayLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(today); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

function Ticks({ status }) {
  if (!status || status === 'queued') return <Clock size={12} className="text-neutral-400" />;
  if (status === 'sent') return <Check size={13} className="text-neutral-400" />;
  if (status === 'delivered') return <CheckCheck size={13} className="text-neutral-400" />;
  if (status === 'read') return <CheckCheck size={13} className="text-sky-500" />;
  return null;
}

function Bubble({ m }) {
  const out = m.direction === 'out';
  const isImage = (m.media_type || '').startsWith('image/');
  return (
    <div className={`flex ${out ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[80%] rounded-2xl px-3 py-2 shadow-sm ${
        out ? 'bg-whatsapp-green-light rounded-br-sm' : 'bg-white border border-[#EFEDEA] rounded-bl-sm'
      }`}>
        {m.media_url && (
          isImage ? (
            <a href={m.media_url} target="_blank" rel="noreferrer">
              <img src={m.media_url} alt="attachment" className="rounded-lg max-h-56 mb-1 object-cover" loading="lazy" />
            </a>
          ) : (
            <a href={m.media_url} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 text-xs font-medium text-whatsapp-green-fg underline mb-1">
              <Paperclip size={13} /> Attachment
            </a>
          )
        )}
        {m.body && <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words">{m.body}</p>}
        <div className="flex items-center justify-end gap-1 mt-0.5">
          <span className="text-[10px] text-neutral-400">{timeShort(m.at)}</span>
          {out && <Ticks status={m.status} />}
        </div>
      </div>
    </div>
  );
}

export default function ChatsTab({ connection, onUnreadChange }) {
  const [threads, setThreads] = useState(null); // null = loading
  const [activeKey, setActiveKey] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const scrollRef = useRef(null);
  const activeKeyRef = useRef(null);
  activeKeyRef.current = activeKey;

  const connected = !!connection?.connected;

  const reportUnread = useCallback((list) => {
    const total = (list || []).reduce((a, t) => a + (t.unread || 0), 0);
    onUnreadChange?.(total);
  }, [onUnreadChange]);

  const load = useCallback(async () => {
    try {
      const r = await whatsappApi.getInbox();
      setThreads(r.threads || []);
      reportUnread(r.threads || []);
    } catch {
      setThreads([]);
    }
  }, [reportUnread]);

  useEffect(() => { load(); }, [load]);

  // Live: append messages pushed by the backend (parent replies, phone-sent, other devices).
  useWaInboxSocket(useCallback((data) => {
    if (data?.type !== 'wa_message' || !data.message) return;
    const key = keyOf(data.thread_phone);
    setThreads((prev) => {
      const list = [...(prev || [])];
      let t = list.find((x) => keyOf(x.from_phone) === key);
      const isOpen = activeKeyRef.current === key;
      const msg = { ...data.message, read: data.message.read || isOpen };
      if (!t) {
        t = { from_phone: data.thread_phone, student_id: data.student_id,
              student_name: data.student_name, standard_name: data.standard_name,
              unread: 0, messages: [] };
        list.unshift(t);
      }
      if (t.messages.some((m) => m.id && m.id === msg.id)) return prev; // dedupe echo
      t.messages = [...t.messages, msg];
      t.last_at = msg.at;
      t.last_body = msg.body;
      if (msg.direction === 'in' && !isOpen) t.unread = (t.unread || 0) + 1;
      const sorted = list.sort((a, b) => (b.last_at || '').localeCompare(a.last_at || ''));
      reportUnread(sorted);
      return [...sorted];
    });
    // Reading it live in the open thread → persist the read mark.
    if (data.message.direction === 'in' && activeKeyRef.current === key) {
      whatsappApi.markInboxRead({ from_phone: data.thread_phone }).catch(() => {});
    }
  }, [reportUnread]));

  const openThread = (t) => {
    const key = keyOf(t.from_phone);
    setActiveKey(key);
    setSendError('');
    if (t.unread > 0) {
      whatsappApi.markInboxRead({ from_phone: t.from_phone }).catch(() => {});
      setThreads((prev) => {
        const next = (prev || []).map((x) => keyOf(x.from_phone) === key
          ? { ...x, unread: 0, messages: x.messages.map((m) => ({ ...m, read: true })) }
          : x);
        reportUnread(next);
        return next;
      });
    }
  };

  const current = useMemo(
    () => (threads || []).find((t) => keyOf(t.from_phone) === activeKey) || null,
    [threads, activeKey]
  );

  // Stick to the bottom like WhatsApp when opening / receiving.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeKey, current?.messages?.length]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !current || sending) return;
    setSending(true);
    setSendError('');
    try {
      const r = await whatsappApi.replyInbox({ to_phone: current.from_phone, text });
      setDraft('');
      const msg = r.message || { id: `tmp-${Date.now()}`, direction: 'out', body: text,
        at: new Date().toISOString(), status: 'queued', read: true };
      setThreads((prev) => (prev || []).map((t) => keyOf(t.from_phone) === activeKey
        ? { ...t, messages: t.messages.some((m) => m.id === msg.id) ? t.messages : [...t.messages, msg],
            last_at: msg.at, last_body: msg.body }
        : t));
    } catch (e) {
      setSendError(e?.message || 'Could not send. Check the WhatsApp connection.');
    } finally {
      setSending(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads || [];
    return (threads || []).filter((t) =>
      (t.student_name || '').toLowerCase().includes(q)
      || (t.standard_name || '').toLowerCase().includes(q)
      || (t.from_phone || '').includes(q));
  }, [threads, search]);

  // Group the open conversation's messages by day for WhatsApp-style separators.
  const grouped = useMemo(() => {
    const out = [];
    let lastDay = null;
    (current?.messages || []).forEach((m) => {
      const day = dayLabel(m.at);
      if (day !== lastDay) { out.push({ separator: day, id: `sep-${day}-${m.id}` }); lastDay = day; }
      out.push(m);
    });
    return out;
  }, [current]);

  if (threads === null) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  if (threads.length === 0) {
    return (
      <div className="glass-panel border border-[#EBEAE7] rounded-card p-8 text-center">
        <MessagesSquare size={28} className="mx-auto text-neutral-300 mb-2" />
        <p className="text-sm text-neutral-500">No chats yet.</p>
        <p className="text-xs text-neutral-400 mt-1">
          When a parent replies on WhatsApp, the conversation appears here with the student's name — and you can reply right from this screen.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(230px,1fr)_2fr] gap-3 md:h-[calc(100vh-220px)] md:min-h-[420px]">
      {/* ── Thread list ── */}
      <div className={`${activeKey ? 'hidden md:flex' : 'flex'} flex-col min-h-0`}>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-[#EBEAE7] bg-white focus:outline-none focus:border-whatsapp-green-fg/50" />
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-[#F4F2EF]" title="Refresh">
            <RefreshCw size={15} className="text-neutral-500" />
          </button>
        </div>
        <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1 pr-0.5">
          {filtered.map((t) => {
            const key = keyOf(t.from_phone);
            return (
              <button key={key} onClick={() => openThread(t)}
                className={`w-full text-left glass-panel border rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors ${
                  activeKey === key ? 'border-whatsapp-green-fg/40 bg-whatsapp-green-light/40' : 'border-[#EBEAE7] hover:bg-[#F4F2EF]'
                }`}>
                <Avatar name={t.student_name || t.from_phone} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.student_name || t.from_phone}</p>
                  <p className="text-xs text-neutral-500 truncate">
                    {t.last_body || (t.messages?.length ? '📎 Attachment' : '')}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-neutral-400">{timeShort(t.last_at)}</span>
                  {t.unread > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-whatsapp-green text-white text-[10px] font-bold flex items-center justify-center">{t.unread}</span>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-sm text-neutral-400 text-center py-8">No chats match "{search}"</p>
          )}
        </div>
      </div>

      {/* ── Conversation ── */}
      <div className={`${activeKey ? 'flex' : 'hidden md:flex'} flex-col min-h-0 glass-panel border border-[#EBEAE7] rounded-card overflow-hidden h-[calc(100vh-220px)] min-h-[420px] md:h-auto`}>
        {current ? (
          <>
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#F1EFEC] bg-white/70 shrink-0">
              <button onClick={() => setActiveKey(null)} className="md:hidden p-1.5 -ml-1 rounded-lg hover:bg-[#F4F2EF]">
                <ArrowLeft size={17} className="text-neutral-600" />
              </button>
              <Avatar name={current.student_name || current.from_phone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold truncate">{current.student_name || current.from_phone}</p>
                <p className="text-[11px] text-neutral-400 truncate">
                  {current.standard_name ? `${current.standard_name} · ` : ''}{current.from_phone}
                </p>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2 bg-[#FAF8F5]">
              {grouped.map((m) => m.separator ? (
                <div key={m.id} className="flex justify-center">
                  <span className="text-[10px] font-semibold text-neutral-400 bg-white border border-[#EFEDEA] rounded-full px-2.5 py-0.5 shadow-sm">{m.separator}</span>
                </div>
              ) : (
                <Bubble key={m.id} m={m} />
              ))}
            </div>

            {/* Composer */}
            <div className="border-t border-[#F1EFEC] bg-white/80 px-3 py-2.5 shrink-0">
              {!connected ? (
                <p className="text-xs text-neutral-400 flex items-center gap-1.5 py-1">
                  <WifiOff size={13} /> WhatsApp is not connected — link it in Settings to reply.
                </p>
              ) : (
                <>
                  {sendError && <p className="text-xs text-red-500 mb-1.5">{sendError}</p>}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                      }}
                      placeholder="Type a message"
                      rows={Math.min(4, Math.max(1, draft.split('\n').length))}
                      className="flex-1 resize-none px-3.5 py-2.5 text-sm rounded-2xl border border-[#EBEAE7] bg-white focus:outline-none focus:border-whatsapp-green-fg/50"
                    />
                    <button onClick={handleSend} disabled={!draft.trim() || sending}
                      className="w-10 h-10 shrink-0 rounded-full bg-whatsapp-green text-white flex items-center justify-center disabled:opacity-40 hover:brightness-95 transition-all">
                      <Send size={17} className="-ml-0.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-neutral-400 gap-2 p-8">
            <MessagesSquare size={30} className="opacity-40" />
            <p className="text-sm">Select a chat to read and reply</p>
          </div>
        )}
      </div>
    </div>
  );
}
