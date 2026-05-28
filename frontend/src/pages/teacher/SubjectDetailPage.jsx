import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Plus, Upload, MoreVertical, Video, FileQuestion, Shield, Loader2, ListChecks, Edit2, Eye, CheckCircle2, Clock } from 'lucide-react';
import { Btn, Tag, Avatar, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi, videoApi } from '../../lib/api';
import AttendanceGrid from '../../components/teacher/AttendanceGrid';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import NewTestModal from '../../components/teacher/NewTestModal';
import { EditVideoModal } from '../../components/teacher/Modals';
import { useAppCache } from '../../store';

function VideoAddModal({ open, onClose, classId, onAdded }) {
  const [youtubeUrl, setYoutubeUrl]         = useState('');
  const [ytVideoId, setYtVideoId]           = useState(null);
  const [ytPreviewTitle, setYtPreviewTitle] = useState('');
  const [ytPreviewLoading, setYtPreviewLoading] = useState(false);
  const [ytPreviewError, setYtPreviewError] = useState(null);
  const [ytTitle, setYtTitle]               = useState('');
  const [ytDescription, setYtDescription]   = useState('');
  const [ytAdding, setYtAdding]             = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setYoutubeUrl(''); setYtVideoId(null); setYtPreviewTitle('');
      setYtPreviewLoading(false); setYtPreviewError(null);
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

  async function fetchYtPreview(url) {
    const id = extractYouTubeId(url);
    if (!id) {
      setYtPreviewError('Invalid YouTube URL. Use youtube.com/watch?v=... or youtu.be/...');
      setYtVideoId(null);
      return;
    }
    setYtVideoId(id);
    setYtPreviewLoading(true);
    setYtPreviewError(null);
    try {
      const res = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
      );
      if (!res.ok) throw new Error('inaccessible');
      const data = await res.json();
      setYtPreviewTitle(data.title || '');
      setYtTitle(data.title || '');
    } catch {
      setYtPreviewError('Could not load video. Make sure it is set to Unlisted (not Private) on YouTube.');
      setYtVideoId(null);
    } finally {
      setYtPreviewLoading(false);
    }
  }

  function onYoutubeUrlChange(e) {
    const url = e.target.value;
    setYoutubeUrl(url);
    setYtVideoId(null);
    setYtPreviewError(null);
    setYtPreviewTitle('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (url.trim()) {
      debounceRef.current = setTimeout(() => fetchYtPreview(url.trim()), 600);
    }
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
      setYtPreviewError(err?.message || 'Failed to add video. Please try again.');
    } finally {
      setYtAdding(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add video" size="md">
      <div className="space-y-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 leading-relaxed">
          <strong>Important:</strong> Set your YouTube video to <strong>Unlisted</strong> — not Private.
          Unlisted videos are hidden from YouTube search. Students watch inside this app and never see the URL.
        </div>

        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-1">YouTube video URL</label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={onYoutubeUrlChange}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20 focus:border-neutral-400"
          />
        </div>

        {ytPreviewLoading && (
          <div className="flex items-center gap-2 text-sm text-neutral-400">
            <div className="w-4 h-4 border-2 border-neutral-200 border-t-neutral-500 rounded-full animate-spin" />
            Checking video...
          </div>
        )}

        {ytPreviewError && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            {ytPreviewError}
          </p>
        )}

        {ytVideoId && !ytPreviewError && !ytPreviewLoading && (
          <div className="flex gap-3 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
            <img
              src={`https://img.youtube.com/vi/${ytVideoId}/mqdefault.jpg`}
              alt="preview"
              className="w-28 flex-shrink-0 rounded-md object-cover"
              style={{ aspectRatio: '16/9' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-800 truncate">{ytPreviewTitle}</p>
              <span className="inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                ✓ Unlisted — ready to add
              </span>
            </div>
          </div>
        )}

        {ytVideoId && !ytPreviewError && (
          <>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Title</label>
              <input
                type="text"
                value={ytTitle}
                onChange={e => setYtTitle(e.target.value)}
                placeholder="Video title"
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-500 mb-1">Description (optional)</label>
              <textarea
                value={ytDescription}
                onChange={e => setYtDescription(e.target.value)}
                placeholder="What this video covers..."
                rows={2}
                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-neutral-900/20"
              />
            </div>
            <Btn
              onClick={handleAdd}
              disabled={!ytVideoId || !ytTitle.trim() || ytAdding}
              className="w-full"
            >
              {ytAdding ? 'Adding...' : 'Add video'}
            </Btn>
          </>
        )}
      </div>
    </Modal>
  );
}

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

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <Modal open={!!video} onClose={onClose} title={video?.title || 'Video viewers'} size="md">
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="w-8 h-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-2.5 w-20" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Summary */}
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Eye size={14} />
            <span><strong className="text-neutral-900">{watched.length}</strong> of <strong className="text-neutral-900">{viewers.length}</strong> students watched</span>
          </div>

          {/* Watched */}
          {watched.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Watched</p>
              <div className="space-y-2">
                {watched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-1">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-neutral-500">@{s.username}{s.last_watched_at ? ` · ${formatTime(s.last_watched_at)}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {s.completed && (
                        <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          <CheckCircle2 size={10} /> Completed
                        </span>
                      )}
                      {!s.completed && (
                        <span className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                          <Clock size={10} /> In progress
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Not yet */}
          {notWatched.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Not yet</p>
              <div className="space-y-2">
                {notWatched.map(s => (
                  <div key={s.id} className="flex items-center gap-3 py-1 opacity-60">
                    <Avatar name={s.name} src={s.avatar_url} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-neutral-500">@{s.username}</p>
                    </div>
                    <span className="text-xs text-neutral-500 bg-neutral-100 border border-neutral-200 rounded-full px-2 py-0.5 flex-shrink-0">
                      Not watched
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {viewers.length === 0 && (
            <p className="text-sm text-neutral-500 text-center py-4">No students enrolled in this standard yet.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function SubjectDetailPage() {
  const { standardId, classId } = useParams();
  const navigate = useNavigate();

  // Serve standard, subject, students from cache (instant from localStorage)
  const cache = useAppCache();
  const cachedStandard = cache.standards.find(s => String(s.id) === String(standardId));
  const cachedSubject  = cache.subjects.find(s => String(s.id) === String(classId));
  const cachedStudents = cache.getStudentsFor(standardId);

  const [standard, setStandard] = useState(cachedStandard || null);
  const [subject, setSubject]   = useState(cachedSubject  || null);
  const [students, setStudents] = useState(cachedStudents);
  const [videos, setVideos]     = useState([]);
  const [tests, setTests]       = useState([]);
  const [lowAttendanceCount, setLowAttendanceCount] = useState(0);
  // Only show full skeleton if NOTHING is in cache
  const [loading, setLoading]   = useState(!cachedSubject);
  const [tab, setTab]           = useState('videos');
  const [uploadOpen, setUploadOpen]   = useState(false);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [editTestId, setEditTestId]   = useState(null);
  const [selectedTest, setSelectedTest]   = useState(null);
  const [videoMenuId, setVideoMenuId] = useState(null);
  const [menuPos, setMenuPos]         = useState({ top: 0, right: 0 });
  const [editVideo, setEditVideo]     = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [thumbnailUrls, setThumbnailUrls] = useState({});

  useEffect(() => {
    if (!videoMenuId) return;
    const close = () => setVideoMenuId(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [videoMenuId]);

  const handleDeleteVideo = async (videoId) => {
    setVideos(prev => prev.filter(v => v.id !== videoId));
    setVideoMenuId(null);
    try {
      await apiClient(`/videos/${videoId}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Delete video failed:', err);
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
      loadTeacherThumbnails(data || []);
    } catch(err) { console.error(err); }
  };

  async function loadTeacherThumbnails(videosList) {
    const thumbMap = {};
    await Promise.all(videosList.map(async (v) => {
      try {
        const res = await videoApi.getThumbnail(v.id);
        if (res?.thumbnail_url) thumbMap[v.id] = res.thumbnail_url;
      } catch {}
    }));
    setThumbnailUrls(thumbMap);
  }

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch only videos + tests in parallel (standard/subject/students from cache)
        const [videosData, testsData, lowAttData] = await Promise.all([
          apiClient(`/videos?class_id=${classId}`),
          apiClient(`/tests?class_id=${classId}`),
          attendanceApi.getLowAttendance(standardId).catch(() => ({ flagged_count: 0 }))
        ]);
        setVideos(videosData || []);
        setTests(testsData  || []);
        setLowAttendanceCount(lowAttData?.flagged_count || lowAttData?.count || 0);
        // Also refresh cache data in background
        const [stdData, subjectsData, studentsData] = await Promise.all([
          apiClient(`/standards/${standardId}`).catch(() => null),
          apiClient(`/subjects?standard_id=${standardId}`),
          apiClient(`/students?standard_id=${standardId}`)
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
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate(`/teacher/subjects/${standardId}`)} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/40 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <span className="text-xl">{subject?.emoji || '📐'}</span>
          <div className="min-w-0 flex-1">
            <p className="hidden lg:block text-[11px] text-neutral-400 leading-none mb-0.5">Subjects / {standard?.name}</p>
            <h1 className="text-base font-semibold truncate">{subject?.name || 'Subject'}</h1>
            <p className="text-xs text-neutral-500 lg:hidden">{standard?.name}</p>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-1 mb-5">
          {[
            { id: 'videos', label: 'Videos', count: videos.length },
            { id: 'tests', label: 'Tests', count: tests.length },
            { id: 'students', label: 'Students', count: students.length },
            { id: 'attendance', label: 'Attendance', count: lowAttendanceCount, isAlert: lowAttendanceCount > 0 },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${tab === t.id ? 'bg-white/50 text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'}`}>
              {t.label} <span className={t.isAlert ? "text-red-500 font-medium" : "text-neutral-400"}>{t.count}</span>
            </button>
          ))}
          <div className="ml-auto">
            {tab === 'videos' && <Btn variant="primary" size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>Add video</Btn>}
            {tab === 'tests' && <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>New test</Btn>}
          </div>
        </div>

        {tab === 'videos' && (
          videos.length === 0 ? (
            <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
              <Video size={32} className="mx-auto mb-3 text-neutral-400" />
              <h3 className="font-medium mb-1">No videos yet</h3>
              <p className="text-sm text-neutral-600 mb-5">Upload your first video.</p>
              <Btn variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>Add video</Btn>
            </div>
          ) : (
            <>
              <div className="glass-panel rounded-xl overflow-hidden">
                {videos.map((v, i) => (
                  <div
                    key={v.id}
                    className={`flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors cursor-pointer ${i < videos.length - 1 ? 'border-b border-white/40' : ''}`}
                    onClick={() => setSelectedVideo(v)}
                  >
                    <div className="w-12 h-12 rounded-md bg-white/50 border border-white/60 flex items-center justify-center flex-shrink-0 shadow-sm overflow-hidden relative">
                      {thumbnailUrls[v.id] ? (
                        <img src={thumbnailUrls[v.id]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Play size={16} className="text-neutral-600" fill="currentColor" />
                      )}
                      {v.source_type === 'youtube' && (
                        <span className="absolute top-0 right-0 text-[9px] font-bold px-1 py-0.5 bg-red-600 text-white rounded-bl-md leading-tight">YT</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.title}</p>
                      <p className="text-xs text-neutral-500 flex items-center gap-1.5 flex-wrap">
                        {v.duration_secs
                          ? `${Math.floor(v.duration_secs / 60)}:${(v.duration_secs % 60).toString().padStart(2, '0')}`
                          : 'No duration'}
                        {students.length > 0 && (
                          <>
                            <span className="text-neutral-300">·</span>
                            <span className="flex items-center gap-1 text-neutral-400">
                              <Eye size={10} />
                              {v.completed_count ?? 0}/{students.length} watched
                            </span>
                          </>
                        )}
                      </p>
                    </div>
                    {/* Stop propagation so three-dot click doesn't open viewers modal */}
                    <div onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (videoMenuId === v.id) { setVideoMenuId(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                          setVideoMenuId(v.id);
                        }}
                        className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded hover:bg-white/60"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Fixed-position dropdown — outside overflow:hidden so it's never clipped */}
              {videoMenuId && (
                <div
                  style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                  className="w-32 bg-white rounded-lg shadow-xl border border-neutral-200 py-1"
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    onClick={() => { setEditVideo(videos.find(v => v.id === videoMenuId) || null); setVideoMenuId(null); }}
                    className="w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => { handleDeleteVideo(videoMenuId); }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </>
          )
        )}

        {tab === 'tests' && (
          tests.length === 0 ? (
            <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
              <FileQuestion size={32} className="mx-auto mb-3 text-neutral-400" />
              <h3 className="font-medium mb-1">No tests yet</h3>
              <Btn variant="primary" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>Create test</Btn>
            </div>
          ) : (
            <div className="space-y-2">
              {tests.map((t) => (
                <div key={t.id}
                  className="glass-panel rounded-xl p-4 hover:bg-white/70 transition-colors">
                  <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-medium text-sm">{t.title}</h4>
                        {t.negative_marking && <Tag color="red">−{t.penalty}</Tag>}
                      </div>
                      <p className="text-xs text-neutral-500">{t.duration_mins} mins · {t.total_marks} marks</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Btn size="sm" variant="ghost" icon={Edit2} onClick={() => { setEditTestId(t.id); setNewTestOpen(true); }}>
                        Edit
                      </Btn>
                      <Btn size="sm" variant="ghost" icon={ListChecks} onClick={() => { setSelectedTest(t); }}>
                        Results
                      </Btn>
                      <Tag color={t.status === 'completed' ? 'green' : t.status === 'scheduled' ? 'amber' : 'gray'}>
                        {t.status}
                      </Tag>
                    </div>
                  </div>
                  {t.scheduled_for && (
                    <div className="text-xs text-amber-700 pt-2 border-t border-white/40 mt-2">
                      Publishes on {new Date(t.scheduled_for).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'students' && (
          <div>
            <div className="p-3 mb-4 rounded-xl bg-blue-50/80 backdrop-blur-sm border border-blue-200 shadow-sm flex items-start gap-2 text-sm">
              <Shield size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 text-blue-900">
                <p className="font-medium">Enrollment is at standard level</p>
                <p className="text-xs text-blue-700">Everyone in {standard?.name} is in this subject.</p>
              </div>
            </div>
            <div className="glass-panel rounded-xl overflow-hidden">
              {students.map((s, i) => (
                <button key={s.id} onClick={() => navigate(`/teacher/students/${s.id}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors text-left ${i < students.length - 1 ? 'border-b border-white/40' : ''}`}>
                  <Avatar name={s.name} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500">@{s.username}</p>
                  </div>
                  <span className="text-xs text-neutral-500 flex-shrink-0">{s.avg_score || 0}%</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === 'attendance' && (
          <AttendanceGrid subjectId={classId} onNavigate={(id) => navigate(`/teacher/students/${id}`)} />
        )}
      </div>

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
    </div>
  );
}