import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Edit2, Trash2, Pin, ArrowLeft, FileText, X, Loader2, Clock, Reply, Search, SmilePlus } from 'lucide-react';
import { apiClient, broadcastApi, getApiBaseUrl } from '../../lib/api';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function BroadcastThread({ std, broadcasts, onUpdate, onBack, showBackBtn, studentCount = 0 }) {
  const [msg, setMsg] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [readCounts, setReadCounts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [reactions, setReactions] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);
  const inputRef = useRef(null);

  const fetchReactions = () => {
    if (!std?.id) return;
    broadcastApi.getReactions(std.id)
      .then(data => {
        setReactions(data?.counts || {});
        setMyReactions(data?.mine || {});
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!std?.id) return;
    broadcastApi.getReadCounts(std.id)
      .then(counts => setReadCounts(counts || {}))
      .catch(() => {});
    fetchReactions();
  }, [std?.id, broadcasts.length]);

  useEffect(() => {
    const apiBase = getApiBaseUrl();
    const wsBase = apiBase.replace(/^http/, 'ws');
    const token = localStorage.getItem('tutoria_token') || '';
    const ws = new WebSocket(`${wsBase}/ws/broadcasts/${std.id}?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        const formatted = data.data.map(b => mapBroadcast(b));
        onUpdate(() => formatted);
      } else if (data.type === 'new_broadcast') {
        const newMsg = mapBroadcast(data.data);
        onUpdate((list) => {
          if (list.some(x => x.id === newMsg.id)) return list;
          return [...list, newMsg];
        });
      } else if (data.type === 'delete_broadcast') {
        const deletedId = data.id || data.data?.id;
        onUpdate((list) => list.filter(x => x.id !== deletedId));
      } else if (data.type === 'edit_broadcast') {
        const b = data.data;
        if (b) onUpdate((list) => list.map(x => x.id === b.id ? { ...x, text: b.message, edited: true } : x));
      } else if (data.type === 'reaction_update') {
        fetchReactions();
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [std.id]);

  function mapBroadcast(b) {
    return {
      id: b.id,
      text: b.message,
      sender: 'Teacher',
      senderRole: 'Class Teacher',
      time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
      pinned: false,
      attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type, name: 'Attachment' }] : [],
      edited: !!b.edited,
      deleted: !!b.deleted,
      readBy: 0,
      scheduled_for: b.scheduled_for || null,
      reply_to: b.reply_to || null,
      reply_to_text: b.reply_to_text || null,
      expires_at: b.expires_at || null,
    };
  }

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const token = localStorage.getItem('tutoria_token');
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      setAttachments([...attachments, { url: data.url, type: data.type, name: data.filename }]);
    } catch (err) {
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!msg.trim() && attachments.length === 0) return;
    if (editingId) {
      const savedMsg = msg;
      setEditingId(null); setMsg(''); setAttachments([]);
      try {
        await apiClient(`/broadcasts/${editingId}`, { method: 'PATCH', body: JSON.stringify({ message: savedMsg }) });
        onUpdate((list) => list.map((b) => b.id !== editingId ? b : { ...b, text: savedMsg, edited: true }));
      } catch (err) {
        setEditingId(editingId); setMsg(savedMsg);
      }
    } else {
      const payload = {
        standard_id: std.id,
        message: msg,
        attachment_url: attachments.length > 0 ? attachments[0].url : null,
        attachment_type: attachments.length > 0 ? attachments[0].type : null,
        reply_to: replyTo?.id || null,
      };
      if (scheduledFor) payload.scheduled_for = scheduledFor;
      setMsg(''); setAttachments([]); setShowSchedule(false); setScheduledFor(''); setReplyTo(null);
      try {
        await apiClient('/broadcasts', { method: 'POST', body: JSON.stringify(payload) });
      } catch (err) {
        console.error(err);
      }
    }
  };

  const handleReaction = async (broadcastId, emoji) => {
    const mine = myReactions[broadcastId] || [];
    const alreadyReacted = mine.includes(emoji);
    // Optimistic update
    setReactions(prev => {
      const updated = { ...prev };
      updated[broadcastId] = { ...(prev[broadcastId] || {}) };
      if (alreadyReacted) {
        updated[broadcastId][emoji] = Math.max(0, (updated[broadcastId][emoji] || 1) - 1);
        if (updated[broadcastId][emoji] === 0) delete updated[broadcastId][emoji];
      } else {
        updated[broadcastId][emoji] = (updated[broadcastId][emoji] || 0) + 1;
      }
      return updated;
    });
    setMyReactions(prev => {
      const mine2 = prev[broadcastId] || [];
      return { ...prev, [broadcastId]: alreadyReacted ? mine2.filter(e => e !== emoji) : [...mine2, emoji] };
    });
    try {
      if (alreadyReacted) {
        await broadcastApi.removeReaction(broadcastId, emoji);
      } else {
        await broadcastApi.addReaction(broadcastId, emoji);
      }
    } catch (err) {
      fetchReactions(); // revert on error
    }
  };

  const visibleBroadcasts = broadcasts.filter(b => {
    if (b.deleted) return false;
    if (searchQuery.trim()) return b.text?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  return (
    <>
      {/* Header */}
      {showBackBtn && (
        <div className="md:hidden flex items-center gap-2 px-4 py-2 border-b border-white/60 bg-white">
          <button onClick={onBack} className="p-1.5 text-neutral-500 hover:text-neutral-900 rounded hover:bg-white/60">
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{std.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{std.name}</p>
            <p className="text-[11px] text-neutral-500">{studentCount} students</p>
          </div>
          <button onClick={() => setShowSearch(s => !s)} className={`p-1.5 rounded hover:bg-white/60 ${showSearch ? 'text-neutral-900' : 'text-neutral-400'}`}>
            <Search size={15} />
          </button>
        </div>
      )}

      {/* Desktop search bar (shown above messages) */}
      {!showBackBtn && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/40">
          <span className="text-xl">{std.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{std.name}</p>
            <p className="text-[11px] text-neutral-500">{studentCount} students</p>
          </div>
          <button onClick={() => setShowSearch(s => !s)} className={`p-1.5 rounded hover:bg-white/60 ${showSearch ? 'text-neutral-900' : 'text-neutral-400'}`}>
            <Search size={15} />
          </button>
        </div>
      )}

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-white/60 border-b border-white/40 flex items-center gap-2">
          <Search size={14} className="text-neutral-400 flex-shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-neutral-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-700">
              <X size={13} />
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-white/30">
        {visibleBroadcasts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 px-6">
            <p className="text-sm font-medium mb-1">{searchQuery ? 'No matching messages' : 'No messages yet'}</p>
            {!searchQuery && <p className="text-xs">Send your first broadcast to {std.name}</p>}
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {visibleBroadcasts.map((b) => {
              const msgReactions = reactions[b.id] || {};
              const myEmojis = myReactions[b.id] || [];
              const isFutureScheduled = b.scheduled_for && new Date(b.scheduled_for) > new Date();
              const expiresIn = b.expires_at ? Math.round((new Date(b.expires_at) - Date.now()) / 3600000) : null;
              return (
                <div key={b.id} className="max-w-md group relative">
                  <div className={`rounded-xl p-3 shadow-sm ${isFutureScheduled ? 'bg-neutral-100/60 border border-neutral-200/60 opacity-75' : 'glass-panel'}`}>
                    {b.pinned && (
                      <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1.5">
                        <Pin size={9} /> Pinned
                      </div>
                    )}
                    {/* Reply-to quote block */}
                    {b.reply_to_text && (
                      <div className="mb-2 pl-2 border-l-2 border-blue-400 bg-blue-50/60 rounded-r-md py-1 px-2">
                        <p className="text-[11px] text-blue-700 line-clamp-2">{b.reply_to_text}</p>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-neutral-900 mb-0.5">
                      {b.sender} <span className="text-neutral-500 font-normal">· {b.senderRole}</span>
                    </p>
                    <p className="text-sm text-neutral-800 leading-relaxed pr-6">{b.text}</p>
                    {b.attachments?.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {b.attachments.map((a, i) => (
                          <div key={i}>
                            {a.type?.startsWith('image/') ? (
                              <a href={a.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-white/40 shadow-sm hover:opacity-90 transition-opacity">
                                <img src={a.url} alt="attachment" className="w-full max-h-48 object-cover" />
                              </a>
                            ) : (
                              <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-white/40 hover:bg-white/60 transition-colors rounded-lg text-sm border border-white/60 shadow-sm">
                                <FileText size={14} className="text-blue-600" />
                                <span className="flex-1 truncate font-medium text-blue-900">{a.name || 'Document'}</span>
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {isFutureScheduled && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full inline-flex border border-amber-200">
                        <Clock size={9} />
                        Sends {new Date(b.scheduled_for).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-neutral-400 flex-wrap">
                      <span>{b.time}</span>
                      {b.edited && <span>· edited</span>}
                      <span>·</span>
                      <span className={(readCounts[b.id] || 0) > 0 ? 'text-blue-500' : ''}>
                        {(readCounts[b.id] || 0) > 0 ? '✓✓' : '✓'} {readCounts[b.id] || 0}/{studentCount} read
                      </span>
                      {expiresIn !== null && expiresIn <= 72 && (
                        <span className="text-amber-500">· expires in {expiresIn < 1 ? '<1h' : `${expiresIn}h`}</span>
                      )}
                    </div>
                    {/* Reactions */}
                    {Object.keys(msgReactions).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <button key={emoji} onClick={() => handleReaction(b.id, emoji)}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${myEmojis.includes(emoji) ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white/60 border-white/60 text-neutral-600 hover:bg-white/80'}`}>
                            {emoji} {count}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Context menu trigger */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (menuId === b.id) { setMenuId(null); return; }
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                        setMenuId(b.id);
                      }}
                      className="absolute top-2 right-2 p-1 text-neutral-400 hover:text-neutral-900 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-white/60">
                      ···
                    </button>
                    {/* Reply button */}
                    <button
                      onClick={() => { setReplyTo(b); inputRef.current?.focus(); }}
                      className="absolute bottom-2 right-2 p-1 text-neutral-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity rounded hover:bg-blue-50"
                      title="Reply">
                      <Reply size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Context menu */}
      {menuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
          <div
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            className="w-48 py-1 z-50 rounded-xl bg-white/90 backdrop-blur-md border border-white/60 shadow-xl"
          >
            {(() => {
              const b = broadcasts.find(x => x.id === menuId);
              if (!b) return null;
              return (
                <>
                  <button onClick={() => { setReplyTo(b); setMenuId(null); inputRef.current?.focus(); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left">
                    <Reply size={13} /> Reply
                  </button>
                  <button onClick={() => { setEditingId(b.id); setMsg(b.text); setAttachments(b.attachments || []); setMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => { onUpdate((list) => list.map((x) => x.id === b.id ? { ...x, pinned: !x.pinned } : x)); setMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left">
                    <Pin size={13} /> {b.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  {/* Quick reactions */}
                  <div className="flex items-center gap-1 px-3 py-1.5 border-t border-white/40">
                    {QUICK_EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => { handleReaction(b.id, emoji); setMenuId(null); }}
                        className="text-base hover:scale-125 transition-transform px-0.5">
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button onClick={async () => {
                      setMenuId(null);
                      try {
                        await apiClient(`/broadcasts/${b.id}`, { method: 'DELETE' });
                        onUpdate((list) => list.filter((x) => x.id !== b.id));
                      } catch (err) {
                        console.error('Delete failed:', err);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600 border-t border-white/40">
                    <Trash2 size={13} /> Delete for everyone
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-200 flex items-start gap-2">
          <Reply size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium text-blue-700 mb-0.5">Replying to</p>
            <p className="text-xs text-blue-800 line-clamp-1">{replyTo.text}</p>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-blue-400 hover:text-blue-700 flex-shrink-0">
            <X size={13} />
          </button>
        </div>
      )}

      {/* Editing bar */}
      {editingId && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Edit2 size={11} /> Editing message
          <button onClick={() => { setEditingId(null); setMsg(''); setAttachments([]); }} className="ml-auto hover:underline">Cancel</button>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 space-y-1">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded text-xs border border-blue-200">
              <FileText size={11} className="text-blue-600" />
              <span className="flex-1 truncate">{a.name}</span>
              <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Schedule bar */}
      {showSchedule && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-2 flex items-center gap-2">
          <Clock size={12} className="text-amber-600" />
          <span className="text-[11px] text-amber-800 font-medium whitespace-nowrap">Schedule send</span>
          <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
            className="flex-1 px-2 py-1 rounded text-xs bg-white border border-amber-200 outline-none focus:ring-1 focus:ring-amber-400" />
          {scheduledFor && (
            <button onClick={() => { setScheduledFor(''); setShowSchedule(false); }} className="p-1 text-amber-500 hover:text-amber-700 rounded hover:bg-white/60">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* Input area */}
      <div className="bg-white border-t border-white/60 px-3 py-2 flex items-end gap-2">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="p-2 text-neutral-500 hover:text-neutral-900 rounded hover:bg-white/60 disabled:opacity-50">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        </button>
        <button onClick={() => setShowSchedule(s => !s)}
          className={`p-2 rounded transition-colors ${showSchedule ? 'text-amber-700 bg-amber-50' : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/60'}`}>
          <Clock size={16} />
        </button>
        <input
          ref={inputRef}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder={`Message ${std.name}...`}
          className="flex-1 px-3 py-2 rounded-md bg-white/50 outline-none text-sm placeholder:text-neutral-400 focus:bg-white/30 focus:ring-2 focus:ring-neutral-200"
        />
        <button onClick={handleSend} disabled={!msg.trim() && attachments.length === 0}
          className={`p-2 rounded-md transition-colors ${msg.trim() || attachments.length > 0 ? 'bg-neutral-900 text-white hover:bg-neutral-800' : 'bg-white/50 text-neutral-400 cursor-not-allowed'}`}>
          <Send size={16} />
        </button>
      </div>
    </>
  );
}
