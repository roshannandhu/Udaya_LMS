import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, FileQuestion, Clock, Loader2, ListChecks, Edit2, Trash2 } from 'lucide-react';
import { Btn, Tag, Skeleton } from '../../components/ui';
import NewTestModal from '../../components/teacher/NewTestModal';
import TestResultsSheet from '../../components/teacher/TestResultsSheet';
import { testApi } from '../../lib/api';
import { useAppCache } from '../../store';

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
  const { subjects, standards, refreshSubjects, refreshStandards } = useAppCache();

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
    <div>
      <div className="sticky top-0 z-30 glass-nav border-b-0 border-white/40 shadow-[0_4px_30px_rgba(0,0,0,0.05)]">
        <div className="px-5 md:px-8 py-3 flex items-center gap-3 max-w-5xl mx-auto">
          <button onClick={() => navigate('/teacher/more')} className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 hover:bg-white/40 rounded-md">
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-base font-semibold flex-1">All Tests</h1>
          <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>New test</Btn>
        </div>
      </div>

      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {/* Filter tabs */}
        <div className="flex gap-1 mb-5 flex-wrap">
          {filters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${filter === f.id ? 'bg-neutral-900 text-white font-semibold' : 'text-neutral-500 hover:text-neutral-900 hover:bg-white/40'}`}>
              {f.label} <span className={`${filter === f.id ? 'opacity-60' : 'text-neutral-400'}`}>{f.count}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 glass-panel border-dashed border-white/60 rounded-2xl">
            <FileQuestion size={36} className="mx-auto mb-3 text-neutral-300" />
            <p className="font-medium text-neutral-600">No {filter !== 'all' ? filter : ''} tests yet</p>
            <p className="text-sm text-neutral-400 mb-4">Create your first test to get started.</p>
            <Btn variant="primary" size="sm" icon={Plus} onClick={() => { setEditTestId(null); setNewTestOpen(true); }}>Create test</Btn>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(t => {
              const sub = subjects.find(x => String(x.id) === String(t.class_id));
              const std = standards.find(x => String(x.id) === String(sub?.standard_id));
              const statusColor = {
                completed: 'green', active: 'blue', scheduled: 'amber', draft: 'gray'
              }[t.status] || 'gray';

              return (
                <div key={t.id} className="glass-panel rounded-xl p-4 hover:bg-white/40 transition-colors">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h4 className="font-medium text-sm">{t.title}</h4>
                        {t.negative_marking && <Tag color="red">−{t.penalty}</Tag>}
                      </div>
                      <p className="text-xs text-neutral-500">
                        {std?.emoji} {std?.name}
                        {sub?.name ? ` · ${sub.emoji || ''} ${sub.name}` : ''}
                        {' · '}{t.duration_mins} min · {t.total_marks} marks
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEdit(t) ? (
                        <button onClick={() => { setEditTestId(t.id); setNewTestOpen(true); }}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium glass-panel border-white/60 rounded-lg hover:bg-white/50 transition-colors">
                          <Edit2 size={13} className="text-neutral-500" />
                          Edit
                        </button>
                      ) : (
                        <span className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-neutral-300 glass-panel border-white/40 rounded-lg cursor-not-allowed select-none" title="Cannot edit after exam starts">
                          <Edit2 size={13} /> Edit
                        </span>
                      )}
                      <button onClick={() => setResultsTest(t)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium glass-panel border-white/60 rounded-lg hover:bg-white/50 transition-colors">
                        <ListChecks size={13} className="text-neutral-500" />
                        Results
                      </button>
                      <button
                        onClick={() => handleDeleteCard(t)}
                        disabled={deleting && deleteConfirmId === t.id}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-colors ${deleteConfirmId === t.id ? 'bg-red-500 text-white hover:bg-red-600' : 'glass-panel border-white/60 text-red-500 hover:bg-red-50'}`}
                      >
                        {deleting && deleteConfirmId === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                        {deleteConfirmId === t.id ? 'Confirm?' : 'Delete'}
                      </button>
                      <Tag color={statusColor}>{t.status}</Tag>
                    </div>
                  </div>
                  {t.scheduled_for && (
                    <div className="flex items-center gap-1.5 text-xs text-amber-700 pt-2 border-t border-white/40 mt-2">
                      <Clock size={11} /> Scheduled: {fmtSchedule(t.scheduled_for)}
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
