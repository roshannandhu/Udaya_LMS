import React, { useState, useEffect } from 'react';
import { Send, Loader2, MessageCircle, Lock, Trash2 } from 'lucide-react';
import { videoApi } from '../../lib/api';

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// Private per-student comment thread shown under a video. A student sees ONLY
// their own messages; the teacher (in their own view) sees everyone's. This is a
// quiet "ask your teacher a doubt" channel, not a public comment wall.
export default function VideoComments({ videoId }) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [error, setError]       = useState('');
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    setLoading(true);
    videoApi.getComments(videoId)
      .then(rows => { if (!cancelled) setComments(Array.isArray(rows) ? rows : []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [videoId]);

  const submit = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await videoApi.postComment(videoId, t);
      setComments(prev => [created, ...prev]);
      setText('');
    } catch (err) {
      const code = err?.status;
      const msg = (code === 503 || /enabled yet|setup/i.test(err?.message || ''))
        ? 'Comments are being set up — please try again shortly.'
        : (err?.message || 'Could not send. Please try again.');
      setError(msg);
    } finally {
      setSending(false);
    }
  };

  const remove = async (id) => {
    if (deletingId) return;
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    setDeletingId(id);
    try {
      await videoApi.deleteComment(id);
      setComments(prev => prev.filter(c => c.id !== id));
    } catch (err) {
      setError(err?.message || 'Could not delete. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-[#EFEDEA]">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={16} className="text-neutral-500" />
        <h3 className="font-semibold text-neutral-900">Ask your teacher</h3>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-neutral-500 mb-4">
        <Lock size={11} /> Private — only you and your teacher can see your messages.
      </p>

      {/* Composer */}
      <div className="flex items-end gap-2 mb-5">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          rows={2}
          maxLength={1000}
          placeholder="Ask a doubt about this lesson…"
          className="flex-1 text-sm rounded-2xl border border-[#EFEDEA] bg-white px-4 py-2.5 outline-none focus:border-neutral-300 focus:ring-2 focus:ring-neutral-100 resize-none placeholder:text-neutral-400 transition-all"
        />
        <button
          onClick={submit}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-11 h-11 rounded-full bg-ink text-white flex items-center justify-center disabled:opacity-40 hover:bg-neutral-800 transition-colors"
          title="Send"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>

      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {/* Thread */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 size={18} className="animate-spin text-neutral-400" /></div>
      ) : comments.length === 0 ? (
        <div className="text-center py-8">
          <MessageCircle size={26} className="text-neutral-300 mx-auto mb-2" />
          <p className="text-sm text-neutral-400">No messages yet.<br />Ask your first doubt above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map(c => (
            <div key={c.id} className="space-y-1.5">
              {/* Student's own message (right-aligned) */}
              <div className="flex flex-col items-end group">
                <div className="max-w-[85%] bg-neutral-900 text-white text-sm rounded-2xl rounded-tr-md px-3.5 py-2 shadow-sm whitespace-pre-wrap break-words">
                  {c.text}
                </div>
                <div className="flex items-center gap-2 mt-1 mr-1">
                  <button
                    onClick={() => remove(c.id)}
                    disabled={deletingId === c.id}
                    className="text-[10px] text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex items-center gap-0.5"
                    title="Delete message"
                  >
                    {deletingId === c.id ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
                    Delete
                  </button>
                  <span className="text-[10px] text-neutral-400">{relTime(c.created_at)}</span>
                </div>
              </div>
              {/* Teacher's reply (left-aligned) */}
              {c.teacher_reply && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[85%] bg-white border border-[#EFEDEA] text-neutral-900 text-sm rounded-2xl rounded-tl-md px-3.5 py-2 shadow-sm whitespace-pre-wrap break-words">
                    <span className="block text-[11px] font-semibold text-blue-600 mb-0.5">Teacher</span>
                    {c.teacher_reply}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-1 ml-1">{relTime(c.replied_at)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
