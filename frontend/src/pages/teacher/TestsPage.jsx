import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileQuestion, Clock, Loader2, ListChecks, Edit2, Trash2 } from 'lucide-react';
import { Btn, Tag, Skeleton } from '../../components/ui';
import NewTestModal from '../../components/teacher/NewTestModal';
import SubjectIcon from '../../components/shared/SubjectIcon';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import { testApi } from '../../lib/api';
import { useAppCache } from '../../store';
import { useAutoRefresh } from '../../lib/useAutoRefresh';

const CARD_COLORS = [
  { bg: 'bg-[#EAF3EB]', text: 'text-green-950', badge: 'bg-white/50 text-green-900' },
  { bg: 'bg-[#F8E1FB]', text: 'text-purple-950', badge: 'bg-white/50 text-purple-900' },
  { bg: 'bg-[#FFF6D8]', text: 'text-amber-950', badge: 'bg-white/50 text-amber-900' },
  { bg: 'bg-[#E5F2FE]', text: 'text-blue-950', badge: 'bg-white/50 text-blue-900' },
  { bg: 'bg-[#FFEBE5]', text: 'text-orange-950', badge: 'bg-white/50 text-orange-900' }
];

export default function TestsPage() {
  const navigate = useNavigate();
  const [filter, setFilter]         = useState('all');
  const [resultsTest, setResultsTest] = useState(null);
  const [newTestOpen, setNewTestOpen] = useState(false);
  const [editTestId, setEditTestId]   = useState(null);
  const [tests, setTests]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [deleting, setDeleting]     = useState(false);

  const canEdit = (t) => {
    if (t.status === 'draft') return true;
    if (t.status === 'scheduled' && t.scheduled_for && new Date(t.scheduled_for) > new Date()) return true;
    return false;
  };

  const handleDeleteCard = async (t) => {
    if (deleteConfirmId !== t.id) { setDeleteConfirmId(t.id); return; }
    setDeleting(true);
    try {
      const { testApi } = await import('../../lib/api');
      await testApi.deleteTest(t.id);
      setTests(prev => prev.filter(x => x.id !== t.id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error(err);
    } finally {
      setDeleting(false);
    }
  };

  // Serve subjects + standards from cache (instant)
  const subjects        = useAppCache(s => s.subjects);
  const standards       = useAppCache(s => s.standards);
  const refreshSubjects  = useAppCache(s => s.refreshSubjects);
  const refreshStandards = useAppCache(s => s.refreshStandards);

  const fetchTests = async () => {
    try {
      setLoading(true);
      const data = await testApi.getTests();
      setTests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTests();
    // Background refresh of subjects/standards for label display
    refreshSubjects();
    refreshStandards();
  }, []);

  // Live refresh on focus / visibility / data-changed (e.g. a student submits).
  useAutoRefresh(fetchTests);

  const filtered = useMemo(() => {
    if (filter === 'all') return tests;
    return tests.filter(t => t.status === filter);
  }, [filter, tests]);

  const filters = [
    { id: 'all',       label: 'All',       count: tests.length },
    { id: 'active',    label: 'Active',    count: tests.filter(t => t.status === 'active').length },
    { id: 'scheduled', label: 'Scheduled', count: tests.filter(t => t.status === 'scheduled').length },
    { id: 'completed', label: 'Completed', count: tests.filter(t => t.status === 'completed').length },
    { id: 'draft',     label: 'Draft',     count: tests.filter(t => t.status === 'draft').length },
  ].filter(f => f.id === 'all' || f.count > 0);

  function fmtSchedule(d) {
    return new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="pb-28 min-h-screen bg-[#F4F7F6]">
      <div className="sticky top-0 z-30 bg-[#F4F7F6] border-b border-black/5">
        <div className="px-5 md:px-8 py-4 flex items-center gap-3 max-w-6xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-black/5 rounded-full transition-colors">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-xl font-bold flex-1">All Tests</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }} className="rounded-full shadow-sm px-4">New test</Btn>
        </div>
      </div>

      <div className="px-5 md:px-8 py-8 max-w-6xl mx-auto">
        {/* Filter tabs */}
        <div className="flex items-center gap-2 p-1.5 bg-black/5 rounded-[20px] mb-8 w-max flex-wrap">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`flex items-center gap-1.5 px-5 py-2 text-[13px] font-bold rounded-full transition-all ${filter === f.id ? 'bg-white shadow-sm text-black' : 'text-neutral-500 hover:text-black'}`}>
              {f.label} <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === f.id ? 'bg-black/5 text-black' : 'bg-black/5 text-neutral-400'}`}>{f.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 rounded-[32px] bg-white/60" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white shadow-sm rounded-[32px]">
            <FileQuestion size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-bold text-[17px] text-neutral-600 mb-1">No {filter !== 'all' ? filter : ''} tests yet</p>
            <p className="text-[13px] font-medium text-neutral-400 mb-5">Create your first test to get started.</p>
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }} className="rounded-full shadow-sm">Create test</Btn>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((t, idx) => {
              const sub = subjects.find(x => String(x.id) === String(t.class_id));
              const std = standards.find(x => String(x.id) === String(sub?.standard_id));
              const theme = CARD_COLORS[idx % CARD_COLORS.length];

              return (
                <div key={t.id} className={`rounded-[32px] ${theme.bg} p-5 flex flex-col hover:-translate-y-1 hover:shadow-md transition-all h-full`}>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <h4 className={`font-bold text-[18px] leading-tight ${theme.text}`}>{t.title}</h4>
                        {t.negative_marking && <span className="bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">−{t.penalty}</span>}
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] font-medium text-black/50 flex-wrap">
                        <span className="bg-white/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><SubjectIcon value={std?.emoji} size={12} fallback="graduation" />{std?.name}</span>
                        {sub?.name && <span className="bg-white/50 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><SubjectIcon value={sub.emoji} size={12} />{sub.name}</span>}
                        <span className="bg-white/50 px-2 py-0.5 rounded-full">{t.duration_mins}m</span>
                        <span className="bg-white/50 px-2 py-0.5 rounded-full">{t.total_marks} marks</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto pt-3 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-1.5">
                      {canEdit(t) ? (
                        <button onClick={() => { setEditTestId(t.id); setNewTestOpen(true); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold bg-white hover:bg-neutral-50 shadow-sm rounded-full transition-colors">
                          <Edit2 size={13} className="text-black" />
                          Edit
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold text-neutral-400 bg-white/40 rounded-full cursor-not-allowed select-none" title="Cannot edit after exam starts">
                          <Edit2 size={13} /> Edit
                        </span>
                      )}
                      <button onClick={() => setResultsTest(t)}
                        className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold bg-white hover:bg-neutral-50 shadow-sm rounded-full transition-colors">
                        <ListChecks size={13} className="text-black" />
                        Results
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDeleteCard(t)}
                        disabled={deleting && deleteConfirmId === t.id}
                        className={`flex items-center justify-center w-8 h-8 rounded-full transition-colors ${deleteConfirmId === t.id ? 'bg-red-500 text-white' : 'bg-white text-red-500 hover:bg-red-50 shadow-sm'}`}
                      >
                        {deleting && deleteConfirmId === t.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                  
                  {t.scheduled_for && (
                    <div className="flex items-center gap-1.5 text-[12px] font-bold text-amber-700 pt-3 border-t border-black/5 mt-3">
                      <Clock size={12} /> Scheduled: {fmtSchedule(t.scheduled_for)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TestResultsSheet
        open={!!resultsTest}
        onClose={() => setResultsTest(null)}
        test={resultsTest}
        onSuccess={(updated) => {
          if (updated) setTests(prev => prev.map(t => t.id === updated.id ? updated : t));
          setResultsTest(null);
        }}
        onDelete={(deletedId) => {
          setTests(prev => prev.filter(t => t.id !== deletedId));
          setResultsTest(null);
        }}
      />
      <NewTestModal 
        open={newTestOpen} 
        onClose={() => { setNewTestOpen(false); setEditTestId(null); }} 
        onSuccess={fetchTests} 
        editTestId={editTestId} 
      />
    </div>
  );
}
