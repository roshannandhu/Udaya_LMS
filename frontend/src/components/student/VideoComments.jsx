import React, { useState, useEffect } from 'react';
import { Send, Loader2, MessageCircle, Lock } from 'lucide-react';
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
      // Backend returns the inserted row; prepend so it shows instantly.
      setComments(prev => [created, ...prev]);
      setText('');
    } catch (err) {
      setError(err?.message || 'Could not send. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-[#EFEDEA]">
      <div className="flex items-center gap-2 mb-1">
        <MessageCircle size={16} className="text-neutral-500" />
        <h3 className="font-semibold text-neutral-900">Ask your teacher</h3>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-neutral-500 mb-3">
        <Lock size={11} /> Private — only you and your teacher can see your messages.
      </p>

      {/* Composer */}
      <div className="flex items-end gap-2 mb-4">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }}
          rows={2}
          maxLength={1000}
          placeholder="Ask a doubt about this lesson…"
          className="flex-1 text-sm rounded-2xl border border-[#EFEDEA] bg-white px-4 py-2.5 outline-none focus:border-blue-300 resize-none placeholder:text-neutral-400"
        />
        <button
          onClick={submit}
          disabled={!text.trim() || sending}
          className="flex-shrink-0 w-11 h-11 rounded-full bg-black text-white flex items-center justify-center disabled:opacity-40 hover:bg-neutral-800 transition-colors"
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
        <p className="text-sm text-neutral-400 text-center py-6">No messages yet. Ask your first doubt above.</p>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="space-y-2">
              {/* Student's own message */}
              <div className="flex flex-col items-end">
                <div className="max-w-[85%] bg-[#dcf8c6] text-neutral-900 text-sm rounded-2xl rounded-tr-sm px-3.5 py-2 shadow-sm whitespace-pre-wrap break-words">
                  {c.text}
                </div>
                <span className="text-[10px] text-neutral-400 mt-0.5 mr-1">{relTime(c.created_at)}</span>
              </div>
              {/* Teacher's reply (if any) */}
              {c.teacher_reply && (
                <div className="flex flex-col items-start">
                  <div className="max-w-[85%] bg-white border border-[#EFEDEA] text-neutral-900 text-sm rounded-2xl rounded-tl-sm px-3.5 py-2 shadow-sm whitespace-pre-wrap break-words">
                    <span className="block text-[11px] font-semibold text-blue-600 mb-0.5">Teacher</span>
                    {c.teacher_reply}
                  </div>
                  <span className="text-[10px] text-neutral-400 mt-0.5 ml-1">{relTime(c.replied_at)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
