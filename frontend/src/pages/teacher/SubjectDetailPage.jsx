import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Plus, Upload, MoreVertical, Video, FileQuestion,
  Shield, Loader2, ListChecks, Edit2, Eye, CheckCircle2, Clock,
  Trash2, Users, ClipboardList, Paperclip, Star, CalendarClock,
  Radio, StickyNote, Pin, PinOff, FileText, AlertCircle, Calendar,
} from 'lucide-react';
import { Btn, Tag, Avatar, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi, videoApi, assignmentApi, liveClassApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import LiveClassThumbnail from '../../components/LiveClassThumbnail';
import LiveClassAttendanceSheet from '../../components/teacher/LiveClassAttendanceSheet';

/* ─── helpers shared with live-class cards ─────────── */
function fmtDateTimeLC(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const h = d.getHours(), m = d.getMinutes();
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} at ${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;
}
function statusColorLC(s) {
  return s==='live'?'green':s==='scheduled'?'amber':s==='cancelled'?'red':'gray';
}

/* ─── ScheduleSubjectLiveModal ──────────────────────── */
function ScheduleSubjectLiveModal({ open, onClose, classId, subjectName, onScheduled }) {
  const [title, setTitle]       = useState('');
  const [date, setDate]         = useState('');
  const [time, setTime]         = useState('');
  const [duration, setDuration] = useState(60);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    if (!open) { setTitle(''); setDate(''); setTime(''); setDuration(60); setError(''); }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim() || !date || !time) return;
    setSaving(true); setError('');
    try {
      await liveClassApi.create({ class_id: classId, title: title.trim(), scheduled_at: `${date}T${time}:00`, duration_mins: duration });
      onScheduled();
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to schedule. Check Zoom credentials.');
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Schedule live class — ${subjectName || ''}`} size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Title</label>
          <input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="e.g. Chapter 5 — Quadratic Equations"
            className="w-full px-3 py-2 rounded-md bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Date</label>
            <input type="date" value={date} min={today} onChange={e=>setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Time</label>
            <input type="time" value={time} onChange={e=>setTime(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Duration</label>
          <select value={duration} onChange={e=>setDuration(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm">
            {[30,45,60,90,120].map(m=><option key={m} value={m}>{m} min</option>)}
          </select>
        </div>
        {error && <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertCircle size={14} className="mt-0.5 flex-shrink-0"/>{error}</div>}
        <Btn variant="primary" onClick={handleSubmit} disabled={!title.trim()||!date||!time||saving} className="w-full justify-center">
          {saving ? 'Scheduling…' : 'Schedule class'}
        </Btn>
      </div>
    </Modal>
  );
}

/* ─── NoteFormModal ─────────────────────────────────── */
function NoteFormModal({ open, onClose, classId, note, onSaved }) {
  const [title, setTitle]     = useState('');
  const [body, setBody]       = useState('');
  const [file, setFile]       = useState(null);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title || ''); setBody(note?.body || ''); setFile(null); setError('');
  }, [open, note]);

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      let fileUrl = note?.file_url || null;
      let fileType = note?.file_type || null;
      let storagePath = note?.storage_path || null;
      if (file === 'remove') {
        // User cleared the existing attachment
        fileUrl = null; fileType = null; storagePath = null;
      } else if (file) {
        const up = await notesApi.uploadFile(file, classId);
        fileUrl = up.url; fileType = up.type; storagePath = up.path;
      }
      const data = { title: title.trim(), body: body.trim() || null, file_url: fileUrl, file_type: fileType, storage_path: storagePath };
      if (note?.id) {
        await notesApi.update(note.id, data);
      } else {
        await notesApi.create({ ...data, class_id: classId });
      }
      onSaved(); onClose();
    } catch (err) { setError(err?.message || 'Failed to save note'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={note ? 'Edit note' : 'New note'} size="md">
      <div className="space-y-4">
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Title</label>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Note title"
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Content (optional)</label>
          <textarea value={body} onChange={e=>setBody(e.target.value)} rows={5} placeholder="Note content…"
            className="w-full px-3 py-2 rounded-xl bg-white border border-[#EFEDEA] focus:outline-none text-sm resize-none" />
        </div>
        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Attachment (PDF / image)</label>
          {(note?.file_url && !file) ? (
            <div className="flex items-center gap-2 text-sm text-neutral-600">
              <FileText size={14}/> <span className="truncate">{note.file_url.split('/').pop()}</span>
              <button onClick={()=>setFile('remove')} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-500 w-full">
              <Paperclip size={14}/>{file && file !== 'remove' ? file.name : 'Choose file'}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e=>setFile(e.target.files[0]||null)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Btn variant="primary" onClick={handleSave} disabled={saving||!title.trim()} className="w-full justify-center">
          {saving ? 'Saving…' : note ? 'Save changes' : 'Create note'}
        </Btn>
      </div>
    </Modal>
  );
}
import AttendanceGrid from '../../components/teacher/AttendanceGrid';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import NewTestModal from '../../components/teacher/NewTestModal';
import { EditVideoModal } from '../../components/teacher/Modals';
import NewAssignmentModal from '../../components/teacher/NewAssignmentModal';
import AssignmentSubmissionsSheet from '../../components/teacher/AssignmentSubmissionsSheet';
import { useAppCache } from '../../store';

/* ─── VideoAddModal ──────────────────────────────────────── */

function VideoAddModal({ open, onClose, classId, onAdded }) {
  const [youtubeUrl, setYoutubeUrl]   = useState('');
  const [ytVideoId, setYtVideoId]     = useState(null);
  const [ytPreviewError, setYtPreviewError] = useState(null);
  const [ytTitle, setYtTitle]         = useState('');
  const [ytDescription, setYtDescription] = useState('');
  const [ytAdding, setYtAdding]       = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setYoutubeUrl(''); setYtVideoId(null); setYtPreviewError(null);
      setYtTitle(''); setYtDescription(''); setYtAdding(false);
    }
  }, [open]);

  function extractYouTubeId(url) {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return m[1];
    }
    return null;
  }

  function onYoutubeUrlChange(e) {
    const url = e.target.value;
    setYoutubeUrl(url);
    setYtPreviewError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!url.trim()) { setYtVideoId(null); return; }
      const id = extractYouTubeId(url.trim());
      if (!id) {
        setYtVideoId(null);
        setYtPreviewError('Invalid YouTube URL. Use youtube.com/watch?v=… or youtu.be/…');
      } else {
        setYtVideoId(id);
      }
    }, 400);
  }

  async function handleAdd() {
    if (!ytVideoId || !ytTitle.trim() || ytAdding) return;
    setYtAdding(true);
    try {
      await apiClient('/videos/youtube', {
        method: 'POST',
        body: JSON.stringify({
          class_id: classId,
          title: ytTitle.trim(),
          description: ytDescription.trim() || null,
          youtube_video_id: ytVideoId,
          youtube_url: youtubeUrl,
        }),
      });
      onAdded();
      onClose();
    } catch (err) {
      setYtPreviewError(err?.message || 'Failed to add video.');
    } finally {
      setYtAdding(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add video" size="md">
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 leading-relaxed">
          <strong>Important:</strong> Set your YouTube video to <strong>Unlisted</strong> — not Private.
          Students watch inside this app and never see the URL.
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1.5">YouTube video URL</label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={onYoutubeUrlChange}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10 focus:border-neutral-400"
          />
        </div>

        {ytPreviewError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{ytPreviewError}</p>
        )}

        {ytVideoId && !ytPreviewError && (
          <div className="flex gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
              alt="preview"
              className="w-28 flex-shrink-0 rounded-lg object-cover"
              style={{ aspectRatio: '16/9' }}
            />
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">
                ✓ Video detected
              </span>
              <p className="text-xs text-neutral-400 mt-1 font-mono break-all">{ytVideoId}</p>
            </div>
          </div>
        )}

        {ytVideoId && !ytPreviewError && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Title</label>
              <input
                type="text"
                value={ytTitle}
                onChange={e => setYtTitle(e.target.value)}
                placeholder="e.g. Chapter 5 — Quadratic Equations"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1.5">Description (optional)</label>
              <textarea
                value={ytDescription}
                onChange={e => setYtDescription(e.target.value)}
                placeholder="What this video covers..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-xl bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/10"
              />
            </div>
            <Btn
              onClick={handleAdd}
              disabled={!ytVideoId || !ytTitle.trim() || ytAdding}
              className="w-full justify-center"
              variant="primary"
            >
              {ytAdding ? <><Loader2 size={14} className="animate-spin mr-1.5" />Adding…</> : 'Add video'}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ─── VideoCard ──────────────────────────────────────────── */

function VideoCard({ video, thumbnail, studentsCount, onView, onMenu }) {
  const watchedCount = video.completed_count ?? 0;
  const watchPct = studentsCount > 0 ? Math.round((watchedCount / studentsCount) * 100) : 0;
  const duration = video.duration_secs
    ? `${Math.floor(video.duration_secs / 60)}:${(video.duration_secs % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 group">
      {/* Thumbnail */}
      <div
        className="relative aspect-video bg-gradient-to-br from-neutral-100 to-neutral-200 overflow-hidden cursor-pointer"
        onClick={() => onView(video)}
      >
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-white/60 flex items-center justify-center">
              <Play size={22} className="text-neutral-500 ml-0.5" fill="currentColor" />
            </div>
          </div>
        )}

        {/* Hover play overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-200 flex items-center justify-center pointer-events-none">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-lg">
            <Play size={18} className="text-neutral-900 ml-0.5" fill="currentColor" />
          </div>
        </div>

        {/* YT badge */}
        {video.source_type === 'youtube' && (
          <span className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md leading-tight z-10">
            YT
          </span>
        )}

        {/* Duration */}
        {duration && (
          <span className="absolute bottom-2 right-2 bg-black/70 text-white text-[11px] px-1.5 py-0.5 rounded-md font-mono leading-tight z-10">
            {duration}
          </span>
        )}

        {/* 3-dot button */}
        <button
          onClick={e => { e.stopPropagation(); onMenu(video.id, e); }}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-black/70 z-10"
        >
          <MoreVertical size={12} />
        </button>
      </div>

      {/* Body */}
      <div className="p-3.5 cursor-pointer" onClick={() => onView(video)}>
        <h4 className="text-sm font-semibold text-neutral-900 mb-2.5 line-clamp-2 leading-snug">
          {video.title}
        </h4>
        {studentsCount > 0 ? (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="flex items-center gap-1 text-neutral-500">
                <Eye size={11} />
                {watchedCount} / {studentsCount} watched
              </span>
              <span className={`font-semibold tabular-nums ${
                watchPct >= 70 ? 'text-green-600' : watchPct >= 30 ? 'text-amber-600' : 'text-neutral-400'
              }`}>
                {watchPct}%
              </span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  watchPct >= 70 ? 'bg-green-500' : watchPct >= 30 ? 'bg-amber-400' : 'bg-neutral-300'
                }`}
                style={{ width: `${watchPct}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-neutral-400">No students yet</p>
        )}
      </div>
    </div>
  );
}

