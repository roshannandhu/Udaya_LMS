import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, MessageCircle, Send, Loader2, Trash2, Heart } from 'lucide-react';
import { Avatar, Modal, Skeleton } from '../../ui';
import { apiClient, videoApi } from '../../../lib/api';

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CommentsTab({ video }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [replyFor, setReplyFor] = useState(null); // comment id being replied to
  const [replyText, setReplyText] = useState('');
  const [busy, setBusy]         = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!video?.id) return;
    let cancelled = false;
    setLoading(true);
    videoApi.getComments(video.id)
      .then(rows => { if (!cancelled) setComments(Array.isArray(rows) ? rows : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [video?.id]);

  const sendReply = async (commentId) => {
    const t = replyText.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const updated = await videoApi.replyComment(commentId, t);
      setComments(prev => prev.map(c => c.id === commentId
        ? { ...c, teacher_reply: updated?.teacher_reply ?? t, replied_at: updated?.replied_at ?? new Date().toISOString() }
        : c));
      setReplyFor(null);
      setReplyText('');
    } catch (err) {
      alert(err?.message || 'Could not send reply.');
    } finally {
      setBusy(false);
    }
  };

  const removeComment = async (commentId) => {
    if (deletingId) return;
    if (!window.confirm('Delete this student message (and your reply)? This cannot be undone.')) return;
    setDeletingId(commentId);
    try {
      await videoApi.deleteComment(commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    } catch (err) {
      alert(err?.message || 'Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-neutral-400" /></div>;
  }
  if (comments.length === 0) {
    return <p className="text-sm text-neutral-500 text-center py-10">No questions from students yet.</p>;
  }

  return (
    <div className="space-y-3">
      {comments.map(c => {
        const s = c.students || {};
        return (
          <div key={c.id} className="rounded-2xl border border-neutral-100 bg-white p-3">
            <div className="flex items-center gap-2.5 mb-2">
              <Avatar name={s.name || 'Student'} src={s.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.name || 'Student'}</p>
                <p className="text-[11px] text-neutral-400">{relTime(c.created_at)}</p>
              </div>
              <button
                onClick={() => removeComment(c.id)}
                disabled={deletingId === c.id}
                title="Delete message"
                className="p-1.5 -mr-1 rounded-lg text-neutral-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
              >
                {deletingId === c.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
            <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words">{c.text}</p>

            {c.teacher_reply ? (
              <div className="mt-2 pl-3 border-l-2 border-blue-200">
                <p className="text-[11px] font-semibold text-blue-600 mb-0.5">Your reply · {relTime(c.replied_at)}</p>
                <p className="text-sm text-neutral-700 whitespace-pre-wrap break-words">{c.teacher_reply}</p>
              </div>
            ) : replyFor === c.id ? (
              <div className="mt-2 flex items-end gap-2">
                <textarea
                  autoFocus value={replyText} onChange={e => setReplyText(e.target.value)} rows={2}
                  placeholder="Write a private reply…"
                  className="flex-1 text-sm rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 outline-none focus:border-blue-300 resize-none"
                />
                <button onClick={() => sendReply(c.id)} disabled={!replyText.trim() || busy}
                  className="w-9 h-9 rounded-full bg-black text-white flex items-center justify-center disabled:opacity-40">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </button>
              </div>
            ) : (
              <button onClick={() => { setReplyFor(c.id); setReplyText(''); }}
                className="mt-2 text-xs font-medium text-blue-600 hover:underline">Reply</button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function VideoViewersModal({ video, onClose }) {
  const [tab, setTab] = useState('viewers');
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!video) return;
    setTab('viewers');
    setLoading(true);
    setViewers([]);
    apiClient(`/videos/${video.id}/viewers`)
      .then(data => setViewers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [video?.id]);

  const watched    = viewers.filter(v => v.watched);
  const notWatched = viewers.filter(v => !v.watched);
  const watchPct   = viewers.length > 0 ? Math.round((watched.length / viewers.length) * 100) : 0;

  const fmtTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  };

  const stroke = watchPct >= 70 ? '#22c55e' : watchPct >= 30 ? '#f59e0b' : '#94a3b8';

  return (
    <Modal open={!!video} onClose={onClose} title={video?.title || ''} size="md">
      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-neutral-100 rounded-full mb-4">
        <button onClick={() => setTab('viewers')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'viewers' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>
          <CheckCircle2 size={14} /> Viewers
        </button>
        <button onClick={() => setTab('comments')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-full text-sm font-semibold transition-colors ${tab === 'comments' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}>
          <MessageCircle size={14} /> Comments
        </button>
      </div>

      {tab === 'comments' ? (
        <CommentsTab video={video} />
      ) : loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-9 h-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats panel */}
          <div className="flex items-center gap-4 p-4 bg-neutral-50 border border-neutral-100 rounded-2xl">
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.2" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke={stroke} strokeWidth="3.2"
                  strokeDasharray={`${watchPct} ${100 - watchPct}`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-neutral-900">{watchPct}%</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-3 gap-2">
              <div className="bg-green-50 border border-green-100 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-green-700 leading-none mb-0.5">{watched.length}</p>
                <p className="text-xs text-green-600 font-medium">Watched</p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-neutral-500 leading-none mb-0.5">{notWatched.length}</p>
                <p className="text-xs text-neutral-400 font-medium">Not yet</p>
              </div>
              <div className="bg-rose-50 border border-rose-100 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-rose-600 leading-none mb-0.5 flex items-center justify-center gap-1">
                  <Heart size={15} className="fill-rose-500 text-rose-500" />{video?.like_count || 0}
                </p>
                <p className="text-xs text-rose-500 font-medium">Likes</p>
              </div>
            </div>
          </div>

          {watched.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Watched ({watched.length})
              </p>
              <div className="space-y-1.5">
                {watched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white border border-neutral-100">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-neutral-400">
                        @{s.username}{s.last_watched_at ? ` · ${fmtTime(s.last_watched_at)}` : ''}
                      </p>
                    </div>
                    {s.completed ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <CheckCircle2 size={10} /> Done
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5 flex-shrink-0">
                        <Clock size={10} /> Partial
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {notWatched.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                Not yet ({notWatched.length})
              </p>
              <div className="space-y-1.5">
                {notWatched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-neutral-50 border border-neutral-100">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate text-neutral-600">{s.name}</p>
                      <p className="text-xs text-neutral-400">@{s.username}</p>
                    </div>
                    <span className="text-xs font-medium text-neutral-400 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      Not watched
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewers.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-6">No students enrolled yet.</p>
          )}
        </div>
      )}
    </Modal>
  );
}
