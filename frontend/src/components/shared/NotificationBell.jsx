import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check, CheckCheck, X } from 'lucide-react';
import { apiClient } from '../../lib/api';

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function NotificationBell({ dark = false }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const fetchNotifications = async () => {
    if (!localStorage.getItem('tutoria_token')) return;
    setLoading(true);
    try {
      const data = await apiClient('/notifications');
      setNotifications(data || []);
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchNotifications();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const interval = setInterval(fetchNotifications, 30000);
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', handler);
    };
  }, [open]);

  const markRead = async (id) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    try { await apiClient(`/notifications/${id}/read`, { method: 'PATCH' }); } catch {}
  };

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    try { await apiClient('/notifications/read-all', { method: 'POST' }); } catch {}
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchNotifications(); }}
        className={`relative p-2 rounded-lg transition-colors ${dark ? 'text-neutral-300 hover:text-white hover:bg-white/10' : 'text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF]'}`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-80 z-50 bg-white rounded-xl shadow-lg border border-[#EFEDEA] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EFEDEA]">
            <span className="text-sm font-semibold">Notifications</span>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded hover:bg-[#F4F2EF]">
                  <CheckCheck size={11} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1 text-neutral-400 hover:text-neutral-900 rounded hover:bg-[#F4F2EF]">
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 && (
              <div className="py-8 text-center text-xs text-neutral-400">Loading...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="py-8 text-center">
                <Bell size={20} className="mx-auto mb-2 text-neutral-300" />
                <p className="text-xs text-neutral-400">No notifications yet</p>
              </div>
            )}
            {notifications.map(n => (
              <div
                key={n.id}
                onClick={() => !n.read && markRead(n.id)}
                className={`px-4 py-3 border-b border-[#EFEDEA] last:border-b-0 cursor-default transition-colors ${n.read ? 'opacity-60' : 'hover:bg-[#F4F2EF] cursor-pointer'}`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${n.read ? 'bg-transparent' : 'bg-blue-500'}`} />
                  <div className="flex-1 min-w-0">
                    {n.title && <p className="text-xs font-semibold text-neutral-900 truncate">{n.title}</p>}
                    {n.body && <p className="text-xs text-neutral-600 leading-relaxed">{n.body}</p>}
                    <p className="text-[10px] text-neutral-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                  {!n.read && (
                    <button onClick={(e) => { e.stopPropagation(); markRead(n.id); }}
                      className="p-1 text-neutral-400 hover:text-blue-600 rounded hover:bg-[#F4F2EF] flex-shrink-0">
                      <Check size={11} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
