import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, Pin, Paperclip, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { useAuthStore } from '../../lib/auth';
import { apiClient, broadcastApi } from '../../lib/api';

function fmtTime(t) { return t || ''; }

export default function StudentBroadcastsPage() {
  const { user } = useAuthStore();
  const [standard, setStandard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [broadcasts, setBroadcasts] = useState([]);
  const wsRef = useRef(null);
  const markedReadRef = useRef(new Set());

  // Load the student's standard from their profile
  useEffect(() => {
    const load = async () => {
      try {
        // standard_id is now returned by /auth/me for students
        const me = await apiClient('/auth/me').catch(() => null);
        const standardId = me?.standard_id || user?.standard_id;
        if (standardId) {
          const stds = await apiClient('/standards');
          const std = (stds || []).find(s => String(s.id) === String(standardId));
          setStandard(std || { id: standardId, name: 'My Class' });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.standard_id]);

  useEffect(() => {
    if (!standard?.id) return;
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';
    const wsBase = apiBase.replace(/^http/, 'ws');
    const token = localStorage.getItem('tutoria_token') || '';
    const ws = new WebSocket(`${wsBase}/ws/broadcasts/${standard.id}?token=${encodeURIComponent(token)}`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'history') {
        const now = new Date();
        const formatted = data.data
          .filter(b => !b.deleted && !(b.scheduled_for && new Date(b.scheduled_for) > now))
          .map(b => ({
            id: b.id,
            text: b.message,
            time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
            pinned: false,
            attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type }] : [],
          }));
        setBroadcasts(formatted);
        // Mark all visible broadcasts as read (skip already-sent IDs)
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
        const newMsg = {
          id: b.id,
          text: b.message,
          time: new Date(b.created_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }),
          pinned: false,
          attachments: b.attachment_url ? [{ url: b.attachment_url, type: b.attachment_type }] : [],
        };
        setBroadcasts(prev => {
          if (prev.some(x => x.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });
        // Mark the new message as read immediately (skip if already sent)
        if (b.id && !markedReadRef.current.has(b.id)) {
          broadcastApi.markRead([b.id]).catch(() => {});
          markedReadRef.current.add(b.id);
        }
      } else if (data.type === 'delete_broadcast') {
        setBroadcasts(prev => prev.filter(b => b.id !== data.id));
      } else if (data.type === 'edit_broadcast') {
        const b = data.data;
        setBroadcasts(prev => prev.map(x =>
          x.id === b.id ? { ...x, text: b.message } : x
        ));
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [standard?.id]);

  const pinned  = broadcasts.filter(b => b.pinned);
  const regular = broadcasts.filter(b => !b.pinned);

  const Bubble = ({ b }) => (
    <div className="max-w-[85%] self-start">
      <div className={`px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed ${
        b.pinned
          ? 'bg-amber-50/80 border border-amber-200 backdrop-blur-sm'
          : 'glass-panel border-white/60'
      }`}>
        {b.pinned && (
          <div className="flex items-center gap-1 text-amber-600 text-xs font-medium mb-1">
            <Pin size={10} /> Pinned
          </div>
        )}
        <p className="text-neutral-800">{b.text}</p>
        {b.attachments?.length > 0 && (
          <div className="mt-2 space-y-2">
            {b.attachments.map((att, i) => (
              <div key={i}>
                {att.type?.startsWith('image/') ? (
                  <a href={att.url} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-white/40 shadow-sm hover:opacity-90 transition-opacity">
                    <img src={att.url} alt="attachment" className="w-full max-h-48 object-cover" />
                  </a>
                ) : (
                  <a href={att.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-white/40 hover:bg-white/60 transition-colors rounded-lg text-sm border border-white/60 shadow-sm">
                    <FileText size={14} className="text-blue-600" />
                    <span className="flex-1 truncate font-medium text-blue-900">Attachment</span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-neutral-400">{fmtTime(b.time)}</span>
          {b.readBy?.length > 0 && (
            <span className="text-[10px] text-blue-400">✓✓ {b.readBy.length} read</span>
          )}
        </div>
      </div>
    </div>
  );

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
          <div className="flex items-center gap-1.5 px-2 py-1 bg-green-50 text-green-700 rounded-full text-[10px] font-bold border border-green-200">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            LIVE
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {broadcasts.length === 0 ? (
          <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
            <MessageSquare size={32} className="mx-auto mb-3 text-neutral-400" />
            <p className="text-sm text-neutral-600">No messages yet.</p>
            <p className="text-xs text-neutral-500 mt-1">Your teacher will post announcements here.</p>
          </div>
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
    </div>
  );
}
