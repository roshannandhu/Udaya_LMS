import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Plus, Upload, Video, FileQuestion, Shield, Edit2,
  Trash2, Users, ClipboardList, Radio, StickyNote, ListChecks,
} from 'lucide-react';
import { Btn, Avatar, Modal, Skeleton } from '../../components/ui';
import { apiClient, attendanceApi, assignmentApi, liveClassApi, notesApi } from '../../lib/api';
import { useAuthStore } from '../../lib/auth';
import { useAppCache } from '../../store';
import SubjectIcon from '../../components/shared/SubjectIcon';
import ZoomMeetingView, { preloadZoomSDK } from '../../components/ZoomMeetingView';
import AttendanceGrid from '../../components/teacher/AttendanceGrid';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import NewTestModal from '../../components/teacher/NewTestModal';
import { EditVideoModal } from '../../components/teacher/Modals';
import NewAssignmentModal from '../../components/teacher/NewAssignmentModal';
import AssignmentSubmissionsSheet from '../../components/teacher/AssignmentSubmissionsSheet';
import LiveClassAttendanceSheet from '../../components/teacher/LiveClassAttendanceSheet';
import PerformancePanel from '../../components/teacher/PerformancePanel';
import { pastelTokens } from '../../components/cards/pastel';
import { useTheme } from '../../lib/theme';
import VideoAddModal from '../../components/teacher/subject/VideoAddModal';
import VideoViewersModal from '../../components/teacher/subject/VideoViewersModal';
import NoteFormModal from '../../components/teacher/subject/NoteFormModal';
import ScheduleSubjectLiveModal from '../../components/teacher/subject/ScheduleSubjectLiveModal';
import VideosSection from '../../components/teacher/subject/VideosSection';
import TestsSection from '../../components/teacher/subject/TestsSection';
import AssignmentsSection from '../../components/teacher/subject/AssignmentsSection';
import LiveSection from '../../components/teacher/subject/LiveSection';
import NotesSection from '../../components/teacher/subject/NotesSection';
import SecureFileViewer from '../../components/shared/SecureFileViewer';

const VALID_TABS = ['learn', 'assess', 'live', 'people', 'performance'];
// Old tab ids (bookmarks / older links) map onto the merged tabs.
const LEGACY_TABS = {
  videos: 'learn', notes: 'learn',
  tests: 'assess', assignments: 'assess',
  students: 'people', attendance: 'people',
};

