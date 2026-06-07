import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Users, BookOpen, Calendar, ChevronLeft, ChevronRight, CheckCircle2, Loader2, Save, Info
} from 'lucide-react';
import { Btn, Skeleton, Avatar } from '../../components/ui';
import { useAppCache } from '../../store';
import SubjectIcon from '../../components/shared/SubjectIcon';
import AttendanceGrid, { getMonday, fmt } from '../../components/teacher/AttendanceGrid';

/* ─── Main Attendance Page ──────────────────────────────────────── */
export default function AttendancePage() {
  const navigate = useNavigate();

  // Pull from global cache — instant if already prefetched
  const standards       = useAppCache(s => s.standards);
  const allSubjects     = useAppCache(s => s.subjects);
  const standardsReady  = useAppCache(s => s.standardsReady);
  const subjectsReady   = useAppCache(s => s.subjectsReady);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const refreshSubjects   = useAppCache(s => s.refreshSubjects);
  const loading = !standardsReady || !subjectsReady;

  const [activeStdId, setActiveStdId]           = useState(null);
  const [activeSubjectId, setActiveSubjectId]   = useState(null);
  const [error, setError]                       = useState('');

  // Background refresh
  useEffect(() => {
    refreshStandards();
    refreshSubjects();
  }, []);

  // Auto-select first standard + subject when cache arrives
  useEffect(() => {
    if (standards.length > 0 && !activeStdId) {
      const firstStd = standards[0];
      setActiveStdId(firstStd.id);
      const firstSub = allSubjects.find(s => String(s.standard_id) === String(firstStd.id));
      if (firstSub) setActiveSubjectId(firstSub.id);
    }
  }, [standards, allSubjects]);

  // BUG FIX: always coerce both sides to string
  const subjects = allSubjects.filter(s => String(s.standard_id) === String(activeStdId));

  const handleStdChange = (stdId) => {
    setActiveStdId(stdId);
    // BUG FIX: coerce comparison
    const firstSub = allSubjects.find(s => String(s.standard_id) === String(stdId));
    setActiveSubjectId(firstSub?.id || null);
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const activeSubject = subjects.find(s => s.id === activeSubjectId);

  return (
    <div className="min-h-screen pb-24">
      {/* Sticky header */}
      <div className="sticky top-0 z-30 bg-canvas border-b border-[#EFEDEA]">
        <div className="px-5 md:px-8 py-4 max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-pastel-sky flex items-center justify-center flex-shrink-0">
                <Calendar size={16} className="text-pastel-sky-fg" />
              </div>
              <div>
                <h1 className="text-lg md:text-xl font-semibold leading-tight">Attendance</h1>
                {activeSubject && (
                  <p className="text-xs text-neutral-500 leading-tight inline-flex items-center gap-1"><SubjectIcon value={activeSubject.emoji} size={13} />{activeSubject.name}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-neutral-400 hidden sm:block">{today}</p>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-8 py-5 max-w-5xl mx-auto">
        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl p-3">
            <AlertTriangle size={16} className="flex-shrink-0" /> {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            <div className="flex gap-2">{[1,2,3].map(i => <Skeleton key={i} className="h-8 w-24 rounded-full" />)}</div>
            <div className="flex gap-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-11 w-28 rounded-xl" />)}</div>
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : standards.length === 0 ? (
          <div className="text-center py-20 glass-panel border-dashed border-[#D8D6D2] rounded-2xl">
            <BookOpen size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-semibold text-neutral-600 mb-1">No standards yet</p>
            <p className="text-sm text-neutral-400 mb-5">Create a standard and enrol students first.</p>
            <button onClick={() => navigate('/teacher/subjects')}
              className="px-5 py-2.5 bg-ink text-white rounded-pill text-sm font-medium hover:bg-neutral-800 transition-colors">
              Go to Subjects
            </button>
          </div>
        ) : (
          <>
            {/* Standard tabs */}
            {standards.length > 1 && (
              <div className="flex gap-2 mb-4 flex-wrap">
                {standards.map(std => (
                  <button key={std.id} onClick={() => handleStdChange(std.id)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium border transition-all
                      ${String(activeStdId) === String(std.id)
                        ? 'bg-neutral-900 text-white border-neutral-900'
                        : 'glass-panel border-white/60 text-neutral-600 hover:bg-[#F4F2EF]'}`}>
                    <SubjectIcon value={std.emoji} size={14} fallback="graduation" /> {std.name}
                  </button>
                ))}
              </div>
            )}

            {/* Subject tabs */}
            {subjects.length === 0 ? (
              <div className="text-center py-12 glass-panel border-dashed border-[#D8D6D2] rounded-2xl text-sm text-neutral-500">
                No subjects in this standard yet.
              </div>
            ) : (
              <>
                <div className="flex gap-2 mb-1 overflow-x-auto pb-2 scrollbar-hide">
                  {subjects.map(sub => (
                    <button key={sub.id} onClick={() => setActiveSubjectId(sub.id)}
                      className={`flex items-center gap-2 px-5 py-3 rounded-full border text-sm font-bold whitespace-nowrap transition-all flex-shrink-0
                        ${String(activeSubjectId) === String(sub.id)
                          ? 'bg-neutral-900 border-neutral-900 text-white shadow-md'
                          : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50 shadow-sm'}`}>
                      <SubjectIcon value={sub.emoji} size={16} />
                      {sub.name}
                    </button>
                  ))}
                </div>

                {activeSubjectId && (
                  <AttendanceGrid
                    key={activeSubjectId}
                    subjectId={activeSubjectId}
                    onNavigate={id => navigate(`/teacher/students/${id}`)}
                  />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
