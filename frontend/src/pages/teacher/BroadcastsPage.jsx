import React, { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import TopBar from '../../components/shared/TopBar';
import BroadcastThread from '../../components/teacher/BroadcastThread';
import { useStore, useAppCache } from '../../store';
import { Skeleton } from '../../components/ui';

export default function BroadcastsPage() {
  const { broadcastsByStandard, updateBroadcasts } = useStore();
  const location = useLocation();

  // Use global cache for standards + students
  const { standards, students, standardsReady, studentsReady, refreshStandards, refreshStudents } = useAppCache();
  const loading = !standardsReady || !studentsReady;

  const [activeStdId, setActiveStdId] = useState(location.state?.stdId || null);
  const [paneView, setPaneView] = useState(location.state?.stdId ? 'thread' : 'list');

  // Set first standard as active once loaded (unless one was pre-selected via nav state)
  useEffect(() => {
    if (standards.length > 0 && !activeStdId) setActiveStdId(standards[0].id);
  }, [standards]);

  // Background refresh
  useEffect(() => {
    refreshStandards();
    refreshStudents();
  }, []);

  // Build student count map from cached students
  const studentCounts = {};
  students.forEach(s => {
    studentCounts[s.standard_id] = (studentCounts[s.standard_id] || 0) + 1;
  });

  const std = standards.find(s => s.id === activeStdId);
  const showList   = paneView === 'list';
  const showThread = paneView === 'thread';

  if (loading) {
    return (
      <div>
        <TopBar title="Inbox" />
        <div className="px-5 md:px-8 py-4 max-w-5xl mx-auto space-y-2">
          {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (standards.length === 0) {
    return (
      <div>
        <TopBar title="Inbox" />
        <div className="px-5 md:px-8 py-20 max-w-5xl mx-auto text-center">
          <MessageSquare size={36} className="mx-auto mb-3 text-neutral-300" />
          <h3 className="font-medium text-neutral-600 mb-1">No standards yet</h3>
          <p className="text-sm text-neutral-500">Create a standard first to send broadcasts.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar
        title={showThread && std ? std.name : 'Inbox'}
        subtitle={showThread && std
          ? `${studentCounts[std.id] || 0} students`
          : 'Class broadcasts'}
        showSearch={!showThread}
      />
      <div className="max-w-5xl mx-auto">
        <div className="flex h-[calc(100dvh-160px)] md:h-[calc(100dvh-90px)]">

          {/* Standards list pane */}
          <div className={`${showList ? 'flex' : 'hidden md:flex'} flex-col w-full md:w-80 md:border-r border-white/40 overflow-y-auto flex-shrink-0`}>
            {standards.map(s => {
              const broadcasts = (broadcastsByStandard[s.id] || []).filter(b => !b.deleted);
              const lastMsg = broadcasts[broadcasts.length - 1];
              const isActive = s.id === activeStdId;
              return (
                <button key={s.id} onClick={() => { setActiveStdId(s.id); setPaneView('thread'); }}
                  className={`flex items-center gap-3 px-4 py-3.5 border-b border-white/40 hover:bg-white/40 transition-colors text-left ${isActive ? 'bg-white/50' : ''}`}>
                  <div className="w-11 h-11 rounded-xl bg-white/50 border border-white/60 shadow-sm flex items-center justify-center text-xl flex-shrink-0">
                    {s.emoji || '📚'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{s.name}</p>
                      {lastMsg && <span className="text-[10px] text-neutral-400 flex-shrink-0">{lastMsg.time}</span>}
                    </div>
                    <p className="text-xs text-neutral-500 truncate">
                      {lastMsg ? lastMsg.text : `${studentCounts[s.id] || 0} students`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Thread pane */}
          <div className={`${showThread ? 'flex' : 'hidden md:flex'} flex-col flex-1 min-w-0`}>
            {std ? (
              <BroadcastThread
                key={activeStdId}
                std={std}
                broadcasts={broadcastsByStandard[std.id] || []}
                onUpdate={updater => updateBroadcasts(std.id, updater)}
                onBack={() => setPaneView('list')}
                showBackBtn={showThread}
                studentCount={studentCounts[std.id] || 0}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-neutral-400">
                Select a class to view broadcasts
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