function SectionHead({ icon: Icon, title, count, action, actionLabel }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <div className="flex items-center gap-2 min-w-0">
        <Icon size={15} className="text-neutral-400 shrink-0" />
        <h3 className="text-sm font-bold text-neutral-800 truncate">{title}</h3>
        {count > 0 && (
          <span className="text-[11px] font-bold text-neutral-400 tabular-nums">({count})</span>
        )}
      </div>
      {action && (
        <button onClick={action}
          className="inline-flex items-center gap-1 text-xs font-semibold text-neutral-500 hover:text-neutral-900 px-2 py-1 rounded-md hover:bg-[#F4F2EF] transition-colors shrink-0">
          <Plus size={13} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

export default function SubjectDetailPage() {
  const { standardId, classId } = useParams();
  const navigate = useNavigate();
  const dark = useTheme(s => s.dark);
  const [searchParams, setSearchParams] = useSearchParams();
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

  const rawTab = searchParams.get('tab');
  const initialTab = VALID_TABS.includes(rawTab) ? rawTab : (LEGACY_TABS[rawTab] || 'learn');
  const [tab, setTabState]      = useState(initialTab);
  const setTab = (t) => {
    setTabState(t);
    setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', t); return p; }, { replace: true });
  };

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
  const [viewerNote, setViewerNote]             = useState(null);
  const deepLinkedTestRef = useRef(false);

  // Deep link from the dashboard copy-suspects card: ?test=<id> opens the
  // results sheet for that test once tests have loaded (once per mount).
  useEffect(() => {
    const testId = searchParams.get('test');
    if (!testId || deepLinkedTestRef.current || tests.length === 0) return;
    const t = tests.find(t => t.id === testId);
    if (t) {
      deepLinkedTestRef.current = true;
      setSelectedTest(t);
      setSearchParams(prev => { const p = new URLSearchParams(prev); p.delete('test'); return p; }, { replace: true });
    }
  }, [tests, searchParams, setSearchParams]);

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

  // Thumbnails ship with the /videos payload — read them directly instead of
  // firing one getThumbnail() request per video.
  function loadThumbnails(list) {
    const map = {};
    (list || []).forEach((v) => { if (v.thumbnail_url) map[v.id] = v.thumbnail_url; });
    setThumbnailUrls(map);
  }

  useEffect(() => {
    const handleUpdate = (e) => {
      const { id, status } = e.detail;
      setLiveClasses(prev => prev.map(lc => lc.id === id ? { ...lc, status } : lc));
    };
    window.addEventListener('live-class-update', handleUpdate);
    return () => window.removeEventListener('live-class-update', handleUpdate);
  }, []);

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

  const liveActive = liveClasses.filter(l => l.status === 'live' || l.status === 'scheduled').length;
  const TABS = [
    { id: 'learn',       label: 'Learn',       count: videos.length + notes.length },
    { id: 'assess',      label: 'Assess',      count: tests.length + assignments.length },
    { id: 'live',        label: 'Live',        count: liveActive },
    { id: 'people',      label: 'People',      count: students.length, alert: lowAttendanceCount > 0 },
    { id: 'performance', label: 'Performance', count: 0 },
  ];

  const QUICK_ADD = [
    { label: 'Video', icon: Upload,        pastel: 'sky',      onClick: () => setUploadOpen(true) },
    { label: 'Test',  icon: FileQuestion,  pastel: 'mint',     onClick: () => { setEditTestId(null); setNewTestOpen(true); } },
    { label: 'Task',  icon: ClipboardList, pastel: 'cream',    onClick: () => { setEditAssignment(null); setNewAssignOpen(true); } },
    { label: 'Live',  icon: Radio,         pastel: 'peach',    onClick: () => setShowScheduleLive(true) },
    { label: 'Note',  icon: StickyNote,    pastel: 'lavender', onClick: () => { setEditNote(null); setShowNoteForm(true); } },
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
        viewerRole="teacher"
        onLeave={() => { setActiveJoin(null); fetchLiveClasses(); }}
      />
    );
  }

  if (loading) {
    return (
      <div>
        <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
          <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-6xl mx-auto">
            <Skeleton className="w-8 h-8" />
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
        <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="aspect-video rounded-2xl" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-28">
      {/* Sticky top bar — same pattern as StandardDetailPage */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-6xl mx-auto">
          <button onClick={() => navigate(`/teacher/standards/${standardId}`)}
            className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-[#F4F2EF] rounded-md">
            <ArrowLeft size={16} />
          </button>
          <SubjectIcon value={subject?.emoji} size={22} className="text-neutral-700 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-neutral-400 leading-none mb-0.5 truncate">{standard?.name || 'Standard'}</p>
            <h1 className="text-lg md:text-xl font-semibold truncate">{subject?.name || 'Subject'}</h1>
          </div>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-6xl mx-auto">
        {/* Quick add — one compact row on phone, lives in the right rail on laptop */}
        <div className="flex gap-2 mb-5 lg:hidden">
          {QUICK_ADD.map(q => {
            const p = pastelTokens(q.pastel, dark);
            return (
              <button key={q.label} onClick={q.onClick}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl ${p.bg} border border-black/5 active:scale-95 transition-transform`}>
                <q.icon size={16} style={{ color: p.fgHex }} />
                <span className="text-[10px] font-bold" style={{ color: p.fgHex }}>{q.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 min-w-0">

            {/* Tabs — wrap instead of scroll */}
            <div className="flex flex-wrap items-center gap-1 mb-5 p-1 bg-black/5 rounded-pill w-fit">
              {TABS.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`relative px-4 py-1.5 text-sm rounded-pill transition-colors flex items-center gap-1.5 ${
                    tab === t.id ? 'bg-white shadow-sm text-neutral-900 font-semibold' : 'text-neutral-500 hover:text-neutral-900'
                  }`}>
                  {t.label}
                  {t.count > 0 && <span className="text-[11px] font-bold text-neutral-400 tabular-nums">{t.count}</span>}
                  {t.alert && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                </button>
              ))}
            </div>

            {/* ══ Learn: videos + notes ══ */}
            {tab === 'learn' && (
              <div className="space-y-8">
                <div>
                  <SectionHead icon={Video} title="Videos" count={videos.length}
                    action={() => setUploadOpen(true)} actionLabel="Add video" />
                  <VideosSection
                    videos={videos}
                    thumbnailUrls={thumbnailUrls}
                    studentsCount={students.length}
                    onAdd={() => setUploadOpen(true)}
                    onView={setSelectedVideo}
                    onMenu={(videoId, e) => {
                      if (videoMenuId === videoId) { setVideoMenuId(null); return; }
                      const rect = e.currentTarget.getBoundingClientRect();
                      setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                      setVideoMenuId(videoId);
                    }}
                  />
                </div>
                <div>
                  <SectionHead icon={StickyNote} title="Notes & materials" count={notes.length}
                    action={() => { setEditNote(null); setShowNoteForm(true); }} actionLabel="New note" />
                  <NotesSection
                    notes={notes}
                    onCreate={() => { setEditNote(null); setShowNoteForm(true); }}
                    onEdit={(n) => { setEditNote(n); setShowNoteForm(true); }}
                    onDelete={handleDeleteNote}
                    onTogglePin={handleTogglePin}
                    onView={(n) => setViewerNote(n)}
                  />
                </div>
              </div>
            )}

            {/* ══ Assess: tests + assignments ══ */}
            {tab === 'assess' && (
              <div className="space-y-8">
                <div>
                  <SectionHead icon={FileQuestion} title="Tests" count={tests.length}
                    action={() => { setEditTestId(null); setNewTestOpen(true); }} actionLabel="Create test" />
                  <TestsSection
                    tests={tests}
                    onCreate={() => { setEditTestId(null); setNewTestOpen(true); }}
                    onEdit={(t) => { setEditTestId(t.id); setNewTestOpen(true); }}
                    onResults={setSelectedTest}
                  />
                </div>
                <div>
                  <SectionHead icon={ClipboardList} title="Assignments" count={assignments.length}
                    action={() => { setEditAssignment(null); setNewAssignOpen(true); }} actionLabel="New assignment" />
                  <AssignmentsSection
                    assignments={assignments}
                    onCreate={() => { setEditAssignment(null); setNewAssignOpen(true); }}
                    onEdit={(a) => { setEditAssignment(a); setNewAssignOpen(true); }}
                    onViewSubmissions={setViewSubmissionsFor}
                    onDelete={handleDeleteAssignment}
                  />
                </div>
              </div>
            )}

            {/* ══ Live ══ */}
            {tab === 'live' && (
              <div>
                <SectionHead icon={Radio} title="Live classes" count={liveClasses.length}
                  action={() => setShowScheduleLive(true)} actionLabel="Schedule" />
                <LiveSection
                  liveClasses={liveClasses}
                  joiningLiveId={joiningLiveId}
                  onSchedule={() => setShowScheduleLive(true)}
                  onWatch={handleWatchLive}
                  onEnd={handleEndLive}
                  onCancel={handleCancelLive}
                  onDelete={handleDeleteLive}
                  onAttendance={setAttendanceSheetId}
                />
              </div>
            )}

            {/* ══ People: roster + attendance ══ */}
            {tab === 'people' && (
              <div className="space-y-8">
                <div>
                  <SectionHead icon={Users} title="Students" count={students.length} />
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
                            <p className="text-xs text-neutral-400 truncate">@{s.username}</p>
                          </div>
                          <span className="text-xs font-medium text-neutral-500 flex-shrink-0">
                            {s.avg_score || 0}%
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <SectionHead icon={ListChecks} title="Attendance" count={0} />
                  <AttendanceGrid subjectId={classId} onNavigate={(id) => navigate(`/teacher/students/${id}`)} />
                </div>
              </div>
            )}

            {/* ══ Performance ══ */}
            {tab === 'performance' && (
              <PerformancePanel standardId={standardId} classId={classId} />
            )}

            {/* Fixed-position video dropdown */}
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
          </div>

          {/* Right rail (laptop): quick add + overview */}
          <div className="hidden lg:block space-y-5 lg:sticky lg:top-16 lg:self-start">
            <div className="bg-white rounded-card p-5 border border-[#EFEDEA] shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Quick add</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_ADD.map((q, i) => {
                  const p = pastelTokens(q.pastel, dark);
                  return (
                    <button key={q.label} onClick={q.onClick}
                      className={`flex flex-col items-center justify-center gap-1.5 py-3.5 rounded-xl ${p.bg} border border-black/5 hover:-translate-y-0.5 transition-transform ${i === QUICK_ADD.length - 1 ? 'col-span-2' : ''}`}>
                      <q.icon size={18} style={{ color: p.fgHex }} />
                      <span className="text-xs font-bold" style={{ color: p.fgHex }}>{q.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-card p-5 border border-[#EFEDEA] shadow-soft">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mb-3">Overview</p>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="text-neutral-500">Students</span><span className="font-semibold tabular-nums">{students.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Videos</span><span className="font-semibold tabular-nums">{videos.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Tests</span><span className="font-semibold tabular-nums">{tests.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Assignments</span><span className="font-semibold tabular-nums">{assignments.length}</span></div>
                <div className="flex items-center justify-between"><span className="text-neutral-500">Notes</span><span className="font-semibold tabular-nums">{notes.length}</span></div>
                {lowAttendanceCount > 0 && (
                  <div className="flex items-center justify-between text-red-600"><span>Low attendance</span><span className="font-semibold tabular-nums">{lowAttendanceCount}</span></div>
                )}
              </div>
            </div>
          </div>
        </div>
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
      <SecureFileViewer
        open={!!viewerNote}
        onClose={() => setViewerNote(null)}
        endpoint={viewerNote ? `/notes/${viewerNote.id}/file` : null}
        title={viewerNote?.title || 'Note'}
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
