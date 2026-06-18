import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Pin, FileText, Loader2, Search, X } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { useAuthStore } from '../../lib/auth';
import { apiClient, broadcastApi, getApiBaseUrl } from '../../lib/api';
import VoiceNotePlayer from '../../components/shared/VoiceNotePlayer';
import SubjectIcon from '../../components/shared/SubjectIcon';
import { fmtTime, fmtChatDate } from '../../lib/datetime';

const formatChatDate = fmtChatDate;

// Module-level cache so re-opening Class Updates renders instantly instead of
// waiting for the WebSocket handshake + history each time. Keyed by user+standard.
let studentBroadcastsCache = null; // { key: `${userId}:${standardId}`, items: [...] }

export default function StudentBroadcastsPage() {
  const { user } = useAuthStore();
  const standardId = user?.standard_id || null;
  const cacheKey = (user?.id && standardId) ? `${user.id}:${standardId}` : null;
  const cacheHit = !!(cacheKey && studentBroadcastsCache?.key === cacheKey);

  // Derive the standard synchronously from the auth store (no extra round-trip)
  // and seed messages from the module cache, so the chat paints immediately.
  const [standard, setStandard] = useState(
    standardId ? { id: standardId, name: user?.standard_name || 'My Class', emoji: user?.standard_emoji || 'graduation' } : null
  );
  const [loading, setLoading] = useState(!standardId);
  const [broadcasts, setBroadcasts] = useState(cacheHit ? studentBroadcastsCache.items : []);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wsRef = useRef(null);
  const markedReadRef = useRef(new Set());
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (standardId) {
      setStandard({ id: standardId, name: user?.standard_name || 'My Class', emoji: user?.standard_emoji || 'graduation' });
      setLoading(false);
    }
  }, [user?.standard_id, user?.standard_name, user?.standard_emoji]);

  // Fast first paint: pull history over plain HTTP the moment we know the
  // standard, in parallel with the WebSocket. HTTP reuses the warm keep-alive
  // connection, so messages show up well before the WS handshake completes; the
  // WS then takes over for live updates.
  useEffect(() => {
    if (!standardId) return;
    let cancelled = false;
    apiClient(`/broadcasts?standard_id=${standardId}`)
      .then(rows => {
        if (cancelled || !Array.isArray(rows)) return;
        const now = new Date();
        const formatted = rows
          .filter(b => !b.deleted && !(b.scheduled_for && new Date(b.scheduled_for) > now))
          .map(mapBroadcast);
        // Don't clobber a longer list the WS may have already delivered.
        setBroadcasts(prev => (formatted.length >= prev.length ? formatted : prev));
        const unseen = formatted.map(b => b.id).filter(id => id && !markedReadRef.current.has(id));
        if (unseen.length > 0) {
          broadcastApi.markRead(unseen).catch(() => {});
          unseen.forEach(id => markedReadRef.current.add(id));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [standardId]);

  // Keep the module cache in sync with the rendered list for instant re-opens.
  useEffect(() => {
    if (cacheKey) studentBroadcastsCache = { key: cacheKey, items: broadcasts };
  }, [broadcasts, cacheKey]);

  useEffect(() => {
    // Jump (not smooth-scroll) to the latest message. A smooth scroll re-triggered
    // every bubble's in-view animation, which read as flicker/jank; an instant jump
    // is snappy and animation-free, like opening a real chat at the bottom.
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [broadcasts.length]);

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
        setBroadcasts(prev => prev.map(x => x.id === b.id ? { ...x, text: b.message, edited: true } : x));
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [standard?.id]);

  function mapBroadcast(b) {
    return {
      id: b.id,
      text: b.message,
      created_at: b.created_at,
      time: fmtTime(b.created_at),
      pinned: false,
      edited: !!b.edited,
      attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type }] : [],
      reply_to: b.reply_to || null,
      reply_to_text: b.reply_to_text || null,
    };
  }

  const visibleBroadcasts = broadcasts.filter(b => {
    if (searchQuery.trim()) return b.text?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });
  
  // WhatsApp doesn't really have "pinned" messages at the top of the chat constantly in the flow, 
  // but if we want to support it, we'll just render them inline with a pinned badge.

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#efeae2] pb-24 lg:pb-0 lg:h-[calc(100vh-64px)]">
        <div className="lg:hidden"><TopBar title="Class Updates" showSearch={false} /></div>
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-neutral-400" size={24} />
        </div>
      </div>
    );
  }

  if (!standard) {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-[#efeae2] pb-24 lg:pb-0 lg:h-[calc(100vh-64px)]">
        <div className="lg:hidden"><TopBar title="Class Updates" showSearch={false} /></div>
        <div className="px-5 py-16 text-center">
          <MessageSquare size={32} className="mx-auto mb-3 text-neutral-400" />
          <p className="text-sm text-neutral-500">No broadcasts available yet.</p>
        </div>
      </div>
    );
  }

  let currentGroup = null;

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#efeae2] lg:pb-0 lg:h-[calc(100vh-64px)]">
      <div className="lg:hidden flex-shrink-0"><TopBar title="Class Updates" showSearch={false} /></div>
      <div className="flex flex-1 w-full max-w-[1000px] mx-auto bg-[#efeae2] md:border-x md:border-black/5 shadow-sm relative flex-col min-h-0">
        
        {/* Unified WhatsApp-style Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-[#f0f2f5] border-b border-neutral-200 z-10 shrink-0">
          <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 bg-[#e2e8f0] overflow-hidden">
              <SubjectIcon value={standard.emoji} size={22} fallback="graduation" />
            </div>
          </div>
          <div className="flex-1 min-w-0 ml-2">
            <p className="text-[16px] font-medium text-neutral-900 truncate leading-tight">{standard.name}</p>
            <p className="text-[13px] text-neutral-500 truncate mt-0.5">Updates from Class Teacher</p>
          </div>
          <button onClick={() => setShowSearch(s => !s)} className={`p-2 rounded-full transition-colors ${showSearch ? 'bg-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'}`}>
            <Search size={20} />
          </button>
        </div>
        
        {/* Search Bar */}
        {showSearch && (
          <div className="px-4 py-2 bg-white border-b border-neutral-200 flex items-center gap-2 shrink-0">
            <Search size={16} className="text-neutral-400 flex-shrink-0" />
            <input autoFocus value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search messages…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-neutral-400" />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-700">
                <X size={16} />
              </button>
            )}
          </div>
        )}

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 space-y-2 max-w-5xl mx-auto w-full">
          {broadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="bg-[#fff9c4] text-[#8a7e00] px-4 py-2 rounded-xl text-xs shadow-sm max-w-[280px]">
                Messages from your teacher will appear here.
              </div>
            </div>
          ) : visibleBroadcasts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="bg-[#fff9c4] text-[#8a7e00] px-4 py-2 rounded-xl text-xs shadow-sm max-w-[280px]">
                No matching messages.
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              {visibleBroadcasts.map(b => {
                const msgGroup = formatChatDate(b.created_at);
                const showDate = msgGroup !== currentGroup;
                if (showDate) currentGroup = msgGroup;

                return (
                  <React.Fragment key={b.id}>
                    {showDate && (
                      <div className="flex justify-center my-4">
                        <div className="bg-white/80 shadow-sm border border-neutral-200/50 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-neutral-600 uppercase tracking-wide">
                          {msgGroup}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col max-w-[85%] md:max-w-[70%] self-start items-start mb-1.5 relative group">
                      <div className="relative w-fit max-w-full px-3 py-2 shadow-sm bg-white rounded-2xl rounded-tl-sm">
                        
                        {/* Pinned Indicator */}
                        {b.pinned && (
                          <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1">
                            <Pin size={9} /> Pinned
                          </div>
                        )}

                        {/* Quoted Reply Block */}
                        {b.reply_to_text && (
                          <div className="mb-1.5 pl-2 border-l-4 border-amber-400 bg-black/5 rounded py-1 px-2 cursor-pointer hover:bg-black/10 transition-colors">
                            <p className="text-[11px] font-semibold text-amber-600">Teacher</p>
                            <p className="text-[11px] text-neutral-600 line-clamp-1">{b.reply_to_text}</p>
                          </div>
                        )}

                        {/* Attachments */}
                        {b.attachments?.length > 0 && (
                          <div className="mb-1.5 space-y-1">
                            {b.attachments.map((att, i) => (
                              <div key={i}>
                                {att.type?.startsWith('image/') ? (
                                  <a href={att.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-black/5">
                                    <img src={att.url} alt="attachment" className="w-full h-auto max-h-64 object-cover" />
                                  </a>
                                ) : att.type?.startsWith('audio/') ? (
                                  <VoiceNotePlayer src={att.url} isSender={false} />
                                ) : (
                                  <a href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-black/5 hover:bg-black/10 transition-colors rounded-lg text-sm">
                                    <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                                      <FileText size={14} className="text-amber-500" />
                                    </div>
                                    <span className="flex-1 truncate font-medium text-neutral-800">Attachment</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Message text + WhatsApp-style time.
                            The transparent inline spacer after the text reserves room
                            on the LAST line so the absolutely-positioned time can never
                            sit on top of the words (it wraps to its own line if the
                            text fills the width). Widen the gap when "edited" shows. */}
                        {b.text && (
                          <div className="relative min-w-0">
                            <p className="text-[14px] text-neutral-900 whitespace-pre-wrap break-words leading-snug">
                              {b.text}
                              <span aria-hidden="true" className="inline-block align-bottom" style={{ width: b.edited ? 78 : 46 }} />
                            </p>
                            <span className="absolute bottom-0 right-0 flex items-center gap-1 text-[10px] text-neutral-400 leading-none select-none">
                              {b.edited && <span className="italic">edited</span>}
                              <span>{b.time}</span>
                            </span>
                          </div>
                        )}

                        {/* Media-only message: no text to wrap around, so the time
                            sits on its own right-aligned line under the attachment. */}
                        {!b.text && (
                          <div className="flex items-center justify-end gap-1 text-[10px] text-neutral-400 leading-none select-none mt-0.5">
                            {b.edited && <span className="italic">edited</span>}
                            <span>{b.time}</span>
                          </div>
                        )}

                      </div>

                    </div>
                  </React.Fragment>
                );
              })}
              <div ref={chatBottomRef} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
