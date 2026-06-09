import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Edit2, Trash2, Pin, ArrowLeft, FileText, X, Loader2, Clock, Reply, Search, SmilePlus, Check, CheckCheck, Mic, Square, Copy, MoreVertical } from 'lucide-react';
import { apiClient, broadcastApi, getApiBaseUrl } from '../../lib/api';
import { useAppCache } from '../../store';
import VoiceNotePlayer from '../shared/VoiceNotePlayer';
import SubjectIcon, { IconPicker } from '../shared/SubjectIcon';
import { PASTEL, pastelFor } from '../cards/pastel';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

function formatChatDate(dateString) {
  if (!dateString) return 'Unknown Date';
  // Parse date in UTC and convert to Indian Standard Time (Asia/Kolkata) for consistent display
  const d = new Date(dateString);
  const timeZone = 'Asia/Kolkata';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const dDate = d.toLocaleDateString('en-GB', { timeZone });
  const todayDate = today.toLocaleDateString('en-GB', { timeZone });
  const yesterdayDate = yesterday.toLocaleDateString('en-GB', { timeZone });

  if (dDate === todayDate) return 'Today';
  if (dDate === yesterdayDate) return 'Yesterday';
  // Return formatted date in Indian format with explicit timezone
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone });
}

export default function BroadcastThread({ std, broadcasts, onUpdate, onBack, showBackBtn, studentCount = 0 }) {
  const [msg, setMsg] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, bottom: 'auto', right: 0 });
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [uploading, setUploading] = useState(false);
  const [readCounts, setReadCounts] = useState({});
  const [replyTo, setReplyTo] = useState(null);
  const [reactions, setReactions] = useState({});
  const [myReactions, setMyReactions] = useState({});
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [readDetailsModal, setReadDetailsModal] = useState(null);
  const [readDetailsData, setReadDetailsData] = useState({ loading: false, read_by: [], not_read_by: [] });
  const [readDetailsTab, setReadDetailsTab] = useState('read');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const readDetailsModalRef = useRef(null);
  const { refreshStandards, invalidate, updateStandardLocal } = useAppCache();
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);
  const inputRef = useRef(null);
  const chatBottomRef = useRef(null);

  const [recording, setRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  const handleEmojiChange = async (emoji) => {
    setShowEmojiPicker(false);
    if (emoji === std.emoji) return;
    const prev = std.emoji;
    updateStandardLocal(std.id, { emoji });   // instant optimistic update
    try {
      await apiClient(`/standards/${std.id}`, { method: 'PATCH', body: JSON.stringify({ emoji }) });
      invalidate();                            // mark cache stale for next natural refresh
    } catch (err) {
      updateStandardLocal(std.id, { emoji: prev });  // rollback on failure
      alert(err?.message || 'Could not change the class icon. Please try again.');
    }
  };

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
    readDetailsModalRef.current = readDetailsModal;
  }, [readDetailsModal]);

  useEffect(() => {
    // Scroll to bottom when opening or receiving new messages
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [broadcasts.length, std?.id]);

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
      } else if (data.type === 'read_receipt_update') {
        broadcastApi.getReadCounts(std.id)
          .then(counts => setReadCounts(counts || {}))
          .catch(() => {});
        const currentModal = readDetailsModalRef.current;
        if (currentModal && data.broadcast_ids?.includes(currentModal)) {
           broadcastApi.getReadDetails(currentModal)
            .then(res => setReadDetailsData({ loading: false, read_by: res.read_by || [], not_read_by: res.not_read_by || [] }))
            .catch(() => {});
        }
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [std.id]);

  function mapBroadcast(b) {
    // Convert timestamps to Indian Standard Time (Asia/Kolkata) for consistent UI display
    const createdAt = new Date(b.created_at);
    const time = createdAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
    return {
      id: b.id,
      text: b.message,
      sender: 'Teacher',
      senderRole: 'Class Teacher',
      created_at: b.created_at,
      time,
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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        setRecordDuration(0);

        setUploading(true);
        const formData = new FormData();
        formData.append('file', blob, 'voicenote.webm');
        try {
          const token = localStorage.getItem('tutoria_token');
          const apiBase = getApiBaseUrl();
          const res = await fetch(`${apiBase}/upload`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          const data = await res.json();
          const payload = {
            standard_id: std.id,
            message: '',
            attachment_url: data.url,
            attachment_type: data.type,
            reply_to: replyTo?.id || null,
          };
          setReplyTo(null);
          await apiClient('/broadcasts', { method: 'POST', body: JSON.stringify(payload) });
        } catch (err) {
          alert('Voice note upload failed');
        } finally {
          setUploading(false);
        }
      };
      
      mediaRecorderRef.current.start();
      setRecording(true);
      setRecordDuration(0);
      timerRef.current = setInterval(() => setRecordDuration(d => d + 1), 1000);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.onstop = () => {
        const stream = mediaRecorderRef.current.stream;
        stream.getTracks().forEach(track => track.stop());
        clearInterval(timerRef.current);
        setRecording(false);
        setRecordDuration(0);
      };
      mediaRecorderRef.current.stop();
    }
  };

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
    try {
      if (alreadyReacted) await broadcastApi.removeReaction(broadcastId, emoji);
      else await broadcastApi.addReaction(broadcastId, emoji);
    } catch (err) {
      fetchReactions();
    }
  };

  const visibleBroadcasts = broadcasts.filter(b => {
    if (b.deleted) return false;
    if (searchQuery.trim()) return b.text?.toLowerCase().includes(searchQuery.toLowerCase());
    return true;
  });

  let currentGroup = null;

  return (
    <div className="flex flex-col h-full bg-[#efeae2]">
      {/* Unified WhatsApp-style Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-[#f0f2f5] border-b border-neutral-200 z-10 shrink-0">
        {showBackBtn && (
          <button onClick={onBack} className="md:hidden p-1.5 -ml-1.5 mr-1 text-neutral-500 hover:text-neutral-900 rounded-full hover:bg-neutral-200 transition-colors">
            <ArrowLeft size={20} />
          </button>
        )}
        <div className="relative flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowEmojiPicker(p => !p)} title="Change class icon"
            className="w-10 h-10 rounded-full flex items-center justify-center text-neutral-700 hover:opacity-80 transition-all overflow-hidden"
            style={{ background: PASTEL[pastelFor(std.name)]?.hex || '#e2e8f0' }}>
            <SubjectIcon value={std.emoji} size={22} fallback="graduation" />
          </button>
          {showEmojiPicker && (
            <div className="absolute top-12 left-0 z-50 bg-white border border-neutral-200 shadow-xl rounded-2xl p-3 w-64">
              <p className="text-[11px] font-medium text-neutral-500 mb-2">Class icon</p>
              <IconPicker value={std.emoji} onChange={handleEmojiChange} fallback="graduation" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 ml-2 cursor-pointer" onClick={() => setShowEmojiPicker(p => !p)}>
          <p className="text-[16px] font-medium text-neutral-900 truncate leading-tight">{std.name}</p>
          <p className="text-[13px] text-neutral-500 truncate mt-0.5">{studentCount} students</p>
        </div>
        <button onClick={() => setShowSearch(s => !s)} className={`p-2 rounded-full transition-colors ${showSearch ? 'bg-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700'}`}>
          <Search size={20} />
        </button>
        <button className="hidden sm:block p-2 rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 transition-colors">
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-white border-b border-neutral-200 flex items-center gap-2 shrink-0">
          <Search size={16} className="text-neutral-400 flex-shrink-0" />
          <input
            autoFocus
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search messages…"
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-neutral-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-neutral-400 hover:text-neutral-700">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-8 space-y-2 relative" onClick={() => { setMenuId(null); setShowEmojiPicker(false); }}>
        {visibleBroadcasts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="bg-[#fff9c4] text-[#8a7e00] px-4 py-2 rounded-xl text-xs shadow-sm max-w-[280px]">
              {searchQuery ? 'No matching messages.' : `Messages you send to ${std.name} will appear here and be delivered to all ${studentCount} students.`}
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {visibleBroadcasts.map((b, index) => {
              const msgGroup = formatChatDate(b.created_at);
              const showDate = msgGroup !== currentGroup;
              if (showDate) currentGroup = msgGroup;

              const msgReactions = reactions[b.id] || {};
              const myEmojis = myReactions[b.id] || [];
              const isFutureScheduled = b.scheduled_for && new Date(b.scheduled_for) > new Date();
              const expiresIn = b.expires_at ? Math.round((new Date(b.expires_at) - Date.now()) / 3600000) : null;
              
              const reads = readCounts[b.id] || 0;
              const allRead = studentCount > 0 && reads >= studentCount;
              
              // To mimic WhatsApp: outgoing messages on the right
              const isSender = true; // Teacher is always the sender in this view

              return (
                <React.Fragment key={b.id}>
                  {showDate && (
                    <div className="flex justify-center my-4">
                      <div className="bg-white/80 shadow-sm border border-neutral-200/50 backdrop-blur-md px-3 py-1 rounded-full text-[11px] font-medium text-neutral-600 uppercase tracking-wide">
                        {msgGroup}
                      </div>
                    </div>
                  )}

                  <div className={`flex flex-col max-w-[80%] md:max-w-[70%] group relative mb-1.5 ${isSender ? 'self-end' : 'self-start'}`}>
                    <div 
                      className={`relative px-3 py-2 shadow-sm ${isFutureScheduled ? 'bg-neutral-100/60 opacity-75' : isSender ? 'bg-[#dcf8c6]' : 'bg-white'} ${isSender ? 'rounded-2xl rounded-tr-sm' : 'rounded-2xl rounded-tl-sm'}`}
                    >
                      {/* Pinned Indicator */}
                      {b.pinned && (
                        <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1">
                          <Pin size={9} /> Pinned
                        </div>
                      )}

                      {/* Quoted Reply Block */}
                      {b.reply_to_text && (
                        <div className="mb-1.5 pl-2 border-l-4 border-[#35b5a2] bg-black/5 rounded py-1 px-2 cursor-pointer hover:bg-black/10 transition-colors">
                          <p className="text-[11px] font-semibold text-[#35b5a2]">You</p>
                          <p className="text-[11px] text-neutral-600 line-clamp-1">{b.reply_to_text}</p>
                        </div>
                      )}

                      {/* Attachments */}
                      {b.attachments?.length > 0 && (
                        <div className="mb-1.5 space-y-1">
                          {b.attachments.map((a, i) => (
                            <div key={i}>
                              {a.type?.startsWith('image/') ? (
                                <a href={a.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-black/5">
                                  <img src={a.url} alt="attachment" className="w-full h-auto max-h-64 object-cover" />
                                </a>
                              ) : a.type?.startsWith('audio/') ? (
                                <VoiceNotePlayer src={a.url} isSender={isSender} />
                              ) : (
                                <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-black/5 hover:bg-black/10 transition-colors rounded-lg text-sm">
                                  <div className="w-8 h-8 rounded-full bg-[#35b5a2]/20 flex items-center justify-center">
                                    <FileText size={14} className="text-[#35b5a2]" />
                                  </div>
                                  <span className="flex-1 truncate font-medium text-neutral-800">{a.name || 'Document'}</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Message Text */}
                      <div className="flex items-end justify-between gap-3">
                        <p className="text-[14px] text-neutral-900 whitespace-pre-wrap break-words leading-snug">
                          {b.text}
                          {/* Invisible spacer to push time/ticks below text nicely if it wraps */}
                          <span className="inline-block w-16" />
                        </p>
                      </div>

                      {/* Meta Info: Time, Ticks, Scheduled */}
                      <div className="absolute bottom-1 right-2 flex items-center gap-1 text-[10px] text-neutral-500">
                        {isFutureScheduled && (
                          <div className="flex items-center gap-0.5 text-amber-600 bg-amber-50 px-1 rounded border border-amber-200">
                            <Clock size={8} />
                            <span>{new Date(b.scheduled_for).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        )}
                        {b.edited && <span className="italic">edited</span>}
                        <span>{b.time}</span>
                        {isSender && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setReadDetailsModal(b.id);
                              setReadDetailsTab('read');
                              setReadDetailsData({ loading: true, read_by: [], not_read_by: [] });
                              broadcastApi.getReadDetails(b.id)
                                .then(res => setReadDetailsData({ loading: false, read_by: res.read_by || [], not_read_by: res.not_read_by || [] }))
                                .catch(() => setReadDetailsData({ loading: false, read_by: [], not_read_by: [] }));
                            }}
                            className="flex items-center hover:opacity-70 transition-opacity"
                            title={`${reads}/${studentCount} read`}
                          >
                            {/* WhatsApp-group parity: delivered = double grey, all read = double blue */}
                            <CheckCheck size={14} className={allRead ? 'text-[#34B7F1]' : 'text-neutral-400'} />
                          </button>
                        )}
                      </div>

                    </div>

                    {/* Reactions below bubble */}
                    {Object.keys(msgReactions).length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-0.5 ${isSender ? 'justify-end' : 'justify-start'}`}>
                        {Object.entries(msgReactions).map(([emoji, count]) => (
                          <button key={emoji} onClick={() => handleReaction(b.id, emoji)}
                            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs shadow-sm transition-colors ${myEmojis.includes(emoji) ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'}`}>
                            {emoji} <span className="text-[10px]">{count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Actions (Context Menu & Reply) - Always visible on mobile, hover on desktop */}
                    <div className={`absolute top-0 -left-[56px] md:-left-[68px] bottom-0 w-[56px] md:w-[68px] opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end px-1 gap-1`}>
                      <button onClick={() => { setReplyTo(b); inputRef.current?.focus(); }} className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 hover:text-neutral-800" title="Reply">
                        <Reply size={13} className="md:w-[14px] md:h-[14px]" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuId === b.id) { setMenuId(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          let rightPos = window.innerWidth - rect.right - 10;
                          if (rightPos < 10) rightPos = 10; // Prevent clipping off the right edge
                          
                          let topPos = rect.bottom + 4;
                          let bottomPos = 'auto';
                          const menuHeight = 280; // Estimated max menu height
                          
                          if (topPos + menuHeight > window.innerHeight) {
                            topPos = 'auto';
                            bottomPos = window.innerHeight - rect.top + 4;
                          }
                          
                          setMenuPos({ top: topPos, bottom: bottomPos, right: rightPos });
                          setMenuId(b.id);
                        }}
                        className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-neutral-500 hover:text-neutral-800" title="Menu">
                        <MoreVertical size={14} className="md:w-[16px] md:h-[16px]" />
                      </button>
                    </div>

                  </div>
                </React.Fragment>
              );
            })}
            <div ref={chatBottomRef} />
          </div>
        )}
      </div>

      {/* Context menu overlay */}
      {menuId && (
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setMenuId(null)} />
          <div
            style={{ position: 'fixed', top: menuPos.top, bottom: menuPos.bottom, right: menuPos.right }}
            className="w-48 py-1 z-[9999] rounded-xl bg-white border border-neutral-200 shadow-2xl"
          >
            {(() => {
              const b = broadcasts.find(x => x.id === menuId);
              if (!b) return null;
              return (
                <>
                  <button onClick={() => { setReplyTo(b); setMenuId(null); inputRef.current?.focus(); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left text-neutral-700">
                    <Reply size={14} /> Reply
                  </button>
                  <button onClick={() => { navigator.clipboard.writeText(b.text || ''); setMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left text-neutral-700">
                    <Copy size={14} /> Copy
                  </button>
                  <button onClick={() => { setEditingId(b.id); setMsg(b.text); setAttachments(b.attachments || []); setMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left text-neutral-700">
                    <Edit2 size={14} /> Edit
                  </button>
                  <button onClick={(e) => {
                      e.stopPropagation();
                      setMenuId(null);
                      setReadDetailsModal(b.id);
                      setReadDetailsTab('read');
                      setReadDetailsData({ loading: true, read_by: [], not_read_by: [] });
                      broadcastApi.getReadDetails(b.id)
                        .then(res => setReadDetailsData({ loading: false, read_by: res.read_by || [], not_read_by: res.not_read_by || [] }))
                        .catch(() => setReadDetailsData({ loading: false, read_by: [], not_read_by: [] }));
                    }} 
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left text-neutral-700">
                    <CheckCheck size={14} /> Message info
                  </button>
                  <button onClick={() => { onUpdate((list) => list.map((x) => x.id === b.id ? { ...x, pinned: !x.pinned } : x)); setMenuId(null); }} className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-neutral-50 text-left text-neutral-700">
                    <Pin size={14} /> {b.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <div className="flex items-center justify-between px-4 py-2 border-t border-neutral-100">
                    {QUICK_EMOJIS.map(emoji => (
                      <button key={emoji} onClick={() => { handleReaction(b.id, emoji); setMenuId(null); }} className="text-lg hover:scale-125 transition-transform">
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
                    className="w-full flex items-center gap-3 px-4 py-2 text-sm hover:bg-red-50 text-left text-red-600 border-t border-neutral-100">
                    <Trash2 size={14} /> Delete for everyone
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* Reply bar */}
      {replyTo && (
        <div className="px-4 py-2 bg-[#f0f2f5] border-t border-neutral-200 flex items-center shrink-0">
          <div className="flex-1 bg-white border-l-4 border-[#35b5a2] rounded p-2 flex justify-between items-start">
            <div>
              <p className="text-[11px] font-semibold text-[#35b5a2]">Replying to</p>
              <p className="text-xs text-neutral-600 line-clamp-1">{replyTo.text}</p>
            </div>
            <button onClick={() => setReplyTo(null)} className="p-1 text-neutral-400 hover:text-neutral-600">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Editing bar */}
      {editingId && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800 shrink-0">
          <Edit2 size={12} /> Editing message
          <button onClick={() => { setEditingId(null); setMsg(''); setAttachments([]); }} className="ml-auto hover:underline font-medium">Cancel</button>
        </div>
      )}

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-[#f0f2f5] border-t border-neutral-200 shrink-0 flex gap-2 overflow-x-auto">
          {attachments.map((a, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg bg-white shadow-sm flex items-center justify-center border border-neutral-200 shrink-0 group">
              {a.type?.startsWith('image/') ? (
                 <img src={a.url} alt="" className="w-full h-full object-cover rounded-lg" />
              ) : (
                <FileText size={20} className="text-[#35b5a2]" />
              )}
              <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-neutral-200 rounded-full flex items-center justify-center text-neutral-500 hover:text-red-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Schedule bar */}
      {showSchedule && (
        <div className="px-4 py-2 bg-[#f0f2f5] border-t border-neutral-200 shrink-0 flex items-center gap-2">
          <Clock size={14} className="text-neutral-600" />
          <span className="text-[12px] text-neutral-700 font-medium whitespace-nowrap">Schedule send</span>
          <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-full text-sm bg-white border border-neutral-300 outline-none focus:border-[#35b5a2]" />
          <button onClick={() => { setScheduledFor(''); setShowSchedule(false); }} className="p-2 text-neutral-500 hover:text-neutral-700 rounded-full hover:bg-neutral-200 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="bg-[#f0f2f5] px-2 py-2 flex items-end gap-2 shrink-0">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        
        {recording ? (
          <div className="flex-1 bg-white rounded-3xl flex items-center px-4 shadow-sm min-h-[44px] gap-3">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="text-red-500 font-medium text-sm flex-1">
              {Math.floor(recordDuration / 60)}:{(recordDuration % 60).toString().padStart(2, '0')}
            </span>
            <button onClick={cancelRecording} className="text-neutral-400 hover:text-red-500 p-2 transition-colors">
              <Trash2 size={18} />
            </button>
          </div>
        ) : (
          <div className="flex-1 bg-white rounded-3xl flex items-end px-1 shadow-sm min-h-[44px]">
            {/* Action buttons left */}
            <button onClick={() => setShowSchedule(s => !s)} className={`p-3 transition-colors ${showSchedule ? 'text-[#35b5a2]' : 'text-neutral-500 hover:text-neutral-700'}`}>
              <Clock size={20} />
            </button>

            <input
              ref={inputRef}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Type a message"
              className="flex-1 py-3 px-1 bg-transparent outline-none text-[15px] placeholder:text-neutral-400"
            />

            {/* Action buttons right */}
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-3 text-neutral-500 hover:text-neutral-700 disabled:opacity-50 transition-colors">
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} className="rotate-45" />}
            </button>
          </div>
        )}

        {/* Send / Mic Button */}
        {recording ? (
          <button onClick={stopRecording}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors bg-[#00a884] text-white hover:bg-[#008f6f]">
            <Send size={18} className="ml-1" />
          </button>
        ) : (msg.trim() || attachments.length > 0) ? (
          <button onClick={handleSend} disabled={uploading}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors bg-[#00a884] text-white hover:bg-[#008f6f]">
            <Send size={18} className="ml-1" />
          </button>
        ) : (
          <button onClick={startRecording} disabled={uploading}
            className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 shadow-sm transition-colors bg-[#00a884] text-white hover:bg-[#008f6f]">
            <Mic size={20} />
          </button>
        )}
      </div>

      {/* Read Details Modal */}
      {readDetailsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setReadDetailsModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 bg-[#f0f2f5]">
              <h3 className="font-semibold text-neutral-800">Message info</h3>
              <button onClick={() => setReadDetailsModal(null)} className="text-neutral-500 hover:text-neutral-900">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex border-b border-neutral-200">
              <button onClick={() => setReadDetailsTab('read')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${readDetailsTab === 'read' ? 'border-b-2 border-[#00a884] text-[#00a884]' : 'text-neutral-500 hover:text-neutral-700'}`}>
                Read ({readDetailsData.read_by.length})
              </button>
              <button onClick={() => setReadDetailsTab('unread')} className={`flex-1 py-3 text-sm font-semibold transition-colors ${readDetailsTab === 'unread' ? 'border-b-2 border-[#00a884] text-[#00a884]' : 'text-neutral-500 hover:text-neutral-700'}`}>
                Delivered ({readDetailsData.not_read_by.length})
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {readDetailsData.loading ? (
                <div className="flex justify-center p-8"><Loader2 className="animate-spin text-[#00a884]" size={28} /></div>
              ) : (
                <div className="divide-y divide-neutral-100">
                  {(readDetailsTab === 'read' ? readDetailsData.read_by : readDetailsData.not_read_by).length === 0 ? (
                    <div className="p-8 text-center text-sm text-neutral-500">
                      {readDetailsTab === 'read' ? 'No one has read this yet.' : 'Everyone has read this message.'}
                    </div>
                  ) : (
                    (readDetailsTab === 'read' ? readDetailsData.read_by : readDetailsData.not_read_by).map(reader => (
                      <div key={reader.student_id} className="flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors">
                        <div className="w-10 h-10 rounded-full bg-pastel-lavender flex items-center justify-center font-bold text-lg text-pastel-lavender-fg shrink-0 overflow-hidden">
                          {reader.avatar_url ? <img src={reader.avatar_url} alt="" className="w-full h-full object-cover" /> : reader.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium text-neutral-900 truncate">{reader.name}</p>
                        </div>
                        {readDetailsTab === 'read' && reader.read_at && (
                          <div className="text-xs text-neutral-500 shrink-0">
                            {new Date(reader.read_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                          </div>
                        )}
                        {readDetailsTab === 'unread' && (
                          <CheckCheck size={16} className="text-neutral-400 shrink-0" />
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
