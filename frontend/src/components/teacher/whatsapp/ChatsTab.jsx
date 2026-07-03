import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  ArrowLeft, Check, CheckCheck, ChevronDown, ChevronRight, Clock, MessagesSquare,
  Mic, Paperclip, RefreshCw, Search, Send, Trash2, Users, WifiOff,
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
  if (status === 'failed') return <span className="text-[10px] font-bold text-red-500" title="Not delivered">!</span>;
  if (!status || status === 'queued') return <Clock size={12} className="text-neutral-400" />;
  if (status === 'sent') return <Check size={13} className="text-neutral-400" />;
  if (status === 'delivered') return <CheckCheck size={13} className="text-neutral-400" />;
  if (status === 'read') return <CheckCheck size={13} className="text-sky-500" />;
  return null;
}

function Bubble({ m }) {
  const out = m.direction === 'out';
  const isImage = (m.media_type || '').startsWith('image/');
  const isAudio = (m.media_type || '').startsWith('audio/');
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
          ) : isAudio ? (
            <audio controls preload="metadata" src={m.media_url} className="max-w-[240px] h-10 mb-1" />
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

export default function ChatsTab({ connection, groups = [], onUnreadChange }) {
  const [threads, setThreads] = useState(null); // null = loading
  const [activeKey, setActiveKey] = useState(null);
  const [view, setView] = useState('chats'); // 'chats' | 'parents'
  const [openStd, setOpenStd] = useState(null); // expanded standard in parents view
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [attachment, setAttachment] = useState(null); // {url, type, name} | {uploading: true}
  const [recording, setRecording] = useState(null); // {startedAt} while the mic is live
  const [recElapsed, setRecElapsed] = useState(0);
  const recRef = useRef(null); // {recorder, chunks, stream, discard}
  const fileInputRef = useRef(null);
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
    // Tick updates: queued → sent → delivered → read for messages we sent.
    if (data?.type === 'wa_status' && data.id) {
      setThreads((prev) => (prev || []).map((t) => (
        t.messages.some((m) => m.id === data.id)
          ? { ...t, messages: t.messages.map((m) => (m.id === data.id ? { ...m, status: data.status } : m)) }
          : t
      )));
      return;
    }
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

  // Start (or jump to) a chat with any parent from the directory. A parent with
  // no prior conversation gets a client-side empty thread — the first sent
  // message makes it real server-side (logged to whatsapp_messages).
  const startChatWith = (s, standardName) => {
    if (!s.phone) return;
    const key = keyOf(s.phone);
    const existing = (threads || []).find((t) => keyOf(t.from_phone) === key);
    setView('chats');
    if (existing) { openThread(existing); return; }
    setThreads((prev) => [{
      from_phone: s.phone, student_id: s.id, student_name: s.name,
      standard_name: standardName, unread: 0, messages: [],
    }, ...(prev || [])]);
    setActiveKey(key);
    setSendError('');
  };

  // Stick to the bottom like WhatsApp when opening / receiving.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activeKey, current?.messages?.length]);

  // ── Voice notes (WhatsApp-style: mic → record → send on stop) ────────────────
  const sendVoiceBlob = async (blob, mime) => {
    if (!current || !blob || blob.size < 200) return; // ignore empty/accidental taps
    setSending(true);
    setSendError('');
    try {
      const ext = mime.includes('ogg') ? 'ogg' : mime.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `voice-note.${ext}`, { type: mime });
      const up = await whatsappApi.uploadMedia(file);
      const r = await whatsappApi.replyInbox({
        to_phone: current.from_phone, text: '',
        media_url: up.url, media_type: up.type || mime,
      });
      const msg = r.message || { id: `tmp-${Date.now()}`, direction: 'out', body: '',
        media_url: up.url, media_type: up.type || mime,
        at: new Date().toISOString(), status: 'queued', read: true };
      setThreads((prev) => (prev || []).map((t) => keyOf(t.from_phone) === activeKey
        ? { ...t, messages: t.messages.some((m) => m.id === msg.id) ? t.messages : [...t.messages, msg],
            last_at: msg.at, last_body: '🎤 Voice message' }
        : t));
    } catch (e) {
      setSendError(e?.message || 'Voice message failed to send.');
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (recording) return;
    setSendError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
        .find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const ctx = recRef.current;
        recRef.current = null;
        setRecording(null);
        if (!ctx || ctx.discard) return;
        const type = recorder.mimeType || mime || 'audio/webm';
        sendVoiceBlob(new Blob(chunks, { type }), type);
      };
      recRef.current = { recorder, chunks, stream, discard: false };
      recorder.start();
      setRecording({ startedAt: Date.now() });
      setRecElapsed(0);
    } catch {
      setSendError('Microphone unavailable — allow mic access to send voice messages.');
    }
  };

  const stopRecording = (discard = false) => {
    const ctx = recRef.current;
    if (!ctx) return;
    ctx.discard = discard;
    try { ctx.recorder.stop(); } catch { /* already stopped */ }
  };

  // Recording timer + cleanup if the component unmounts mid-recording.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setRecElapsed(Math.floor((Date.now() - recording.startedAt) / 1000)), 500);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => () => { if (recRef.current) { recRef.current.discard = true; try { recRef.current.recorder.stop(); } catch { /* noop */ } } }, []);

  const handlePickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // same file can be re-picked later
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setSendError('File too large (max 25 MB).'); return; }
    setSendError('');
    setAttachment({ uploading: true, name: file.name });
    try {
      const r = await whatsappApi.uploadMedia(file);
      setAttachment({ url: r.url, type: r.type || file.type, name: r.filename || file.name });
    } catch (err) {
      setAttachment(null);
      setSendError(err?.message || 'Attachment upload failed.');
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    const media = attachment && !attachment.uploading ? attachment : null;
    if ((!text && !media) || !current || sending || attachment?.uploading) return;
    setSending(true);
    setSendError('');
    try {
      const r = await whatsappApi.replyInbox({
        to_phone: current.from_phone, text,
        media_url: media?.url || null, media_type: media?.type || null,
      });
      setDraft('');
      setAttachment(null);
      const msg = r.message || { id: `tmp-${Date.now()}`, direction: 'out', body: text,
        media_url: media?.url || null, media_type: media?.type || null,
        at: new Date().toISOString(), status: 'queued', read: true };
      setThreads((prev) => (prev || []).map((t) => keyOf(t.from_phone) === activeKey
        ? { ...t, messages: t.messages.some((m) => m.id === msg.id) ? t.messages : [...t.messages, msg],
            last_at: msg.at, last_body: msg.body || '📎 Attachment' }
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

  // Parents directory: search across every class; otherwise grouped by standard.
  const parentSearch = view === 'parents' ? search.trim().toLowerCase() : '';
  const parentMatches = useMemo(() => {
    if (!parentSearch) return null;
    const out = [];
    (groups || []).forEach((g) => (g.students || []).forEach((s) => {
      if ((s.name || '').toLowerCase().includes(parentSearch)
        || (g.standard_name || '').toLowerCase().includes(parentSearch)
        || (s.phone || '').includes(parentSearch)) {
        out.push({ ...s, standard_name: g.standard_name });
      }
    }));
    return out;
  }, [groups, parentSearch]);

  if (threads === null) {
    return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }

  const threadKeys = new Set((threads || []).map((t) => keyOf(t.from_phone)));
  const effectiveOpenStd = openStd ?? groups[0]?.standard_id;

  const ParentRow = ({ s, standardName }) => (
    <button key={s.id} onClick={() => startChatWith(s, standardName)} disabled={!s.phone}
      className="w-full text-left glass-panel border border-[#EBEAE7] rounded-xl px-3 py-2.5 flex items-center gap-3 transition-colors hover:bg-[#F4F2EF] disabled:opacity-50 disabled:cursor-not-allowed">
      <Avatar name={s.name} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold truncate">{s.name}</p>
        <p className="text-xs text-neutral-500 truncate">{s.phone || 'No number'}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {s.opted_out && <span className="text-[9px] font-bold uppercase tracking-wide text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">Opted out</span>}
        {s.phone && threadKeys.has(keyOf(s.phone)) && <span className="w-2 h-2 rounded-full bg-whatsapp-green" title="Existing chat" />}
      </div>
    </button>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(230px,1fr)_2fr] gap-3 md:h-[calc(100vh-220px)] md:min-h-[420px]">
      {/* ── Thread list / parents directory ── */}
      <div className={`${activeKey ? 'hidden md:flex' : 'flex'} flex-col min-h-0`}>
        {/* View toggle: conversations vs the full parent directory by class */}
        <div className="flex items-center gap-0.5 p-1 bg-neutral-100/80 rounded-xl mb-2 self-start">
          <button onClick={() => setView('chats')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'chats' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
            <MessagesSquare size={13} /> Chats
          </button>
          <button onClick={() => setView('parents')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${view === 'parents' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500 hover:text-neutral-700'}`}>
            <Users size={13} /> All Parents
          </button>
        </div>
        <div className="flex items-center gap-2 mb-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={view === 'parents' ? 'Search parents' : 'Search chats'}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-xl border border-[#EBEAE7] bg-white focus:outline-none focus:border-whatsapp-green-fg/50" />
          </div>
          <button onClick={load} className="p-2 rounded-lg hover:bg-[#F4F2EF]" title="Refresh">
            <RefreshCw size={15} className="text-neutral-500" />
          </button>
        </div>

        <div className="space-y-1.5 overflow-y-auto min-h-0 flex-1 pr-0.5">
          {view === 'parents' ? (
            /* ── All parents, classified by standard ── */
            parentMatches ? (
              parentMatches.length === 0
                ? <p className="text-sm text-neutral-400 text-center py-8">No parents match "{search}"</p>
                : parentMatches.map((s) => <ParentRow key={s.id} s={s} standardName={s.standard_name} />)
            ) : (groups || []).length === 0 ? (
              <p className="text-sm text-neutral-400 text-center py-8">No students yet.</p>
            ) : (
              (groups || []).map((g) => (
                <div key={g.standard_id}>
                  <button onClick={() => setOpenStd(effectiveOpenStd === g.standard_id ? '' : g.standard_id)}
                    className="w-full flex items-center gap-2 px-2 py-2 text-left">
                    {effectiveOpenStd === g.standard_id
                      ? <ChevronDown size={15} className="text-neutral-400" />
                      : <ChevronRight size={15} className="text-neutral-400" />}
                    <span className="text-xs font-bold uppercase tracking-wider text-neutral-600 flex-1">{g.standard_name}</span>
                    <span className="text-[10px] font-bold text-neutral-400 bg-neutral-100 rounded-full px-2 py-0.5">{(g.students || []).length}</span>
                  </button>
                  {effectiveOpenStd === g.standard_id && (
                    <div className="space-y-1.5 mb-2">
                      {(g.students || []).map((s) => <ParentRow key={s.id} s={s} standardName={g.standard_name} />)}
                    </div>
                  )}
                </div>
              ))
            )
          ) : threads.length === 0 ? (
            /* ── No conversations yet ── */
            <div className="glass-panel border border-[#EBEAE7] rounded-card p-6 text-center">
              <MessagesSquare size={26} className="mx-auto text-neutral-300 mb-2" />
              <p className="text-sm text-neutral-500">No chats yet.</p>
              <p className="text-xs text-neutral-400 mt-1 mb-3">Parent replies appear here — or start the conversation yourself.</p>
              <button onClick={() => setView('parents')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-pill text-xs font-semibold bg-whatsapp-green text-white hover:brightness-95">
                <Users size={13} /> Browse all parents
              </button>
            </div>
          ) : (
            <>
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
                        {t.last_body || (t.messages?.length ? '📎 Attachment' : `${t.standard_name || ''}`)}
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
            </>
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
                  {attachment && (
                    <div className="flex items-center gap-2 mb-1.5 bg-[#F4F2EF] border border-[#EBEAE7] rounded-xl px-3 py-1.5 text-xs text-neutral-600">
                      <Paperclip size={13} className="shrink-0 text-neutral-400" />
                      <span className="flex-1 truncate font-medium">
                        {attachment.uploading ? `Uploading ${attachment.name}…` : attachment.name}
                      </span>
                      {!attachment.uploading && (
                        <button onClick={() => setAttachment(null)} className="text-neutral-400 hover:text-red-500 font-bold px-1">✕</button>
                      )}
                    </div>
                  )}
                  {recording ? (
                    /* ── Recording bar: cancel · pulsing timer · stop-and-send ── */
                    <div className="flex items-center gap-3 py-1">
                      <button onClick={() => stopRecording(true)} title="Discard"
                        className="w-10 h-10 shrink-0 rounded-full bg-[#F4F2EF] text-neutral-500 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all">
                        <Trash2 size={17} />
                      </button>
                      <div className="flex-1 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-sm font-semibold text-neutral-700 tabular-nums">
                          {Math.floor(recElapsed / 60)}:{String(recElapsed % 60).padStart(2, '0')}
                        </span>
                        <span className="text-xs text-neutral-400">Recording…</span>
                      </div>
                      <button onClick={() => stopRecording(false)} title="Send voice message"
                        className="w-10 h-10 shrink-0 rounded-full bg-whatsapp-green text-white flex items-center justify-center hover:brightness-95 transition-all">
                        <Send size={17} className="-ml-0.5" />
                      </button>
                    </div>
                  ) : (
                  <div className="flex items-end gap-2">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handlePickFile}
                      accept="image/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" />
                    <button onClick={() => fileInputRef.current?.click()} disabled={attachment?.uploading}
                      title="Attach a photo, PDF or document"
                      className="w-10 h-10 shrink-0 rounded-full bg-[#F4F2EF] text-neutral-500 flex items-center justify-center hover:bg-[#EBEAE7] disabled:opacity-40 transition-all">
                      <Paperclip size={17} />
                    </button>
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
                    {draft.trim() || attachment ? (
                      <button onClick={handleSend}
                        disabled={(!draft.trim() && !(attachment && !attachment.uploading)) || sending || attachment?.uploading}
                        className="w-10 h-10 shrink-0 rounded-full bg-whatsapp-green text-white flex items-center justify-center disabled:opacity-40 hover:brightness-95 transition-all">
                        <Send size={17} className="-ml-0.5" />
                      </button>
                    ) : (
                      /* WhatsApp behaviour: empty composer shows the mic */
                      <button onClick={startRecording} disabled={sending} title="Record a voice message"
                        className="w-10 h-10 shrink-0 rounded-full bg-whatsapp-green text-white flex items-center justify-center disabled:opacity-40 hover:brightness-95 transition-all">
                        <Mic size={17} />
                      </button>
                    )}
                  </div>
                  )}
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
