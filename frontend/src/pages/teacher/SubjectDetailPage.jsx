import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Play, Upload, Plus, MoreVertical, Video, FileQuestion, Shield, Loader2, ListChecks } from 'lucide-react';
import { Btn, Tag, Avatar, Modal, Input, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi } from '../../lib/api';
import AttendanceGrid from '../../components/teacher/AttendanceGrid';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import NewTestModal from '../../components/teacher/NewTestModal';
import { useAppCache } from '../../store';

function UploadVideoModal({ open, onClose, classId, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allowDownload, setAllowDownload] = useState(true);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setTitle(''); setDescription(''); setAllowDownload(true);
      setFile(null); setUploading(false); setProgress(0); setError('');
    }
  }, [open]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const handleSubmit = async () => {
    if (!file) { setError('Please select a video file.'); return; }
    if (!title.trim()) { setError('Title is required.'); return; }

    setUploading(true);
    setError('');
    setProgress(0);

    const token = localStorage.getItem('tutoria_token');
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8001/api';

    const formData = new FormData();
    formData.append('file', file);
    formData.append('class_id', classId);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('allow_download', allowDownload ? 'true' : 'false');

    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBase}/videos/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 90));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            setProgress(100);
            resolve(JSON.parse(xhr.responseText));
          } else {
            try {
              reject(new Error(JSON.parse(xhr.responseText).detail || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error('Network error. Check your connection.'));
        xhr.send(formData);
      });
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'Upload failed. Try again.');
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const fileSizeMB = file ? (file.size / 1024 / 1024).toFixed(1) : null;

  return (
    <Modal open={open} onClose={uploading ? undefined : onClose} title="Upload Video" size="md">
      <div className="space-y-4">
        {error && <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-2.5 rounded-lg">{error}</div>}

        {/* File picker */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className={`w-full border-2 border-dashed rounded-xl p-6 text-center transition-colors disabled:opacity-50 ${
              file ? 'border-neutral-400 bg-white/40' : 'border-white/60 bg-white/20 hover:bg-white/40 hover:border-neutral-300'
            }`}
          >
            {file ? (
              <div>
                <Video size={24} className="mx-auto mb-1 text-neutral-700" />
                <p className="text-sm font-medium text-neutral-800 truncate">{file.name}</p>
                <p className="text-xs text-neutral-500">{fileSizeMB} MB · {file.type}</p>
              </div>
            ) : (
              <div>
                <Upload size={24} className="mx-auto mb-1 text-neutral-400" />
                <p className="text-sm font-medium text-neutral-600">Tap to pick a video</p>
                <p className="text-xs text-neutral-400 mt-0.5">MP4, MOV, AVI · any size</p>
              </div>
            )}
          </button>
        </div>

        <Input
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Introduction to Algebra"
          disabled={uploading}
        />

        <div>
          <label className="text-xs font-medium text-neutral-600 mb-1.5 block">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={uploading}
            className="w-full px-3 py-2 rounded-md bg-white/50 border border-white/60 focus:border-neutral-400 outline-none text-sm resize-none disabled:opacity-50"
            placeholder="What will students learn in this video?"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allowDownload}
            onChange={(e) => setAllowDownload(e.target.checked)}
            disabled={uploading}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm text-neutral-700">Allow students to save for offline viewing</span>
        </label>

        {/* Upload progress */}
        {uploading && (
          <div>
            <div className="flex items-center justify-between text-xs text-neutral-600 mb-1">
              <span className="flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Uploading…</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-white/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-neutral-400 mt-1">Don't close this window while uploading.</p>
          </div>
        )}

        <Btn
          onClick={handleSubmit}
          disabled={!file || !title.trim() || uploading}
          className="w-full"
          variant="primary"
        >
          {uploading ? 'Uploading…' : 'Upload Video'}
        </Btn>
      </div>
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
  const [selectedTest, setSelectedTest]   = useState(null);
  const [videoMenuId, setVideoMenuId] = useState(null);

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
    } catch(err) { console.error(err); }
  };

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
            {tab === 'videos' && <Btn variant="primary" size="sm" icon={Upload} onClick={() => setUploadOpen(true)}>Upload</Btn>}
            {tab === 'tests' && <Btn variant="primary" size="sm" icon={Plus} onClick={() => setNewTestOpen(true)}>New test</Btn>}
          </div>
        </div>

        {tab === 'videos' && (
          videos.length === 0 ? (
            <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
              <Video size={32} className="mx-auto mb-3 text-neutral-400" />
              <h3 className="font-medium mb-1">No videos yet</h3>
              <p className="text-sm text-neutral-600 mb-5">Upload your first video.</p>
              <Btn variant="primary" icon={Upload} onClick={() => setUploadOpen(true)}>Upload video</Btn>
            </div>
          ) : (
            <div className="glass-panel rounded-xl overflow-hidden">
              {videos.map((v, i) => (
                <div key={v.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-white/50 transition-colors ${i < videos.length - 1 ? 'border-b border-white/40' : ''}`}>
                  <div className="w-12 h-12 rounded-md bg-white/50 border border-white/60 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <Play size={16} className="text-neutral-600" fill="currentColor" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.title}</p>
                    <p className="text-xs text-neutral-500">
                      {v.duration_secs ? `${Math.floor(v.duration_secs / 60)}:${(v.duration_secs % 60).toString().padStart(2, '0')}` : 'No duration'}
                    </p>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setVideoMenuId(videoMenuId === v.id ? null : v.id); }}
                      className="p-1.5 text-neutral-400 hover:text-neutral-900 rounded hover:bg-white/60"
                    >
                      <MoreVertical size={14} />
                    </button>
                    {videoMenuId === v.id && (
                      <div
                        className="absolute right-0 top-full mt-1 w-28 bg-white rounded-lg shadow-lg border border-neutral-200 z-50 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => handleDeleteVideo(v.id)}
                          className="w-full text-left px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {tab === 'tests' && (
          tests.length === 0 ? (
            <div className="text-center py-16 glass-panel border-dashed border-white/60 rounded-xl">
              <FileQuestion size={32} className="mx-auto mb-3 text-neutral-400" />
              <h3 className="font-medium mb-1">No tests yet</h3>
              <Btn variant="primary" icon={Plus} onClick={() => setNewTestOpen(true)}>Create test</Btn>
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
                      <Btn size="sm" variant="ghost" icon={ListChecks} onClick={() => { setSelectedTest(t); }}>
                        Results
                      </Btn>
                      <Tag color={t.status === 'completed' ? 'green' : t.status === 'scheduled' ? 'amber' : 'gray'}>
                        {t.status}
                      </Tag>
                    </div>
                  </div>
                  {t.scheduled_for && (
                    <div className="text-xs text-neutral-500 pt-2 border-t border-white/40 mt-2">
                      Scheduled: {new Date(t.scheduled_for).toLocaleString()}
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

      <UploadVideoModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        classId={classId}
        onSuccess={() => fetchVideosData()}
      />
      <NewTestModal
        open={newTestOpen}
        onClose={() => setNewTestOpen(false)}
        defaultClassId={classId}
        onSuccess={() => fetchTestsData()}
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
    </div>
  );
}