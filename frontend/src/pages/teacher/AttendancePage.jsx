import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, ChevronRight } from 'lucide-react';
import { Skeleton } from '../../components/ui';
import { useAppCache } from '../../store';
import SubjectIcon from '../../components/shared/SubjectIcon';
import AttendanceGrid, { getMonday, fmt } from '../../components/teacher/AttendanceGrid';

export default function AttendancePage() {
  const navigate = useNavigate();

  const standards      = useAppCache(s => s.standards);
  const allSubjects    = useAppCache(s => s.subjects);
  const standardsReady = useAppCache(s => s.standardsReady);
  const subjectsReady  = useAppCache(s => s.subjectsReady);
  const refreshStandards = useAppCache(s => s.refreshStandards);
  const refreshSubjects  = useAppCache(s => s.refreshSubjects);
  const loading = !standardsReady || !subjectsReady;

  const [activeStdId, setActiveStdId]       = useState(null);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  useEffect(() => {
    refreshStandards();
    refreshSubjects();
  }, []);

  useEffect(() => {
    if (standards.length > 0 && !activeStdId) {
      const firstStd = standards[0];
      setActiveStdId(firstStd.id);
      const firstSub = allSubjects.find(s => String(s.standard_id) === String(firstStd.id));
      if (firstSub) setActiveSubjectId(firstSub.id);
    }
  }, [standards, allSubjects]);

  const subjects = allSubjects.filter(s => String(s.standard_id) === String(activeStdId));

  const handleStdChange = (stdId) => {
    setActiveStdId(stdId);
    const firstSub = allSubjects.find(s => String(s.standard_id) === String(stdId));
    setActiveSubjectId(firstSub?.id || null);
  };

  const activeSubject  = subjects.find(s => s.id === activeSubjectId);
  const activeStandard = standards.find(s => s.id === activeStdId);

  return (
    <div className="min-h-screen bg-[#f8f9fb]">

      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-20 bg-white border-b border-neutral-100 shadow-sm">
        <div className="px-4 pt-4 pb-3 max-w-2xl mx-auto">

          {/* Title + breadcrumb */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-black text-neutral-900 leading-tight">Attendance</h1>
              {activeStandard && activeSubject && (
                <div className="flex items-center gap-1 text-xs text-neutral-500 mt-0.5">
                  <SubjectIcon value={activeStandard.emoji} size={11} fallback="graduation" />
                  <span>{activeStandard.name}</span>
                  <ChevronRight size={10} />
                  <SubjectIcon value={activeSubject.emoji} size={11} />
                  <span className="font-semibold text-neutral-700">{activeSubject.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Selectors */}
          {loading ? (
            <div className="flex gap-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-24 rounded-full flex-shrink-0" />)}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Standard chips */}
              {standards.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {standards.map(std => (
                    <button key={std.id} onClick={() => handleStdChange(std.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap flex-shrink-0 transition-all
                        ${String(activeStdId) === String(std.id)
                          ? 'bg-neutral-900 text-white border-neutral-900'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
                      <SubjectIcon value={std.emoji} size={11} fallback="graduation" />
                      {std.name}
                    </button>
                  ))}
                </div>
              )}
              {/* Subject chips */}
              {subjects.length > 0 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {subjects.map(sub => (
                    <button key={sub.id} onClick={() => setActiveSubjectId(sub.id)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border whitespace-nowrap flex-shrink-0 transition-all
                        ${String(activeSubjectId) === String(sub.id)
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                          : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-400'}`}>
                      <SubjectIcon value={sub.emoji} size={11} />
                      {sub.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Page content ── */}
      <div className="px-4 py-3 max-w-2xl mx-auto">
        {!loading && standards.length === 0 ? (
          <div className="text-center py-20 bg-white border border-dashed border-neutral-200 rounded-2xl mt-4">
            <BookOpen size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-semibold text-neutral-600 mb-1">No standards yet</p>
            <p className="text-sm text-neutral-400 mb-5">Create a standard and enrol students first.</p>
            <button onClick={() => navigate('/teacher/standards')}
              className="px-5 py-2.5 bg-neutral-900 text-white rounded-full text-sm font-bold hover:bg-neutral-700 transition-colors">
              Go to Subjects
            </button>
          </div>
        ) : !loading && subjects.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-neutral-200 rounded-2xl mt-4">
            <p className="text-sm text-neutral-400">No subjects in this standard yet.</p>
          </div>
        ) : activeSubjectId ? (
          <AttendanceGrid
            key={activeSubjectId}
            subjectId={activeSubjectId}
            onNavigate={id => navigate(`/teacher/students/${id}`)}
          />
        ) : null}
      </div>

    </div>
  );
}

