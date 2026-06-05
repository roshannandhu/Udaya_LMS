import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Pin, FileText, Loader2, Search, X } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { useAuthStore } from '../../lib/auth';
import { broadcastApi, getApiBaseUrl } from '../../lib/api';
import ScreenshotGuard from '../../components/shared/ScreenshotGuard';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export default function StudentBroadcastsPage() {
  const { user } = useAuthStore();
  const [standard, setStandard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [broadcasts, setBroadcasts] = useState([]);
  const [reactions, setReactions] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [emojiPickerId, setEmojiPickerId] = useState(null);
  const wsRef = useRef(null);
  const markedReadRef = useRef(new Set());

  useEffect(() => {
    const standardId = user?.standard_id;
    if (standardId) setStandard({ id: standardId, name: user?.standard_name || 'My Class' });
    setLoading(false);
  }, [user?.standard_id]);

  const fetchReactions = (stdId) => {
    broadcastApi.getReactions(stdId || standard?.id)
      .then(data => { setReactions(data?.counts || {}); setMyReactions(data?.mine || {}); })
      .catch(() => {});
  };

  useEffect(() => {
    if (!standard?.id) return;
    const apiBase = getApiBaseUrl();
    const wsBase = apiBase.replace(/^http/, 'ws');
    const token = localStorage.getItem('tutoria_token') || '';
    const ws = new WebSocket(`${wsBase}/ws/broadcasts/${standard.id}?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        const now = new Date();
        const formatted = data.data
          .filter(b => !b.deleted && !(b.scheduled_for && new Date(b.scheduled_for) > now))
          .map(mapBroadcast);
        setBroadcasts(formatted);
        const ids = formatted.map(b => b.id).filter(Boolean);
        const unseen = ids.filter(id => !markedReadRef.current.has(id));
        if (unseen.length > 0) {
          broadcastApi.markRead(unseen).catch(() => {});
          unseen.forEach(id => markedReadRef.current.add(id));
        }
        fetchReactions(standard.id);
      } else if (data.type === 'new_broadcast') {
        const b = data.data;
        if (b.deleted) return;
        if (b.scheduled_for && new Date(b.scheduled_for) > new Date()) return;
        const newMsg = mapBroadcast(b);
        setBroadcasts(prev => {
          if (prev.some(x => x.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        if (b.id && !markedReadRef.current.has(b.id)) {
          broadcastApi.markRead([b.id]).catch(() => {});
          markedReadRef.current.add(b.id);
        }
      } else if (data.type === 'delete_broadcast') {
        setBroadcasts(prev => prev.filter(b => b.id !== data.id));
      } else if (data.type === 'edit_broadcast') {
        const b = data.data;
        setBroadcasts(prev => prev.map(x => x.id === b.id ? { ...x, text: b.message } : x));
      } else if (data.type === 'reaction_update') {
        fetchReactions(standard.id);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [standard?.id]);

  function mapBroadcast(b) {
    return {
      id: b.id,
      text: b.message,
      time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
      pinned: false,
      attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type }] : [],
      reply_to: b.reply_to || null,
      reply_to_text: b.reply_to_text || null,
    };
  }

  const handleReaction = async (broadcastId, emoji) => {
    const mine = myReactions[broadcastId] || [];
    const alreadyReacted = mine.includes(emoji);
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
    setEmojiPickerId(null);
    try {
      if (alreadyReacted) await broadcastApi.removeReaction(broadcastId, emoji);
      else await broadcastApi.addReaction(broadcastId, emoji);
    } catch { fetchReactions(); }
  };

  const visibleBroadcasts = broadcasts.filter(b => {
    if (searchQuery.trim()) return b.text?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });
  const pinned  = visibleBroadcasts.filter(b => b.pinned);
  const regular = visibleBroadcasts.filter(b => !b.pinned);

  const Bubble = ({ b }) => {
    const msgReactions = reactions[b.id] || {};
    const myEmojis = myReactions[b.id] || [];
    return (
      <div className="max-w-[85%] self-start">
        <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
          b.pinned ? 'bg-amber-50/80 border border-amber-200 backdrop-blur-sm' : 'glass-panel border-white/60'
        }`}>
          {b.pinned && (
            <div className="flex items-center gap-1 text-amber-600 text-xs font-medium mb-1">
              <Pin size={10} /> Pinned
            </div>
          )}
          {/* Reply-to quote block */}
          {b.reply_to_text && (
            <div className="mb-2 pl-2 border-l-2 border-blue-400 bg-blue-50/60 rounded-r-md py-1 px-2">
              <p className="text-[11px] text-blue-700 line-clamp-2">{b.reply_to_text}</p>
            </div>
          )}
          <p className="text-neutral-800">{b.text}</p>
          {b.attachments?.length > 0 && (
            <div className="mt-2 space-y-2">
              {b.attachments.map((att, i) => (
                <div key={i}>
                  {att.type?.startsWith('image/') ? (
                    <div className="block rounded-lg overflow-hidden border border-white/40 shadow-sm">
                      <img src={att.url} alt="attachment" className="w-full max-h-48 object-cover"
                        onContextMenu={e => e.preventDefault()} draggable={false} />
                    </div>
                  ) : (
                    <a href={att.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 p-2 bg-white/40 hover:bg-white/60 transition-colors rounded-lg text-sm border border-white/60 shadow-sm">
                      <FileText size={14} className="text-blue-600" />
                      <span className="flex-1 truncate font-medium text-blue-900">Attachment</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] text-neutral-400">{b.time}</span>
          </div>
          {/* Reactions display */}
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
          {/* Emoji picker toggle */}
          <div className="relative mt-1.5">
            <button onClick={() => setEmojiPickerId(emojiPickerId === b.id ? null : b.id)}
              className="text-[10px] text-neutral-400 hover:text-neutral-600 transition-colors">
              + react
            </button>
            {emojiPickerId === b.id && (
              <div className="absolute bottom-6 left-0 flex items-center gap-1 bg-white/95 backdrop-blur-sm border border-white/60 shadow-lg rounded-full px-2 py-1 z-10">
                {QUICK_EMOJIS.map(emoji => (
                  <button key={emoji} onClick={() => handleReaction(b.id, emoji)}
                    className={`text-base hover:scale-125 transition-transform px-0.5 ${myEmojis.includes(emoji) ? 'opacity-50' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div>
        <TopBar title="Inbox" showSearch={false} />
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-neutral-400" size={24} />
        </div>
      </div>
    );
  }

  if (!standard) {
    return (
      <div>
        <TopBar title="Inbox" showSearch={false} />
        <div className="px-5 py-16 text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-neutral-300" />
          <p className="text-sm text-neutral-500">No broadcasts yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 md:pb-8">
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <MessageSquare size={16} />
            </div>
            <div>
              <h1 className="text-base font-semibold">{standard.name} Broadcasts</h1>
              <p className="text-[11px] text-neutral-500">From Class Teacher</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSearch(s => !s)}
              className={`p-1.5 rounded-lg transition-colors ${showSearch ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-neutral-700'}`}>
              <Search size={16} />
            </button>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold border border-green-200">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
              LIVE
            </div>
          </div>
        </div>
        {showSearch && (
          <div className="px-5 md:px-8 pb-3 max-w-5xl mx-auto">
            <div className="flex items-center gap-2 bg-white/60 rounded-lg px-3 py-1.5 border border-white/60">
              <Search size={14} className="text-neutral-400 flex-shrink-0" />
              <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search messages…"
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-neutral-400" />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-700">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <ScreenshotGuard label={user?.username || user?.name || 'student'}>
        <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto" onClick={() => setEmojiPickerId(null)}>
          {broadcasts.length === 0 ? (
            <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
              <MessageSquare size={32} className="mx-auto mb-3 text-neutral-400" />
              <p className="text-sm text-neutral-600">No messages yet.</p>
              <p className="text-xs text-neutral-500 mt-1">Your teacher will post announcements here.</p>
            </div>
          ) : visibleBroadcasts.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-12">No matching messages.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {pinned.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Pinned</p>
                  {pinned.map(b => <Bubble key={b.id} b={b} />)}
                  <div className="border-t border-white/40 my-2" />
                </>
              )}
              {regular.map(b => <Bubble key={b.id} b={b} />)}
            </div>
          )}
        </div>
      </ScreenshotGuard>
    </div>
  );
}
