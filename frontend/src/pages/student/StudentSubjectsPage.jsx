import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, FileQuestion, ChevronRight, Loader2 } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { apiClient, testApi } from '../../lib/api';
import { useAppCache } from '../../store';
import { Skeleton } from '../../components/ui';

export default function StudentSubjectsPage() {
  const navigate = useNavigate();
  const [videoCounts, setVideoCounts] = useState({});
  const [testCounts, setTestCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const subjects = useAppCache(s => s.subjects);

  useEffect(() => {
    const load = async () => {
      try {
        const [vids, tests] = await Promise.all([
          apiClient('/videos'),
          testApi.getTests(),
        ]);

        // count videos per subject
        const vc = {};
        (Array.isArray(vids) ? vids : []).forEach(v => {
          vc[v.class_id] = (vc[v.class_id] || 0) + 1;
        });
        setVideoCounts(vc);

        // count active/scheduled tests per subject
        const tc = {};
        (Array.isArray(tests) ? tests : [])
          .filter(t => t.status === 'active' || t.status === 'scheduled')
          .forEach(t => {
            tc[t.class_id] = (tc[t.class_id] || 0) + 1;
          });
        setTestCounts(tc);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <div>
      <TopBar title="Subjects" showSearch={false} />
      <div className="px-5 md:px-8 py-6 max-w-5xl mx-auto">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-500 glass-panel rounded-xl border-dashed border-white/60">
            No subjects enrolled yet.
          </div>
        ) : (
          <div className="space-y-2">
            {subjects.map(c => {
              const vc = videoCounts[c.id] || 0;
              const tc = testCounts[c.id] || 0;
              return (
                <button key={c.id} onClick={() => navigate(`/student/subjects/${c.id}`)}
                  className="w-full flex items-center gap-4 p-4 glass-panel rounded-xl hover:bg-white/40 transition-colors text-left">
                  <div className="w-12 h-12 rounded-xl bg-white/50 border border-white/60 flex items-center justify-center text-2xl flex-shrink-0 drop-shadow-sm">
                    {c.emoji || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium mb-1">{c.name}</p>
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                      <span className="flex items-center gap-1"><Play size={11} />{vc} video{vc !== 1 ? 's' : ''}</span>
                      <span className="flex items-center gap-1"><FileQuestion size={11} />{tc} test{tc !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-neutral-400 flex-shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
