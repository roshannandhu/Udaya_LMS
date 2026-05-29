import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Plus, Upload, MoreVertical, Video, FileQuestion,
  Shield, Loader2, ListChecks, Edit2, Eye, CheckCircle2, Clock,
  Trash2, Users,
} from 'lucide-react';
import { Btn, Tag, Avatar, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi, videoApi } from '../../lib/api';
import AttendanceGrid from '../../components/teacher/AttendanceGrid';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import NewTestModal from '../../components/teacher/NewTestModal';
import { EditVideoModal } from '../../components/teacher/Modals';
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

  const fetchVideosData = async () => {
    try {
      const data = await apiClient(`/videos?class_id=${classId}`);
      setVideos(data || []);
      loadThumbnails(data || []);
    } catch(err) { console.error(err); }
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
        const [videosData, testsData, lowAttData] = await Promise.all([
          apiClient(`/videos?class_id=${classId}`),
          apiClient(`/tests?class_id=${classId}`),
          attendanceApi.getLowAttendance(standardId).catch(() => ({ flagged_count: 0 })),
        ]);
        setVideos(videosData || []);
        setTests(testsData  || []);
        setLowAttendanceCount(lowAttData?.flagged_count || lowAttData?.count || 0);
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
    { id: 'videos',     label: 'Videos',     count: videos.length },
    { id: 'tests',      label: 'Tests',      count: tests.length },
    { id: 'students',   label: 'Students',   count: students.length },
    { id: 'attendance', label: 'Attendance', count: lowAttendanceCount, alert: lowAttendanceCount > 0 },
  ];

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
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
    <div className="pb-28">
      {/* ── Header ── */}
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button
            onClick={() => navigate(`/teacher/subjects/${standardId}`)}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/40 rounded-md"
          >
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{subject?.emoji || '📐'}</span>
          <div className="min-w-0 flex-1">
            <p className="hidden lg:block text-[11px] text-neutral-400 leading-none mb-0.5">
              Subjects / {standard?.name}
            </p>
            <h1 className="text-base font-semibold truncate">{subject?.name || 'Subject'}</h1>
            <p className="text-xs text-neutral-500 lg:hidden">{standard?.name}</p>
          </div>
          {/* Action button for current tab */}
          {tab === 'videos' && (
            <Btn variant="primary" size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>
              Add video
            </Btn>
          )}
          {tab === 'tests' && (
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>
              New test
            </Btn>
          )}
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* ── Pill tabs ── */}
        <div className="flex items-center gap-1 p-1 bg-black/5 rounded-xl mb-6 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                tab === t.id
                  ? 'bg-white shadow-sm text-neutral-900'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span className={`text-xs rounded-full px-1.5 py-0.5 leading-none ${
                  tab === t.id
                    ? t.alert ? 'bg-red-500 text-white' : 'bg-neutral-900 text-white'
                    : t.alert ? 'text-red-500' : 'text-neutral-400'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ Videos tab ══ */}
        {tab === 'videos' && (
          videos.length === 0 ? (
            <div className="text-center py-20 glass-panel border-dashed border-white/60 rounded-2xl">
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
            <div className="text-center py-20 glass-panel border-dashed border-white/60 rounded-2xl">
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
