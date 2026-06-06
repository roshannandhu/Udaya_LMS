import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Play, FileQuestion, ArrowRight } from 'lucide-react';
import TopBar from '../../components/shared/TopBar';
import { apiClient, testApi } from '../../lib/api';
import { useAppCache } from '../../store';
import { Skeleton } from '../../components/ui';
import { PASTEL, pastelFor } from '../../components/cards/pastel';
import { staggerChildren, fadeUp, springCard } from '../../lib/motion';

let subjectsPageCache = null;

export default function StudentSubjectsPage() {
  const navigate = useNavigate();
  const [videoCounts, setVideoCounts] = useState(subjectsPageCache?.videoCounts || {});
  const [testCounts, setTestCounts] = useState(subjectsPageCache?.testCounts || {});
  const [loading, setLoading] = useState(!subjectsPageCache);
  const subjects = useAppCache(s => s.subjects);

  useEffect(() => {
    const load = async () => {
      if (!subjectsPageCache) setLoading(true);
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
        
        subjectsPageCache = { videoCounts: vc, testCounts: tc };
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3,4].map(i => <Skeleton key={i} className="h-40 rounded-card" />)}
          </div>
        ) : subjects.length === 0 ? (
          <div className="text-center py-16 text-sm text-neutral-500 glass-panel">
            No subjects enrolled yet.
          </div>
        ) : (
          <motion.div variants={staggerChildren} initial="hidden" animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects.map(c => {
              const vc = videoCounts[c.id] || 0;
              const tc = testCounts[c.id] || 0;
              const pastel = PASTEL[pastelFor(c.name)];
              return (
                <motion.div key={c.id} variants={fadeUp}
                  onClick={() => navigate(`/student/subjects/${c.id}`)}
                  whileHover={{ y: -4 }} whileTap={{ scale: 0.99 }} transition={springCard}
                  className="group rounded-card p-5 cursor-pointer border border-black/5 flex flex-col"
                  style={{ background: pastel.hex }}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-14 h-14 rounded-2xl bg-white/70 flex items-center justify-center text-2xl flex-shrink-0">
                      {c.emoji || '📚'}
                    </div>
                    <div className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center text-neutral-500 group-hover:bg-ink group-hover:text-white transition-colors">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                  <p className="font-semibold text-lg tracking-tight mb-3" style={{ fontFamily: '"Fraunces", Georgia, serif' }}>{c.name}</p>
                  <div className="flex items-center gap-3 text-xs font-medium" style={{ color: pastel.fgHex }}>
                    <span className="flex items-center gap-1 bg-white/60 rounded-pill px-2.5 py-1"><Play size={12} />{vc} video{vc !== 1 ? 's' : ''}</span>
                    <span className="flex items-center gap-1 bg-white/60 rounded-pill px-2.5 py-1"><FileQuestion size={12} />{tc} test{tc !== 1 ? 's' : ''}</span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
