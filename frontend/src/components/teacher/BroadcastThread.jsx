import React, { useState, useEffect, useRef } from 'react';
import { Send, Paperclip, Edit2, Trash2, Pin, ArrowLeft, FileText, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { apiClient, broadcastApi } from '../../lib/api';

export default function BroadcastThread({ std, broadcasts, onUpdate, onBack, showBackBtn, studentCount = 0 }) {
  const [msg, setMsg] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readCounts, setReadCounts] = useState({});
  const fileInputRef = useRef(null);
  const wsRef = useRef(null);

  // Fetch read counts whenever broadcasts list changes
  useEffect(() => {
    if (!std?.id) return;
    broadcastApi.getReadCounts(std.id)
      .then(counts => setReadCounts(counts || {}))
      .catch(() => {});
  }, [std?.id, broadcasts.length]);

  useEffect(() => {
    // Connect WebSocket
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const token = localStorage.getItem('tutoria_token') || '';
    const ws = new WebSocket(`${wsBase}/ws/broadcasts/${std.id}?token=${encodeURIComponent(token)}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        const formatted = data.data.map(b => ({
          id: b.id,
          text: b.message,
          sender: 'Teacher',
          senderRole: 'Class Teacher',
          time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
          pinned: false,
          attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type, name: 'Attachment' }] : [],
          edited: !!b.edited,
          deleted: !!b.deleted,
          readBy: 0
        }));
        onUpdate(() => formatted);
      } else if (data.type === 'new_broadcast') {
        const b = data.data;
        const newMsg = {
          id: b.id,
          text: b.message,
          sender: 'Teacher',
          senderRole: 'Class Teacher',
          time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
          pinned: false,
          attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type, name: 'Attachment' }] : [],
          edited: false,
          deleted: false,
          readBy: 0
        };
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
      }
    };
    
    wsRef.current = ws;
    return () => ws.close();
  }, [std.id]);

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const token = localStorage.getItem('tutoria_token');
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
      const res = await fetch(`${apiBase}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      setAttachments([...attachments, { url: data.url, type: data.type, name: data.filename }]);
    } catch (err) {
      console.error(err);
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!msg.trim() && attachments.length === 0) return;
    
    const time = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
    
    if (editingId) {
      const savedMsg = msg;
      setEditingId(null);
      setMsg('');
      setAttachments([]);
      try {
        await apiClient(`/broadcasts/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ message: savedMsg }),
        });
        onUpdate((list) =>
          list.map((b) =>
            b.id !== editingId ? b : { ...b, text: savedMsg, attachments: attachments.length ? attachments : b.attachments, edited: true }
          )
        );
      } catch (err) {
        console.error('Edit failed:', err);
        // Re-open editor with original text so teacher can retry
        setEditingId(editingId);
        setMsg(savedMsg);
      }
    } else {
      // Send real API request
      const payload = {
        standard_id: std.id,
        message: msg,
        attachment_url: attachments.length > 0 ? attachments[0].url : null,
        attachment_type: attachments.length > 0 ? attachments[0].type : null
      };
      
      setMsg('');
      setAttachments([]);
      
      try {
        await apiClient('/broadcasts', { method: 'POST', body: JSON.stringify(payload) });
      } catch (err) {
        console.error(err);
      }
    }
  };

  return (
    <>
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
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 bg-white/30">
        {broadcasts.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-neutral-500 px-6">
            <p className="text-sm font-medium mb-1">No messages yet</p>
            <p className="text-xs">Send your first broadcast to {std.name}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {broadcasts.filter(b => !b.deleted).map((b) => (
                <div key={b.id} className="max-w-md group relative">
                  <div className="glass-panel rounded-xl p-3 shadow-sm">
                    {b.pinned && (
                      <div className="flex items-center gap-1 text-[10px] text-neutral-500 mb-1.5">
                        <Pin size={9} /> Pinned
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
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-neutral-400">
                      <span>{b.time}</span>
                      {b.edited && <span>· edited</span>}
                      <span>·</span>
                      <span className={(readCounts[b.id] || 0) > 0 ? 'text-blue-500' : ''}>
                        {(readCounts[b.id] || 0) > 0 ? '✓✓' : '✓'} {readCounts[b.id] || 0}/{studentCount} read
                      </span>
                    </div>
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
                  </div>
                </div>
            ))}
          </div>
        )}
      </div>

      {/* Message context menu — rendered fixed so it is never clipped by overflow-y-auto */}
      {menuId && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuId(null)} />
          <div
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
            className="w-44 py-1 z-50 rounded-xl bg-white/90 backdrop-blur-md border border-white/60 shadow-xl"
          >
            {(() => {
              const b = broadcasts.find(x => x.id === menuId);
              if (!b) return null;
              return (
                <>
                  <button onClick={() => { setEditingId(b.id); setMsg(b.text); setAttachments(b.attachments || []); setMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left">
                    <Edit2 size={13} /> Edit
                  </button>
                  <button onClick={() => { onUpdate((list) => list.map((x) => x.id === b.id ? { ...x, pinned: !x.pinned } : x)); setMenuId(null); }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-white/40 text-left">
                    <Pin size={13} /> {b.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button onClick={async () => {
                      setMenuId(null);
                      try {
                        await apiClient(`/broadcasts/${b.id}`, { method: 'DELETE' });
                        onUpdate((list) => list.filter((x) => x.id !== b.id));
                      } catch (err) {
                        console.error('Delete failed:', err);
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-red-50 text-left text-red-600">
                    <Trash2 size={13} /> Delete for everyone
                  </button>
                </>
              );
            })()}
          </div>
        </>
      )}

      {editingId && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex items-center gap-2 text-xs text-amber-800">
          <Edit2 size={11} /> Editing message
          <button onClick={() => { setEditingId(null); setMsg(''); setAttachments([]); }} className="ml-auto hover:underline">Cancel</button>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-t border-blue-100 space-y-1">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white rounded text-xs border border-blue-200">
              <FileText size={11} className="text-blue-600" />
              <span className="flex-1 truncate">{a.name}</span>
              <span className="text-neutral-400">{a.size}</span>
              <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-600">
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white border-t border-white/60 px-3 py-2 flex items-end gap-2">
        <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
        <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 text-neutral-500 hover:text-neutral-900 rounded hover:bg-white/60 disabled:opacity-50">
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Paperclip size={16} />}
        </button>
        <input
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