/* ─── VideoViewersModal ──────────────────────────────────── */

function VideoViewersModal({ video, onClose }) {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!video) return;
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

  // SVG donut params (viewBox 36×36, r=15.9, circumference ≈ 99.9)
  const stroke = watchPct >= 70 ? '#22c55e' : watchPct >= 30 ? '#f59e0b' : '#94a3b8';

  return (
    <Modal open={!!video} onClose={onClose} title={video?.title || ''} size="md">
      {loading ? (
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
            {/* Donut */}
            <div className="relative w-16 h-16 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#e5e7eb" strokeWidth="3.2" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={stroke} strokeWidth="3.2"
                  strokeDasharray={`${watchPct} ${100 - watchPct}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-sm font-bold text-neutral-900">{watchPct}%</span>
              </div>
            </div>
            <div className="flex-1 grid grid-cols-2 gap-2">
              <div className="bg-green-50 border border-green-100 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-green-700 leading-none mb-0.5">{watched.length}</p>
                <p className="text-xs text-green-600 font-medium">Watched</p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-2.5 text-center">
                <p className="text-2xl font-bold text-neutral-500 leading-none mb-0.5">{notWatched.length}</p>
                <p className="text-xs text-neutral-400 font-medium">Not yet</p>
              </div>
            </div>
          </div>

          {/* Watched */}
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

          {/* Not watched */}
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

/* ─── SubjectDetailPage ──────────────────────────────────── */

export default function SubjectDetailPage() {
  const { standardId, classId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const allStandards  = useAppCache(s => s.standards);
  const allSubjects   = useAppCache(s => s.subjects);
  const allStudents   = useAppCache(s => s.students);
  const cachedStandard = allStandards.find(s => String(s.id) === String(standardId));
  const cachedSubject  = allSubjects.find(s => String(s.id) === String(classId));
  const cachedStudents = allStudents.filter(s => String(s.standard_id) === String(standardId));

  const [standard, setStandard] = useState(cachedStandard || null);
  const [subject, setSubject]   = useState(cachedSubject  || null);
  const [students, setStudents] = useState(cachedStudents);
  const [videos, setVideos]     = useState([]);
  const [tests, setTests]       = useState([]);
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);
  const [loading, setLoading]   = useState(!cachedSubject);
  const [tab, setTab]           = useState('videos');
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [editTestId, setEditTestId]   = useState(null);
  const [selectedTest, setSelectedTest]   = useState(null);
  const [videoMenuId, setVideoMenuId]     = useState(null);
  const [menuPos, setMenuPos]             = useState({ top: 0, right: 0 });
  const [editVideo, setEditVideo]         = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [thumbnailUrls, setThumbnailUrls] = useState({});
  const [assignments, setAssignments]           = useState([]);
  const [newAssignOpen, setNewAssignOpen]       = useState(false);
  const [editAssignment, setEditAssignment]     = useState(null);
  const [viewSubmissionsFor, setViewSubmissionsFor] = useState(null);
  const [liveClasses, setLiveClasses]           = useState([]);
  const [showScheduleLive, setShowScheduleLive] = useState(false);
  const [joiningLiveId, setJoiningLiveId]       = useState(null);
  const [activeJoin, setActiveJoin]             = useState(null);
  const [attendanceSheetId, setAttendanceSheetId] = useState(null);
  const [notes, setNotes]                       = useState([]);
  const [showNoteForm, setShowNoteForm]         = useState(false);
  const [editNote, setEditNote]                 = useState(null);

  useEffect(() => {
    if (!videoMenuId) return;
    const close = () => setVideoMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [videoMenuId]);

  const openDeleteConfirm = (videoId) => {
    setVideoMenuId(null);
    setConfirmDeleteId(videoId);
  };

  const doDeleteVideo = async () => {
    const videoId = confirmDeleteId;
    setConfirmDeleteId(null);
    const previous = videos;
    setVideos(prev => prev.filter(v => v.id !== videoId));
    try {
      await apiClient(`/videos/${videoId}`, { method: 'DELETE' });
    } catch (err) {
      setVideos(previous);
      alert(err.message || 'Failed to delete video.');
    }
  };

  const fetchTestsData = async () => {
    try {
      const data = await apiClient(`/tests?class_id=${classId}`);
      setTests(data || []);
    } catch(err) { console.error(err); }
  };

  const fetchAssignmentsData = async () => {
    try {
      const data = await assignmentApi.getByClass(classId);
      setAssignments(data?.assignments || []);
    } catch(err) { console.error(err); }
  };

  const handleDeleteAssignment = async (assignmentId) => {
    if (!window.confirm('Delete this assignment? All student submissions will also be removed.')) return;
    try {
      await assignmentApi.delete(assignmentId);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
      // Clear the submissions sheet if it was open for the deleted assignment
      if (viewSubmissionsFor?.id === assignmentId) setViewSubmissionsFor(null);
    } catch (err) {
      alert(err.message || 'Failed to delete assignment');
    }
  };

  const fetchVideosData = async () => {
    try {
      const data = await apiClient(`/videos?class_id=${classId}`);
      setVideos(data || []);
      loadThumbnails(data || []);
    } catch(err) { console.error(err); }
  };

  const fetchLiveClasses = async () => {
    const data = await liveClassApi.getByClass(classId).catch(() => []);
    setLiveClasses(Array.isArray(data) ? data : []);
  };

  const fetchNotes = async () => {
    const data = await notesApi.getByClass(classId).catch(() => []);
    setNotes(Array.isArray(data) ? data : []);
  };

  const handleWatchLive = async (lc) => {
    if (joiningLiveId) return;
    setJoiningLiveId(lc.id);
    preloadZoomSDK();
    try {
      const res = await liveClassApi.getJoinToken(lc.id);
      setActiveJoin({ ...res, liveClass: lc });
    } catch (err) { alert(err?.message || 'Could not open the live class.'); }
    finally { setJoiningLiveId(null); }
  };

  const handleEndLive = async (lc) => {
    if (!window.confirm(`End "${lc.title}"?`)) return;
    try { await liveClassApi.end(lc.id); await fetchLiveClasses(); } catch (err) { alert(err?.message); }
  };

  const handleCancelLive = async (lc) => {
    if (!window.confirm(`Cancel "${lc.title}"?`)) return;
    try { await liveClassApi.cancel(lc.id); await fetchLiveClasses(); } catch (err) { alert(err?.message); }
  };

  const handleDeleteLive = async (lc) => {
    if (!window.confirm(`Delete "${lc.title}" permanently?`)) return;
    try { await liveClassApi.remove(lc.id); await fetchLiveClasses(); } catch (err) { alert(err?.message); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!window.confirm('Delete this note?')) return;
    try { await notesApi.remove(noteId); setNotes(prev => prev.filter(n => n.id !== noteId)); } catch (err) { alert(err?.message); }
  };

  const handleTogglePin = async (note) => {
    try {
      await notesApi.update(note.id, { is_pinned: !note.is_pinned });
      setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n));
    } catch (err) { alert(err?.message); }
  };

  async function loadThumbnails(list) {
    const map = {};
    await Promise.all(list.map(async (v) => {
      try {
        const res = await videoApi.getThumbnail(v.id);
        if (res?.thumbnail_url) map[v.id] = res.thumbnail_url;
      } catch {}
    }));
    setThumbnailUrls(map);
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [videosData, testsData, lowAttData, assignData, liveData, notesData] = await Promise.all([
          apiClient(`/videos?class_id=${classId}`),
          apiClient(`/tests?class_id=${classId}`),
          attendanceApi.getLowAttendance(standardId).catch(() => ({ flagged_count: 0 })),
          assignmentApi.getByClass(classId).catch(() => ({ assignments: [] })),
          liveClassApi.getByClass(classId).catch(() => []),
          notesApi.getByClass(classId).catch(() => []),
        ]);
        setVideos(videosData || []);
        setTests(testsData  || []);
        setAssignments(assignData?.assignments || []);
        setLowAttendanceCount(lowAttData?.flagged_count || lowAttData?.count || 0);
        setLiveClasses(Array.isArray(liveData) ? liveData : []);
        setNotes(Array.isArray(notesData) ? notesData : []);
        loadThumbnails(videosData || []);

        const [stdData, subjectsData, studentsData] = await Promise.all([
          apiClient(`/standards/${standardId}`).catch(() => null),
          apiClient(`/subjects?standard_id=${standardId}`),
          apiClient(`/students?standard_id=${standardId}`),
        ]);
        if (stdData) setStandard(stdData);
        const found = (subjectsData || []).find(s => s.id === classId);
        if (found) setSubject(found);
        if (studentsData) setStudents(studentsData);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    if (standardId && classId) fetchData();
  }, [standardId, classId]);

  const TABS = [
    { id: 'videos',      label: 'Videos',      count: videos.length },
    { id: 'tests',       label: 'Tests',       count: tests.length },
    { id: 'assignments', label: 'Assignments', count: assignments.length },
    { id: 'live',        label: 'Live',        count: liveClasses.filter(l => l.status === 'live' || l.status === 'scheduled').length },
    { id: 'notes',       label: 'Notes',       count: notes.length },
    { id: 'students',    label: 'Students',    count: students.length },
    { id: 'attendance',  label: 'Attendance',  count: lowAttendanceCount, alert: lowAttendanceCount > 0 },
  ];

  if (activeJoin) {
    return (
      <ZoomMeetingView
        meeting_id={activeJoin.meeting_id}
        signature={activeJoin.signature}
        sdk_key={activeJoin.sdk_key}
        role={activeJoin.role ?? 0}
        display_name={user?.name || 'Teacher'}
        passcode={activeJoin.passcode}
        onLeave={() => { setActiveJoin(null); fetchLiveClasses(); }}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
            <Skeleton className="w-8 h-8" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[1,2,3].map(i => <Skeleton key={i} className="aspect-video rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* ── MASSIVE PASTEL HERO SECTION ── */}
      <div className="relative overflow-hidden bg-white border-b border-neutral-100 shadow-sm mb-8">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#e0f7fa] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 translate-x-1/3 -translate-y-1/2 pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#fce4ec] rounded-full mix-blend-multiply filter blur-[80px] opacity-70 -translate-x-1/3 translate-y-1/3 pointer-events-none"></div>
        
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 py-8 relative z-10 flex flex-col items-center text-center">
          <div className="w-full flex items-center justify-between mb-8">
            <button onClick={() => navigate(`/teacher/subjects/${standardId}`)} className="w-10 h-10 rounded-full bg-white shadow-sm border border-neutral-100 flex items-center justify-center text-neutral-600 hover:scale-110 transition-transform">
              <ArrowLeft size={20} />
            </button>
            <div className="flex gap-2">
              {tab === 'videos' && <Btn variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>Add video</Btn>}
              {tab === 'tests' && <Btn variant="primary" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>New test</Btn>}
              {tab === 'assignments' && <Btn variant="primary" icon={Plus} onClick={() => { setEditAssignment(null); setNewAssignOpen(true); }}>New assignment</Btn>}
              {tab === 'live' && <Btn variant="primary" icon={Radio} onClick={() => setShowScheduleLive(true)}>Schedule class</Btn>}
              {tab === 'notes' && <Btn variant="primary" icon={Plus} onClick={() => { setEditNote(null); setShowNoteForm(true); }}>New note</Btn>}
            </div>
          </div>

          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-white/60 backdrop-blur-md border-4 border-white shadow-xl flex items-center justify-center text-5xl md:text-6xl mb-6 transform hover:rotate-12 transition-transform duration-500">
            {subject?.emoji || '📚'}
          </div>

          <p className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-2">
            Standard: {standard?.name}
          </p>
          <h1 className="text-3xl md:text-5xl font-extrabold text-neutral-900 tracking-tight leading-none mb-6" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>
            {subject?.name || 'Subject Hub'}
          </h1>
        </div>

        {/* ── FLOATING PILL NAVIGATION ── */}
        <div className="max-w-[1200px] mx-auto px-5 md:px-8 pb-6 relative z-10 overflow-x-auto custom-scrollbar flex gap-3">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-shrink-0 px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wider transition-all duration-300 flex items-center gap-2 ${
                tab === t.id
                  ? 'bg-neutral-900 text-white shadow-lg scale-105'
                  : 'bg-white text-neutral-500 border border-neutral-200 hover:bg-neutral-50 hover:text-neutral-900'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`w-5 h-5 flex items-center justify-center text-[10px] rounded-full shadow-sm ${
                  tab === t.id
                    ? t.alert ? 'bg-red-500 text-white' : 'bg-white/20 text-white'
                    : t.alert ? 'bg-red-100 text-red-600' : 'bg-neutral-100 text-neutral-600'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 md:px-8 max-w-[1200px] mx-auto">

        {/* ══ Videos tab ══ */}
        {tab === 'videos' && (
          videos.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Video size={28} className="text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">No videos yet</h3>
              <p className="text-sm text-neutral-500 mb-6">Add your first YouTube video link.</p>
              <Btn variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>Add video</Btn>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {videos.map(v => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    thumbnail={thumbnailUrls[v.id]}
                    studentsCount={students.length}
                    onView={setSelectedVideo}
                    onMenu={(videoId, e) => {
                      if (videoMenuId === videoId) { setVideoMenuId(null); return; }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setVideoMenuId(videoId);
                    }}
                  />
                ))}
                {/* Add more card */}
                <button
                  onClick={() => setUploadOpen(true)}
                  className="aspect-video rounded-2xl border-2 border-dashed border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition-all flex flex-col items-center justify-center gap-2 text-neutral-400 hover:text-neutral-600"
                >
                  <div className="w-10 h-10 rounded-full border-2 border-neutral-300 flex items-center justify-center">
                    <Plus size={18} />
                  </div>
                  <span className="text-xs font-medium">Add video</span>
                </button>
              </div>
            </>
          )
        )}

        {/* Fixed-position dropdown */}
        {videoMenuId && (
          <div
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
            className="w-32 bg-white rounded-xl shadow-xl border border-neutral-100 py-1"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => { setEditVideo(videos.find(v => v.id === videoMenuId) || null); setVideoMenuId(null); }}
              className="w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 flex items-center gap-2"
            >
              <Edit2 size={12} /> Edit
            </button>
            <button
              onClick={() => openDeleteConfirm(videoMenuId)}
              className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}

        {/* ══ Tests tab ══ */}
        {tab === 'tests' && (
          tests.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <FileQuestion size={28} className="text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">No tests yet</h3>
              <p className="text-sm text-neutral-500 mb-6">Create your first MCQ test.</p>
              <Btn variant="primary" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>
                Create test
              </Btn>
            </div>
          ) : (
            <div className="space-y-3">
              {tests.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-semibold text-sm text-neutral-900">{t.title}</h4>
                        {t.negative_marking && <Tag color="red">−{t.penalty}</Tag>}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {t.duration_mins} min · {t.total_marks} marks
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Btn size="sm" variant="ghost" icon={Edit2} onClick={() => { setEditTestId(t.id); setNewTestOpen(true); }}>
                        Edit
                      </Btn>
                      <Btn size="sm" variant="ghost" icon={ListChecks} onClick={() => setSelectedTest(t)}>
                        Results
                      </Btn>
                      <Tag color={t.status === 'completed' ? 'green' : t.status === 'scheduled' ? 'amber' : 'gray'}>
                        {t.status}
                      </Tag>
                    </div>
                  </div>
                  {t.scheduled_for && (
                    <div className="text-xs text-amber-700 pt-2 border-t border-neutral-100">
                      Publishes on {new Date(t.scheduled_for).toLocaleDateString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ══ Assignments tab ══ */}
        {tab === 'assignments' && (
          assignments.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <ClipboardList size={28} className="text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">No assignments yet</h3>
              <p className="text-sm text-neutral-500 mb-6">Create your first assignment for students.</p>
              <Btn variant="primary" icon={Plus} onClick={() => { setEditAssignment(null); setNewAssignOpen(true); }}>
                New assignment
              </Btn>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => {
                const now = new Date();
                const due = a.due_date ? new Date(a.due_date) : null;
                const isPast = due && due < now;
                const isNear = due && !isPast && (due - now) < 24 * 3600 * 1000;
                const submittedCount = a.submitted_count ?? 0;
                return (
                  <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-neutral-100 p-4">
                    <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-semibold text-sm text-neutral-900 mb-1">{a.title}</h4>
                        {a.description && (
                          <p className="text-xs text-neutral-500 line-clamp-2">{a.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Btn size="sm" variant="ghost" icon={Edit2}
                          onClick={() => { setEditAssignment(a); setNewAssignOpen(true); }}>
                          Edit
                        </Btn>
                        <Btn size="sm" variant="ghost" icon={Users}
                          onClick={() => setViewSubmissionsFor(a)}>
                          Submissions
                        </Btn>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {due && (
                        <div className={`flex items-center gap-1 text-xs font-medium ${isPast ? 'text-red-600' : isNear ? 'text-amber-600' : 'text-neutral-500'}`}>
                          <CalendarClock size={11} />
                          Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {isPast && <Tag color="red">Closed</Tag>}
                        </div>
                      )}
                      <span className="text-xs text-neutral-400">
                        {submittedCount} submitted
                      </span>
                      {(a.assignment_attachments || []).length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-neutral-400">
                          <Paperclip size={11} />
                          {a.assignment_attachments.length} file{a.assignment_attachments.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleDeleteAssignment(a.id)}
                        className="text-xs text-red-500 hover:text-red-700 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ══ Students tab ══ */}
        {tab === 'students' && (
          <div>
            <div className="p-3.5 mb-4 rounded-2xl bg-blue-50 border border-blue-100 flex items-start gap-2.5 text-sm">
              <Shield size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-blue-900">
                <p className="font-semibold text-sm">Enrollment is at standard level</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  Everyone in {standard?.name} is auto-enrolled in this subject.
                </p>
              </div>
            </div>
            {students.length === 0 ? (
              <div className="text-center py-12 glass-panel rounded-2xl">
                <Users size={28} className="mx-auto mb-2 text-neutral-300" />
                <p className="text-sm text-neutral-500">No students enrolled yet.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl overflow-hidden shadow-sm border border-neutral-100">
                {students.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/teacher/students/${s.id}`)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors text-left ${
                      i < students.length - 1 ? 'border-b border-neutral-100' : ''
                    }`}
                  >
                    <Avatar name={s.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-neutral-400">@{s.username}</p>
                    </div>
                    <span className="text-xs font-medium text-neutral-500 flex-shrink-0">
                      {s.avg_score || 0}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══ Live tab ══ */}
        {tab === 'live' && (
          liveClasses.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <Radio size={28} className="text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">No live classes yet</h3>
              <p className="text-sm text-neutral-500 mb-6">Schedule a Zoom live class for this subject.</p>
              <Btn variant="primary" icon={Radio} onClick={() => setShowScheduleLive(true)}>Schedule</Btn>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {liveClasses.map(lc => {
                const status = lc.status || 'scheduled';
                const isLive = status === 'live';
                const isScheduled = status === 'scheduled';
                const isEnded = status === 'ended';
                const isCancelled = status === 'cancelled';
                return (
                  <div key={lc.id} className="rounded-xl glass-panel border-white/60 shadow-sm overflow-hidden flex flex-col">
                    <LiveClassThumbnail
                      thumbnailUrl={lc.thumbnail_url}
                      textSide={lc.thumbnail_text_side}
                      subjectName={subject?.name}
                      standardName={standard?.name}
                      topic={lc.title}
                      status={status}
                      scheduledAt={lc.scheduled_at}
                    />
                    <div className="p-3 flex flex-col gap-2 flex-1">
                      <div className="flex items-start gap-2">
                        <h3 className="flex-1 text-sm font-semibold text-neutral-900 leading-snug line-clamp-2">{lc.title}</h3>
                        <Tag color={statusColorLC(status)}>
                          {isLive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block mr-1 animate-pulse" />}
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Tag>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-neutral-500">
                        {!isCancelled && (
                          <span className="flex items-center gap-1"><Calendar size={10}/>{fmtDateTimeLC(lc.scheduled_at)}</span>
                        )}
                        {lc.duration_mins > 0 && (
                          <span className="flex items-center gap-1"><Clock size={10}/>{lc.duration_mins} min</span>
                        )}
                      </div>
                      <div className="mt-auto flex items-center gap-2 flex-wrap pt-1">
                        {isScheduled && (
                          <>
                            <span className="text-xs text-neutral-500">Start from your Zoom app</span>
                            <Btn size="sm" variant="ghost" onClick={() => handleCancelLive(lc)}>Cancel</Btn>
                          </>
                        )}
                        {isLive && (
                          <>
                            <Btn size="sm" variant="primary" onClick={() => handleWatchLive(lc)} disabled={joiningLiveId === lc.id}>
                              {joiningLiveId === lc.id ? <><Loader2 size={13} className="animate-spin"/> Opening…</> : 'Watch live'}
                            </Btn>
                            <Btn size="sm" variant="ghost" icon={Users} onClick={() => setAttendanceSheetId(lc.id)}>
                              {lc.attended_count ?? 0}/{lc.total_registered ?? 0}
                            </Btn>
                            <Btn size="sm" variant="dangerSolid" onClick={() => handleEndLive(lc)}>End</Btn>
                          </>
                        )}
                        {isEnded && (
                          <Btn size="sm" variant="ghost" icon={Users} onClick={() => setAttendanceSheetId(lc.id)}>
                            {lc.attended_count ?? 0}/{lc.total_registered ?? 0} attended
                          </Btn>
                        )}
                        {isCancelled && <span className="text-xs text-neutral-400">Cancelled</span>}
                        {!isLive && (
                          <button onClick={() => handleDeleteLive(lc)}
                            className="ml-auto flex items-center gap-1 text-xs font-medium text-red-600 hover:bg-red-50 px-2 py-1.5 rounded-md">
                            <Trash2 size={13}/> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ══ Notes tab ══ */}
        {tab === 'notes' && (
          notes.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
              <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mx-auto mb-4">
                <StickyNote size={28} className="text-neutral-400" />
              </div>
              <h3 className="font-semibold text-neutral-800 mb-1">No notes yet</h3>
              <p className="text-sm text-neutral-500 mb-6">Add notes, handouts, or PDF materials for students.</p>
              <Btn variant="primary" icon={Plus} onClick={() => { setEditNote(null); setShowNoteForm(true); }}>New note</Btn>
            </div>
          ) : (
            <div className="space-y-3">
              {[...notes].sort((a,b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0)).map(note => (
                <div key={note.id} className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${note.is_pinned ? 'bg-amber-50 border-amber-200' : 'bg-white border-neutral-100'}`}>
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {note.is_pinned && <Pin size={12} className="text-amber-500 flex-shrink-0"/>}
                        <h3 className="text-sm font-semibold text-neutral-900 truncate">{note.title}</h3>
                      </div>
                      {note.body && <p className="text-sm text-neutral-600 line-clamp-3 whitespace-pre-wrap">{note.body}</p>}
                      {note.file_url && (
                        <a href={note.file_url} target="_blank" rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-800">
                          <FileText size={13}/> View attachment
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => handleTogglePin(note)} title={note.is_pinned ? 'Unpin' : 'Pin'}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-amber-500 hover:bg-amber-50 transition-colors">
                        {note.is_pinned ? <PinOff size={14}/> : <Pin size={14}/>}
                      </button>
                      <button onClick={() => { setEditNote(note); setShowNoteForm(true); }}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors">
                        <Edit2 size={14}/>
                      </button>
                      <button onClick={() => handleDeleteNote(note.id)}
                        className="p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                        <Trash2 size={14}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ══ Attendance tab ══ */}
        {tab === 'attendance' && (
          <AttendanceGrid subjectId={classId} onNavigate={(id) => navigate(`/teacher/students/${id}`)} />
        )}
      </div>

      {/* ── Modals ── */}
      <VideoAddModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        classId={classId}
        onAdded={() => fetchVideosData()}
      />
      <NewTestModal
        open={newTestOpen}
        onClose={() => { setNewTestOpen(false); setEditTestId(null); }}
        defaultClassId={classId}
        onSuccess={() => fetchTestsData()}
        editTestId={editTestId}
      />
      <EditVideoModal
        open={!!editVideo}
        onClose={() => setEditVideo(null)}
        video={editVideo}
        onSuccess={() => fetchVideosData()}
      />
      <TestResultsSheet
        open={!!selectedTest}
        onClose={() => setSelectedTest(null)}
        test={selectedTest}
        onSuccess={(updated) => {
          if (updated) setTests(prev => prev.map(t => t.id === updated.id ? updated : t));
          setSelectedTest(null);
        }}
        onDelete={(deletedId) => {
          setTests(prev => prev.filter(t => t.id !== deletedId));
          setSelectedTest(null);
        }}
      />
      <VideoViewersModal
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
      />
      <NewAssignmentModal
        open={newAssignOpen}
        onClose={() => { setNewAssignOpen(false); setEditAssignment(null); }}
        classId={classId}
        editAssignment={editAssignment}
        onSuccess={() => fetchAssignmentsData()}
      />
      <AssignmentSubmissionsSheet
        open={!!viewSubmissionsFor}
        onClose={() => setViewSubmissionsFor(null)}
        assignment={viewSubmissionsFor}
        totalStudents={students.length}
        onSubmissionDeleted={() => {
          // Update submitted_count on the card after teacher deletes a submission
          setAssignments(prev => prev.map(a =>
            a.id === viewSubmissionsFor?.id
              ? { ...a, submitted_count: Math.max(0, (a.submitted_count || 1) - 1) }
              : a
          ));
        }}
      />

      <ScheduleSubjectLiveModal
        open={showScheduleLive}
        onClose={() => setShowScheduleLive(false)}
        classId={classId}
        subjectName={subject?.name}
        onScheduled={fetchLiveClasses}
      />
      <NoteFormModal
        open={showNoteForm}
        onClose={() => { setShowNoteForm(false); setEditNote(null); }}
        classId={classId}
        note={editNote}
        onSaved={fetchNotes}
      />
      <LiveClassAttendanceSheet
        liveClassId={attendanceSheetId}
        onClose={() => setAttendanceSheetId(null)}
      />

      {/* Delete confirmation */}
      <Modal
        open={!!confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
        title="Delete video?"
        size="sm"
      >
        {(() => {
          const v = videos.find(v => v.id === confirmDeleteId);
          return (
            <div className="space-y-4">
              <p className="text-sm text-neutral-600">
                Are you sure you want to delete{' '}
                <span className="font-semibold text-neutral-900">"{v?.title}"</span>?
                This cannot be undone.
              </p>
              <div className="flex gap-2 justify-end">
                <Btn variant="ghost" onClick={() => setConfirmDeleteId(null)}>Cancel</Btn>
                <Btn
                  variant="dangerSolid"
                  icon={Trash2}
                  onClick={doDeleteVideo}
                >
                  Delete
                </Btn>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
